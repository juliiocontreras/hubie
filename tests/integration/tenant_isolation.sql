-- Run against a DEDICATED staging Supabase DB after migrations 0001-0003.
-- Requires two EXISTING confirmed auth.users UUIDs supplied to psql:
-- psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -v user_a=... -v user_b=... -f tests/integration/tenant_isolation.sql
-- Uses a transaction and rolls back all test fixtures. NEVER run against production.
\set ON_ERROR_STOP on
BEGIN;
INSERT INTO public.organizations(slug,name) VALUES
 ('hubie-rls-a-' || substr(md5(random()::text),1,10),'RLS Fixture A')
RETURNING id AS org_a \gset
INSERT INTO public.organizations(slug,name) VALUES
 ('hubie-rls-b-' || substr(md5(random()::text),1,10),'RLS Fixture B')
RETURNING id AS org_b \gset
INSERT INTO public.memberships(organization_id,user_id,role,status) VALUES
 (:'org_a'::uuid, :'user_a'::uuid,'owner','active'),
 (:'org_b'::uuid, :'user_b'::uuid,'owner','active');
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', :'user_a',true);
SELECT (count(*)=1) AS visible_only_own_org
FROM public.organizations WHERE id IN (:'org_a'::uuid,:'org_b'::uuid) \gset
\if :visible_only_own_org
\else
 \echo 'FAIL: A can see B or cannot see A'
 \quit 1
\endif
SELECT (count(*)=0) AS cannot_read_b_members
FROM public.memberships WHERE organization_id=:'org_b'::uuid \gset
\if :cannot_read_b_members
\else
 \echo 'FAIL: A can read B memberships'
 \quit 1
\endif
SELECT set_config('request.jwt.claim.sub', :'user_b',true);
SELECT (count(*)=1) AS b_visible_only_own_org
FROM public.organizations WHERE id IN (:'org_a'::uuid,:'org_b'::uuid) \gset
\if :b_visible_only_own_org
\else
 \echo 'FAIL: B can see A or cannot see B'
 \quit 1
\endif
SELECT set_config('request.jwt.claim.sub', '',true);
SELECT (count(*)=0) AS no_identity_no_data
FROM public.organizations WHERE id IN (:'org_a'::uuid,:'org_b'::uuid) \gset
\if :no_identity_no_data
\else
 \echo 'FAIL: unauthenticated identity can see tenant'
 \quit 1
\endif
RESET ROLE;
ROLLBACK;
\echo 'PASS: tenant isolation checks completed (fixtures rolled back)'
