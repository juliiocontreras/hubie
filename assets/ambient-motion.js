(function(){
const reduced=window.matchMedia('(prefers-reduced-motion: reduce)');
const images=[...document.querySelectorAll('.hubie-editorial-card img')];
if(!images.length||reduced.matches)return;
let scheduled=false;
function update(){
 const h=window.innerHeight;
 images.forEach(img=>{const rect=img.parentElement.getBoundingClientRect();if(rect.bottom<0||rect.top>h)return;const shift=Math.max(-14,Math.min(14,(h/2-(rect.top+rect.height/2))*.045));img.style.setProperty('--hubie-parallax',shift.toFixed(1)+'px');});
 scheduled=false;
}
function onScroll(){if(!scheduled){scheduled=true;requestAnimationFrame(update);}}
addEventListener('scroll',onScroll,{passive:true});addEventListener('resize',onScroll,{passive:true});update();
reduced.addEventListener('change',()=>{if(reduced.matches){images.forEach(img=>img.style.removeProperty('--hubie-parallax'));removeEventListener('scroll',onScroll);removeEventListener('resize',onScroll);}});
})();