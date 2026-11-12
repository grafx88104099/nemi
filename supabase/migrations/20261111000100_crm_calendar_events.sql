-- CRM календарь: ажилтны өөрийн үйл явдал (уулзалт, дуудлага, цаг тавих гэх мэт).
-- Даалгавар, дараагийн алхам, үзлэг, боломжийн уулзалт нь өөрсдийн хүснэгт/RLS-ээрээ
-- календарьт нийлнэ; энэ хүснэгт зөвхөн гараар үүсгэсэн үйл явдлыг хадгална.
--
-- Харах эрх CRM-тэй ижил: өөрийн, урилгатай, багийн ахлагч гишүүдийнхээ, менежер
-- бүгдийнх. Хувийн (is_private) үйл явдлыг эзэн ба урилгатай хүнээс бусад нь зөвхөн
-- «Завгүй» гэж харна — үүнийг crm_calendar_events() RPC нууна.

create table public.crm_events (
  id uuid primary key default gen_random_uuid(),
  office_id uuid not null references public.offices(id) on delete cascade,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 200),
  description text check (description is null or char_length(description) <= 4000),
  location text check (location is null or char_length(location) <= 300),
  kind text not null default 'meeting'
    check (kind in ('meeting', 'call', 'showing', 'personal', 'other')),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  all_day boolean not null default false,
  is_private boolean not null default false,
  attendee_ids uuid[] not null default '{}',
  lead_id uuid references public.crm_leads(id) on delete set null,
  contact_id uuid references public.crm_contacts(id) on delete set null,
  opportunity_id uuid references public.crm_opportunities(id) on delete set null,
  created_by uuid not null default auth.uid() references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint crm_events_range check (ends_at > starts_at and ends_at - starts_at <= interval '31 days'),
  constraint crm_events_attendees check (cardinality(attendee_ids) <= 50)
);

create index crm_events_owner_idx on public.crm_events (office_id, owner_id, starts_at);
create index crm_events_range_idx on public.crm_events (office_id, starts_at, ends_at);
create index crm_events_attendees_idx on public.crm_events using gin (attendee_ids);

-- Хэн хэний календарийг харах вэ (CRM-ийн сэжмийн эрхтэй ижил).
create function public.crm_calendar_can_view(p_profile uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select p_profile = auth.uid()
      or public.crm_is_manager()
      or public.crm_is_team_of(p_profile);
$$;

create function public.crm_events_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  new.updated_at := now();
  new.title := btrim(new.title);
  -- Урилга: зөвхөн тухайн оффисын хүмүүс, давхардалгүй, эзэн өөрөө орохгүй.
  new.attendee_ids := coalesce((
    select array_agg(distinct a) from unnest(new.attendee_ids) a
     where a is not null and a <> new.owner_id
  ), '{}');
  foreach v_id in array new.attendee_ids loop
    if not public.staff_chat_in_office(v_id, new.office_id) then
      raise exception 'Календарь: урьсан хүн таны оффист байхгүй';
    end if;
  end loop;
  if new.lead_id is not null and not exists (select 1 from public.crm_leads where id = new.lead_id and office_id = new.office_id) then
    raise exception 'Календарь: сэжим олдсонгүй';
  end if;
  if new.contact_id is not null and not exists (select 1 from public.crm_contacts where id = new.contact_id and office_id = new.office_id) then
    raise exception 'Календарь: харилцагч олдсонгүй';
  end if;
  if new.opportunity_id is not null and not exists (select 1 from public.crm_opportunities where id = new.opportunity_id and office_id = new.office_id) then
    raise exception 'Календарь: боломж олдсонгүй';
  end if;
  if tg_op = 'UPDATE' then
    new.office_id := old.office_id;
    new.owner_id := old.owner_id;
    new.created_by := old.created_by;
    new.created_at := old.created_at;
  end if;
  return new;
end
$$;
create trigger crm_events_guard
  before insert or update on public.crm_events
  for each row execute function public.crm_events_guard();

alter table public.crm_events enable row level security;

create policy crm_events_select on public.crm_events
  for select to authenticated
  using (
    office_id = (select public.crm_office_id())
    and (
      owner_id = auth.uid()
      or auth.uid() = any(attendee_ids)
      or (not is_private and public.crm_calendar_can_view(owner_id))
    )
  );

create policy crm_events_insert on public.crm_events
  for insert to authenticated
  with check (
    office_id = (select public.crm_office_id())
    and owner_id = auth.uid()
    and created_by = auth.uid()
    and (select public.crm_my_staff_id()) is not null
  );

create policy crm_events_update on public.crm_events
  for update to authenticated
  using (office_id = (select public.crm_office_id()) and owner_id = auth.uid())
  with check (office_id = (select public.crm_office_id()) and owner_id = auth.uid());

create policy crm_events_delete on public.crm_events
  for delete to authenticated
  using (office_id = (select public.crm_office_id()) and owner_id = auth.uid());

-- Календарийн үйл явдал: хүмүүсийн жагсаалт ба хугацаагаар. Хувийн үйл явдлыг эзэн/урилгатай
-- хүнээс бусдад «Завгүй» болгож нууна. Хугацаа 62 хоногоос ихгүй.
create function public.crm_calendar_events(p_from timestamptz, p_to timestamptz, p_people uuid[])
returns table (
  id uuid,
  owner_id uuid,
  title text,
  description text,
  location text,
  kind text,
  starts_at timestamptz,
  ends_at timestamptz,
  all_day boolean,
  is_private boolean,
  attendee_ids uuid[],
  lead_id uuid,
  contact_id uuid,
  opportunity_id uuid,
  masked boolean,
  can_edit boolean
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_office uuid := public.crm_office_id();
  v_me uuid := auth.uid();
begin
  if v_me is null or v_office is null then return; end if;
  if p_from is null or p_to is null or p_to <= p_from or p_to - p_from > interval '62 days' then
    raise exception 'Календарь: хугацааны муж буруу';
  end if;

  return query
  with vis as (
    select e.*,
           (e.owner_id = v_me or v_me = any(e.attendee_ids)) as mine
      from public.crm_events e
     where e.office_id = v_office
       and e.starts_at < p_to
       and e.ends_at > p_from
       and (e.owner_id = any(p_people) or e.attendee_ids && p_people)
  )
  select v.id,
         v.owner_id,
         case when v.mine or not v.is_private then v.title else 'Завгүй' end,
         case when v.mine or not v.is_private then v.description end,
         case when v.mine or not v.is_private then v.location end,
         case when v.mine or not v.is_private then v.kind else 'other' end,
         v.starts_at,
         v.ends_at,
         v.all_day,
         v.is_private,
         case when v.mine or not v.is_private then v.attendee_ids else '{}'::uuid[] end,
         case when v.mine or not v.is_private then v.lead_id end,
         case when v.mine or not v.is_private then v.contact_id end,
         case when v.mine or not v.is_private then v.opportunity_id end,
         not (v.mine or not v.is_private),
         v.owner_id = v_me
    from vis v
   where v.mine or public.crm_calendar_can_view(v.owner_id)
   order by v.starts_at;
end
$$;

do $$
declare f text;
begin
  foreach f in array array['crm_calendar_can_view(uuid)', 'crm_calendar_events(timestamptz, timestamptz, uuid[])'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated, service_role', f);
  end loop;
  execute 'revoke all on function public.crm_events_guard() from public, anon, authenticated';
  execute 'grant execute on function public.crm_events_guard() to service_role';
end $$;
