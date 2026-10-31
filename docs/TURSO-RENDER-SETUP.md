# Hubie: Turso + Render

Service: https://hubie-dev.onrender.com
Render dashboard: https://dashboard.render.com/web/srv-dbj2f1k9v7es738ur25g
Branch: feat/turso-core
Database: hubie-dev (user-provisioned; connection unverified)

## Secure setup
1. In Turso dashboard, open hubie-dev and copy the libSQL database URL (typically libsql://...).
2. Create a database auth token using Turso dashboard or CLI; do not commit or paste it into chat.
3. In Render service > Environment, add TURSO_DATABASE_URL and TURSO_AUTH_TOKEN as secret environment variables. Do not set PUBLIC_ or VITE_ prefixes.
4. Add the server-side @libsql/client dependency and implement a database connection module before enabling database operations. Current server.mjs is static-only and /healthz reports database: not-connected.
5. Apply turso/migrations/001_core.sql to hubie-dev via authenticated Turso CLI or a controlled one-off migration job. Verify all five tables and indexes.
6. Implement server-side verified authentication and tenant-scoped authorization. SQLite does not have PostgreSQL RLS. Do not expose direct SQL credentials or generic query endpoints to browser.
7. Run integration tests across two tenants and test owner/admin membership, invitation expiry, last-owner guard and audit trail.
8. Only after successful tests, merge PR and configure production deploy. Disable automatic deployment until ready.

No credentials, Turso writes or live migrations have been performed by this change.
