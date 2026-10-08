// Only canonicalize actual Instagram post URLs; share redirects still need resolving.
export function canonicalRecipeUrl(value){
 const url=new URL(value);
 if(['instagram.com','www.instagram.com','m.instagram.com'].includes(url.hostname.toLowerCase())&&/^\/(?:p|reel|reels|tv)\/[A-Za-z0-9_-]+\/?$/.test(url.pathname)){
  url.hostname='www.instagram.com';url.pathname=url.pathname.replace(/^\/reels\//,'/reel/').replace(/\/?$/,'/');url.search='';url.hash='';
 }
 return url.href;
}
export function isInstagramUrl(value){try{return ['instagram.com','www.instagram.com','m.instagram.com'].includes(new URL(value).hostname.toLowerCase());}catch{return false;}}
