// Field blueprints for operational records. These are not payment, SAT or third-party integrations.
const blueprints={
 C001:'contacto|Contacto|text;email|Correo|email;telefono|Teléfono|tel;direccion|Dirección|text',
 C002:'cliente|Cliente|text;valor|Importe estimado MXN|number;etapa|Etapa comercial|text;responsable|Responsable|text',
 C003:'cliente|Cliente o expediente|text;referencia|Referencia|text;detalle|Detalle|textarea',
 C004:'cliente|Cliente|text;fecha|Fecha|date;hora|Hora|time;responsable|Responsable|text;estado|Estado|text;recordatorio|Recordatorio|text',
 C005:'sku|SKU|text;cantidad|Cantidad|number;minimo|Mínimo|number;ubicacion|Ubicación|text;variante|Variante (talla/color/modelo)|text;almacen|Almacén|text;lote|Lote|text;caducidad|Caducidad|date;proveedor|Proveedor|text',
 C006:'sku|SKU|text;precio|Precio MXN|number;categoria|Categoría|text;descripcion|Descripción|textarea',
 C007:'importe|Importe MXN|number;categoria|Categoría|text;fecha|Fecha del gasto|date;proveedor|Proveedor|text',
 // C010 ya no es un formulario genérico: su vista ES el centro de
 // notificaciones del tenant (assets/notifications.js, platform/notifications.mjs).
 // Los registros genéricos antiguos de C010 siguen leyéndose por API, pero la
 // PWA ya no los crea ni los muestra como formulario.
 T001:'cliente|Cliente|text;descripcion|Solicitud o seguimiento|textarea',
 T002:'cliente|Cliente|text;puntos|Puntos|number;recompensa|Recompensa|text',
 T003:'plantilla|Plantilla|text;responsable|Responsable|text;fecha|Fecha límite|date;pasos|Checklist|textarea',
 T004:'responsable|Responsable|text;fecha|Fecha límite|date;prioridad|Prioridad|text;estado|Estado|text',
 T005:'etapa|Columna Kanban|text;responsable|Responsable|text;fecha|Fecha límite|date',
 T006:'firmante|Firmante|text;documento|Documento|text;estado_firma|Estado de firma|text',
 T007:'formulario|Formulario|text;campos|Campos (texto, número, fecha, selección, casilla)|textarea;respuestas|Respuestas|textarea',
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
 C004:'Agenda real con cliente, responsable del equipo y recordatorio. Calendarios externos (Google/Outlook): pendiente de integración.',
 C005:'Inventario real con variantes (SKU propio), almacén, lote, caducidad y proveedor por variante. La orden de compra real es T008 (Compras).',
 C008:'Dashboard real: filtros por fecha y módulo, métricas de operación, meta mensual de cobros y serie de 12 semanas.',
 T003:'Checklists reales con plantillas, ítems verificables, responsable y evidencia enlazada a adjuntos.',
 T004:'Tareas reales con responsable del equipo, vencimiento y estados; al vencer intentan avisar (bandeja C010 pendiente).',
 T007:'Constructor real de formularios con validación; las respuestas se guardan como registros y se exportan en CSV.',
 C006:'Fichas reales con precio, categoría y foto adjunta; activa o desactiva sin borrar.',
 C007:'Gastos reales con fecha, categoría y comprobante adjunto; totales por categoría y mes.',
 T008:'Órdenes de compra por partidas con recepción ligada al inventario.',
 T009:'Directorio maestro de proveedores con condiciones de pago y documentos.',
 T010:'Stock por almacén y transferencias entre almacenes con historial.',
 T016:'Aperturas, movimientos, arqueos y cierres de caja con diferencia registrada.',
 T017:'Saldos ligados a cotización aceptada, abonos y antigüedad de saldos.',
 T018:'Cuentas por pagar a proveedor con vencimientos, abonos y aprobaciones.',
 T001:'Portal de clientes con acceso seguro por correo y contraseña (enlace de activación de 24 h, un solo uso). El envío del enlace por correo está pendiente.',
 T002:'Programa de lealtad real: puntos por cobros confirmados y canjes con reglas del tenant; cada movimiento queda en el libro de puntos.',
 T005:'Tablero Kanban real: fases configurables y tarjetas ligadas a tratos, expedientes o registros; arrastrar y soltar persiste la fase.',
 T006:'Firma simple con evidencia (canvas + hash SHA-256 + consentimiento). No equivale a firma electrónica avanzada ni e.firma.',
 T011:'Lotes reales con caducidad y alertas de caducidad próxima. La notificación automática está pendiente (tabla tenant_notifications, frente search).',
 T012:'Escaneo real por cámara (BarcodeDetector) que resuelve el código al SKU del catálogo; sin soporte, entrada manual del código.',
 T013:'Cotización real con partidas, IVA y aceptación del cliente por enlace.',
 T014:'Cobro manual registrado fuera de Hubie. No se cobra dinero a través de Hubie ni usa Stripe.',
 T015:'Factura administrativa sin CFDI (pendiente PAC). No timbra ante el SAT.',
 T019:'Comisiones reales por reglas del tenant, calculadas solo sobre cobros confirmados; sin cobro confirmado no hay comisión.',
 T020:'Resumen mensual y exportación CSV real de clientes, cotizaciones, cobros y gastos.'
};
export function fieldsFor(toolId){
 const raw=blueprints[toolId]||'detalle|Detalle|textarea';
 const list=raw.split(';').map(field=>{const [key,label,type]=field.split('|');return {key,label,type};});
 return [...list,{key:'notas',label:'Notas',type:'textarea'}].filter((f,i,a)=>a.findIndex(x=>x.key===f.key)===i);
}
export function hintFor(id){return integrations[id]||'Los registros de esta herramienta se guardan únicamente en tu empresa.';}
