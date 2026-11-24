-- Hubie Sprint 1: baseline tenant authorization (Supabase PostgreSQL).
-- Apply only to a NEW / reviewed database; never run blindly on production.
begin;
create extension if not exists pgcrypto with schema public;
create table if not exists public.organizations (
 id uuid primary key default gen_random_uuid(),
 slug text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{2,62}$'),
 name text not null check (length(trim(name)) between 1 and 160),
 status text not null default 'active' check (status in ('active','suspended')),
 created_at timestamptz not null default now()
);
create table if not exists public.memberships (
 organization_id uuid not null references public.organizations(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,
 role text not null check (role in ('owner','admin','member','viewer')),
 status text not null default 'active' check (status in ('active','suspended')),
 created_at timestamptz not null default now(),
 primary key (organization_id,user_id)
);
create table if not exists public.audit_events (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid references public.organizations(id) on delete set null,
 actor_user_id uuid references auth.users(id) on delete set null,
 action text not null,
 target_type text not null,
 target_id text,
 metadata_redacted jsonb not null default '{}'::jsonb,
 occurred_at timestamptz not null default now()
);
-- SECURITY DEFINER avoids recursive membership RLS evaluation.
-- Only accepts the current auth.uid(), never a user supplied by the client.
create or replace function public.hubie_has_org_role(p_org uuid, p_roles text[] default array['owner','admin','member','viewer'])
returns boolean language sql stable security definer set search_path = ''
as $$
 select auth.uid() is not null and exists (
  select 1 from public.memberships m
  where m.organization_id = p_org
    and m.user_id = auth.uid()
    and m.status = 'active'
    and m.role = any(p_roles)
 );
$$;
revoke all on function public.hubie_has_org_role(uuid,text[]) from public;
grant execute on function public.hubie_has_org_role(uuid,text[]) to authenticated;
alter table public.organizations enable row level security;
alter table public.memberships enable row level security;
alter table public.audit_events enable row level security;
drop policy if exists org_read on public.organizations;
create policy org_read on public.organizations for select to authenticated
 using (public.hubie_has_org_role(id));
drop policy if exists membership_read on public.memberships;
create policy membership_read on public.memberships for select to authenticated
 using (public.hubie_has_org_role(organization_id));
drop policy if exists audit_read on public.audit_events;
create policy audit_read on public.audit_events for select to authenticated
 using (public.hubie_has_org_role(organization_id,array['owner','admin']));
-- No client INSERT/UPDATE/DELETE policies: privileged transactional server
-- operations are required for org creation, invites, membership changes and audit.
revoke all on public.organizations,public.memberships,public.audit_events from anon;
grant select on public.organizations,public.memberships,public.audit_events to authenticated;
revoke insert,update,delete on public.organizations,public.memberships,public.audit_events from authenticated;
commit;
