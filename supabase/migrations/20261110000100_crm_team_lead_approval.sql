-- Багийн ахлагчийг оффисын админ баталгаажуулна.
--   • Оффисын админ томилбол шууд хүчинтэй.
--   • Баг удирдах эрхтэй бусад хүн (sysadmin, sales_director, ops_qc) зөвхөн санал болгоно;
--     оффисын админ батлах хүртэл ахлагчийн эрх идэвхжихгүй.
--   • Ахлагчаас чөлөөлөх нь эрх хасах үйлдэл тул баг удирдах эрхтэй хэн ч шууд хийнэ.
-- Хамгаалалт DB түвшинд: crm_teams-ийн ахлагчийн талбар, crm_staff-д team_lead дүр нэмэхийг
-- зөвхөн эдгээр функц (эсвэл оффисын админ, service role) хийж чадна.

-- Санал болгосон хүн/хэн санал болгосон: profiles руу FK тавихгүй — crm_teams → profiles
-- хоёр дахь FK нь PostgREST embed-ийг хоёрдмол болгоно. Утгыг функц шалгана.
alter table public.crm_teams
  add column pending_lead_profile_id uuid,
  add column lead_proposed_by uuid,
  add column lead_proposed_at timestamptz;

create function public.crm_can_approve_team_lead()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.crm_office_id() is not null
     and public.jwt_role() = 'office_admin'::public.user_role;
$$;

-- ── Хамгаалалтын trigger-ууд ───────────────────────────────────────────────────
create function public.crm_teams_lead_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null
     or coalesce(current_setting('crm.team_lead_rpc', true), '') = '1' then
    return new;
  end if;
  if new.lead_profile_id is distinct from old.lead_profile_id
     or new.pending_lead_profile_id is distinct from old.pending_lead_profile_id
     or new.lead_proposed_by is distinct from old.lead_proposed_by
     or new.lead_proposed_at is distinct from old.lead_proposed_at then
    raise exception 'Баг: ахлагчийг «Багууд» хуудсаар томилно (оффисын админ батална)';
  end if;
  return new;
end
$$;
create trigger crm_teams_lead_guard
  before update on public.crm_teams
  for each row execute function public.crm_teams_lead_guard();

create function public.crm_teams_insert_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null
     or coalesce(current_setting('crm.team_lead_rpc', true), '') = '1' then
    return new;
  end if;
  if new.lead_profile_id is not null or new.pending_lead_profile_id is not null then
    raise exception 'Баг: ахлагчийг «Багууд» хуудсаар томилно (оффисын админ батална)';
  end if;
  return new;
end
$$;
create trigger crm_teams_insert_guard
  before insert on public.crm_teams
  for each row execute function public.crm_teams_insert_guard();

create function public.crm_staff_lead_role_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not ('team_lead'::public.crm_role = any(new.roles)) then return new; end if;
  if tg_op = 'UPDATE' and 'team_lead'::public.crm_role = any(old.roles) then return new; end if;
  if auth.uid() is null
     or coalesce(current_setting('crm.team_lead_rpc', true), '') = '1'
     or public.crm_can_approve_team_lead() then
    return new;
  end if;
  raise exception 'Баг: ахлагчийн эрхийг оффисын админ батална';
end
$$;
create trigger crm_staff_lead_role_guard
  before insert or update of roles on public.crm_staff
  for each row execute function public.crm_staff_lead_role_guard();

-- ── Ахлагч томилох/чөлөөлөх ────────────────────────────────────────────────────
-- p_profile = null: чөлөөлөх (баг удирдах эрхтэй хэн ч). Томилох: зөвхөн оффисын админ.
create or replace function public.crm_team_set_lead(p_team uuid, p_profile uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_office uuid := public.crm_office_id();
  v_old uuid;
begin
  if not public.crm_can_manage_teams() then raise exception 'Баг: танд эрх алга'; end if;
  if p_profile is not null and not public.crm_can_approve_team_lead() then
    raise exception 'Баг: ахлагчийг оффисын админ батална — санал болгоно уу';
  end if;
  perform set_config('crm.team_lead_rpc', '1', true);

  select lead_profile_id into v_old from public.crm_teams
   where id = p_team and office_id = v_office for update;
  if not found then raise exception 'Баг: олдсонгүй'; end if;

  if p_profile is not null and not exists (
    select 1 from public.crm_staff s
     where s.office_id = v_office and s.profile_id = p_profile and s.team_id = p_team and s.is_active
  ) then
    raise exception 'Баг: ахлагч нь энэ багийн гишүүн байх ёстой';
  end if;

  if v_old is distinct from p_profile then
    update public.crm_teams set lead_profile_id = p_profile where id = p_team;
    if v_old is not null then perform public.crm_team_drop_lead_role(v_office, v_old); end if;
  end if;

  if p_profile is not null then
    update public.crm_teams
       set pending_lead_profile_id = null, lead_proposed_by = null, lead_proposed_at = null
     where id = p_team;

    update public.crm_staff s
       set roles = coalesce(nullif(array_remove(s.roles, 'team_lead'::public.crm_role), '{}'::public.crm_role[]), '{agent}'::public.crm_role[])
     where s.office_id = v_office and s.team_id = p_team and s.profile_id is distinct from p_profile
       and 'team_lead'::public.crm_role = any(s.roles)
       and not exists (select 1 from public.crm_teams t where t.office_id = v_office and t.lead_profile_id = s.profile_id);

    update public.crm_staff
       set roles = roles || 'team_lead'::public.crm_role
     where office_id = v_office and profile_id = p_profile
       and not ('team_lead'::public.crm_role = any(roles));
  end if;

  perform set_config('crm.team_lead_rpc', '', true);
end
$$;

-- Санал болгох. Оффисын админ өөрөө бол шууд томилно ('applied'), бусад үед 'pending'.
create function public.crm_team_propose_lead(p_team uuid, p_profile uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_office uuid := public.crm_office_id();
  v_lead uuid;
begin
  if not public.crm_can_manage_teams() then raise exception 'Баг: танд эрх алга'; end if;
  if p_profile is null then raise exception 'Баг: ахлагч болох гишүүнээ сонгоно уу'; end if;

  select lead_profile_id into v_lead from public.crm_teams
   where id = p_team and office_id = v_office for update;
  if not found then raise exception 'Баг: олдсонгүй'; end if;

  if not exists (
    select 1 from public.crm_staff s
     where s.office_id = v_office and s.profile_id = p_profile and s.team_id = p_team and s.is_active
  ) then
    raise exception 'Баг: ахлагч нь энэ багийн гишүүн байх ёстой';
  end if;

  if public.crm_can_approve_team_lead() then
    perform public.crm_team_set_lead(p_team, p_profile);
    return 'applied';
  end if;

  if v_lead is not distinct from p_profile then
    raise exception 'Баг: энэ хүн аль хэдийн ахлагч байна';
  end if;

  perform set_config('crm.team_lead_rpc', '1', true);
  update public.crm_teams
     set pending_lead_profile_id = p_profile, lead_proposed_by = auth.uid(), lead_proposed_at = now()
   where id = p_team;
  perform set_config('crm.team_lead_rpc', '', true);
  return 'pending';
end
$$;

-- Батлах: зөвхөн оффисын админ. Батлагдсан ахлагчийн profile_id-г буцаана.
create function public.crm_team_approve_lead(p_team uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_office uuid := public.crm_office_id();
  v_pending uuid;
begin
  if not public.crm_can_approve_team_lead() then raise exception 'Баг: ахлагчийг зөвхөн оффисын админ батална'; end if;
  select pending_lead_profile_id into v_pending from public.crm_teams
   where id = p_team and office_id = v_office for update;
  if not found then raise exception 'Баг: олдсонгүй'; end if;
  if v_pending is null then raise exception 'Баг: батлах санал алга'; end if;
  perform public.crm_team_set_lead(p_team, v_pending);
  return v_pending;
end
$$;

-- Татгалзах (оффисын админ) эсвэл өөрийн саналаа цуцлах (санал болгогч).
create function public.crm_team_reject_lead(p_team uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_office uuid := public.crm_office_id();
  v_pending uuid;
  v_by uuid;
begin
  select pending_lead_profile_id, lead_proposed_by into v_pending, v_by from public.crm_teams
   where id = p_team and office_id = v_office for update;
  if not found then raise exception 'Баг: олдсонгүй'; end if;
  if v_pending is null then return; end if;
  if not (public.crm_can_approve_team_lead()
          or (public.crm_can_manage_teams() and v_by = auth.uid())) then
    raise exception 'Баг: танд эрх алга';
  end if;
  perform set_config('crm.team_lead_rpc', '1', true);
  update public.crm_teams
     set pending_lead_profile_id = null, lead_proposed_by = null, lead_proposed_at = null
   where id = p_team;
  perform set_config('crm.team_lead_rpc', '', true);
end
$$;

-- ── Багаас гарах/идэвхгүй болоход ахлагч, саналыг цэвэрлэнэ ────────────────────
create or replace function public.crm_staff_team_sync()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old uuid := case when tg_op = 'UPDATE' and old.is_active then old.team_id end;
  v_new uuid := case when new.is_active then new.team_id end;
begin
  if v_old is not distinct from v_new then return new; end if;

  if v_old is not null then
    perform set_config('crm.team_lead_rpc', '1', true);
    delete from public.staff_chat_members m
     using public.staff_chats c
     where c.id = m.chat_id and c.team_id = v_old and m.profile_id = new.profile_id;
    update public.crm_teams
       set pending_lead_profile_id = null, lead_proposed_by = null, lead_proposed_at = null
     where id = v_old and pending_lead_profile_id = new.profile_id;
    update public.crm_teams set lead_profile_id = null
     where id = v_old and lead_profile_id = new.profile_id;
    if found then perform public.crm_team_drop_lead_role(new.office_id, new.profile_id); end if;
    perform set_config('crm.team_lead_rpc', '', true);
  end if;

  if v_new is not null and public.staff_chat_in_office(new.profile_id, new.office_id) then
    insert into public.staff_chat_members (chat_id, profile_id)
    select c.id, new.profile_id from public.staff_chats c where c.team_id = v_new
    on conflict do nothing;
  end if;
  return new;
end
$$;

do $$
declare f text;
begin
  foreach f in array array[
    'crm_can_approve_team_lead()',
    'crm_team_propose_lead(uuid, uuid)',
    'crm_team_approve_lead(uuid)',
    'crm_team_reject_lead(uuid)'
  ] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated, service_role', f);
  end loop;
  foreach f in array array[
    'crm_teams_lead_guard()',
    'crm_teams_insert_guard()',
    'crm_staff_lead_role_guard()'
  ] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
end $$;
