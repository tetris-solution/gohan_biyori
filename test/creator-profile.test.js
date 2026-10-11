import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import worker from '../worker.js';
function memoryDatabase(){
 const sql=new DatabaseSync(':memory:');sql.exec('PRAGMA foreign_keys=ON');
 const prepare=(query,args=[])=>({bind(...values){return prepare(query,values)},async first(){return sql.prepare(query).get(...args)||null},async all(){return {results:sql.prepare(query).all(...args)}},async run(){return {meta:{changes:Number(sql.prepare(query).run(...args).changes)}}}});
 return {prepare,async batch(statements){sql.exec('BEGIN');try{const result=[];for(const statement of statements)result.push(await statement.run());sql.exec('COMMIT');return result;}catch(error){sql.exec('ROLLBACK');throw error;}}};
}
test('creator avatars verify ownership, preserve old clients and follow profile visibility',async()=>{
 const images=new Map(),env={DB:memoryDatabase(),IMAGES:{async head(key){return images.has(key)?{}:null},async get(key){return images.has(key)?{body:images.get(key),httpMetadata:{contentType:'image/png'}}:null}}},base='https://app.test';
 const call=(cookie,path,method='GET',input)=>worker.fetch(new Request(base+'/api/'+path,{method,headers:{Cookie:cookie||'',Origin:base,...(method!=='GET'?{'Content-Type':'application/json'}:{})},...(input?{body:JSON.stringify(input)}:{})}),env);
 const users=[];for(const username of ['portraitowner','portraitviewer']){const response=await call('','signup','POST',{username,password:'a long secure password'});assert.equal(response.status,200);users.push({...await response.json(),cookie:response.headers.get('Set-Cookie').split(';')[0]});}
 const [a,b]=users,imageId='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',other='bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';images.set(a.user.id+'/'+imageId,'portrait');images.set(b.user.id+'/'+other,'private');
 const profile={name:'料理の人',bio:'紹介',category:'和食',enabled:true,recipeIds:[],avatarImageId:imageId};
 assert.equal((await call(a.cookie,'creator/profile','PUT',{...profile,avatarImageId:other})).status,400);
 assert.equal((await call(a.cookie,'creator/profile','PUT',{...profile,avatarImageId:'https://example.com/a.jpg'})).status,400);
 assert.equal((await call(a.cookie,'creator/profile','PUT',profile)).status,200);
 assert.equal((await (await call(a.cookie,'creator/profile')).json()).profile.avatarImageId,imageId);
 const path='creators/'+a.user.id+'/images/'+imageId;assert.equal((await call(b.cookie,path)).status,200);assert.equal(await (await call(b.cookie,path)).text(),'portrait');assert.equal((await call(b.cookie,'creators/'+a.user.id+'/images/'+other)).status,404);
 const {avatarImageId,...oldClient}=profile;assert.equal((await call(a.cookie,'creator/profile','PUT',oldClient)).status,200);assert.ok((await (await call(b.cookie,'creators/'+a.user.id)).json()).creator.avatar.endsWith(imageId));
 assert.equal((await call(a.cookie,'creator/profile','PUT',{...profile,enabled:false})).status,200);assert.equal((await call(b.cookie,path)).status,404);
 assert.equal((await call(a.cookie,'creator/profile','PUT',{...profile,avatarImageId:null})).status,200);assert.equal((await call(b.cookie,path)).status,404);assert.equal((await (await call(a.cookie,'creator/profile')).json()).profile.avatar,null);
});
