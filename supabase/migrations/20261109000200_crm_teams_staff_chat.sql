-- Оффисын агентуудыг багт хуваарилах, багийн ахлагч томилох, ахлагч гишүүдийнхээ
-- сэжмийг хянах, мөн оффисын дотоод чат (шууд, бүлэг, багийн).
--
-- Хамрах хүрээ: чат зөвхөн нэг оффисын дотор. Агент багт орох үед CRM-д автоматаар
-- `agent` дүртэй бүртгэгдэнэ.

-- ── 1. Багийн ахлагч гишүүдийнхээ БҮРТГЭСЭН сэжмийг харна ─────────────────────
-- Өмнө нь зөвхөн эзэмшигч (owner_id) гишүүн байвал харагддаг байсан тул дараалалд
-- орсон эсвэл өөр хүнд шилжсэн сэжим ахлагчид харагдахгүй байв.
alter policy crm_leads_select on public.crm_leads
  using (
    (office_id = (select public.crm_office_id()))
    and (
      owner_id = auth.uid()
      or created_by = auth.uid()
      or (owner_id is not null and public.crm_is_team_of(owner_id))
      or public.crm_is_team_of(created_by)
      or (select public.crm_is_manager())
      or (select public.has_crm_role(variadic array['marketing'::public.crm_role, 'aml_officer'::public.crm_role]))
    )
  );

create or replace function public.crm_can_view_contact(c uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare ok boolean := false;
begin
  select exists (
    select 1 from public.crm_contacts ct
    where ct.id = c
      and ct.office_id = public.crm_office_id()
      and (
        ct.created_by = auth.uid()
        or public.crm_is_manager()
        or public.has_crm_role('finance', 'aml_officer')
        or exists (
          select 1 from public.crm_leads l
          where l.contact_id = ct.id
            and (l.owner_id = auth.uid()
                 or l.created_by = auth.uid()
                 or (l.owner_id is not null and public.crm_is_team_of(l.owner_id))
                 or public.crm_is_team_of(l.created_by))
        )
        or exists (
          select 1 from public.crm_opportunities op
          where op.contact_id = ct.id
            and (op.owner_id = auth.uid()
                 or op.created_by = auth.uid()
                 or public.crm_is_team_of(op.owner_id))
        )
      )
  ) into ok;
  return ok;
end
$$;

-- ── 2. Чатын хүснэгтүүд ────────────────────────────────────────────────────────
create type public.staff_chat_kind as enum ('direct', 'group', 'team');

create table public.staff_chats (
  id uuid primary key default gen_random_uuid(),
  office_id uuid not null references public.offices(id) on delete cascade,
  kind public.staff_chat_kind not null,
  name text check (name is null or char_length(btrim(name)) between 1 and 80),
  team_id uuid unique references public.crm_teams(id) on delete cascade,
  direct_key text unique,
  created_by uuid references public.profiles(id) on delete set null,
  last_message_at timestamptz,
  created_at timestamptz not null default now(),
  constraint staff_chats_direct_key check ((kind = 'direct') = (direct_key is not null)),
  constraint staff_chats_team check ((kind = 'team') = (team_id is not null)),
  constraint staff_chats_named check (kind = 'direct' or name is not null)
);
create index staff_chats_office_idx on public.staff_chats (office_id, last_message_at desc nulls last);

create table public.staff_chat_members (
  chat_id uuid not null references public.staff_chats(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  joined_at timestamptz not null default now(),
  last_read_at timestamptz,
  primary key (chat_id, profile_id)
);
create index staff_chat_members_profile_idx on public.staff_chat_members (profile_id);

create table public.staff_chat_messages (
  id uuid primary key default gen_random_uuid(),
  chat_id uuid not null references public.staff_chats(id) on delete cascade,
  sender_id uuid references public.profiles(id) on delete set null,
  body text not null check (char_length(btrim(body)) between 1 and 4000),
  created_at timestamptz not null default now()
);
create index staff_chat_messages_chat_idx on public.staff_chat_messages (chat_id, created_at desc);

-- Оффисоос гарсан хүн гишүүнчлэлтэй үлдсэн ч хандах эрхгүй болно.
create function public.staff_chat_is_member(p_chat uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
      from public.staff_chat_members m
      join public.staff_chats c on c.id = m.chat_id
     where m.chat_id = p_chat
       and m.profile_id = auth.uid()
       and c.office_id = public.crm_office_id()
  );
$$;

create function public.staff_chat_in_office(p_profile uuid, p_office uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select p_office is not null and (
    exists (select 1 from public.profiles p where p.id = p_profile and p.office_id = p_office)
    or exists (select 1 from public.agents a where a.profile_id = p_profile and a.office_id = p_office and a.status = 'active')
  );
$$;

alter table public.staff_chats enable row level security;
alter table public.staff_chat_members enable row level security;
alter table public.staff_chat_messages enable row level security;

create policy staff_chats_select on public.staff_chats
  for select to authenticated using (public.staff_chat_is_member(id));
create policy staff_chat_members_select on public.staff_chat_members
  for select to authenticated using (public.staff_chat_is_member(chat_id));
create policy staff_chat_messages_select on public.staff_chat_messages
  for select to authenticated using (public.staff_chat_is_member(chat_id));
create policy staff_chat_messages_insert on public.staff_chat_messages
  for insert to authenticated
  with check (sender_id = auth.uid() and public.staff_chat_is_member(chat_id));

create function public.staff_chat_after_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.staff_chats set last_message_at = new.created_at where id = new.chat_id;
  update public.staff_chat_members set last_read_at = new.created_at
   where chat_id = new.chat_id and profile_id = new.sender_id;
  return new;
end
$$;
create trigger staff_chat_messages_after
  after insert on public.staff_chat_messages
  for each row execute function public.staff_chat_after_message();

-- ── 3. Чатын функцүүд ──────────────────────────────────────────────────────────
-- Өөрийн оффисын хэн ч чатлах боломжтой хүмүүсийн жагсаалт (нэрээс өөр мэдээлэл өгөхгүй).
create function public.staff_chat_directory()
returns table (profile_id uuid, name text, avatar_url text, role public.user_role, team_name text)
language sql
stable
security definer
set search_path = public
as $$
  with me as (select public.crm_office_id() as office_id)
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
     and (p.office_id = me.office_id or a.status = 'active')
   order by p.id;
$$;

create function public.staff_chat_open_direct(p_other uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
  v_office uuid := public.crm_office_id();
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

create function public.staff_chat_create_group(p_name text, p_members uuid[])
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
  v_office uuid := public.crm_office_id();
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

create function public.staff_chat_add_members(p_chat uuid, p_members uuid[])
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_office uuid := public.crm_office_id();
  v_kind public.staff_chat_kind;
  v_member uuid;
begin
  if not public.staff_chat_is_member(p_chat) then raise exception 'Чат: олдсонгүй'; end if;
  select kind into v_kind from public.staff_chats where id = p_chat;
  if v_kind <> 'group' then raise exception 'Чат: зөвхөн бүлэгт гишүүн нэмнэ'; end if;
  foreach v_member in array coalesce(p_members, '{}'::uuid[]) loop
    if not public.staff_chat_in_office(v_member, v_office) then
      raise exception 'Чат: сонгосон хүн таны оффист байхгүй';
    end if;
    insert into public.staff_chat_members (chat_id, profile_id) values (p_chat, v_member) on conflict do nothing;
  end loop;
end
$$;

create function public.staff_chat_leave(p_chat uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_kind public.staff_chat_kind;
begin
  if not public.staff_chat_is_member(p_chat) then raise exception 'Чат: олдсонгүй'; end if;
  select kind into v_kind from public.staff_chats where id = p_chat;
  if v_kind <> 'group' then raise exception 'Чат: зөвхөн бүлгээс гарч болно'; end if;
  delete from public.staff_chat_members where chat_id = p_chat and profile_id = auth.uid();
end
$$;

create function public.staff_chat_mark_read(p_chat uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.staff_chat_members
     set last_read_at = now()
   where chat_id = p_chat
     and profile_id = auth.uid()
     and public.staff_chat_is_member(p_chat);
$$;

create function public.staff_chat_list()
returns table (
  id uuid,
  kind public.staff_chat_kind,
  name text,
  team_id uuid,
  last_message_at timestamptz,
  created_at timestamptz,
  last_body text,
  last_sender_id uuid,
  unread_count int,
  member_count int,
  other_profile_id uuid,
  other_name text,
  other_avatar_url text
)
language sql
stable
security definer
set search_path = public
as $$
  select c.id, c.kind, c.name, c.team_id, c.last_message_at, c.created_at,
         lm.body, lm.sender_id,
         (select count(*)::int from public.staff_chat_messages x
           where x.chat_id = c.id
             and x.sender_id is distinct from auth.uid()
             and x.created_at > coalesce(mine.last_read_at, '-infinity'::timestamptz)),
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
     and c.office_id = public.crm_office_id()
   order by coalesce(c.last_message_at, c.created_at) desc;
$$;

-- Чатын гишүүдийн нэр (мессежийн илгээгчийг харуулах). Зөвхөн тухайн чатын гишүүнд.
create function public.staff_chat_people(p_chat uuid)
returns table (profile_id uuid, name text, avatar_url text, last_read_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select m.profile_id,
         coalesce(a.display_name, p.full_name, 'Хэрэглэгч'),
         coalesce(a.avatar_url, a.avatar, p.avatar_url),
         m.last_read_at
    from public.staff_chat_members m
    join public.staff_chats c on c.id = m.chat_id
    join public.profiles p on p.id = m.profile_id
    left join public.agents a on a.profile_id = m.profile_id and a.office_id = c.office_id
   where m.chat_id = p_chat
     and public.staff_chat_is_member(p_chat);
$$;

-- ── 4. Багийн удирдлага ────────────────────────────────────────────────────────
create function public.crm_can_manage_teams()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.crm_office_id() is not null
     and (public.jwt_role() = 'office_admin'::public.user_role
          or public.has_crm_role('sysadmin', 'sales_director', 'ops_qc'));
$$;

-- Менежерт: оффисын бүх агент ба тэдний багийн байдал (crm_staff бүртгэлгүй ч гарна).
create function public.crm_team_roster()
returns table (
  profile_id uuid,
  name text,
  avatar_url text,
  phone text,
  user_role public.user_role,
  staff_id uuid,
  team_id uuid,
  is_active boolean,
  roles public.crm_role[]
)
language sql
stable
security definer
set search_path = public
as $$
  with me as (select public.crm_office_id() as office_id)
  select distinct on (p.id)
         p.id,
         coalesce(a.display_name, p.full_name, 'Хэрэглэгч'),
         coalesce(a.avatar_url, a.avatar, p.avatar_url),
         coalesce(a.phone, p.phone),
         p.role,
         s.id,
         s.team_id,
         s.is_active,
         s.roles
    from public.profiles p
    cross join me
    left join public.agents a on a.profile_id = p.id and a.office_id = me.office_id
    left join public.crm_staff s on s.profile_id = p.id and s.office_id = me.office_id
   where public.crm_can_manage_teams()
     and (a.status = 'active' or s.id is not null)
   order by p.id;
$$;

create function public.crm_team_save(p_id uuid, p_name text, p_branch uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_office uuid := public.crm_office_id();
  v_name text := btrim(coalesce(p_name, ''));
  v_id uuid;
begin
  if not public.crm_can_manage_teams() then raise exception 'Баг: танд эрх алга'; end if;
  if char_length(v_name) not between 1 and 80 then raise exception 'Баг: нэр оруулна уу'; end if;
  if not exists (select 1 from public.crm_branches b where b.id = p_branch and b.office_id = v_office) then
    raise exception 'Баг: салбар сонгоно уу';
  end if;
  if p_id is null then
    insert into public.crm_teams (office_id, branch_id, name)
    values (v_office, p_branch, v_name)
    returning id into v_id;
  else
    update public.crm_teams set name = v_name, branch_id = p_branch
     where id = p_id and office_id = v_office
     returning id into v_id;
    if v_id is null then raise exception 'Баг: олдсонгүй'; end if;
  end if;
  return v_id;
end
$$;

-- p_team = null бол багаас гаргана. CRM-д шинээр бүртгэгдсэн эсэхийг буцаана.
create function public.crm_team_assign_member(p_team uuid, p_profile uuid)
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
    update public.crm_staff set team_id = p_team where id = v_staff.id;
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

create function public.crm_team_drop_lead_role(p_office uuid, p_profile uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.crm_staff
     set roles = array_remove(roles, 'team_lead'::public.crm_role)
   where office_id = p_office
     and profile_id = p_profile
     and 'team_lead'::public.crm_role = any(roles)
     and not exists (
       select 1 from public.crm_teams t
        where t.office_id = p_office and t.lead_profile_id = p_profile
     );
$$;

-- p_profile = null бол ахлагчийг чөлөөлнө. Ахлагч заавал тухайн багийн идэвхтэй гишүүн.
create function public.crm_team_set_lead(p_team uuid, p_profile uuid)
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

  if p_profile is not null then
    update public.crm_staff
       set roles = roles || 'team_lead'::public.crm_role
     where office_id = v_office and profile_id = p_profile
       and not ('team_lead'::public.crm_role = any(roles));
  end if;
end
$$;

-- ── 5. Багийн чат ба ахлагчийг автоматаар тааруулах ────────────────────────────
create function public.crm_team_chat_sync()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.staff_chats (office_id, kind, name, team_id, created_by)
    values (new.office_id, 'team', left(btrim(new.name), 80), new.id, auth.uid())
    on conflict (team_id) do nothing;
  elsif new.name is distinct from old.name then
    update public.staff_chats set name = left(btrim(new.name), 80) where team_id = new.id;
  end if;
  return new;
end
$$;
create trigger crm_teams_chat_sync
  after insert or update of name on public.crm_teams
  for each row execute function public.crm_team_chat_sync();

-- Ажилтны багийн өөрчлөлт аль ч замаар хийгдсэн (багийн хуудас, ажилтны тохиргоо,
-- идэвхгүй болгох) багийн чат ба ахлагчийн байдал зөрөхгүй.
create function public.crm_staff_team_sync()
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
    delete from public.staff_chat_members m
     using public.staff_chats c
     where c.id = m.chat_id and c.team_id = v_old and m.profile_id = new.profile_id;
    update public.crm_teams set lead_profile_id = null
     where id = v_old and lead_profile_id = new.profile_id;
    if found then perform public.crm_team_drop_lead_role(new.office_id, new.profile_id); end if;
  end if;

  if v_new is not null then
    insert into public.staff_chat_members (chat_id, profile_id)
    select c.id, new.profile_id from public.staff_chats c where c.team_id = v_new
    on conflict do nothing;
  end if;
  return new;
end
$$;
create trigger crm_staff_team_sync
  after insert or update of team_id, is_active on public.crm_staff
  for each row execute function public.crm_staff_team_sync();

-- Одоо байгаа багуудын чат.
insert into public.staff_chats (office_id, kind, name, team_id, created_by)
select t.office_id, 'team'::public.staff_chat_kind, left(btrim(t.name), 80), t.id, t.lead_profile_id
  from public.crm_teams t
on conflict (team_id) do nothing;

insert into public.staff_chat_members (chat_id, profile_id)
select c.id, s.profile_id
  from public.staff_chats c
  join public.crm_staff s on s.team_id = c.team_id and s.is_active
on conflict do nothing;

insert into public.staff_chat_members (chat_id, profile_id)
select c.id, t.lead_profile_id
  from public.staff_chats c
  join public.crm_teams t on t.id = c.team_id
 where t.lead_profile_id is not null
on conflict do nothing;

-- ── 6. Эрх ба realtime ─────────────────────────────────────────────────────────
do $$
declare f text;
begin
  foreach f in array array[
    'staff_chat_is_member(uuid)',
    'staff_chat_directory()',
    'staff_chat_open_direct(uuid)',
    'staff_chat_create_group(text, uuid[])',
    'staff_chat_add_members(uuid, uuid[])',
    'staff_chat_leave(uuid)',
    'staff_chat_mark_read(uuid)',
    'staff_chat_list()',
    'staff_chat_people(uuid)',
    'crm_can_manage_teams()',
    'crm_team_roster()',
    'crm_team_save(uuid, text, uuid)',
    'crm_team_assign_member(uuid, uuid)',
    'crm_team_set_lead(uuid, uuid)'
  ] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated, service_role', f);
  end loop;
  foreach f in array array[
    'staff_chat_in_office(uuid, uuid)',
    'staff_chat_after_message()',
    'crm_team_drop_lead_role(uuid, uuid)',
    'crm_team_chat_sync()',
    'crm_staff_team_sync()'
  ] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
end $$;

alter publication supabase_realtime
  add table public.staff_chats, public.staff_chat_members, public.staff_chat_messages;
