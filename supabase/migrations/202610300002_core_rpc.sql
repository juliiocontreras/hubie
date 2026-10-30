-- Hubie Sprint 1: transactional RPCs; staging review required.
begin;
create or replace function public.hubie_create_organization(p_slug text, p_name text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_org uuid;
begin
 if auth.uid() is null then raise exception 'authentication required' using errcode = '28000'; end if;
 if p_slug is null or p_slug !~ '^[a-z0-9][a-z0-9-]{2,62}$' or p_name is null or length(trim(p_name)) not between 1 and 160 then
  raise exception 'invalid organization data' using errcode = '22023';
 end if;
 insert into public.organizations(slug,name) values(p_slug,trim(p_name)) returning id into v_org;
 insert into public.memberships(organization_id,user_id,role,status) values(v_org,auth.uid(),'owner', 'active');
 insert into public.audit_events(organization_id,actor_user_id,action,target_type,target_id)
 values(v_org,auth.uid(),'organization.created','organization',v_org::text);
 return v_org;
end;
$$;
create or replace function public.hubie_suspend_member(p_org uuid, p_user uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_role text; v_target_role text; v_count integer;
begin
 if auth.uid() is null then raise exception 'authentication required' using errcode = '28000'; end if;
 perform 1 from public.organizations where id = p_org and status = 'active' for update;
 if not found then raise exception 'organization unavailable' using errcode = '42501'; end if;
 select role into v_role from public.memberships where organization_id=p_org and user_id=auth.uid() and status='active';
 if v_role is null or v_role <> all(array['owner','admin']) then raise exception 'permission denied' using errcode = '42501'; end if;
 select role into v_target_role from public.memberships where organization_id=p_org and user_id=p_user and status='active' for update;
 if v_target_role is null then raise exception 'member unavailable' using errcode = '42501'; end if;
 if v_target_role='owner' and v_role<>'owner' then raise exception 'only owner may suspend owner' using errcode = '42501'; end if;
 if v_target_role='owner' then
  select count(*) into v_count from public.memberships where organization_id=p_org and role='owner' and status='active';
  if v_count <= 1 then raise exception 'cannot suspend last active owner' using errcode = '23514'; end if;
 end if;
 update public.memberships set status='suspended' where organization_id=p_org and user_id=p_user;
 insert into public.audit_events(organization_id,actor_user_id,action,target_type,target_id)
 values(p_org,auth.uid(),'membership.suspended','membership',p_user::text);
end;
$$;
revoke all on function public.hubie_create_organization(text,text) from public;
revoke all on function public.hubie_suspend_member(uuid,uuid) from public;
grant execute on function public.hubie_create_organization(text,text) to authenticated;
grant execute on function public.hubie_suspend_member(uuid,uuid) to authenticated;
commit;
