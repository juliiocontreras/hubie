(function(){
'use strict';
const reduced=window.matchMedia('(prefers-reduced-motion: reduce)');
const finePointer=window.matchMedia('(pointer: fine)');
let tracked=[],observer=null,raf=0,active=true;
function discover(){
 tracked=[...document.querySelectorAll('.hubie-editorial-card img,.hubie-suite-card,.hubie-page-hero,.hero,.hubie-suite-choice')];
 if(observer)observer.disconnect();
 if('IntersectionObserver' in window){
  observer=new IntersectionObserver(entries=>{
   for(const entry of entries)entry.target.dataset.hubieVisible=entry.isIntersecting?'1':'0';
   schedule();
  },{rootMargin:'120px 0px'});
  tracked.forEach(el=>observer.observe(el));
 }else tracked.forEach(el=>el.dataset.hubieVisible='1');
 schedule();
}
function clearMotion(){
 for(const el of tracked){
  el.style.removeProperty('--hubie-parallax');
  el.style.removeProperty('--hubie-scroll-y');
  el.style.removeProperty('--hubie-parallax-depth');
  el.style.removeProperty('--hubie-pointer-x');
  el.style.removeProperty('--hubie-pointer-y');
 }
}
function update(){
 raf=0;
 if(reduced.matches||!active)return;
 const vh=window.innerHeight||800;
 for(const el of tracked){
  if(el.dataset.hubieVisible==='0')continue;
  const rect=el.getBoundingClientRect();
  if(rect.bottom<0||rect.top>vh)continue;
  const progress=Math.max(-1,Math.min(1,(vh*.5-(rect.top+rect.height*.5))/(vh*.5+rect.height*.5)));
  if(el.matches('.hubie-editorial-card img')){
   el.style.setProperty('--hubie-parallax',(progress*13).toFixed(1)+'px');
  }else if(el.matches('.hubie-suite-card,.hubie-suite-choice')){
   el.style.setProperty('--hubie-scroll-y',(progress*-9).toFixed(1)+'px');
   el.style.setProperty('--hubie-parallax-depth',(progress*2.5).toFixed(1)+'deg');
  }else{
   el.style.setProperty('--hubie-scroll-y',(progress*-17).toFixed(1)+'px');
  }
 }
}
function schedule(){if(!raf&&!reduced.matches&&active)raf=requestAnimationFrame(update);}
function onPointer(event){
 if(!finePointer.matches||reduced.matches)return;
 const card=event.target.closest('.hubie-suite-card');
 if(!card)return;
 const rect=card.getBoundingClientRect();
 const x=(event.clientX-rect.left)/rect.width-.5;
 const y=(event.clientY-rect.top)/rect.height-.5;
 card.style.setProperty('--hubie-pointer-x',(x*6).toFixed(1)+'deg');
 card.style.setProperty('--hubie-pointer-y',(y*-6).toFixed(1)+'deg');
}
function resetPointer(event){
 const card=event.target.closest('.hubie-suite-card');
 if(card){card.style.removeProperty('--hubie-pointer-x');card.style.removeProperty('--hubie-pointer-y');}
}
document.addEventListener('pointermove',onPointer,{passive:true});
document.addEventListener('pointerout',resetPointer,{passive:true});
window.addEventListener('scroll',schedule,{passive:true});
window.addEventListener('resize',schedule,{passive:true});
document.addEventListener('visibilitychange',()=>{active=!document.hidden;if(active)schedule();});
reduced.addEventListener('change',()=>{if(reduced.matches){if(raf)cancelAnimationFrame(raf);raf=0;clearMotion();}else schedule();});
document.addEventListener('hubie:catalog-rendered',discover);
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',discover,{once:true});else discover();
})();