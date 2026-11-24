# Validación real de Hubie Core (staging exclusivamente)

Estado: **pendiente de ejecución**. La conexión Supabase disponible no incluye un proyecto Hubie; no reutilizar Redboy ni Huertas Catering.

## Requisitos
1. Proyecto Supabase de pruebas dedicado a Hubie, sin datos de clientes.
2. Migraciones 0001, 0002 y 0003 aplicadas en orden, después de revisión de seguridad.
3. Dos usuarios distintos de prueba ya existentes en `auth.users`, con correos verificados.
4. `psql` instalado y cadena de conexión de staging en variable local `DATABASE_URL` (nunca commitearla).

## Prueba RLS entre empresas
```bash
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 \
  -v user_a="<UUID_AUTH_USER_A>" \
  -v user_b="<UUID_AUTH_USER_B>" \
  -f tests/integration/tenant_isolation.sql
```
La prueba inserta dos organizaciones temporales y sus membresías, comprueba visibilidad para A, B y una identidad ausente, y hace `ROLLBACK` al terminar. Requiere un rol de conexión con permisos para crear fixtures. Un fallo puede dejar una transacción abierta en la conexión del proceso; cerrar la sesión.

## Casos adicionales bloqueantes
- Invitar a B desde A debe fallar; admin A sí puede invitar a su organización.
- Aceptación con correo no coincidente, sin confirmar, token expirado o token consumido debe fallar.
- Suspender al último owner debe fallar; suspender a un miembro debe revocar acceso.
- Ninguna función SECURITY DEFINER debe permitir elevación de rol o lectura intertenant.
- Ejecutar advisors de seguridad y revisar privilegios de funciones, esquema pgcrypto, grants y RLS.
- Verificar que ninguna clave de servicio esté expuesta en frontend.

## Limitaciones de la prueba SQL
La simulación de JWT mediante `request.jwt.claim.sub` solo verifica las políticas en PostgreSQL, no la validación criptográfica de tokens ni el flujo real de autenticación HTTP. Antes del despliegue añadir E2E vía cliente Supabase con sesiones reales. Las pruebas estáticas de GitHub Actions tampoco sustituyen estas pruebas.

**No aplicar migraciones ni activar registro empresarial en producción hasta completar la validación.**
