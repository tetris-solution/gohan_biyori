import {normalizeVideo} from './public/src/recipe-video.js';
const decode=s=>String(s||'').replace(/&amp;/gi,'&').replace(/&quot;/gi,'"').replace(/&#39;/g,"'");
export function videoFromPage(html,base){
 const candidates=[];const add=v=>{if(typeof v==='string')candidates.push(v);else if(Array.isArray(v))v.forEach(add);else if(v&&typeof v==='object'){add(v.contentUrl);add(v.embedUrl);add(v.url);}};
 function visit(v,depth=0){if(depth>12||!v||typeof v!=='object')return;if(Array.isArray(v)){v.forEach(x=>visit(x,depth+1));return;}const types=Array.isArray(v['@type'])?v['@type']:[v['@type']];if(types.includes('Recipe'))add(v.video);if(types.includes('VideoObject'))add(v);Object.values(v).forEach(x=>{if(typeof x==='object')visit(x,depth+1);});}
 for(const match of html.matchAll(/<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)){try{visit(JSON.parse(match[1]));}catch{}}
 const attrs=tag=>Object.fromEntries([...tag.matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)].map(m=>[m[1].toLowerCase(),decode(m[2]??m[3])]));
 for(const m of html.matchAll(/<meta\b[^>]*>/gi)){const a=attrs(m[0]);if(/^(og:video(?::url|:secure_url)?|twitter:player)$/i.test(a.property||a.name||''))add(a.content);}
 for(const m of html.matchAll(/<video\b[^>]*>[\s\S]*?<\/video>/gi)){add(attrs(m[0].slice(0,m[0].indexOf('>')+1)).src);for(const source of m[0].matchAll(/<source\b[^>]*>/gi))add(attrs(source[0]).src);}
 for(const m of html.matchAll(/<iframe\b[^>]*>/gi))add(attrs(m[0]).src);
 for(const value of candidates){try{const video=normalizeVideo(new URL(decode(value),base).href);if(video)return video;}catch{}}
 return normalizeVideo(base);
}
