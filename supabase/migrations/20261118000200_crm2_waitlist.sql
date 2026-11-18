-- Хүлээлгийн үйлчлүүлэгч (T10) — тохирох Staff хөрөнгө хүлээж буй хүмүүс.
--
-- Хэн орох: ИДЭВХТЭЙ шаардлагатай боловч нээлттэй хэлцэлгүй харилцагч.
--   (Хэлцэл эхэлмэгц жагсаалтаас өөрөө гарна — тэр хүн дээр ажил явж байна.)
-- Тааруулалт: ангилал, төрөл, дүүрэг, зайлшгүй онцлог нь ЯГ таарна; төсөв,
--   талбай, өрөөний тоо нь яг таарвал «тохирох», 10% (өрөө ±1) зөрүүтэй бол
--   «ойрхон» гэж тусад нь харагдана.
-- Мэдэгдэл: тохирох хөрөнгө идэвхжих/өөрчлөгдөхөд харилцагчийг хариуцсан
--   агентад нэг удаа (нэг хөрөнгө × нэг шаардлагад) мэдэгдэнэ.
--
-- Хөрөнгийн харагдац: оффисын «property.visibility» тохиргоог дагана —
-- агентад харагдахгүй хөрөнгийг тааруулалтад ч харуулахгүй.

-- ── 1. Давтан мэдэгдэхээс сэргийлэх бүртгэл ─────────────────────────────────

create table if not exists public.crm2_match_notices (
  office_id uuid not null references public.offices(id) on delete cascade,
  requirement_id uuid not null references public.crm2_requirements(id) on delete cascade,
  property_id uuid not null references public.crm2_properties(id) on delete cascade,
  fit text not null,
  created_at timestamptz not null default now(),
  primary key (requirement_id, property_id)
);

create index if not exists crm2_match_notices_property_idx on public.crm2_match_notices (property_id);

alter table public.crm2_match_notices enable row level security;
-- Зөвхөн системийн функцууд уншиж бичнэ (UI-д шууд хэрэггүй).
revoke all on table public.crm2_match_notices from public, anon, authenticated;
grant all on table public.crm2_match_notices to service_role;

comment on table public.crm2_match_notices is
  'Хүлээлгийн жагсаалтын мэдэгдэл давтахаас сэргийлнэ: нэг шаардлага × нэг хөрөнгөд нэг мөр.';

-- ── 2. Тааруулалт ───────────────────────────────────────────────────────────

/**
 * Шаардлагад тохирох ИДЭВХТЭЙ хөрөнгүүд.
 *   fit = 'exact' — бүх нөхцөл яг таарсан
 *   fit = 'near'  — төсөв/талбай 10% дотор, өрөө ±1 зөрүүтэй
 * Хатуу шалгуур (ангилал, төрөл, дүүрэг, зайлшгүй онцлог, валют, үнийн
 * хугацаа) хоёуланд нь ЗААВАЛ таарна.
 * Тухайн харилцагчид аль хэдийн хэлцэл нээгдэж байсан хөрөнгийг гаргахгүй
 * (үзсэн эсвэл татгалзсан гэсэн үг).
 */
create or replace function public.crm2_requirement_matches(p_requirement uuid, p_property uuid default null)
returns table (property_id uuid, fit text)
language sql
stable
security definer
set search_path = public
as $$
  with r as (
    select * from public.crm2_requirements where id = p_requirement and status = 'active'
  )
  select p.id,
         case
           when (r.budget_min is null or p.price_total >= r.budget_min)
            and (r.budget_max is null or p.price_total <= r.budget_max)
            and (r.area_min is null or p.area_m2 >= r.area_min)
            and (r.area_max is null or p.area_m2 <= r.area_max)
            and (r.rooms_min is null or p.rooms >= r.rooms_min)
            and (r.rooms_max is null or p.rooms <= r.rooms_max)
           then 'exact' else 'near'
         end
    from r
    join public.crm2_properties p
      on p.office_id = r.office_id
     and p.status = 'active'
     and (p_property is null or p.id = p_property)
     -- Хатуу нөхцөл
     and (r.category is null or p.category = r.category)
     and (r.property_type is null or p.property_type = r.property_type)
     and (cardinality(coalesce(r.districts, '{}'::text[])) = 0 or p.district = any (r.districts))
     and (cardinality(coalesce(r.required_features, '{}'::text[])) = 0
          or p.features @> r.required_features)
     and coalesce(p.currency, 'MNT') = coalesce(r.currency, 'MNT')
     and p.price_period = coalesce(r.price_period, p.price_period)
     -- Зөөлөвшүүлсэн хүрээ (энэ хүрээнээс гарвал огт харуулахгүй)
     and (r.budget_min is null or p.price_total >= r.budget_min * 0.9)
     and (r.budget_max is null or p.price_total <= r.budget_max * 1.1)
     and (r.area_min is null or p.area_m2 >= r.area_min * 0.9)
     and (r.area_max is null or p.area_m2 <= r.area_max * 1.1)
     and (r.rooms_min is null or p.rooms >= r.rooms_min - 1)
     and (r.rooms_max is null or p.rooms <= r.rooms_max + 1)
     -- Аль хэдийн санал болгож үзсэн/татгалзсан хөрөнгө
     and not exists (
       select 1 from public.crm2_deals d
        where d.contact_id = r.contact_id and d.property_id = p.id
     );
$$;

revoke all on function public.crm2_requirement_matches(uuid, uuid) from public, anon, authenticated;
grant execute on function public.crm2_requirement_matches(uuid, uuid) to service_role;

-- ── 3. Жагсаалт (UI) ────────────────────────────────────────────────────────

/**
 * Хүлээж буй үйлчлүүлэгчид. Зөвхөн дуудагчид харагдах харилцагчид.
 * p_only_mine — зөвхөн өөрийн хариуцсан хүмүүс.
 * p_with_matches — null: бүгд, true: тохирохтой нь, false: тохирохгүй нь.
 */
create or replace function public.crm2_waitlist(
  p_only_mine boolean default false,
  p_with_matches boolean default null,
  p_limit integer default 200
)
returns table (
  requirement_id uuid,
  contact_id uuid,
  contact_code text,
  contact_name text,
  responsible_agent_id uuid,
  agent_name text,
  requirement jsonb,
  waiting_since timestamptz,
  last_activity_at timestamptz,
  next_task_id uuid,
  next_task_due timestamptz,
  next_task_note text,
  exact_count integer,
  near_count integer
)
language sql
stable
security definer
set search_path = public
as $$
  select r.id,
         c.id,
         c.code,
         c.full_name,
         c.responsible_agent_id,
         public.crm2_profile_name(c.responsible_agent_id),
         to_jsonb(r) - 'office_id' - 'created_by' - 'updated_by' - 'search_text',
         r.created_at,
         act.last_at,
         t.id,
         t.due_at,
         t.note,
         coalesce(m.exact_count, 0)::int,
         coalesce(m.near_count, 0)::int
    from public.crm2_requirements r
    join public.crm2_contacts c on c.id = r.contact_id
    left join lateral (
      select max(a.occurred_at) last_at
        from public.crm2_activities a
       where a.contact_id = c.id and a.voided_at is null
    ) act on true
    left join lateral (
      select tk.id, tk.due_at, tk.note
        from public.crm2_tasks tk
       where tk.contact_id = c.id and tk.status = 'open'
       order by tk.due_at nulls last
       limit 1
    ) t on true
    left join lateral (
      select count(*) filter (where mm.fit = 'exact')::int exact_count,
             count(*) filter (where mm.fit = 'near')::int near_count
        from public.crm2_requirement_matches(r.id) mm
        join public.crm2_properties pp on pp.id = mm.property_id
       where public.crm2_property_visible(pp.id, pp.status, pp.created_by,
                                          pp.listing_agent_id, pp.contract_agent_id, pp.photo_agent_id)
    ) m on true
   where r.office_id = public.crm_office_id()
     and r.status = 'active'
     and c.status = 'active'
     and public.crm2_contact_visible(c.id, c.responsible_agent_id)
     -- Нээлттэй хэлцэлтэй хүн хүлээж байгаа гэж тооцогдохгүй
     and not exists (
       select 1 from public.crm2_deals d where d.contact_id = c.id and d.is_open
     )
     and (not p_only_mine or c.responsible_agent_id = auth.uid())
     and (p_with_matches is null
          or (p_with_matches and coalesce(m.exact_count, 0) + coalesce(m.near_count, 0) > 0)
          or (not p_with_matches and coalesce(m.exact_count, 0) + coalesce(m.near_count, 0) = 0))
   order by coalesce(m.exact_count, 0) desc, r.created_at
   limit greatest(1, least(coalesce(p_limit, 200), 500));
$$;

revoke all on function public.crm2_waitlist(boolean, boolean, integer) from public, anon;
grant execute on function public.crm2_waitlist(boolean, boolean, integer) to authenticated, service_role;

/** Нэг шаардлагын тохирох хөрөнгүүд (карт дээр дэлгэж харах). */
create or replace function public.crm2_requirement_match_list(
  p_requirement uuid,
  p_limit integer default 20
)
returns table (
  property_id uuid,
  code text,
  fit text,
  category public.crm2_property_category,
  property_type text,
  district text,
  location_text text,
  rooms smallint,
  area_m2 numeric,
  floor smallint,
  building_floors smallint,
  price_total numeric,
  currency text,
  price_period public.crm2_price_period,
  available_from date,
  listing_agent_id uuid,
  listing_agent_name text
)
language sql
stable
security definer
set search_path = public
as $$
  select p.id, p.code, m.fit, p.category, p.property_type, p.district, p.location_text,
         p.rooms, p.area_m2, p.floor, p.building_floors, p.price_total, p.currency,
         p.price_period, p.available_from, p.listing_agent_id,
         public.crm2_profile_name(p.listing_agent_id)
    from public.crm2_requirements r
    join public.crm2_requirement_matches(r.id) m on true
    join public.crm2_properties p on p.id = m.property_id
   where r.id = p_requirement
     and public.crm2_can_view_contact(r.contact_id)
     and public.crm2_property_visible(p.id, p.status, p.created_by,
                                      p.listing_agent_id, p.contract_agent_id, p.photo_agent_id)
   order by (m.fit = 'exact') desc, p.price_total nulls last
   limit greatest(1, least(coalesce(p_limit, 20), 100));
$$;

revoke all on function public.crm2_requirement_match_list(uuid, integer) from public, anon;
grant execute on function public.crm2_requirement_match_list(uuid, integer) to authenticated, service_role;

-- ── 4. Шинэ хөрөнгө гарахад мэдэгдэх ────────────────────────────────────────

create or replace function public.crm2_property_match_notify()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row record;
  v_sent int := 0;
begin
  for v_row in
    select req.id req_id, req.contact_id, c.responsible_agent_id, c.full_name, m.fit
      from public.crm2_requirements req
      join public.crm2_contacts c on c.id = req.contact_id and c.status = 'active'
      join public.crm2_requirement_matches(req.id, new.id) m on true
     where req.office_id = new.office_id
       and req.status = 'active'
       and c.responsible_agent_id is not null
       and not exists (select 1 from public.crm2_deals d where d.contact_id = req.contact_id and d.is_open)
       and not exists (select 1 from public.crm2_match_notices n
                        where n.requirement_id = req.id and n.property_id = new.id)
     -- Нэг хөрөнгө олон хүнд таарч болно; мэдэгдлийн тоог хязгаарлана.
     limit 50
  loop
    insert into public.crm2_match_notices (office_id, requirement_id, property_id, fit)
    values (new.office_id, v_row.req_id, new.id, v_row.fit)
    on conflict (requirement_id, property_id) do nothing;

    perform public.crm2_notify(
      array[v_row.responsible_agent_id],
      'crm2_waitlist_match',
      'Хүлээлгийн жагсаалт: хөрөнгө олдлоо',
      format('%s — %s %s', v_row.full_name, new.code,
             case when v_row.fit = 'exact' then 'шаардлагад тохирч байна' else 'шаардлагад ойролцоо' end),
      '/agent/crm/waitlist'
    );
    v_sent := v_sent + 1;
  end loop;
  return null;
end $$;

revoke all on function public.crm2_property_match_notify() from public, anon, authenticated;
grant execute on function public.crm2_property_match_notify() to service_role;

-- Шинэ мөр нь guard-аар үргэлж «ноорог» болдог тул зөвхөн UPDATE. Хайлтын
-- текст/системийн талбар өөрчлөгдөхөд дэмий ажиллуулахгүй.
drop trigger if exists crm2_property_match_notify on public.crm2_properties;
create trigger crm2_property_match_notify
  after update on public.crm2_properties
  for each row
  when (new.status = 'active' and (
        old.status is distinct from new.status
     or old.category is distinct from new.category
     or old.property_type is distinct from new.property_type
     or old.district is distinct from new.district
     or old.price is distinct from new.price
     or old.price_basis is distinct from new.price_basis
     or old.price_period is distinct from new.price_period
     or old.currency is distinct from new.currency
     or old.area_m2 is distinct from new.area_m2
     or old.rooms is distinct from new.rooms
     or old.features is distinct from new.features))
  execute function public.crm2_property_match_notify();
