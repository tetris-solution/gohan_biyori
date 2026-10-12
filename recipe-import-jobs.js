import {publicUrl} from './recipe-import.js';
export const importJobSchema=["CREATE TABLE IF NOT EXISTS recipe_import_jobs(id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,url TEXT NOT NULL,context TEXT NOT NULL DEFAULT '{}',status TEXT NOT NULL CHECK(status IN ('queued','working','ready','failed','done')),result TEXT,error TEXT,recipe_id INTEGER,dismissed INTEGER NOT NULL DEFAULT 0,created_at INTEGER NOT NULL,updated_at INTEGER NOT NULL,lease_until INTEGER NOT NULL DEFAULT 0)","CREATE INDEX IF NOT EXISTS recipe_import_jobs_owner ON recipe_import_jobs(user_id,created_at)"];
const jobId=/^[a-f0-9-]{36}$/;
const expose=row=>({id:row.id,url:row.url,context:JSON.parse(row.context),status:row.status,recipeId:row.recipe_id,...(row.status==='ready'?{recipe:JSON.parse(row.result)}:{}),...(row.error?{failure:JSON.parse(row.error)}:{})});
export async function importJobsApi(request,env,user,ctx,{body,json,extract}){
 const db=env.DB,path=new URL(request.url).pathname,match=path.match(/^\/api\/recipes\/jobs\/([a-f0-9-]{36})$/),now=Date.now();
 if(request.method==='GET'&&path==='/api/recipes/jobs'){const rows=await db.prepare('SELECT * FROM recipe_import_jobs WHERE user_id=? AND dismissed=0 ORDER BY created_at DESC LIMIT 20').bind(user.id).all();return json({jobs:rows.results.map(expose)});}
 if(request.method==='POST'&&path==='/api/recipes/jobs'){
  const input=await body(request,8192);let url;try{url=publicUrl(input.url).href;}catch(e){return json({error:e.message},400);}if(!jobId.test(input.id||''))return json({error:'登録IDを確認してください'},400);
  const existing=await db.prepare('SELECT * FROM recipe_import_jobs WHERE id=? AND user_id=?').bind(input.id,user.id).first();if(existing)return json({job:expose(existing)},202);
  const context=input.context||{};if(context.sharingGroupId!=null&&(!jobId.test(context.sharingGroupId)||!await db.prepare('SELECT 1 FROM sharing_members WHERE group_id=? AND user_id=?').bind(context.sharingGroupId,user.id).first()))return json({error:'共有先を確認してください'},403);
  if(context.addToMeal!=null&&!['朝','昼','晩'].includes(context.addToMeal)||context.targetDate!=null&&!/^\d{4}-\d{2}-\d{2}$/.test(context.targetDate))return json({error:'献立の登録先を確認してください'},400);
  const options={sharingGroupId:context.sharingGroupId||null,addToMeal:context.addToMeal||null,targetDate:context.targetDate||null};
  const created=await db.prepare("INSERT INTO recipe_import_jobs(id,user_id,url,context,status,created_at,updated_at) SELECT ?,?,?,?,'queued',?,? WHERE (SELECT COUNT(*) FROM recipe_import_jobs WHERE user_id=? AND status IN ('queued','working','ready'))<3 RETURNING *").bind(input.id,user.id,url,JSON.stringify(options),now,now,user.id).first();if(!created)return json({error:'読み取りは同時に3件までです。完了をお待ちください'},429);
  if(ctx?.waitUntil)ctx.waitUntil(runImportJob(env,input.id,extract));return json({job:expose(created)},202);
 }
 if(match&&request.method==='PUT'){
  const input=await body(request,4096),row=await db.prepare('SELECT * FROM recipe_import_jobs WHERE id=? AND user_id=?').bind(match[1],user.id).first();if(!row)return json({error:'読み取りが見つかりません'},404);
  if(input.dismiss){if(!['failed','done'].includes(row.status))return json({error:'処理中の通知は閉じられません'},409);await db.prepare('UPDATE recipe_import_jobs SET dismissed=1,updated_at=? WHERE id=? AND user_id=?').bind(now,row.id,user.id).run();return json({ok:true});}
  if(row.status!=='ready'&&row.status!=='done')return json({error:'解析結果を確認してください'},409);
  const saved=await db.prepare('SELECT data FROM user_data WHERE user_id=?').bind(user.id).first(),recipe=saved&&JSON.parse(saved.data).recipes?.find(r=>r.id===input.recipeId&&r.importJobId===row.id);if(!recipe)return json({error:'レシピの保存を確認できません'},409);
  await db.prepare("UPDATE recipe_import_jobs SET status='done',recipe_id=?,result=NULL,error=NULL,updated_at=? WHERE id=? AND user_id=?").bind(recipe.id,now,row.id,user.id).run();return json({ok:true});
 }
 return json({error:'見つかりません'},404);
}
export async function runImportJob(env,id,extract){
 const db=env.DB,now=Date.now(),row=await db.prepare("UPDATE recipe_import_jobs SET status='working',updated_at=?,lease_until=? WHERE id=? AND (status='queued' OR (status='working' AND lease_until<?)) RETURNING *").bind(now,now+5*60*1000,id,now).first();if(!row)return;
 try{const user=await db.prepare('SELECT id,username FROM users WHERE id=?').bind(row.user_id).first();if(!user)return;
  const response=await extract(new Request('https://import.internal/api/recipes/import',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({kind:'url',url:row.url})}),env,user),result=await response.json();
  if(!response.ok||!result.recipe){await db.prepare("UPDATE recipe_import_jobs SET status='failed',error=?,result=NULL,lease_until=0,updated_at=? WHERE id=? AND status='working' AND lease_until=?").bind(JSON.stringify({message:result.error||'読み取りに失敗しました',fallback:result.fallback||null,sourceUrl:result.sourceUrl||row.url}),Date.now(),id,row.lease_until).run();return;}
  await db.prepare("UPDATE recipe_import_jobs SET status='ready',result=?,error=NULL,lease_until=0,updated_at=? WHERE id=? AND status='working' AND lease_until=?").bind(JSON.stringify(result.recipe),Date.now(),id,row.lease_until).run();
 }catch{await db.prepare("UPDATE recipe_import_jobs SET status='failed',error=?,lease_until=0,updated_at=? WHERE id=? AND status='working' AND lease_until=?").bind(JSON.stringify({message:'取得処理を完了できませんでした。再入力して試してください',sourceUrl:row.url}),Date.now(),id,row.lease_until).run();}
}
export async function processImportJobs(env,extract){const rows=await env.DB.prepare("SELECT id FROM recipe_import_jobs WHERE status='queued' OR (status='working' AND lease_until<?) ORDER BY created_at LIMIT 3").bind(Date.now()).all();await Promise.all(rows.results.map(row=>runImportJob(env,row.id,extract)));await env.DB.prepare("DELETE FROM recipe_import_jobs WHERE (dismissed=1 OR status='done') AND updated_at<?").bind(Date.now()-30*86400000).run();}
