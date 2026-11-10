-- Салбаргүй бүртгэгдсэн ажилтан багт ороход багийн салбарыг авна.
create or replace function public.crm_team_assign_member(p_team uuid, p_profile uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_office uuid := public.crm_office_id();
  v_staff public.crm_staff;
  v_branch uuid;
begin
  if not public.crm_can_manage_teams() then raise exception 'Баг: танд эрх алга'; end if;

  if p_team is not null then
    select branch_id into v_branch from public.crm_teams where id = p_team and office_id = v_office;
    if v_branch is null then raise exception 'Баг: олдсонгүй'; end if;
  end if;

  select * into v_staff from public.crm_staff where office_id = v_office and profile_id = p_profile;

  if found then
    if not v_staff.is_active then raise exception 'Баг: энэ ажилтан идэвхгүй байна'; end if;
    if v_staff.team_id is not distinct from p_team then return false; end if;
    update public.crm_staff
       set team_id = p_team,
           branch_id = coalesce(branch_id, v_branch)
     where id = v_staff.id;
    return false;
  end if;

  if p_team is null then return false; end if;
  if not exists (
    select 1 from public.agents a
     where a.profile_id = p_profile and a.office_id = v_office and a.status = 'active'
  ) then
    raise exception 'Баг: энэ хүн таны оффисын идэвхтэй агент биш';
  end if;

  insert into public.crm_staff (office_id, profile_id, branch_id, team_id)
  values (v_office, p_profile, v_branch, p_team);
  return true;
end
$$;
