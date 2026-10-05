const encoder = new TextEncoder();
const sessionLifetime = 30 * 24 * 60 * 60;
const cookieName = '__Host-konade';
const hash = async value => BufferlessHex(await crypto.subtle.digest('SHA-256', encoder.encode(value)));
function BufferlessHex(value) { return Array.from(new Uint8Array(value), b => b.toString(16).padStart(2, '0')).join(''); }
const random = () => BufferlessHex(crypto.getRandomValues(new Uint8Array(32)));
async function passwordHash(password, salt) {
  const key = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']);
  return BufferlessHex(await crypto.subtle.deriveBits({name:'PBKDF2', hash:'SHA-256', salt:encoder.encode(salt), iterations:100000}, key, 256));
}
function equal(a, b) { if (a.length !== b.length) return false; let result=0; for(let i=0;i<a.length;i++) result |= a.charCodeAt(i)^b.charCodeAt(i); return result===0; }
function json(data, status=200, headers={}) { return new Response(JSON.stringify(data), {status, headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store',...headers}}); }
const sessionCookie = token => `${cookieName}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${sessionLifetime}`;
async function currentUser(request, db) {
  const token=request.headers.get('Cookie')?.split(';').map(s=>s.trim()).find(s=>s.startsWith(cookieName+'='))?.slice(cookieName.length+1);
  if(!token||!/^[a-f0-9]{64}$/.test(token)) return null;
  return db.prepare('SELECT users.id, users.username FROM sessions JOIN users ON users.id=sessions.user_id WHERE token_hash=? AND expires_at>?').bind(await hash(token),Date.now()).first();
}
async function body(request, limit=1100000) {
  if(Number(request.headers.get('Content-Length'))>limit) throw new Error('TOO_LARGE');
  const reader=request.body?.getReader(); if(!reader) throw new Error('BAD_BODY');let size=0,chunks=[];
  while(true){const {value,done}=await reader.read();if(done)break;size+=value.byteLength;if(size>limit){await reader.cancel();throw new Error('TOO_LARGE')}chunks.push(value)}
  const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length}
  try{return JSON.parse(new TextDecoder().decode(bytes))}catch{throw new Error('BAD_BODY')}
}
function validData(data) {
  if(!data||typeof data!=='object'||Array.isArray(data))return false;
  for(const key of ['recipes','foods','shopping','stores'])if(!Array.isArray(data[key])||data[key].length>2000)return false;
  if(!data.plans||typeof data.plans!=='object'||Array.isArray(data.plans)||Object.keys(data.plans).length>730)return false;
  if(!data.foods.every(x=>x&&typeof x.name==='string'&&typeof x.qty==='string'&&typeof x.emoji==='string'))return false;
  if(!data.recipes.every(x=>x&&typeof x.name==='string'&&Array.isArray(x.ingredients)&&x.ingredients.every(i=>typeof i==='string')&&Number.isFinite(x.time)&&['朝','昼','晩'].includes(x.meal)&&typeof x.img==='string'&&Number.isSafeInteger(x.id)&&(!x.url||/^https?:\/\//.test(x.url))&&(x.kcal===undefined||Number.isFinite(x.kcal))))return false;
  if(!data.shopping.every(x=>x&&typeof x.name==='string'&&typeof x.done==='boolean'))return false;
  if(!data.stores.every(x=>x&&typeof x.name==='string'&&typeof x.url==='string'&&/^https?:\/\//.test(x.url)))return false;
  return Object.values(data.plans).every(p=>Array.isArray(p)&&p.length===3&&p.every(id=>data.recipes.some(r=>r.id===id)));
}
async function api(request, env) {
  const url=new URL(request.url), path=url.pathname, db=env.DB;
  if(!db)return json({error:'DBがまだ設定されていません'},503);
  if(!['GET','POST','PUT','DELETE'].includes(request.method))return json({error:'許可されていない操作です'},405);
  if(request.method!=='GET'){
    if(request.headers.get('Origin')!==url.origin)return json({error:'許可されていないアクセスです'},403);
    if(!(path==='/api/images'&&request.method==='POST')&&!request.headers.get('Content-Type')?.startsWith('application/json'))return json({error:'JSONで送信してください'},415);
  }
  if(path==='/api/signup'||path==='/api/login'){
    if(request.method!=='POST')return json({error:'POSTが必要です'},405);
    const now=Date.now(),ip=request.headers.get('CF-Connecting-IP')||'local';
    const bucket=await hash(ip+':'+Math.floor(now/600000));
    await db.prepare('DELETE FROM auth_attempts WHERE expires_at<?').bind(now).run();
    const attempt=await db.prepare('INSERT INTO auth_attempts(bucket,attempts,expires_at) VALUES(?,1,?) ON CONFLICT(bucket) DO UPDATE SET attempts=attempts+1 RETURNING attempts').bind(bucket,now+600000).first();
    if(attempt.attempts>20)return json({error:'試行が多すぎます。10分ほど待ってください'},429);
    const input=await body(request,4096);const username=typeof input.username==='string'?input.username.trim().toLowerCase():'';const password=input.password;
    if(!/^[a-z0-9_-]{3,40}$/.test(username)||typeof password!=='string'||password.length<12||password.length>128)return json({error:'ユーザー名は英数字・_・-で3〜40文字、パスワードは12〜128文字にしてください'},400);
    let user=await db.prepare('SELECT * FROM users WHERE username=?').bind(username).first();
    if(path==='/api/signup'){
      if(user)return json({error:'このユーザー名は使用できません'},409);
      const id=crypto.randomUUID(),salt=random(),digest=await passwordHash(password,salt);
      try{await db.prepare('INSERT INTO users(id,username,password_hash,salt,created_at) VALUES(?,?,?,?,?)').bind(id,username,digest,salt,now).run()}catch(e){if(String(e).includes('UNIQUE'))return json({error:'このユーザー名は使用できません'},409);throw e}
      user={id,username};
    }else{
      const digest=await passwordHash(password,user?.salt||'nonexistent-user-salt');
      if(!user||!equal(digest,user.password_hash))return json({error:'ユーザー名またはパスワードが違います'},401);
    }
    const token=random();await db.prepare('DELETE FROM sessions WHERE expires_at<?').bind(now).run();
    await db.prepare('INSERT INTO sessions(token_hash,user_id,expires_at) VALUES(?,?,?)').bind(await hash(token),user.id,now+sessionLifetime*1000).run();
    return json({user:{id:user.id,username:user.username}},200,{'Set-Cookie':sessionCookie(token)});
  }
  const user=await currentUser(request,db);
  if(!user)return json({error:'ログインしてください'},401);
  if(path==='/api/me'&&request.method==='GET')return json({user});
  if(path==='/api/images'||path.startsWith('/api/images/')){
    if(!env.IMAGES)return json({error:'画像用のR2が未設定です'},503);
    const prefix=user.id+'/';
    if(path==='/api/images'&&request.method==='GET'){
      const cursor=url.searchParams.get('cursor')||undefined;
      const list=await env.IMAGES.list({prefix,limit:100,cursor,include:['customMetadata']});
      return json({images:list.objects.map(o=>({id:o.key.slice(prefix.length),name:o.customMetadata?.name||'画像',kind:o.customMetadata?.kind||'food',uploaded:o.uploaded,size:o.size})),cursor:list.truncated?list.cursor:null});
    }
    if(path==='/api/images'&&request.method==='POST'){
      const limit=5*1024*1024,type=request.headers.get('Content-Type')?.split(';')[0];
      if(!['image/jpeg','image/png','image/webp'].includes(type))return json({error:'JPEG・PNG・WebP画像を選んでください'},415);
      if(Number(request.headers.get('Content-Length'))>limit)return json({error:'画像は5MB以下にしてください'},413);
      const reader=request.body?.getReader();if(!reader)return json({error:'画像を選んでください'},400);
      const chunks=[];let size=0;
      while(true){const {value,done}=await reader.read();if(done)break;size+=value.byteLength;if(size>limit){await reader.cancel();return json({error:'画像は5MB以下にしてください'},413)}chunks.push(value)}
      const bytes=new Uint8Array(size);let offset=0;for(const c of chunks){bytes.set(c,offset);offset+=c.length}
      const valid=(type==='image/jpeg'&&bytes[0]===255&&bytes[1]===216&&bytes[2]===255)||(type==='image/png'&&[137,80,78,71,13,10,26,10].every((b,i)=>bytes[i]===b))||(type==='image/webp'&&new TextDecoder().decode(bytes.slice(0,4))==='RIFF'&&new TextDecoder().decode(bytes.slice(8,12))==='WEBP');
      if(!valid)return json({error:'画像形式を確認してください'},400);
      let name;try{name=decodeURIComponent(request.headers.get('X-Image-Name')||'画像').slice(0,120)}catch{return json({error:'ファイル名を確認してください'},400)}
      const kind=request.headers.get('X-Image-Kind')||'food';if(!['food','recipe','receipt'].includes(kind))return json({error:'画像の分類を確認してください'},400);
      const id=crypto.randomUUID();await env.IMAGES.put(prefix+id,bytes,{httpMetadata:{contentType:type},customMetadata:{name,kind}});
      return json({id,name,kind},201);
    }
    const id=path.slice('/api/images/'.length);if(!/^[a-f0-9-]{36}$/.test(id))return json({error:'画像がありません'},404);
    if(request.method==='GET'){
      const image=await env.IMAGES.get(prefix+id);if(!image)return json({error:'画像がありません'},404);
      return new Response(image.body,{headers:{'Content-Type':image.httpMetadata?.contentType||'application/octet-stream','Cache-Control':'private, no-store'}});
    }
    if(request.method==='DELETE'){await env.IMAGES.delete(prefix+id);return json({ok:true})}
    return json({error:'許可されていない操作です'},405);
  }

  if(path==='/api/logout'&&request.method==='POST'){
    const token=request.headers.get('Cookie')?.split(';').map(s=>s.trim()).find(s=>s.startsWith(cookieName+'='))?.slice(cookieName.length+1);
    if(token)await db.prepare('DELETE FROM sessions WHERE token_hash=?').bind(await hash(token)).run();
    return json({ok:true},200,{'Set-Cookie':`${cookieName}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`});
  }
  if(path==='/api/data'&&request.method==='GET'){
    const row=await db.prepare('SELECT data,version FROM user_data WHERE user_id=?').bind(user.id).first();
    return json({data:row?JSON.parse(row.data):null,version:row?.version||0});
  }
  if(path==='/api/data'&&request.method==='PUT'){
    const input=await body(request);if(!validData(input.data)||!Number.isSafeInteger(input.version)||input.version<0)return json({error:'保存データの形式が正しくありません'},400);
    const payload=JSON.stringify(input.data);
    const result=await db.prepare('INSERT INTO user_data(user_id,data,version,updated_at) VALUES(?,?,1,?) ON CONFLICT(user_id) DO UPDATE SET data=excluded.data,version=user_data.version+1,updated_at=excluded.updated_at WHERE user_data.version=? RETURNING version').bind(user.id,payload,Date.now(),input.version).first();
    if(!result)return json({error:'別の端末で更新されています。未保存の内容を控えてから再読み込みしてください'},409);
    return json({version:result.version});
  }
  return json({error:'ページがありません'},404);
}
export default {async fetch(request, env){
  let response;
  try{response=new URL(request.url).pathname.startsWith('/api/')?await api(request,env):await env.ASSETS.fetch(request)}catch(e){response=json({error:e.message==='TOO_LARGE'?'データが大きすぎます':e.message==='BAD_BODY'?'送信データを確認してください':'処理に失敗しました。時間をおいて再試行してください'},e.message==='TOO_LARGE'?413:e.message==='BAD_BODY'?400:500)}
  const headers=new Headers(response.headers);headers.set('X-Content-Type-Options','nosniff');headers.set('Referrer-Policy','strict-origin-when-cross-origin');headers.set('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' https://images.unsplash.com data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'");
  return new Response(response.body,{status:response.status,headers});
}};
