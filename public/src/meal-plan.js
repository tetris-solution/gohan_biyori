export const mealSlots=['朝','昼','晩'];
export function normalizePlan(value,fallback=[1,2,3]){const source=value??fallback;return Object.fromEntries(mealSlots.map((slot,i)=>[slot,Array.isArray(source)?(Number.isSafeInteger(source[i])?[source[i]]:[]):Array.isArray(source?.[slot])?[...source[slot]]:[]]));}
export function flattenPlan(value){return mealSlots.flatMap(slot=>normalizePlan(value,[])[slot]);}
export function validPlan(value,ids){if(Array.isArray(value))return value.length===3&&value.every(id=>Number.isSafeInteger(id)&&ids.has(id));if(!value||typeof value!=='object'||Object.keys(value).length!==3)return false;return mealSlots.every(slot=>Array.isArray(value[slot])&&value[slot].length<=20&&new Set(value[slot]).size===value[slot].length&&value[slot].every(id=>Number.isSafeInteger(id)&&ids.has(id)));}
export function normalizedLogs(value){return Object.fromEntries(mealSlots.map(slot=>[slot,Array.isArray(value?.[slot])?value[slot]:value?.[slot]?[value[slot]]:[]]));}
export function mealRecords(value){return mealSlots.flatMap(slot=>normalizedLogs(value)[slot]);}
export function recentEntries(items){return items.map((item,index)=>({item,index})).sort((a,b)=>{const time=x=>{if(x.createdAt)return typeof x.createdAt==='number'?x.createdAt:Date.parse(x.createdAt)||0;return typeof x.id==='number'&&x.id>100000000000?x.id:0;};return time(b.item)-time(a.item)||b.index-a.index;});}
