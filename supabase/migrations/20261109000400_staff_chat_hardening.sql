-- Оффисын чат ба багийн функцүүдийн засвар (бие даасан шалгалтаар илэрсэн):
-- A. Чатын гишүүнчлэл = тухайн оффисын office_admin эсвэл ИДЭВХТЭЙ агент. Идэвхгүй болсон,
--    батлагдаагүй агент чат, жагсаалтад хандахгүй. Шинэ гишүүнд өмнөх түүх уншаагүй тоологдохгүй.
-- B. Багийн чатад зөвхөн тухайн оффисын идэвхтэй багийн гишүүд.
-- C. Мессежийн цагийг сервер тогтооно (клиент created_at өгч дараалал эвдэхгүй).
-- D. Ахлагчаас чөлөөлөхөд хоосон дүргүй үлдэхгүй; нэг багт нэг ахлагчийн эрх.
-- E. staff_chats-ийн DELETE үйл явдал realtime-аар бусад оффист цацагдахгүй.
-- A. Office membership = office_admin of the office, or an active agent of it (defects 1, 9, 5)
create or replace function public.staff_chat_in_office(p_profile uuid, p_office uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select p_office is not null and (
    exists (select 1 from public.profiles p where p.id = p_profile and p.office_id = p_office and p.role = 'office_admin')
    or exists (select 1 from public.agents a where a.profile_id = p_profile and a.office_id = p_office and a.status = 'active')
  );
$$;

create or replace function public.staff_chat_my_office()
returns uuid language sql stable security definer set search_path = public as $$
  select x.o from (select public.crm_office_id() as o) x where public.staff_chat_in_office(auth.uid(), x.o);
$$;
revoke all on function public.staff_chat_my_office() from public, anon, authenticated;
grant execute on function public.staff_chat_my_office() to service_role;

create or replace function public.staff_chat_is_member(p_chat uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1
      from public.staff_chat_members m
      join public.staff_chats c on c.id = m.chat_id
     where m.chat_id = p_chat
       and m.profile_id = auth.uid()
       and c.office_id = public.staff_chat_my_office()
  );
$$;

create or replace function public.staff_chat_directory()
returns table (profile_id uuid, name text, avatar_url text, role public.user_role, team_name text)
language sql stable security definer set search_path = public as $$
  with me as (select public.staff_chat_my_office() as office_id)
  select distinct on (p.id)
         p.id,
         coalesce(a.display_name, p.full_name, 'Хэрэглэгч') as name,
         coalesce(a.avatar_url, a.avatar, p.avatar_url) as avatar_url,
         p.role,
         t.name as team_name
    from public.profiles p
    cross join me
    left join public.agents a on a.profile_id = p.id and a.office_id = me.office_id
    left join public.crm_staff s on s.profile_id = p.id and s.office_id = me.office_id and s.is_active
    left join public.crm_teams t on t.id = s.team_id
   where me.office_id is not null
     and p.id <> auth.uid()
     and public.staff_chat_in_office(p.id, me.office_id)
   order by p.id;
$$;

create or replace function public.staff_chat_open_direct(p_other uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_me uuid := auth.uid();
  v_office uuid := public.staff_chat_my_office();
  v_key text;
  v_id uuid;
begin
  if v_me is null or v_office is null then raise exception 'Чат: оффист харьяалагдаагүй байна'; end if;
  if p_other is null or p_other = v_me then raise exception 'Чат: хүн сонгоно уу'; end if;
  if not public.staff_chat_in_office(p_other, v_office) then raise exception 'Чат: энэ хүн таны оффист байхгүй'; end if;
  v_key := least(v_me::text, p_other::text) || ':' || greatest(v_me::text, p_other::text);

  insert into public.staff_chats (office_id, kind, direct_key, created_by)
  values (v_office, 'direct', v_key, v_me)
  on conflict (direct_key) do nothing;

  select id into v_id from public.staff_chats where direct_key = v_key and office_id = v_office;
  if v_id is null then raise exception 'Чат: нээж чадсангүй'; end if;

  insert into public.staff_chat_members (chat_id, profile_id)
  values (v_id, v_me), (v_id, p_other)
  on conflict do nothing;
  return v_id;
end
$$;

create or replace function public.staff_chat_create_group(p_name text, p_members uuid[])
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_me uuid := auth.uid();
  v_office uuid := public.staff_chat_my_office();
  v_name text := btrim(coalesce(p_name, ''));
  v_id uuid;
  v_member uuid;
  v_count int := 0;
begin
  if v_me is null or v_office is null then raise exception 'Чат: оффист харьяалагдаагүй байна'; end if;
  if char_length(v_name) not between 1 and 80 then raise exception 'Чат: бүлгийн нэр оруулна уу'; end if;

  insert into public.staff_chats (office_id, kind, name, created_by)
  values (v_office, 'group', v_name, v_me)
  returning id into v_id;
  insert into public.staff_chat_members (chat_id, profile_id) values (v_id, v_me);

  foreach v_member in array coalesce(p_members, '{}'::uuid[]) loop
    continue when v_member = v_me;
    if not public.staff_chat_in_office(v_member, v_office) then
      raise exception 'Чат: сонгосон хүн таны оффист байхгүй';
    end if;
    insert into public.staff_chat_members (chat_id, profile_id) values (v_id, v_member) on conflict do nothing;
    v_count := v_count + 1;
  end loop;
  if v_count = 0 then raise exception 'Чат: дор хаяж нэг гишүүн сонгоно уу'; end if;
  return v_id;
end
$$;

create or replace function public.staff_chat_list()
returns table (
  id uuid, kind public.staff_chat_kind, name text, team_id uuid,
  last_message_at timestamptz, created_at timestamptz, last_body text, last_sender_id uuid,
  unread_count int, member_count int, other_profile_id uuid, other_name text, other_avatar_url text
)
language sql stable security definer set search_path = public as $$
  select c.id, c.kind, c.name, c.team_id, c.last_message_at, c.created_at,
         lm.body, lm.sender_id,
         (select count(*)::int from public.staff_chat_messages x
           where x.chat_id = c.id
             and x.sender_id is distinct from auth.uid()
             and x.created_at > coalesce(mine.last_read_at, mine.joined_at)),
         (select count(*)::int from public.staff_chat_members x where x.chat_id = c.id),
         other.profile_id,
         other.name,
         other.avatar_url
    from public.staff_chat_members mine
    join public.staff_chats c on c.id = mine.chat_id
    left join lateral (
      select m.body, m.sender_id from public.staff_chat_messages m
       where m.chat_id = c.id order by m.created_at desc limit 1
    ) lm on true
    left join lateral (
      select om.profile_id,
             coalesce(a.display_name, p.full_name, 'Хэрэглэгч') as name,
             coalesce(a.avatar_url, a.avatar, p.avatar_url) as avatar_url
        from public.staff_chat_members om
        join public.profiles p on p.id = om.profile_id
        left join public.agents a on a.profile_id = om.profile_id and a.office_id = c.office_id
       where c.kind = 'direct' and om.chat_id = c.id and om.profile_id <> auth.uid()
       limit 1
    ) other on true
   where mine.profile_id = auth.uid()
     and c.office_id = (select public.staff_chat_my_office())
   order by coalesce(c.last_message_at, c.created_at) desc;
$$;

create or replace function public.staff_chat_people(p_chat uuid)
returns table (profile_id uuid, name text, avatar_url text, last_read_at timestamptz)
language sql stable security definer set search_path = public as $$
  select m.profile_id,
         coalesce(a.display_name, p.full_name, 'Хэрэглэгч'),
         coalesce(a.avatar_url, a.avatar, p.avatar_url),
         m.last_read_at
    from public.staff_chat_members m
    join public.staff_chats c on c.id = m.chat_id
    join public.profiles p on p.id = m.profile_id
    left join public.agents a on a.profile_id = m.profile_id and a.office_id = c.office_id
   where m.chat_id = p_chat
     and public.staff_chat_is_member(p_chat)
     and public.staff_chat_in_office(m.profile_id, c.office_id);
$$;

-- B. Team chat = active in-office team members (defect 2)
create or replace function public.crm_staff_team_sync()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_old uuid := case when tg_op = 'UPDATE' and old.is_active then old.team_id end;
  v_new uuid := case when new.is_active then new.team_id end;
begin
  if v_old is not distinct from v_new then return new; end if;

  if v_old is not null then
    delete from public.staff_chat_members m
     using public.staff_chats c
     where c.id = m.chat_id and c.team_id = v_old and m.profile_id = new.profile_id;
    update public.crm_teams set lead_profile_id = null
     where id = v_old and lead_profile_id = new.profile_id;
    if found then perform public.crm_team_drop_lead_role(new.office_id, new.profile_id); end if;
  end if;

  if v_new is not null and public.staff_chat_in_office(new.profile_id, new.office_id) then
    insert into public.staff_chat_members (chat_id, profile_id)
    select c.id, new.profile_id from public.staff_chats c where c.team_id = v_new
    on conflict do nothing;
  end if;
  return new;
end
$$;

create or replace function public.crm_team_assign_member(p_team uuid, p_profile uuid)
returns boolean language plpgsql security definer set search_path = public as $$
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
    if p_team is not null and not public.staff_chat_in_office(p_profile, v_office) then
      raise exception 'Баг: энэ хүн таны оффисын идэвхтэй агент биш';
    end if;
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

delete from public.staff_chat_members m using public.staff_chats c
 where c.id = m.chat_id and c.kind = 'team'
   and not exists (select 1 from public.crm_staff s
                    where s.team_id = c.team_id and s.profile_id = m.profile_id and s.is_active
                      and public.staff_chat_in_office(s.profile_id, s.office_id));

-- C. Server-assigned message time (defect 6)
create function public.staff_chat_before_message()
returns trigger language plpgsql set search_path = public as $$
begin
  new.created_at := now();
  return new;
end
$$;
create trigger staff_chat_messages_before
  before insert on public.staff_chat_messages
  for each row execute function public.staff_chat_before_message();
revoke all on function public.staff_chat_before_message() from public, anon, authenticated;
grant execute on function public.staff_chat_before_message() to service_role;

-- D. Team lead role hygiene (defects 7, 8)
create or replace function public.crm_team_drop_lead_role(p_office uuid, p_profile uuid)
returns void language sql security definer set search_path = public as $$
  update public.crm_staff
     set roles = coalesce(nullif(array_remove(roles, 'team_lead'::public.crm_role), '{}'::public.crm_role[]), '{agent}'::public.crm_role[])
   where office_id = p_office
     and profile_id = p_profile
     and 'team_lead'::public.crm_role = any(roles)
     and not exists (select 1 from public.crm_teams t where t.office_id = p_office and t.lead_profile_id = p_profile);
$$;

create or replace function public.crm_team_set_lead(p_team uuid, p_profile uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_office uuid := public.crm_office_id();
  v_old uuid;
begin
  if not public.crm_can_manage_teams() then raise exception 'Баг: танд эрх алга'; end if;
  select lead_profile_id into v_old from public.crm_teams
   where id = p_team and office_id = v_office for update;
  if not found then raise exception 'Баг: олдсонгүй'; end if;

  if p_profile is not null and not exists (
    select 1 from public.crm_staff s
     where s.office_id = v_office and s.profile_id = p_profile and s.team_id = p_team and s.is_active
  ) then
    raise exception 'Баг: ахлагч нь энэ багийн гишүүн байх ёстой';
  end if;

  if v_old is not distinct from p_profile then
    if p_profile is null then return; end if;
  else
    update public.crm_teams set lead_profile_id = p_profile where id = p_team;
    if v_old is not null then perform public.crm_team_drop_lead_role(v_office, v_old); end if;
  end if;

  update public.crm_staff s
     set roles = coalesce(nullif(array_remove(s.roles, 'team_lead'::public.crm_role), '{}'::public.crm_role[]), '{agent}'::public.crm_role[])
   where s.office_id = v_office and s.team_id = p_team and s.profile_id is distinct from p_profile
     and 'team_lead'::public.crm_role = any(s.roles)
     and not exists (select 1 from public.crm_teams t where t.office_id = v_office and t.lead_profile_id = s.profile_id);

  if p_profile is not null then
    update public.crm_staff
       set roles = roles || 'team_lead'::public.crm_role
     where office_id = v_office and profile_id = p_profile
       and not ('team_lead'::public.crm_role = any(roles));
  end if;
end
$$;

-- E. Realtime (defect 10). No client subscribes to staff_chats.
alter publication supabase_realtime drop table public.staff_chats;
