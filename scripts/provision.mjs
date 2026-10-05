import {readFileSync,writeFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
const account=process.env.CLOUDFLARE_ACCOUNT_ID,token=process.env.CLOUDFLARE_API_TOKEN;
if(!account||!token)throw Error('CLOUDFLARE_ACCOUNT_ID と CLOUDFLARE_API_TOKEN をシークレットに設定してください');
const api=async(path,options={})=>{const response=await fetch(`https://api.cloudflare.com/client/v4/accounts/${account}/${path}`,{...options,headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'}});const data=await response.json();if(!response.ok||!data.success)throw Error(`Cloudflare API error: ${response.status} ${JSON.stringify(data.errors)}`);return data.result};
const config=JSON.parse(readFileSync('wrangler.jsonc','utf8'));const name=config.d1_databases[0].database_name;
let database;
for(let page=1;page<=100;page++){const list=await api(`d1/database?per_page=100&page=${page}`);database=list.find(d=>d.name===name);if(database||list.length<100)break;}
if(!database)database=await api('d1/database',{method:'POST',body:JSON.stringify({name})});
config.d1_databases[0].database_id=database.uuid;writeFileSync('wrangler.jsonc',JSON.stringify(config,null,2)+'\n');
execFileSync('npx',['wrangler','d1','migrations','apply',name,'--remote'],{stdio:'inherit'});
execFileSync('npx',['wrangler','deploy'],{stdio:'inherit'});
