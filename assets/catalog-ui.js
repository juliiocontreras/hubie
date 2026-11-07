(async function(){
const page=location.pathname;
if(!['/suite.html','/tools.html','/precios.html'].includes(page))return;
let catalog;try{const response=await fetch('/assets/catalog.json');if(!response.ok)throw Error('catalog');catalog=await response.json();}catch{return;}
const money=n=>new Intl.NumberFormat('es-MX',{style:'currency',currency:'MXN',maximumFractionDigits:0}).format(n);
const palette=['#e64a93','#0ca58b','#8158e6','#ed8c28','#df6545','#477fe8','#6951d7','#2eae85','#bd6a35','#da559a'];
const suiteIcons=['flower','cross','building','cart','utensils','briefcase','people','paw-print','graduation-cap','calendar-days'];
const iconPaths={flower:'<circle cx="12" cy="12" r="2"/><circle cx="12" cy="5" r="3"/><circle cx="19" cy="12" r="3"/><circle cx="12" cy="19" r="3"/><circle cx="5" cy="12" r="3"/>',cross:'<path d="M9 3h6v6h6v6h-6v6H9v-6H3V9h6z"/>',building:'<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M9 7h2m3 0h1M9 11h2m3 0h1M9 15h2m3 0h1M10 21v-3h4v3"/>',cart:'<circle cx="9" cy="20" r="1"/><circle cx="18" cy="20" r="1"/><path d="M2 3h3l3 12h11l2-9H6"/>',utensils:'<path d="M4 2v8a3 3 0 0 0 6 0V2M7 13v9M18 2c-4 2-5 8-2 11h3V2zM18 13v9"/>',briefcase:'<rect x="3" y="7" width="18" height="14" rx="2"/><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M3 13h18"/>',people:'<circle cx="9" cy="8" r="3"/><path d="M3 21v-3a6 6 0 0 1 12 0v3M17 5a3 3 0 0 1 0 6m1 4a5 5 0 0 1 3 5"/>','paw-print':'<circle cx="6" cy="8" r="1"/><circle cx="11" cy="5" r="1"/><circle cx="17" cy="7" r="1"/><circle cx="20" cy="12" r="1"/><path d="M12 12c-3 0-6 4-6 6a3 3 0 0 0 4 3l2-1 2 1a3 3 0 0 0 4-3c0-2-3-6-6-6z"/>','graduation-cap':'<path d="m2 9 10-5 10 5-10 5zM6 12v5c4 3 8 3 12 0v-5M22 9v8"/>','calendar-days':'<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4m10-4v4M3 10h18M8 14h3m3 0h3M8 18h3"/>'};
const suiteIcon=i=>'<svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+iconPaths[suiteIcons[i%10]]+'</svg>';
const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
if(page==='/tools.html'){
 const grid=document.querySelector('.hubie-card-grid');if(!grid)return;
 grid.innerHTML=catalog.tools.map(t=>'<article class="hubie-product-card" id="'+escape(t.id)+'"><span class="hubie-card-icon" aria-hidden="true"><svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="4" width="16" height="16" rx="4"/><path d="M8 12h8M12 8v8"/></svg></span><h2>'+escape(t.name)+'</h2><p>'+(t.included?'Incluida en el Core':'Tool opcional · '+money(t.price)+' MXN')+'</p><a href="/precios.html">Añadir a mi configuración →</a></article>').join('');
}
if(page==='/suite.html'){
 const target=document.querySelector('.giro-split');if(!target)return;
 const section=document.createElement('section');section.className='hubie-page-section';section.innerHTML='<div class="container"><div class="hubie-section-heading"><div><span class="hubie-page-eyebrow">SUITES HUBIE</span><h2>Explora nuestras Suites</h2></div><p>Elige la familia que mejor se adapta a tu operación.</p></div><div class="hubie-card-grid">'+catalog.suites.map((s,i)=>'<article class="hubie-product-card hubie-suite-card" style="--suite-accent:'+palette[i%palette.length]+'"><span class="hubie-metal-badge" aria-hidden="true"><span class="hubie-metal-inner">'+suiteIcon(i)+'</span></span><h3>'+escape(s.name)+'</h3><p>Setup '+money(s.price)+' MXN · '+s.users+' usuarios incluidos.</p><a href="/precios.html">Configurar Suite →</a></article>').join('')+'</div></div>';
 target.closest('section')?.before(section);
 document.dispatchEvent(new Event('hubie:catalog-rendered'));
}
if(page==='/precios.html'){
 const suiteGrid=document.getElementById('suites'),toolsList=document.getElementById('tools'),extrasList=document.getElementById('extras');
 if(!suiteGrid||!toolsList||!extrasList)return;

 const selectable=catalog.tools.filter(t=>!t.included);
 suiteGrid.innerHTML=catalog.suites.map((s,i)=>'<label class="suite-option hubie-suite-choice" style="--suite-accent:'+palette[i%palette.length]+'"><input type="radio" name="suite" value="'+escape(s.name)+'" '+(i===0?'checked':'')+'><span class="hubie-metal-badge hubie-metal-badge-sm" aria-hidden="true"><span class="hubie-metal-inner">'+suiteIcon(i)+'</span></span> <span>'+escape(s.name)+'<small style="display:block;color:#64748b">'+money(s.price)+'</small></span></label>').join('');
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
 document.dispatchEvent(new Event('hubie:catalog-rendered'));
}
})();