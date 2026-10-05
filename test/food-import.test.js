import test from 'node:test';
import assert from 'node:assert/strict';
import {extractFoods,normalizeFoods} from '../food-import.js';
const food={name:'トマト',quantity:2,unit:'個',category:'野菜',expiryType:'best-before',expiryDate:''};
test('food extraction supports unknown quantities and strips untrusted fields',async()=>{
  let seen;const foods=[{...food,id:'untrusted',quantity:null},{...food,name:'卵',quantity:10,category:'卵・乳製品',expiryDate:'2026-10-10'}];
  const parsed=await extractFoods({AI:{async run(model,input){assert.equal(model,'@cf/meta/llama-4-scout-17b-16e-instruct');seen=input;return {response:'```json\n'+JSON.stringify({foods})+'\n```'};}}},{arrayBuffer:async()=>new Uint8Array([137,80,78]).buffer,httpMetadata:{contentType:'image/png'}});
  assert.equal(parsed[0].quantity,null);assert.equal(parsed[0].id,undefined);assert.match(seen.messages[0].content[1].image_url.url,/^data:image\/png;base64,/);assert.equal(parsed[1].expiryDate,'2026-10-10');assert.deepEqual(normalizeFoods({foods:[]}),[]);
});
test('invalid AI quantities, dates and excessive results are rejected',()=>{
  for(const patch of [{quantity:-1},{quantity:'2'},{quantity:Infinity},{expiryDate:'2026-02-30'},{category:'日用品'},{name:''},{unit:'x'.repeat(31)}])assert.throws(()=>normalizeFoods({foods:[{...food,...patch}]}));
  assert.throws(()=>normalizeFoods({foods:Array(51).fill(food)}));
});
