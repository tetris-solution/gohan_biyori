import {sharingApi} from './sharing.js';
import {hasCommerceAccess} from './commerce.js';
export const communitySchema=[
 'CREATE TABLE IF NOT EXISTS community_groups(group_id TEXT PRIMARY KEY REFERENCES sharing_groups(id) ON DELETE CASCADE)',
 'CREATE TABLE IF NOT EXISTS commerce_recipes(product_id TEXT NOT NULL REFERENCES commerce_products(id) ON DELETE CASCADE,user_id TEXT NOT NULL REFERENCES users(id),recipe_id INTEGER NOT NULL,data TEXT NOT NULL,updated_at INTEGER NOT NULL,PRIMARY KEY(product_id,user_id,recipe_id))'
];
export async function communitiesApi(request,env,user,helpers){
 const {json}=helpers,db=env.DB;
 // Verify schema before creating a sharing group so schema retry cannot duplicate it.
 await db.prepare('SELECT group_id FROM community_groups LIMIT 1').all();
 if(request.method==='POST'){
  const url=new URL(request.url);url.pathname='/api/sharing/groups';const response=await sharingApi(new Request(url,request),env,user,helpers);if(response.status!==201)return response;const created=await response.json();await db.prepare('INSERT INTO community_groups(group_id) VALUES(?)').bind(created.group.id).run();return json({id:created.group.id,group:created.group},201);
 }
 if(request.method!=='GET')return json({error:'許可されていない操作です'},405);
 const groups=await db.prepare('SELECT g.id,g.name,g.owner_id,(SELECT COUNT(*) FROM sharing_members WHERE group_id=g.id) AS member_count FROM sharing_groups g JOIN community_groups c ON c.group_id=g.id JOIN sharing_members m ON m.group_id=g.id WHERE m.user_id=? ORDER BY g.created_at DESC').bind(user.id).all();
 const paid=await db.prepare("SELECT p.* FROM commerce_products p WHERE p.kind='community' AND (p.creator_id=? OR EXISTS(SELECT 1 FROM commerce_memberships m WHERE m.product_id=p.id AND m.user_id=?)) ORDER BY p.created_at DESC").bind(user.id,user.id).all();
 const communities=groups.results.map(g=>({id:g.id,name:g.name,kind:'free',ownerId:g.owner_id,owner:g.owner_id===user.id,accessible:true,memberCount:g.member_count}));
 for(const p of paid.results)communities.push({id:'paid:'+p.id,productId:p.id,name:p.title,kind:'paid',owner:p.creator_id===user.id,accessible:await hasCommerceAccess(db,user.id,p),published:!!p.published,price:p.price});
 return json({communities});
}
