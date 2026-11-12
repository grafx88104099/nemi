-- Календарийн засвар (бие даасан шалгалтаар илэрсэн):
-- A. Guard: хамгаалагдсан баганыг эхэлж сэргээнэ; зөвхөн ШИНЭЭР нэмсэн урилгыг шалгана
--    (урьсан хүн оффисоос гарсны дараа ч эзэн үйл явдлаа засна); урих хүн CRM-д идэвхтэй байна.
-- B. Ахлагч гишүүнийхээ оролцох (эзнийг нь харах эрхгүй) үйл явдлыг «Завгүй» гэж харна.

create or replace function public.crm_events_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_prev uuid[] := '{}';
begin
  if tg_op = 'UPDATE' then
    new.office_id := old.office_id;
    new.owner_id := old.owner_id;
    new.created_by := old.created_by;
    new.created_at := old.created_at;
    v_prev := old.attendee_ids;
  end if;
  new.updated_at := now();
  new.title := btrim(new.title);
  new.attendee_ids := coalesce((
    select array_agg(distinct a) from unnest(new.attendee_ids) a
     where a is not null and a <> new.owner_id
  ), '{}');
  for v_id in
    select a from unnest(new.attendee_ids) a
    except
    select a from unnest(v_prev) a
  loop
    if not public.staff_chat_in_office(v_id, new.office_id) then
      raise exception 'Календарь: урьсан хүн таны оффист байхгүй';
    end if;
    if not exists (
      select 1 from public.crm_staff s
       where s.profile_id = v_id and s.office_id = new.office_id and s.is_active
    ) then
      raise exception 'Календарь: % CRM-д бүртгэлгүй тул урих боломжгүй',
        coalesce((select p.full_name from public.profiles p where p.id = v_id), 'урьсан хүн');
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
  return new;
end
$$;

-- B) crm_calendar_events: a row matched only through an attendee the caller may view (owner not viewable) is returned masked as «Завгүй», with owner_id reported as that attendee (#9)
create or replace function public.crm_calendar_events(p_from timestamptz, p_to timestamptz, p_people uuid[])
returns table (
  id uuid, owner_id uuid, title text, description text, location text, kind text,
  starts_at timestamptz, ends_at timestamptz, all_day boolean, is_private boolean,
  attendee_ids uuid[], lead_id uuid, contact_id uuid, opportunity_id uuid,
  masked boolean, can_edit boolean
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
           (e.owner_id = v_me or v_me = any(e.attendee_ids)) as mine,
           public.crm_calendar_can_view(e.owner_id) as owner_ok,
           (select a from unnest(e.attendee_ids) a
             where a = any(p_people) and public.crm_calendar_can_view(a)
             limit 1) as via_attendee
      from public.crm_events e
     where e.office_id = v_office
       and e.starts_at < p_to
       and e.ends_at > p_from
       and (e.owner_id = any(p_people) or e.attendee_ids && p_people)
  ), shown as (
    select v.*, (v.mine or (v.owner_ok and not v.is_private)) as is_open
      from vis v
     where v.mine or v.owner_ok or v.via_attendee is not null
  )
  select s.id,
         case when s.mine or s.owner_ok then s.owner_id else s.via_attendee end,
         case when s.is_open then s.title else 'Завгүй' end,
         case when s.is_open then s.description end,
         case when s.is_open then s.location end,
         case when s.is_open then s.kind else 'other' end,
         s.starts_at,
         s.ends_at,
         s.all_day,
         s.is_private,
         case when s.is_open then s.attendee_ids else '{}'::uuid[] end,
         case when s.is_open then s.lead_id end,
         case when s.is_open then s.contact_id end,
         case when s.is_open then s.opportunity_id end,
         not s.is_open,
         s.owner_id = v_me
    from shown s
   order by s.starts_at;
end
$$;
