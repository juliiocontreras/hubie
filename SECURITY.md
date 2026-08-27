# Security Baseline

Hubie follows the shared PWA App Factory security model.

## Secrets

- Never commit credentials, tokens, service-role keys or database passwords.
- `VITE_*` variables are browser-visible and must contain only public configuration.
- Server credentials belong in the hosting provider's secret store or GitHub Actions secrets.

## Data access

- Enable RLS on every table exposed through the Supabase Data API.
- Grant the minimum Postgres privileges required by `anon`, `authenticated`, and `service_role`.
- Review every `SECURITY DEFINER` function as an API endpoint.

## Releases

Production releases must pass tests, build, PWA validation and smoke tests. Destructive migrations, production restores and secret rotation require explicit human approval.

## Operations

Production must expose a health endpoint, use external uptime monitoring, retain database/media backups, and document a tested restore path before public launch.
