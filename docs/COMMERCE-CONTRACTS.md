# Hubie 2.0 — Contratos Commerce: Services + Shop

Estado: especificación, no implementación. Depende de Sprint 1 (autenticación, organizaciones, RLS y auditoría).

## Principios
- Shop (productos) y Services (trabajos creativos) comparten identidad, catálogo de precios versionado, cotizaciones, pagos, notificaciones y auditoría; sus estados y entregables son independientes.
- Cada orden o solicitud incluye `organization_id`, `requested_by`, `approved_by` cuando corresponda, y snapshots inmutables de precios, impuestos, descuentos y condiciones aceptadas.
- Las operaciones financieras se calculan en servidor, en MXN por defecto, con importes en unidades menores enteras; nunca confiar en totales enviados por el navegador.
- El catálogo global Hubie es distinto de los catálogos privados de cada empresa.
- Proveedores, costos y márgenes son internos y no visibles para compradores.

## Services
Tablas: `service_requests`, `service_briefs`, `service_quotes`, `service_quote_lines`, `service_projects`, `service_tasks`, `service_deliverables`, `service_approvals`, `service_messages`, `service_files`.
Flujo: received -> needs_info | quoting -> quoted -> accepted | rejected | expired -> awaiting_payment -> in_progress -> client_review -> delivered -> closed.
Ramas: cancellation, change_request, rework, disputed. Un proyecto no inicia sin aceptación y condiciones de pago satisfechas; cierre exige entregables y evidencia de aceptación o regla de cierre notificada.
Brief: objetivo, audiencia, descripción, formatos, dimensiones, referencias, materiales, deadline solicitado, prioridad y permisos de uso. La urgencia no garantiza SLA ni precio.
Cotización: `quote_version`, `valid_until`, entregables, número de revisiones, exclusiones, impuestos, anticipo y cronograma. Cambios de alcance requieren nueva versión aceptada.

## Shop
Tablas: `shop_products`, `shop_variants`, `shop_inventory`, `shop_carts`, `shop_cart_items`, `shop_orders`, `shop_order_items`, `shop_shipments`, `shop_returns`, `shop_artwork_approvals`.
Flujo: draft -> awaiting_approval (si aplica) -> awaiting_payment -> paid -> preparing -> shipped -> delivered -> closed.
Ramas: payment_failed, partially_fulfilled, cancelled, return_requested, returned, refunded.
Inventario reservado con vencimiento; verificación de existencias en checkout; prevención de sobreventa mediante transacción.
Productos personalizados requieren arte final aprobado antes de iniciar producción. Reembolso y devolución se registran sin borrar el pedido original.

## Autorizaciones
- Roles separados: requester, purchaser, approver, operations, platform_admin.
- Políticas por empresa: límite por operación, categoría, presupuesto y aprobadores.
- Un solicitante no puede autoaprobar cuando la política exige segregación de funciones.
- Revalidar autorización, precio y estado al confirmar, nunca solo en UI.

## Pagos e integraciones
- Estado de integración: `not_configured`, `configured`, `verified`, `enabled`, `degraded`, `disabled`.
- `commerce_payments` registra intentos, conciliación y referencias externas; no almacenar datos de tarjeta.
- Webhooks verificados por firma, idempotencia por evento y reintentos con backoff; duplicados no generan doble pedido/cobro.
- Comprobante subido no implica pago confirmado. CFDI, WhatsApp y SMS requieren proveedor real y pruebas; un flag JSON no acredita integración.

## Operación y SLA
- `operations_assignments`, `suppliers`, `purchase_orders`, `commerce_events`, `notification_outbox`.
- Notificaciones por outbox transaccional; reintentos, cola de errores y panel de reenvío controlado.
- SLA por tipo de servicio, calendario hábil, prioridad aceptada y pausas por información pendiente.
- Métricas: tiempo a primera respuesta, tasa de cotización aceptada, entregas a tiempo, margen realizado, devoluciones y recurrencia.

## Pruebas bloqueantes
1. Ninguna empresa puede ver pedidos, solicitudes, archivos, costos ni mensajes de otra.
2. Cotización aceptada conserva sus importes si cambia el catálogo.
3. Pedido no avanza a preparación sin autorización y pago confirmado según reglas.
4. Evento de pago duplicado no duplica cargos, pedidos ni notificaciones.
5. Producto personalizado no se produce sin aprobación de arte.
6. Cambio de alcance exige cotización nueva antes de tareas fuera de contrato.
7. Un comprador no ve costos de proveedores ni notas internas.
8. Cancelaciones, reembolsos y errores preservan historial auditable.

## MVP
- Services: formulario de brief, bandeja interna, cotización manual, aprobación, estados y entrega.
- Shop: catálogo, carrito, pedido, autorización empresarial, confirmación manual de pago y seguimiento.
- Fuera del MVP: facturación automatizada, multicarrier, reabastecimiento automático, motor complejo de proveedores y múltiples pasarelas.
