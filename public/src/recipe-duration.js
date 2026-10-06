import {choiceField} from './food-fields.js';
export function matchesRecipeDuration(time,filter){return !filter||(filter==='20+'?time>=20:time<=Number(filter));}
export function recipeDurationField(time=15){const current=Number.isFinite(time)&&time>0?time:15;const options=[['5','5分','clock'],['10','10分','clock'],['15','15分','clock'],[String(current>=20?current:20),'20分以上','clock']];if(current<20&&![5,10,15].includes(current))options.push([String(current),current+'分（元の値）','clock']);return choiceField('recipe-time','time','調理時間',String(current),options);}
