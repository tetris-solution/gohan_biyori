const number='(?:\\d+(?:\\.\\d+)?(?:\\/\\d+(?:\\.\\d+)?)?)';
const amountPattern=new RegExp('^(.+?)[\\s:：.…・]*((大さじ|小さじ)\\s*('+number+')|('+number+')\\s*(kg|g|ml|mL|L|個|本|枚|袋|束|パック|カップ|粒|玉|尾))\\s*$');
export const normalizeRecipeText=value=>String(value).normalize('NFKC').replace(/大さず|大さし|大匙/g,'大さじ').replace(/小さず|小さし|小匙/g,'小さじ');
function quantity(value){const [a,b]=value.split('/').map(Number);return b===undefined?a:b>0?a/b:null;}
export function sourceIngredients(text){return normalizeRecipeText(text).split(/\r?\n/).flatMap(raw=>{const line=raw.trim().replace(/^[\s●○■□◆◇・*\-\p{Extended_Pictographic}\uFE0F]+/u,'');const m=line.match(amountPattern),unknown=line.match(/^(.+?)[\s:：.…・]+(適量|少々)$/);if(!m&&!unknown)return [];const name=(m?.[1]||unknown[1]).trim();if(!name||name.length>100||/を|作り方|手順|材料|調理時間/.test(name))return [];const q=m?quantity(m[4]||m[5]):null,unit=m?(m[3]||m[6]):'';if(m&&(!Number.isFinite(q)||q<=0))return [];return [{name,quantity:q,unit,amountText:m?m[2]:unknown[2]}];});}
export function correctRecipeExtraction(result,source=''){
 const originals=sourceIngredients(source),warnings=[];const ingredients=result.requiredIngredients.map(i=>{
  let name=normalizeRecipeText(i.name),unit=normalizeRecipeText(i.unit),amountText=normalizeRecipeText(i.amountText);let original=originals.find(o=>o.name===name);
  if(name==='宝'&&!source.includes('宝')){const eggs=originals.filter(o=>['卵','玉子','たまご'].includes(o.name)&&o.quantity===i.quantity);if(eggs.length===1){original=eggs[0];name=original.name;}}
  if(original)return {...i,...original};
  if(source&&!normalizeRecipeText(source).includes(name))warnings.push('材料名「'+name+'」を原文と確認してください');
  return {...i,name,unit,amountText};
 });for(const original of originals)if(!ingredients.some(i=>i.name===original.name))ingredients.push(original);
 return {...result,requiredIngredients:ingredients,steps:(result.steps||[]).map(normalizeRecipeText),reviewWarnings:[...new Set(warnings)]};
}
