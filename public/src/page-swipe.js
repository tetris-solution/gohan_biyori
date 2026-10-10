// Touch navigation leaves native vertical scrolling and nested controls alone.
export function installPageSwipe({canSwipe,onNavigate}){
  let gesture=null,suppressClickUntil=0;
  const reduced=()=>matchMedia('(prefers-reduced-motion:reduce)').matches;
  function reset(){const g=gesture;gesture=null;if(!g)return;g.content.style.transform='';g.content.style.willChange='';if(g.locked&&!reduced()&&g.content.isConnected)g.content.animate([{transform:`translateX(${g.offset}px)`},{transform:'translateX(0)'}],{duration:160,easing:'ease-out'});}
  function excluded(target,content){if(target.closest('input,textarea,select,button,a,summary,iframe,video,[contenteditable="true"],[role="slider"]'))return true;for(let el=target;el&&el!==content;el=el.parentElement){const css=getComputedStyle(el);if(el.scrollWidth>el.clientWidth+2&&/(auto|scroll)/.test(css.overflowX))return true;}return false;}
  document.addEventListener('touchstart',event=>{
    reset();if(event.touches.length!==1||!matchMedia('(max-width:760px)').matches||!canSwipe()||document.querySelector('dialog[open]'))return;
    const content=event.target.closest('.content'),touch=event.touches[0];if(!content||excluded(event.target,content)||touch.clientX<24||touch.clientX>innerWidth-24)return;
    const tabs=[...document.querySelectorAll('.nav button[data-view]')].map(b=>b.dataset.view),current=document.querySelector('.nav button.active')?.dataset.view,index=tabs.indexOf(current);if(index<0)return;
    gesture={content,tabs,index,id:touch.identifier,x:touch.clientX,y:touch.clientY,offset:0,dx:0,locked:false};
  },{passive:true});
  document.addEventListener('touchmove',event=>{
    const g=gesture;if(!g)return;if(event.touches.length!==1||!g.content.isConnected){reset();return;}const touch=[...event.touches].find(t=>t.identifier===g.id);if(!touch)return;
    const dx=touch.clientX-g.x,dy=touch.clientY-g.y;if(!g.locked){if(Math.max(Math.abs(dx),Math.abs(dy))<10)return;if(Math.abs(dx)<=Math.abs(dy)*1.3){gesture=null;return;}g.locked=true;g.content.getAnimations().forEach(a=>a.cancel());g.content.style.willChange='transform';}
    if(!event.cancelable){reset();return;}event.preventDefault();g.dx=dx;const next=g.index+(dx<0?1:-1);g.offset=next<0||next>=g.tabs.length?dx*.18:Math.max(-innerWidth*.65,Math.min(innerWidth*.65,dx));if(!reduced())g.content.style.transform=`translateX(${g.offset}px)`;
  },{passive:false});
  document.addEventListener('touchend',event=>{
    const g=gesture;if(!g||![...event.changedTouches].some(t=>t.identifier===g.id))return;
    if(g.locked)suppressClickUntil=Date.now()+400;const direction=g.dx<0?1:-1,next=g.index+direction;
    if(g.locked&&Math.abs(g.dx)>=Math.max(56,Math.min(100,innerWidth*.2))&&next>=0&&next<g.tabs.length&&g.content.isConnected){gesture=null;g.content.style.transform='';g.content.style.willChange='';onNavigate(g.tabs[next],direction);}else reset();
  },{passive:true});
  document.addEventListener('touchcancel',reset,{passive:true});
  document.addEventListener('click',event=>{if(Date.now()<suppressClickUntil){event.preventDefault();event.stopImmediatePropagation();}},{capture:true});
  window.addEventListener('resize',reset);window.addEventListener('pagehide',reset);
}
