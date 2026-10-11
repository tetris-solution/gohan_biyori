export async function recipePublicationApi(request,env,user,{body,json,publishedRecipe}){
 const db=env.DB,path=new URL(request.url).pathname,match=path.match(/^\/api\/creator\/recipe-visibility(?:\/(\d+))?$/);
 if(!match)return json({error:'ページがありません'},404);
 if(request.method==='GET'&&!match[1]){
  const publicRows=await db.prepare('SELECT recipe_id FROM creator_recipes WHERE creator_id=?').bind(user.id).all(),limited=await db.prepare('SELECT r.recipe_id,r.group_id FROM sharing_recipes r JOIN sharing_members m ON m.group_id=r.group_id AND m.user_id=r.user_id WHERE r.user_id=?').bind(user.id).all();
  const paid=await db.prepare('SELECT recipe_id,product_id FROM commerce_recipes WHERE user_id=?').bind(user.id).all();
  return json({publicIds:publicRows.results.map(r=>r.recipe_id),limited:limited.results.map(r=>({recipeId:r.recipe_id,groupId:r.group_id})).concat(paid.results.map(r=>({recipeId:r.recipe_id,groupId:'paid:'+r.product_id})))});
 }
 if(request.method!=='PUT'||!match[1])return json({error:'許可されていない操作です'},405);
 const id=Number(match[1]),input=await body(request,4096);if(!Number.isSafeInteger(id)||!['private','public','limited'].includes(input.visibility))return json({error:'公開範囲を選択してください'},400);
 const row=await db.prepare('SELECT data FROM user_data WHERE user_id=?').bind(user.id).first(),recipe=row&&JSON.parse(row.data).recipes?.find(r=>r.id===id);if(!recipe)return json({error:'先にレシピを保存してください'},404);
 if(input.visibility!=='private'&&recipe.archived)return json({error:'アーカイブを解除してから公開してください'},400);
 if(input.visibility==='public'){
  const profile=await db.prepare('SELECT enabled FROM creator_profiles WHERE user_id=?').bind(user.id).first();if(!profile?.enabled)return json({error:'先にクリエイタープロフィールを公開してください'},400);
  const count=await db.prepare('SELECT COUNT(*) AS n FROM creator_recipes WHERE creator_id=? AND recipe_id<>?').bind(user.id,id).first();if(count.n>=100)return json({error:'一般公開は100件までです'},400);
 }
 if(input.visibility==='limited'){
  if(typeof input.groupId!=='string'||! /^(paid:)?[a-f0-9-]{36}$/.test(input.groupId))return json({error:'公開グループを選択してください'},400);
  if(input.groupId.startsWith('paid:')){if(!await db.prepare("SELECT 1 FROM commerce_products WHERE id=? AND creator_id=? AND kind='community'").bind(input.groupId.slice(5),user.id).first())return json({error:'運営している月額コミュニティだけ選択できます'},403);}else if(!await db.prepare('SELECT 1 FROM sharing_members WHERE group_id=? AND user_id=?').bind(input.groupId,user.id).first())return json({error:'参加しているグループだけ選択できます'},403);
 }
 const image=String(recipe.img||'').match(/^\/api\/images\/([a-f0-9-]{36})$/);if(input.visibility!=='private'&&image&&!await env.IMAGES?.head(user.id+'/'+image[1]))return json({error:'レシピ画像を確認してください'},400);
 const statements=[db.prepare('DELETE FROM creator_recipes WHERE creator_id=? AND recipe_id=?').bind(user.id,id),db.prepare('DELETE FROM sharing_recipes WHERE user_id=? AND recipe_id=?').bind(user.id,id),db.prepare('DELETE FROM commerce_recipes WHERE user_id=? AND recipe_id=?').bind(user.id,id)],now=Date.now();
 if(input.visibility==='public')statements.push(db.prepare('INSERT INTO creator_recipes(creator_id,recipe_id,recipe,published_at) VALUES(?,?,?,?)').bind(user.id,id,JSON.stringify(publishedRecipe(recipe,user.id)),now));
 if(input.visibility==='limited'){const snapshot=publishedRecipe(recipe,user.id);snapshot.img=recipe.img;const data=JSON.stringify(snapshot);if(input.groupId.startsWith('paid:'))statements.push(db.prepare('INSERT INTO commerce_recipes(product_id,user_id,recipe_id,data,updated_at) VALUES(?,?,?,?,?)').bind(input.groupId.slice(5),user.id,id,data,now));else {const previous=await db.prepare('SELECT version FROM sharing_recipes WHERE group_id=? AND user_id=? AND recipe_id=?').bind(input.groupId,user.id,id).first();statements.push(db.prepare('INSERT INTO sharing_recipes(group_id,user_id,recipe_id,data,version,updated_at) SELECT ?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM sharing_members WHERE group_id=? AND user_id=?)').bind(input.groupId,user.id,id,data,(previous?.version||0)+1,now,input.groupId,user.id));}}
 const result=await db.batch(statements);if(input.visibility==='limited'&&!result.at(-1).meta.changes)return json({error:'グループの参加状況が変わりました。確認してください'},409);
 return json({recipeId:id,visibility:input.visibility,groupId:input.visibility==='limited'?input.groupId:null});
}
