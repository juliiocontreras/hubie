-- Hubie Sprint 1: invitation primitives. Review and integration-test before applying.
begin;
create table if not exists public.organization_invitations (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.organizations(id) on delete cascade,
 email text not null check (length(email) between 3 and 254),
 role text not null check (role in ('admin','member','viewer')),
 token_hash bytea not null unique,
 created_by uuid not null references auth.users(id),
 expires_at timestamptz not null,
 consumed_at timestamptz,
 created_at timestamptz not null default now()
);
create index if not exists organization_invitations_org_idx on public.organization_invitations(organization_id);
alter table public.organization_invitations enable row level security;
-- No table policies: only controlled security-definer RPCs access invitations.
revoke all on public.organization_invitations from anon, authenticated;
create or replace function public.hubie_create_invitation(p_org uuid,p_email text,p_role text)
returns text language plpgsql security definer set search_path = '' as $$
declare v_token text; v_email text;
begin
 if auth.uid() is null or not public.hubie_has_org_role(p_org,array['owner','admin']) then
  raise exception 'permission denied' using errcode='42501';
 end if;
 if not exists(select 1 from public.organizations where id=p_org and status='active') then
  raise exception 'organization unavailable' using errcode='42501';
 end if;
 v_email := lower(trim(p_email));
 if v_email is null or length(v_email) not between 3 and 254 or v_email !~ '^[^ @]+@[^ @]+[.][^ @]+$'
    or p_role not in ('admin','member','viewer') then
  raise exception 'invalid invitation' using errcode='22023';
 end if;
 if exists(select 1 from public.memberships m join auth.users u on u.id=m.user_id
           where m.organization_id=p_org and lower(u.email)=v_email) then
  raise exception 'already a member' using errcode='23505';
 end if;
 -- Token returned once; caller must deliver it over a trusted private channel.
 v_token := encode(public.gen_random_bytes(32),'hex');
 insert into public.organization_invitations(organization_id,email,role,token_hash,created_by,expires_at)
 values(p_org,v_email,p_role,public.digest(v_token,'sha256'),auth.uid(),now()+interval '7 days');
 insert into public.audit_events(organization_id,actor_user_id,action,target_type)
 values(p_org,auth.uid(),'invitation.created','invitation');
 return v_token;
end;
$$;
create or replace function public.hubie_accept_invitation(p_token text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_inv public.organization_invitations%rowtype; v_email text; v_confirmed timestamptz;
begin
 if auth.uid() is null then raise exception 'authentication required' using errcode='28000'; end if;
 if p_token is null or p_token !~ '^[0-9a-f]{64}$' then
  raise exception 'invalid invitation' using errcode='22023';
 end if;
 select lower(email),email_confirmed_at into v_email,v_confirmed from auth.users where id=auth.uid();
 if v_confirmed is null then raise exception 'verified email required' using errcode='42501'; end if;
 select * into v_inv from public.organization_invitations
 where token_hash=public.digest(p_token,'sha256') and consumed_at is null and expires_at > now() for update;
 if not found or lower(trim(v_inv.email)) <> v_email then
  raise exception 'invalid or expired invitation' using errcode='42501';
 end if;
 if not exists(select 1 from public.organizations where id=v_inv.organization_id and status='active') then
  raise exception 'organization unavailable' using errcode='42501';
 end if;
 insert into public.memberships(organization_id,user_id,role,status)
 values(v_inv.organization_id,auth.uid(),v_inv.role,'active');
 update public.organization_invitations set consumed_at = now() where id=v_inv.id;
 insert into public.audit_events(organization_id,actor_user_id,action,target_type,target_id)
 values(v_inv.organization_id,auth.uid(),'invitation.accepted','membership',auth.uid()::text);
 return v_inv.organization_id;
end;
$$;
revoke all on function public.hubie_create_invitation(uuid,text,text) from public;
revoke all on function public.hubie_accept_invitation(text) from public;
grant execute on function public.hubie_create_invitation(uuid,text,text) to authenticated;
grant execute on function public.hubie_accept_invitation(text) to authenticated;
commit;
