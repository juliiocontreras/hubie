# Hubie Infrastructure Lifecycle

Hubie starts as a greenfield PWA inside the shared App Factory model. Infrastructure is added before public launch, not after incidents appear.

## Stage 0 — Bootstrap

Required now:

- `app-factory.yml`
- `.env.example`
- `SECURITY.md`
- readiness workflow
- documented human gates

No production hosting or database is created until product code exists.

## Stage 1 — Code Ready

Triggered when `package.json` and the first application entrypoint exist.

Add:

- deterministic package lock
- tests
- production build command
- lint/typecheck
- PWA manifest
- service worker/update strategy
- install icons
- offline fallback

The readiness workflow should then become blocking for missing application essentials.

## Stage 2 — Preview Ready

Add:

- hosting project
- deploy previews for pull requests
- isolated preview environment variables
- Supabase development/staging environment if data is required
- preview smoke tests
- test data only; never production data in preview

## Stage 3 — Production Ready

Production gate requires:

- protected `main` workflow
- tests/build/PWA validation green
- production deploy automation
- `/api/health` or equivalent health endpoint
- external uptime monitor
- error tracking
- analytics/UTM events
- database migrations tracked in Git
- RLS/security review
- database backup
- media/storage backup where applicable
- documented rollback
- successful restore drill
- transactional email configured if used

## Stage 4 — Hands-off Supervised

Routine operations are automatic:

- dependency update PRs
- tests and build
- previews
- production deployment after approved merge
- smoke checks
- health monitoring
- database backups
- release snapshots
- analytics events
- incident routing
- migration drift audits

Human approval remains mandatory for:

- destructive database changes
- production restore
- secret rotation
- bulk/mass messaging
- paid campaign budget changes
- irreversible billing actions

## Naming and environment contract

Recommended public structure:

- marketing: `hubie.<domain>` or primary marketing domain
- app: `app.<domain>`
- admin: `admin.<domain>` when administrative capabilities must be isolated
- status/operations: internal or protected surface, never bundled into the customer PWA

All server secrets stay outside the browser. Any variable prefixed with `VITE_` must be treated as public.
