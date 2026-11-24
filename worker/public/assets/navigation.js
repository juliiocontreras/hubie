/* Hubie shared navigation — one source of truth for all public pages. */
(()=>{'use strict';
const header=document.querySelector('header.site-header');if(!header)return;
const path=location.pathname.split('/').pop()||'index.html';
const items=[['index.html','Inicio'],['suite.html','Suites'],['tools.html','Herramientas'],['shop.html','Tienda'],['servicios.html','Servicios'],['precios.html','Cotizador'],['contacto.html','Contacto']];
const active=path==='productos.html'?'suite.html':path;
const navItems=items.map(([href,label])=>'<a class="hubie-nav__link'+(active===href?' is-current':'')+'" href="/'+href+'"'+(active===href?' aria-current="page"':'')+'>'+label+'</a>').join('');
header.innerHTML='<div class="container hubie-nav"><a class="hubie-nav__brand" href="/index.html" aria-label="Hubie, ir al inicio"><span class="hubie-nav__symbol" aria-hidden="true">›</span><span>hubie<span class="hubie-nav__brand-dot">.</span></span></a><nav class="hubie-nav__links" id="hubie-nav-links" aria-label="Navegación principal">'+navItems+'</nav><a class="hubie-nav__cta" href="/contacto.html">Solicitar asesoría <span aria-hidden="true">↗</span></a><button class="hubie-nav__toggle" type="button" aria-label="Abrir menú" aria-expanded="false" aria-controls="hubie-nav-links"><span></span><span></span><span></span></button></div>';
const toggle=header.querySelector('.hubie-nav__toggle'),nav=header.querySelector('.hubie-nav__links');
function close(){toggle.setAttribute('aria-expanded','false');toggle.setAttribute('aria-label','Abrir menú');header.classList.remove('hubie-nav--open')}
toggle.addEventListener('click',()=>{const open=toggle.getAttribute('aria-expanded')!=='true';toggle.setAttribute('aria-expanded',String(open));toggle.setAttribute('aria-label',open?'Cerrar menú':'Abrir menú');header.classList.toggle('hubie-nav--open',open)});
document.addEventListener('pointerdown',e=>{if(!header.contains(e.target))close()});
document.addEventListener('keydown',e=>{if(e.key==='Escape'){close();toggle.focus()}});
nav.addEventListener('click',e=>{if(e.target.closest('a'))close()});
window.addEventListener('resize',()=>{if(window.innerWidth>980)close()});
})();