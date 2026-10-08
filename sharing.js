import {normalizePlan,mealSlots} from './public/src/meal-plan.js';
export const sharingSchema=[
 'CREATE TABLE IF NOT EXISTS sharing_groups(id TEXT PRIMARY KEY,name TEXT NOT NULL,owner_id TEXT NOT NULL REFERENCES users(id),created_at INTEGER NOT NULL)',
 'CREATE TABLE IF NOT EXISTS sharing_members(group_id TEXT NOT NULL REFERENCES sharing_groups(id) ON DELETE CASCADE,user_id TEXT NOT NULL REFERENCES users(id),joined_at INTEGER NOT NULL,PRIMARY KEY(group_id,user_id))',
 'CREATE TABLE IF NOT EXISTS sharing_invites(id TEXT PRIMARY KEY,group_id TEXT NOT NULL REFERENCES sharing_groups(id) ON DELETE CASCADE,token_hash TEXT NOT NULL UNIQUE,expires_at INTEGER NOT NULL,used_at INTEGER)',
 'CREATE TABLE IF NOT EXISTS sharing_recipes(group_id TEXT NOT NULL REFERENCES sharing_groups(id) ON DELETE CASCADE,user_id TEXT NOT NULL REFERENCES users(id),recipe_id INTEGER NOT NULL,data TEXT NOT NULL,version INTEGER NOT NULL DEFAULT 1,updated_at INTEGER NOT NULL,PRIMARY KEY(group_id,user_id,recipe_id))',
 'CREATE TABLE IF NOT EXISTS sharing_plans(group_id TEXT NOT NULL REFERENCES sharing_groups(id) ON DELETE CASCADE,user_id TEXT NOT NULL REFERENCES users(id),day TEXT NOT NULL,data TEXT NOT NULL,version INTEGER NOT NULL DEFAULT 1,updated_at INTEGER NOT NULL,PRIMARY KEY(group_id,user_id,day))',
 'CREATE INDEX IF NOT EXISTS sharing_members_user ON sharing_members(user_id)',
];
const hash=async token=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(token))),b=>b.toString(16).padStart(2,'0')).join('');
const recipeFields=['id','name','side','description','ingredients','requiredIngredients','ingredientAmounts','steps','servings','time','meal','mood','img','url','sourceTitle','sourceType','video','nutrition','nutritionNote','nutritionSource','kcal','generated','createdAt'];
function snapshot(recipe){return Object.fromEntries(recipeFields.filter(k=>recipe?.[k]!==undefined).map(k=>[k,recipe[k]]));}
function rewriteRecipe(recipe,group,owner){return {...recipe,img:/^\/api\/images\/[a-f0-9-]{36}$/.test(recipe.img)?`/api/sharing/groups/${group}/images/${owner}/${recipe.img.split('/').at(-1)}`:recipe.img};}
const validDay=day=>/^\d{4}-\d{2}-\d{2}$/.test(day)&&Number.isFinite(Date.parse(day+'T12:00:00Z'))&&new Date(day+'T12:00:00Z').toISOString().slice(0,10)===day;
export async function sharingApi(request,env,user,{body,json,validData}){
 const db=env.DB,path=new URL(request.url).pathname.slice('/api/sharing'.length),method=request.method;
 const groups=async()=> (await db.prepare('SELECT g.*, (SELECT COUNT(*) FROM sharing_members WHERE group_id=g.id) AS member_count FROM sharing_groups g JOIN sharing_members m ON g.id=m.group_id WHERE m.user_id=? ORDER BY g.created_at DESC').bind(user.id).all()).results;
 if(path===''&&method==='GET')return json({groups:await groups()});
 if(path==='/groups'&&method==='POST'){
  const input=await body(request,4096),name=typeof input.name==='string'?input.name.trim():'';if(!name||name.length>60)return json({error:'グループ名を60文字以内で入力してください'},400);
  const id=crypto.randomUUID(),now=Date.now();const results=await db.batch([db.prepare('INSERT INTO sharing_groups(id,name,owner_id,created_at) SELECT ?,?,?,? WHERE (SELECT COUNT(*) FROM sharing_members WHERE user_id=?)<5').bind(id,name,user.id,now,user.id),db.prepare('INSERT INTO sharing_members(group_id,user_id,joined_at) SELECT ?,?,? WHERE EXISTS(SELECT 1 FROM sharing_groups WHERE id=?)').bind(id,user.id,now,id)]);if(!results[0].meta.changes)return json({error:'参加できるグループは5件までです'},400);return json({group:{id,name,owner_id:user.id,member_count:1}},201);
 }
 if(path==='/join'&&method==='POST'){
  const input=await body(request,4096),code=typeof input.code==='string'?input.code.trim():'';if(!/^[a-f0-9]{48}$/.test(code))return json({error:'招待コードを確認してください'},400);
  const tokenHash=await hash(code),now=Date.now(),invite=await db.prepare('SELECT * FROM sharing_invites WHERE token_hash=? AND used_at IS NULL AND expires_at>?').bind(tokenHash,now).first();if(!invite)return json({error:'招待コードが無効か、使用済み・期限切れです'},404);
  if(await db.prepare('SELECT 1 FROM sharing_members WHERE group_id=? AND user_id=?').bind(invite.group_id,user.id).first())return json({error:'すでに参加しています'},409);
  const result=await db.batch([db.prepare('INSERT INTO sharing_members(group_id,user_id,joined_at) SELECT group_id,?,? FROM sharing_invites WHERE token_hash=? AND used_at IS NULL AND expires_at>? AND (SELECT COUNT(*) FROM sharing_members WHERE group_id=sharing_invites.group_id)<20 AND (SELECT COUNT(*) FROM sharing_members WHERE user_id=?)<5').bind(user.id,now,tokenHash,now,user.id),db.prepare('UPDATE sharing_invites SET used_at=? WHERE token_hash=? AND used_at IS NULL AND changes()=1').bind(now,tokenHash)]);if(!result[0].meta.changes)return json({error:'参加できません。招待コードやグループ人数を確認してください'},409);return json({groupId:invite.group_id});
 }
 const match=path.match(/^\/groups\/([a-f0-9-]{36})(.*)$/);if(!match)return json({error:'共有ページがありません'},404);const [,groupId,rest]=match;
 const group=await db.prepare('SELECT g.* FROM sharing_groups g JOIN sharing_members m ON g.id=m.group_id WHERE g.id=? AND m.user_id=?').bind(groupId,user.id).first();if(!group)return json({error:'共有グループにアクセスできません'},403);
 const admin=group.owner_id===user.id;
 if(rest===''&&method==='GET'){
  const [members,recipes,plans,invites]=await Promise.all([db.prepare('SELECT u.id,u.username FROM sharing_members m JOIN users u ON u.id=m.user_id WHERE m.group_id=? ORDER BY m.joined_at').bind(groupId).all(),db.prepare('SELECT r.*,u.username FROM sharing_recipes r JOIN users u ON u.id=r.user_id WHERE group_id=? ORDER BY updated_at DESC').bind(groupId).all(),db.prepare('SELECT p.*,u.username FROM sharing_plans p JOIN users u ON u.id=p.user_id WHERE group_id=? ORDER BY day DESC,updated_at DESC').bind(groupId).all(),admin?db.prepare('SELECT id,expires_at FROM sharing_invites WHERE group_id=? AND used_at IS NULL AND expires_at>?').bind(groupId,Date.now()).all():Promise.resolve({results:[]})]);
  return json({group,members:members.results,recipes:recipes.results.map(r=>({ownerId:r.user_id,username:r.username,version:r.version,updatedAt:r.updated_at,recipe:rewriteRecipe(JSON.parse(r.data),groupId,r.user_id)})),plans:plans.results.map(p=>({ownerId:p.user_id,username:p.username,day:p.day,version:p.version,updatedAt:p.updated_at,meals:Object.fromEntries(mealSlots.map(slot=>[slot,(JSON.parse(p.data)[slot]||[]).map(r=>rewriteRecipe(r,groupId,p.user_id))]))})),invites:invites.results});
 }
 if(rest==='/invites'&&method==='POST'){
  if(!admin)return json({error:'招待はグループ作成者が行えます'},403);const id=crypto.randomUUID(),code=Array.from(crypto.getRandomValues(new Uint8Array(24)),b=>b.toString(16).padStart(2,'0')).join(''),expiresAt=Date.now()+7*86400000;
  await db.prepare('DELETE FROM sharing_invites WHERE expires_at<? OR used_at IS NOT NULL').bind(Date.now()).run();const result=await db.prepare('INSERT INTO sharing_invites(id,group_id,token_hash,expires_at) SELECT ?,?,?,? WHERE (SELECT COUNT(*) FROM sharing_invites WHERE group_id=?)<10').bind(id,groupId,await hash(code),expiresAt,groupId).run();if(!result.meta.changes)return json({error:'未使用の招待は10件までです。先に取り消してください'},400);return json({id,code,expiresAt},201);
 }
 const inviteDelete=rest.match(/^\/invites\/([a-f0-9-]{36})$/);if(inviteDelete&&method==='DELETE'){if(!admin)return json({error:'招待を取り消せません'},403);await db.prepare('DELETE FROM sharing_invites WHERE id=? AND group_id=?').bind(inviteDelete[1],groupId).run();return json({ok:true});}
 const memberDelete=rest.match(/^\/members\/([a-f0-9-]{36})$/);if(memberDelete&&method==='DELETE'){
  const target=memberDelete[1];if((!admin&&target!==user.id)||target===group.owner_id)return json({error:'このメンバーを解除できません。作成者はグループを削除してください'},403);
  await db.batch([db.prepare('DELETE FROM sharing_recipes WHERE group_id=? AND user_id=?').bind(groupId,target),db.prepare('DELETE FROM sharing_plans WHERE group_id=? AND user_id=?').bind(groupId,target),db.prepare('DELETE FROM sharing_members WHERE group_id=? AND user_id=?').bind(groupId,target)]);return json({ok:true});
 }
 if(rest===''&&method==='DELETE'){if(!admin)return json({error:'グループを削除できません'},403);await db.batch(['sharing_invites','sharing_recipes','sharing_plans','sharing_members','sharing_groups'].map(table=>db.prepare(`DELETE FROM ${table} WHERE ${table==='sharing_groups'?'id':'group_id'}=?`).bind(groupId)));return json({ok:true});}
 const image=rest.match(/^\/images\/([a-f0-9-]{36})\/([a-f0-9-]{36})$/);
 if(image&&method==='GET'){
  const [,owner,id]=image;if(!env.IMAGES)return json({error:'画像がありません'},404);const ref='/api/images/'+id;const rows=await db.prepare('SELECT data FROM sharing_recipes WHERE group_id=? AND user_id=? UNION ALL SELECT data FROM sharing_plans WHERE group_id=? AND user_id=?').bind(groupId,owner,groupId,owner).all();const referenced=rows.results.some(row=>{const d=JSON.parse(row.data);return d.img===ref||mealSlots.some(slot=>d[slot]?.some(r=>r.img===ref));});if(!referenced)return json({error:'画像がありません'},404);const object=await env.IMAGES.get(owner+'/'+id);if(!object)return json({error:'画像がありません'},404);return new Response(object.body,{headers:{'Content-Type':object.httpMetadata?.contentType||'image/jpeg','Cache-Control':'private, no-store'}});
 }
 const recipePath=rest.match(/^\/recipes\/(\d+)$/),planPath=rest.match(/^\/plans\/(\d{4}-\d{2}-\d{2})$/);
 if(recipePath||planPath){const table=recipePath?'sharing_recipes':'sharing_plans',key=recipePath?'recipe_id':'day',value=recipePath?Number(recipePath[1]):planPath[1];if(recipePath&&!Number.isSafeInteger(value)||planPath&&!validDay(value))return json({error:'登録先が正しくありません'},400);
  if(method==='GET'){const record=await db.prepare(`SELECT version FROM ${table} WHERE group_id=? AND user_id=? AND ${key}=?`).bind(groupId,user.id,value).first();return json({version:record?.version||0});}
  if(method==='DELETE'){await db.prepare(`DELETE FROM ${table} WHERE group_id=? AND user_id=? AND ${key}=?`).bind(groupId,user.id,value).run();return json({ok:true});}
  if(method==='PUT'){
   const input=await body(request,500000);if(!Number.isSafeInteger(input.version)||input.version<0)return json({error:'保存バージョンを確認してください'},400);
   let payload;
   if(recipePath){payload=snapshot(input.recipe);if(payload.id!==value||!validData({recipes:[payload],foods:[],plans:{},shopping:[],stores:[]}))return json({error:'レシピの形式が正しくありません'},400);}
   else{if(!input.meals||mealSlots.some(slot=>!Array.isArray(input.meals[slot])||input.meals[slot].length>20))return json({error:'献立の形式が正しくありません'},400);payload=Object.fromEntries(mealSlots.map(slot=>[slot,input.meals[slot].map(snapshot)]));const all=mealSlots.flatMap(slot=>payload[slot]);if(!validData({recipes:all,foods:[],plans:{},shopping:[],stores:[]}))return json({error:'献立の形式が正しくありません'},400);}
   const all=recipePath?[payload]:mealSlots.flatMap(slot=>payload[slot]);if(all.some(r=>typeof r.img!=='string'||r.img.startsWith('/')&&!/^\/api\/images\/[a-f0-9-]{36}$/.test(r.img)||r.img&&!r.img.startsWith('/')&&!/^https:\/\/|^data:image\//.test(r.img)))return json({error:'画像の共有形式を確認してください'},400);
   for(const r of all){if(r.img.startsWith('/api/images/')){if(!env.IMAGES||!await env.IMAGES.head(user.id+'/'+r.img.split('/').at(-1)))return json({error:'自分が保存した画像のみ共有できます'},403);}}
   const existing=await db.prepare(`SELECT version FROM ${table} WHERE group_id=? AND user_id=? AND ${key}=?`).bind(groupId,user.id,value).first();if(!existing){const count=await db.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE group_id=? AND user_id=?`).bind(groupId,user.id).first();if(count.n>=(recipePath?2000:730))return json({error:'共有データの登録上限に達しました'},400);if(input.version!==0)return json({error:'共有データが変更されています。再読み込みしてください'},409);}
   const result=await db.prepare(`INSERT INTO ${table}(group_id,user_id,${key},data,version,updated_at) SELECT ?,?,?,?,1,? WHERE EXISTS(SELECT 1 FROM sharing_members WHERE group_id=? AND user_id=?) AND (?=0 OR EXISTS(SELECT 1 FROM ${table} WHERE group_id=? AND user_id=? AND ${key}=? AND version=?)) ON CONFLICT(group_id,user_id,${key}) DO UPDATE SET data=excluded.data,version=${table}.version+1,updated_at=excluded.updated_at WHERE ${table}.version=? AND EXISTS(SELECT 1 FROM sharing_members WHERE group_id=? AND user_id=?) RETURNING version`).bind(groupId,user.id,value,JSON.stringify(payload),Date.now(),groupId,user.id,input.version,groupId,user.id,value,input.version,input.version,groupId,user.id).first();if(!result)return json({error:'別の端末で共有データが更新されています。再読み込みしてください'},409);return json({version:result.version});
  }
 }
 return json({error:'共有ページがありません'},404);
}
