(async function(){
const page=location.pathname;
if(!['/suite.html','/tools.html','/precios.html'].includes(page))return;
let catalog;try{const response=await fetch('/assets/catalog.json');if(!response.ok)throw Error('catalog');catalog=await response.json();}catch{return;}
const money=n=>new Intl.NumberFormat('es-MX',{style:'currency',currency:'MXN',maximumFractionDigits:0}).format(n);
const palette=['#e64a93','#0ca58b','#8158e6','#ed8c28','#df6545','#477fe8','#6951d7','#2eae85','#bd6a35','#da559a'];
const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
if(page==='/tools.html'){
 const grid=document.querySelector('.hubie-card-grid');if(!grid)return;
 grid.innerHTML=catalog.tools.map(t=>'<article class="hubie-product-card" id="'+escape(t.id)+'"><span class="hubie-card-icon" aria-hidden="true">◇</span><h2>'+escape(t.name)+'</h2><p>Herramienta modular disponible para configurar tu Hubie.</p><a href="/precios.html">Añadir a mi configuración →</a></article>').join('');
}
if(page==='/suite.html'){
 const target=document.querySelector('.giro-split');if(!target)return;
 const section=document.createElement('section');section.className='hubie-page-section';section.innerHTML='<div class="container"><div class="hubie-section-heading"><div><span class="hubie-page-eyebrow">SUITES HUBIE</span><h2>Explora nuestras Suites</h2></div><p>Elige la familia que mejor se adapta a tu operación.</p></div><div class="hubie-card-grid">'+catalog.suites.map((s,i)=>'<article class="hubie-product-card hubie-suite-card" style="--suite-accent:'+palette[i%palette.length]+'"><span class="hubie-card-icon" aria-hidden="true">'+['✿','✚','⌂','▣','♨','▤','◎','♧','✎','✧'][i%10]+'</span><h3>'+escape(s.name)+'</h3><p>Setup '+money(s.price)+' MXN · '+s.users+' usuarios incluidos.</p><a href="/precios.html">Configurar Suite →</a></article>').join('')+'</div></div>';
 target.closest('section')?.before(section);
}
if(page==='/precios.html'){
 const suiteGrid=document.getElementById('suites'),toolsList=document.getElementById('tools'),extrasList=document.getElementById('extras');
 if(!suiteGrid||!toolsList||!extrasList)return;

 const selectable=catalog.tools.filter(t=>!t.included);
 suiteGrid.innerHTML=catalog.suites.map((s,i)=>'<label class="suite-option"><input type="radio" name="suite" value="'+escape(s.name)+'" '+(i===0?'checked':'')+'> <span>'+escape(s.name)+'<small style="display:block;color:#64748b">'+money(s.price)+'</small></span></label>').join('');
 toolsList.innerHTML='<details class="hubie-core-details" open><summary><strong>Core incluido en todas las Suites</strong><span>10 herramientas · $0 adicionales</span></summary><div id="hubie-core-list" class="hubie-core-list">'+catalog.tools.filter(t=>t.included).map(t=>'<span>✓ '+escape(t.name)+'</span>').join('')+'</div></details>'+selectable.map(t=>'<label class="tool-option"><input type="checkbox" value="'+escape(t.id)+'"> <span>'+escape(t.name)+' · '+money(t.price)+'</span></label>').join('');
 extrasList.innerHTML=catalog.extras.map(t=>'<label class="tool-option"><input type="checkbox" value="'+escape(t.id)+'"> <span>'+escape(t.name)+' · '+(t.price===null?'Cotización personalizada':(t.pricing==='from'?'Desde ':'')+money(t.price))+'</span></label>').join('');
 const summary=document.querySelector('.quote-summary');
 if(!summary)return;
 const calc=document.createElement('div');calc.id='hubie-cost-breakdown';calc.setAttribute('aria-live','polite');calc.style.cssText='padding:16px 0;border-top:1px solid #e2e8f0;line-height:1.8';
 summary.insertBefore(calc,summary.querySelector('button'));
 const note=summary.querySelector('.quote-note');if(note)note.textContent='Pago único por Setup + Tools + Extras. Anticipo 50%; saldo en 1 a 6 pagos. Los conceptos «desde» y las integraciones personalizadas requieren confirmación.';
 const recalc=()=>{
 const s=catalog.suites.find(x=>x.name===document.querySelector('input[name="suite"]:checked')?.value)||catalog.suites[0];
 const checked=[...document.querySelectorAll('#tools input:checked,#extras input:checked')].map(x=>x.value);
 const selected=[...catalog.tools,...catalog.extras].filter(x=>checked.includes(x.id));
 const hasQuote=selected.some(x=>x.price===null),hasFrom=selected.some(x=>x.pricing==='from');
 const total=s.price+selected.reduce((sum,x)=>sum+(x.price||0),0);
 document.getElementById('selected-suite').textContent=s.name;
 const ul=document.getElementById('selected-items');ul.replaceChildren();
 selected.forEach(x=>{const li=document.createElement('li');li.textContent=x.name+(x.price===null?' · Por cotizar':' · '+money(x.price));ul.append(li);});
 if(!selected.length){const li=document.createElement('li');li.textContent='Core incluido · Sin herramientas adicionales';ul.append(li);}
 calc.innerHTML='<strong>'+(hasFrom?'Total desde: ':'Total: ')+money(total)+'</strong><div>Anticipo 50%: '+money(total*.5)+'</div><div>Saldo 50%: '+money(total*.5)+'</div><small>Saldo en hasta 6 pagos: '+money(total*.5/6)+' por pago</small>'+(hasQuote?'<p class="quote-note">Hay conceptos pendientes de cotización; el total no es definitivo.</p>':'');
 };
 suiteGrid.closest('.quote-layout')?.addEventListener('change',recalc);
 recalc();
}
})();