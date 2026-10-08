export const pantrySchema=[
 'CREATE TABLE IF NOT EXISTS sharing_foods(group_id TEXT NOT NULL REFERENCES sharing_groups(id) ON DELETE CASCADE,food_id TEXT NOT NULL,data TEXT NOT NULL,initial_data TEXT NOT NULL,version INTEGER NOT NULL DEFAULT 1,created_by TEXT NOT NULL REFERENCES users(id),updated_by TEXT NOT NULL REFERENCES users(id),created_at INTEGER NOT NULL,updated_at INTEGER NOT NULL,PRIMARY KEY(group_id,food_id))',
 "CREATE TRIGGER IF NOT EXISTS sharing_foods_limit BEFORE INSERT ON sharing_foods WHEN NOT EXISTS(SELECT 1 FROM sharing_foods WHERE group_id=NEW.group_id AND food_id=NEW.food_id) AND (SELECT COUNT(*) FROM sharing_foods WHERE group_id=NEW.group_id)>=2000 BEGIN SELECT RAISE(ABORT,'SHARED_FOODS_LIMIT'); END",
];
const fields=['name','qty','emoji','category','location','expiryType','expiryDate'];
const snapshot=food=>Object.fromEntries(fields.filter(k=>food?.[k]!==undefined).map(k=>[k,food[k]]));
const valid=(food,validData)=>typeof food.name==='string'&&food.name.trim().length>0&&food.name.length<=100&&typeof food.qty==='string'&&food.qty.length<=64&&/^\d+(?:\.\d+)?/.test(food.qty)&&parseFloat(food.qty)>0&&parseFloat(food.qty)<=999999&&typeof food.emoji==='string'&&food.emoji.length<=16&&validData({recipes:[],foods:[food],shopping:[],stores:[],plans:{}});
export async function pantryApi(request,env,user,groupId,rest,{body,json,validData}){
 const db=env.DB,method=request.method;
 if(rest==='/foods'&&method==='GET'){const rows=await db.prepare('SELECT food_id,data,version,created_at,updated_at FROM sharing_foods WHERE group_id=? ORDER BY created_at DESC,food_id DESC').bind(groupId).all();return json({foods:rows.results.map(r=>({...JSON.parse(r.data),id:r.food_id,version:r.version,createdAt:r.created_at,updatedAt:r.updated_at}))});}
 if(rest==='/foods'&&method==='POST'){
  const input=await body(request,150000);if(!Array.isArray(input.foods)||!input.foods.length||input.foods.length>25)return json({error:'食材は1〜25件ずつ登録してください'},400);
  const foods=input.foods.map(food=>({id:food?.id,data:snapshot(food)}));if(new Set(foods.map(f=>f.id)).size!==foods.length||foods.some(f=>!/^[a-f0-9-]{36}$/.test(f.id||'')||!valid(f.data,validData)))return json({error:'食材名・数量・期限を確認してください'},400);
  const now=Date.now(),statements=[],existing=(await db.prepare('SELECT food_id,initial_data,created_by FROM sharing_foods WHERE group_id=? AND food_id IN ('+foods.map(()=>'?').join(',')+')').bind(groupId,...foods.map(f=>f.id)).all()).results;
  for(const f of foods){const row=existing.find(row=>row.food_id===f.id);if(row&&(row.created_by!==user.id||row.initial_data!==JSON.stringify(f.data)))return json({error:'登録内容が変更されています。共有食材を更新して確認してください'},409);statements.push(db.prepare('INSERT INTO sharing_foods(group_id,food_id,data,initial_data,version,created_by,updated_by,created_at,updated_at) SELECT ?,?,?,?,1,?,?,?,? WHERE EXISTS(SELECT 1 FROM sharing_members WHERE group_id=? AND user_id=?) ON CONFLICT(group_id,food_id) DO NOTHING').bind(groupId,f.id,JSON.stringify(f.data),JSON.stringify(f.data),user.id,user.id,now,now,groupId,user.id));}
  try{await db.batch(statements);}catch(e){if(String(e).includes('SHARED_FOODS_LIMIT'))return json({error:'共有食材は2000件までです'},400);throw e;}
  if(!await db.prepare('SELECT 1 FROM sharing_members WHERE group_id=? AND user_id=?').bind(groupId,user.id).first())return json({error:'共有グループから解除されています'},403);return json({ok:true,ids:foods.map(f=>f.id)},201);
 }
 const match=rest.match(/^\/foods\/([a-f0-9-]{36})$/);if(!match)return json({error:'食材が見つかりません'},404);const id=match[1];
 if(!['PUT','DELETE'].includes(method))return json({error:'許可されていない操作です'},405);
 const input=await body(request,8192);if(!Number.isSafeInteger(input.version)||input.version<1)return json({error:'保存バージョンを確認してください'},400);
 if(method==='DELETE'){const result=await db.prepare('DELETE FROM sharing_foods WHERE group_id=? AND food_id=? AND version=? AND EXISTS(SELECT 1 FROM sharing_members WHERE group_id=? AND user_id=?)').bind(groupId,id,input.version,groupId,user.id).run();if(!result.meta.changes)return json({error:'ほかのメンバーが食材を更新しました。一覧を更新してから操作してください'},409);return json({ok:true});}
 const food=snapshot(input.food);if(!valid(food,validData))return json({error:'食材名・数量・期限を確認してください'},400);
 const row=await db.prepare('UPDATE sharing_foods SET data=?,version=version+1,updated_by=?,updated_at=? WHERE group_id=? AND food_id=? AND version=? AND EXISTS(SELECT 1 FROM sharing_members WHERE group_id=? AND user_id=?) RETURNING version').bind(JSON.stringify(food),user.id,Date.now(),groupId,id,input.version,groupId,user.id).first();if(!row)return json({error:'ほかのメンバーが食材を更新しました。入力内容を控え、フォームを閉じて一覧を更新してください'},409);return json({version:row.version});
}
