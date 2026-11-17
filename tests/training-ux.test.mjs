import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const noEmoji=/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}]/u;
const noTextIcon=/content:\s*['"][⌄∨▾v><]['"]/;

test('T022 UI: panel con 10 pestañas y flujo completo curso → quiz → constancia',async()=>{
 const ui=await readFile('assets/operational-training.js','utf8');
 assert.match(ui,/export async function renderTraining/);
 for(const tab of ['Tablero','Cursos','Sesiones','Empleados','Inscripciones','Asistencia','Avance','Evaluaciones','Certificados','Exportar']){
  assert.ok(ui.includes("'"+tab+"'")||ui.includes('"'+tab+'"'),'falta pestaña '+tab);
 }
 assert.match(ui,/Crear curso/);
 assert.match(ui,/Crear módulo/);
 assert.match(ui,/Módulos y quizzes/);
 assert.match(ui,/Añadir quiz/);
 assert.match(ui,/Guardar quiz/);
 assert.match(ui,/Responder quiz/);
 assert.match(ui,/Enviar respuestas/);
 assert.match(ui,/Crear sesión/);
 assert.match(ui,/Registrar empleado/);
 assert.match(ui,/Inscribir empleado/);
 assert.match(ui,/Marcar completado/);
 assert.match(ui,/Registrar evaluación/);
 assert.match(ui,/Emitir constancia/);
 assert.match(ui,/Consultar constancia/);
 assert.match(ui,/Exportar a CSV/);
 assert.match(ui,/Descargar .* \(CSV\)/);
 // El panel consume los endpoints reales del store, no datos inventados.
 for(const path of ["base+'/dashboard'","base+'/courses'","base+'/sessions'","base+'/employees'","base+'/enrollments'",
  "base+'/certificates'","base+'/evaluations'","base+'/export?kind='","/modules/","/attempts"]){
  assert.ok(ui.includes(path),'falta endpoint '+path);
 }
 assert.match(ui,/folioPrefix:'CAP-'/,'folio de constancia con prefijo CAP-');
 // fmtDay recibe timestamps completos (issuedAt, createdAt), no solo fecha:
 // sin el recorte a 10 caracteres renderizaba "Invalid Date" en constancias.
 assert.match(ui,/slice\(0,10\)\+'T00:00:00'/,'fmtDay debe aceptar timestamps completos');
 assert.doesNotMatch(ui,noEmoji);
 assert.doesNotMatch(ui,noTextIcon);
 assert.match(ui,/Nunito/);
 assert.match(ui,/#16123a/);
 assert.doesNotMatch(ui,/#0000ff|#0000FF|blue/i);
});

test('T022 cableado: app-workflows, app-records, icono academy y rutas del servidor',async()=>{
 const workflows=await readFile('assets/app-workflows.js','utf8');
 assert.match(workflows,/key==='T022'\?renderTraining/);
 assert.match(workflows,/from '\.\/operational-training\.js'/);
 const records=await readFile('assets/app-records.js','utf8');
 assert.match(records,/'T022'/);
 const icons=await readFile('assets/ui-icons.js','utf8');
 assert.match(icons,/academy/);
 assert.match(icons,/T022:'academy'/);
 assert.doesNotMatch(icons,noEmoji);
 const server=await readFile('server.mjs','utf8');
 assert.ok(server.includes('training\\/export'),'ruta de exportación CSV');
 assert.ok(server.includes("/training(?:\\/(.*))?"),'ruta base /training/...');
 for(const segment of ["'dashboard'","'courses'","'modules'","'quiz'","'attempts'","'sessions'","'employees'","'enrollments'","'attendance'","'progress'","'evaluations'","'certificates'"]){
  assert.ok(server.includes(segment),'falta ruta training '+segment);
 }
 const catalog=JSON.parse(await readFile('assets/catalog.json','utf8'));
 const tool=catalog.tools.find(t=>t.id==='T022');
 assert.equal(tool.name,'Capacitaciones');
 assert.equal(tool.group,'Recursos Humanos');
 assert.equal(tool.price,null);
 assert.equal(tool.pricing,'quote');
});

test('T022 demo: el espejo en demo-backend cubre los endpoints y se habilita en comercio-demo',async()=>{
 const demo=await readFile('assets/demo-backend.js','utf8');
 assert.match(demo,/training:\{courses:\[\],sessions:\[\],employees:\[\],enrollments:\[\],attendance:\[\],progress:\[\],modules:\[\],attempts:\[\],evaluations:\[\],certificates:\[\],completions:\[\]\}/);
 assert.match(demo,/demoT022\.enabled=true/);
 assert.match(demo,/trRoute=p\.match\(\/\^\\\/api\\\/app\\\/\(\[a-z0-9-\]\+\)\\\/training/);
 for(const segment of ['dashboard','courses','modules','quiz','attempts','complete','sessions','employees','enrollments','attendance','progress','evaluations','certificates','export']){
  assert.match(demo,new RegExp("seg\\[\\d\\]==='"+segment+"'"),'falta espejo demo de '+segment);
 }
 for(const action of ['training.course_created','training.enrollment_created','training.attempt_recorded','training.certificate_issued']){
  assert.ok(demo.includes(action),'falta acción de auditoría demo '+action);
 }
 // El espejo calcula el puntaje en el demo igual que el servidor: nunca confía en el cliente.
 assert.match(demo,/const scoreQuiz=\(quiz,answers,minScore\)=>/);
 assert.match(demo,/genFolio/);
 assert.match(demo,/'CAP-'/);
 assert.doesNotMatch(demo,noEmoji);
});
