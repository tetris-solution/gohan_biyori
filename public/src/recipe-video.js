const safeHttps=value=>{try{const u=new URL(value);if(u.protocol!=='https:'||u.username||u.password||(u.port&&u.port!=='443')||!u.hostname.includes('.')||u.hostname.includes(':')||/^\d+(?:\.\d+){3}$/.test(u.hostname)||/(^|\.)(localhost|local|internal|lan|home|test|invalid|example|onion)\.?$/.test(u.hostname))return null;return u;}catch{return null;}};
export function normalizeVideo(value){
 const u=safeHttps(typeof value==='string'?value:value?.url||'');if(!u)return null;const host=u.hostname.toLowerCase().replace(/^www\./,''),parts=u.pathname.split('/').filter(Boolean);
 if(host==='instagram.com'&&['p','reel','tv'].includes(parts[0])&&/^[a-zA-Z0-9_-]{5,64}$/.test(parts[1]||''))return {kind:'embed',url:'https://www.instagram.com/'+parts[0]+'/'+parts[1]+'/embed/'};
 let id;if(host==='youtu.be')id=parts[0];else if(['youtube.com','m.youtube.com','youtube-nocookie.com'].includes(host))id=u.searchParams.get('v')||(['embed','shorts','live'].includes(parts[0])?parts[1]:null);
 if(id&&/^[a-zA-Z0-9_-]{11}$/.test(id))return {kind:'embed',url:'https://www.youtube-nocookie.com/embed/'+id};
 if(['vimeo.com','player.vimeo.com'].includes(host)){id=parts.find(p=>/^\d{1,12}$/.test(p));if(id){const h=u.searchParams.get('h')||parts[parts.indexOf(id)+1];return {kind:'embed',url:'https://player.vimeo.com/video/'+id+(h&&/^[a-f0-9]{6,32}$/.test(h)?'?h='+h:'')};}}
 if(/\.(mp4|webm|m4v)$/i.test(u.pathname))return {kind:'file',url:u.href};return null;
}
export function validVideo(v){const normalized=normalizeVideo(v);return !!normalized&&v.kind===normalized.kind&&v.url===normalized.url;}
