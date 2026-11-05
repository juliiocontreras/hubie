// Field blueprints for operational records. These are not payment, SAT or third-party integrations.
const blueprints={
 C001:'contacto|Contacto|text;email|Correo|email;telefono|Teléfono|tel;direccion|Dirección|text',
 C002:'cliente|Cliente|text;valor|Importe estimado MXN|number;etapa|Etapa comercial|text;responsable|Responsable|text',
 C003:'cliente|Cliente o expediente|text;referencia|Referencia|text;detalle|Detalle|textarea',
 C004:'cliente|Cliente|text;fecha|Fecha|date;hora|Hora|time;responsable|Responsable|text',
 C005:'sku|SKU|text;cantidad|Cantidad|number;minimo|Mínimo|number;ubicacion|Ubicación|text',
 C006:'sku|SKU|text;precio|Precio MXN|number;categoria|Categoría|text;descripcion|Descripción|textarea',
 C007:'importe|Importe MXN|number;categoria|Categoría|text;fecha|Fecha del gasto|date;proveedor|Proveedor|text',
 C010:'destinatario|Destinatario|text;contenido|Mensaje|textarea;fecha|Fecha|date',
 T001:'cliente|Cliente|text;descripcion|Solicitud o seguimiento|textarea',
 T002:'cliente|Cliente|text;puntos|Puntos|number;recompensa|Recompensa|text',
 T003:'responsable|Responsable|text;fecha|Fecha límite|date;pasos|Checklist|textarea',
 T004:'responsable|Responsable|text;fecha|Fecha límite|date;prioridad|Prioridad|text',
 T005:'etapa|Columna Kanban|text;responsable|Responsable|text;fecha|Fecha límite|date',
 T006:'firmante|Firmante|text;documento|Documento|text;estado_firma|Estado de firma|text',
 T007:'formulario|Formulario|text;destinatario|Destinatario|text;respuestas|Respuestas|textarea',
 T008:'proveedor|Proveedor|text;importe|Total MXN|number;fecha|Fecha|date',
 T009:'contacto|Contacto|text;telefono|Teléfono|tel;email|Correo|email',
 T010:'almacen|Almacén|text;responsable|Responsable|text;ubicacion|Ubicación|text',
 T011:'sku|SKU|text;lote|Lote|text;caducidad|Caducidad|date',
 T012:'codigo|Código QR o de barras|text;sku|SKU|text;ubicacion|Ubicación|text',
 T013:'cliente|Cliente|text;importe|Importe MXN|number;vigencia|Vigencia|date;detalle|Detalle|textarea',
 T014:'cliente|Cliente|text;importe|Importe MXN|number;fecha|Fecha|date;referencia|Referencia|text',
 T015:'rfc|RFC|text;cliente|Razón social|text;importe|Importe MXN|number;concepto|Concepto|text',
 T016:'cajero|Cajero|text;monto|Monto MXN|number;tipo|Tipo de movimiento|text',
 T017:'cliente|Cliente|text;monto|Saldo MXN|number;vence|Vencimiento|date',
 T018:'proveedor|Proveedor|text;monto|Saldo MXN|number;vence|Vencimiento|date',
 T019:'asesor|Asesor|text;base|Venta MXN|number;comision|Comisión MXN|number',
 T020:'periodo|Período|text;indicador|Indicador|text;valor|Valor|number'
};
const integrations={
 T006:'El registro documenta el estado. No aplica una firma electrónica real.',
 T012:'Registro de códigos. El uso de la cámara y la impresión están pendientes de integración.',
 T014:'Registro de cobros. No se cobra dinero a través de Hubie.',
 T015:'Borrador administrativo. No emite CFDI ni conecta con SAT/PAC.',
 T020:'Registro de indicadores. La analítica avanzada está pendiente de desarrollo.'
};
export function fieldsFor(toolId){
 const raw=blueprints[toolId]||'detalle|Detalle|textarea';
 const list=raw.split(';').map(field=>{const [key,label,type]=field.split('|');return {key,label,type};});
 return [...list,{key:'notas',label:'Notas',type:'textarea'}].filter((f,i,a)=>a.findIndex(x=>x.key===f.key)===i);
}
export function hintFor(id){return integrations[id]||'Los registros de esta herramienta se guardan únicamente en tu empresa.';}
