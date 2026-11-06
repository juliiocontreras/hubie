// Locally rendered, consistent line icons. No emoji placeholders or third-party CDN.
const ns='http://www.w3.org/2000/svg';
const paths={
 home:['path:M3 10.5 12 3l9 7.5','path:M5 9.5V21h14V9.5','path:M9 21v-8h6v8'],
 building:['rect:3 3 18 18 2','path:M9 21v-4h6v4','path:M7 7h.01M12 7h.01M17 7h.01M7 12h.01M12 12h.01M17 12h.01'],
 grid:['rect:3 3 7 7 1','rect:14 3 7 7 1','rect:3 14 7 7 1','rect:14 14 7 7 1'],
 users:['path:M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2','circle:9 7 4','path:M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75'],
 target:['circle:12 12 9','circle:12 12 5','circle:12 12 1'],
 calendar:['rect:3 5 18 16 2','path:M16 3v4M8 3v4M3 10h18','path:M8 15h2M14 15h2'],
 box:['path:M3 7 12 3l9 4v10l-9 4-9-4z','path:M3 7l9 5 9-5M12 12v9'],
 settings:['path:M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8','path:M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-2 2-.07-.06A1.7 1.7 0 0 0 15.9 19.2L15 21h-6l-.9-1.8a1.7 1.7 0 0 0-1.83-.32l-.07.06-2-2 .06-.06A1.7 1.7 0 0 0 4.6 15L3 14v-4l1.6-1a1.7 1.7 0 0 0-.34-1.88L4.2 7.06l2-2 .07.06A1.7 1.7 0 0 0 8.1 4.8L9 3h6l.9 1.8a1.7 1.7 0 0 0 1.83.32l.07-.06 2 2-.06.06A1.7 1.7 0 0 0 19.4 9L21 10v4z'],
 palette:['path:M12 3a9 9 0 0 0-9 9 9 9 0 0 0 9 9h1.2a2.3 2.3 0 0 0 1.7-3.9 2.3 2.3 0 0 1 1.7-3.9H18a3 3 0 0 0 3-3A9 9 0 0 0 12 3z','circle:7 12 1','circle:8 8 1','circle:13 7 1','circle:17 10 1'],
 upload:['path:M12 16V3M7 8l5-5 5 5','path:M4 17v4h16v-4'],
 paperclip:['path:M8 12.5l7.1-7.1a3 3 0 0 1 4.2 4.2l-9.2 9.2a5 5 0 0 1-7.1-7.1l9.5-9.5'],
 file:['path:M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z','path:M14 2v6h6M8 13h8M8 17h6'],
 briefcase:['rect:3 7 18 14 2','path:M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M3 13h18'],
 bell:['path:M18 8a6 6 0 1 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4'],
 chart:['path:M4 19V5M4 19h17','path:M8 14l4-4 4 3 4-7'],
 list:['path:M9 6h12M9 12h12M9 18h12M3 6h.01M3 12h.01M3 18h.01'],
 search:['circle:10.8 10.8 7.8','path:M16.5 16.5 21 21'],
 folder:['path:M3 7a2 2 0 0 1 2-2h5l2 2h7a2 2 0 0 1 2 2v10H3z'],
 money:['circle:12 12 9','path:M14.5 8.5a3 3 0 0 0-5 0c-2 3 5 3 5.5 5 1 3-4 4-6 2.5M12 5v14'],
 shield:['path:M12 2 21 6v6c0 6-4 9-9 10-5-1-9-4-9-10V6z','path:M8 12l3 3 5-6'],
 clipboard:['rect:5 4 14 18 2','rect:9 2 6 5 1','path:M9 12h6M9 16h6'],
 spark:['path:M12 2l2.6 7.4L22 12l-7.4 2.6L12 22l-2.6-7.4L2 12l7.4-2.6z'],
 plus:['path:M12 5v14M5 12h14'],
 logout:['path:M10 17l5-5-5-5M15 12H3','path:M12 3h6a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-6'],
 chevron:['path:M6 9l6 6 6-6'],
 layers:['path:M3 9l9-6 9 6-9 6zM3 14l9 6 9-6'],
 truck:['path:M2 6h12v12H2zM14 10h4l4 4v4h-8','circle:6 19 2','circle:18 19 2'],
 receipt:['path:M4 2h16v20l-4-2-4 2-4-2-4 2zM8 7h8M8 11h8M8 15h5']
};
paths.survey=['rect:4 3 16 18 2','path:M8 8h8M8 12h3M8 16h3','path:M14 14l2 2 4-5'];
const toolIcons={
 C001:'users',C002:'target',C003:'folder',C004:'calendar',C005:'box',C006:'grid',C007:'money',
 C008:'chart',C009:'shield',C010:'bell',
 T001:'briefcase',T002:'clipboard',T003:'file',T004:'list',T005:'receipt',
 T006:'chart',T007:'truck',T008:'calendar',T009:'users',T010:'money',
 T011:'box',T012:'file',T013:'receipt',T014:'briefcase',T015:'calendar',
 T016:'chart',T017:'clipboard',T018:'folder',T019:'settings',T020:'spark',T021:'survey'
};
export function icon(name,size=18){
 const svg=document.createElementNS(ns,'svg');
 svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('width',String(size));svg.setAttribute('height',String(size));
 svg.setAttribute('fill','none');svg.setAttribute('stroke','currentColor');svg.setAttribute('stroke-width','1.8');
 svg.setAttribute('stroke-linecap','round');svg.setAttribute('stroke-linejoin','round');
 svg.setAttribute('aria-hidden','true');svg.classList.add('hubie-icon');
 for(const entry of paths[name]||paths.layers){
  const [tag,raw]=entry.split(':');let child;
  if(tag==='circle'){const [cx,cy,r]=raw.split(' ').map(Number);child=document.createElementNS(ns,'circle');for(const[k,v]of Object.entries({cx,cy,r}))child.setAttribute(k,String(v));}
  else if(tag==='rect'){const [x,y,width,height,rx]=raw.split(' ').map(Number);child=document.createElementNS(ns,'rect');for(const[k,v]of Object.entries({x,y,width,height,rx}))child.setAttribute(k,String(v));}
  else{child=document.createElementNS(ns,'path');child.setAttribute('d',raw);}
  svg.append(child);
 }
 return svg;
}
export const toolIcon=id=>icon(toolIcons[id]||'layers');
export function decorateSidebar(sidebar){
 if(!sidebar)return;
 const mapping={overview:'home',companies:'building',create:'plus',detail:'settings',appearance:'palette',catalog:'grid'};
 for(const node of sidebar.querySelectorAll('.nav-item')){
  if(node.querySelector('svg'))continue;
  const key=node.dataset.view||node.dataset.home&&'overview';
  const type=node.id==='logout'?'logout':node.id==='appearance-nav'?'palette':mapping[key]||(node.matches('a')?'layers':'layers');
  const label=node.textContent.trim().replace(/^[^\p{L}\p{N}]+/u,'').trim();
  node.replaceChildren(icon(type),document.createTextNode(label));
 }
}
