(async function(){
const page=location.pathname;
if(!['/suite.html','/tools.html','/precios.html'].includes(page))return;
let catalog;try{const response=await fetch('/assets/catalog.json');if(!response.ok)throw Error('catalog');catalog=await response.json();}catch{return;}
const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
if(page==='/tools.html'){
 const grid=document.querySelector('.hubie-card-grid');if(!grid)return;
 grid.innerHTML=catalog.tools.map(t=>'<article class="hubie-product-card" id="'+escape(t.id)+'"><span class="hubie-card-icon" aria-hidden="true">◇</span><h2>'+escape(t.name)+'</h2><p>Herramienta modular disponible para configurar tu Hubie.</p><a href="/precios.html">Añadir a mi configuración →</a></article>').join('');
}
if(page==='/suite.html'){
 const target=document.querySelector('.giro-split');if(!target)return;
 const section=document.createElement('section');section.className='hubie-page-section';section.innerHTML='<div class="container"><div class="hubie-section-heading"><div><span class="hubie-page-eyebrow">SUITES HUBIE</span><h2>Explora nuestras Suites</h2></div><p>Elige la familia que mejor se adapta a tu operación.</p></div><div class="hubie-card-grid">'+catalog.suites.map(s=>'<article class="hubie-product-card"><span class="hubie-card-icon" aria-hidden="true">◇</span><h3>'+escape(s.name)+'</h3><p>Configura esta Suite con las herramientas que necesita tu negocio.</p><a href="/precios.html">Configurar Suite →</a></article>').join('')+'</div></div>';
 target.closest('section')?.before(section);
}
if(page==='/precios.html'){
 const suiteGrid=document.getElementById('suites'),toolsList=document.getElementById('tools'),extrasList=document.getElementById('extras');
 if(!suiteGrid||!toolsList||!extrasList)return;
 suiteGrid.innerHTML=catalog.suites.map((s,i)=>'<label class="suite-option"><input type="radio" name="suite" value="'+escape(s.name)+'" '+(i===0?'checked':'')+'> '+escape(s.name)+'</label>').join('');
 toolsList.innerHTML=catalog.tools.map(t=>'<label class="tool-option"><input type="checkbox" value="'+escape(t.name)+'"> '+escape(t.name)+'</label>').join('');
 extrasList.innerHTML=catalog.extras.map(t=>'<label class="tool-option"><input type="checkbox" value="'+escape(t.name)+'"> '+escape(t.name)+'</label>').join('');
 suiteGrid.closest('.quote-layout')?.addEventListener('change',()=>{const name=document.querySelector('input[name="suite"]:checked')?.value||'';document.getElementById('selected-suite').textContent='Suite '+name;const ul=document.getElementById('selected-items');ul.replaceChildren();const selected=[...document.querySelectorAll('#tools input:checked,#extras input:checked')].map(x=>x.value);for(const label of selected){const li=document.createElement('li');li.textContent=label;ul.append(li);}if(!selected.length){const li=document.createElement('li');li.textContent='Sin herramientas adicionales';ul.append(li);}});
 document.querySelector('input[name="suite"]')?.dispatchEvent(new Event('change',{bubbles:true}));
}
})();