-- ============================================================
-- PMC CRM — PRO-001 v2.1 нийцүүлэлт (U3 crm-deal-flow), 2/3.
-- Үзлэгийн бүртгэл (§6.15) ба листингийн үнийн дүн шинжилгээ (§6.14).
--
--  1. crm_showings: товлосон огноо/цаг, үл хөдлөх, оролцогчид, үзлэгийн
--     өмнөх шалгаруулалт (тохирлын оноо, сул бол үндэслэл), товлосон →
--     хийгдсэн/цуцалсан/ирээгүй, эргэх холбооны ангилал, сонирхол,
--     сонирхсон бол дараагийн үйлдэл (давтан үзлэг / үнийн санал /
--     баримт бүрдүүлэлт) + огноо заавал.
--     Хийгдсэн болмогц үйл ажиллагааны бүртгэл (channel='showing')
--     автоматаар үүсч, эргэх холбоо бүртгэгдэхэд түүний ангилал
--     шинэчлэгдэнэ — crm-daily-ийн 24/48 цагийн хяналт хэвээр ажиллана.
--  2. crm_price_analyses: зах зээлийн харьцуулалт (жишиг объектууд),
--     санал болгох үнийн муж — «Үнэлгээ, үнэ тогтоолт» шатны нотолгоо.
-- RLS: эерэг жагсаалт, (select fn()) боолттой.
-- ============================================================

-- ── 1. Үзлэг ──

create table if not exists public.crm_showings (
  id uuid primary key default gen_random_uuid(),
  office_id uuid not null references public.offices(id) on delete restrict,
  opportunity_id uuid references public.crm_opportunities(id) on delete restrict,
  contact_id uuid not null references public.crm_contacts(id) on delete restrict,
  property_id uuid not null references public.crm_properties(id) on delete restrict,
  agent_id uuid not null references public.profiles(id),
  scheduled_at timestamptz not null,
  duration_min int,
  meeting_point text,
  participants text,
  status text not null default 'scheduled',
  done_at timestamptz,
  cancel_reason text,
  match_strength text,
  match_score numeric(5,2),
  weak_match_reason text,
  feedback_category text,
  feedback_note text,
  feedback_at timestamptz,
  interest text,
  next_action text,
  next_step_date date,
  activity_id uuid references public.crm_activities(id),
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint crm_showings_status check (status in ('scheduled', 'done', 'cancelled', 'no_show')),
  constraint crm_showings_match_strength check (match_strength is null or match_strength in ('strong', 'possible', 'weak', 'none')),
  constraint crm_showings_feedback check (feedback_category is null
    or feedback_category in ('price', 'location', 'layout', 'condition', 'financing', 'other')),
  constraint crm_showings_interest check (interest is null or interest in ('interested', 'maybe', 'not_interested')),
  constraint crm_showings_next_action check (next_action is null or next_action in ('repeat_showing', 'offer', 'documents')),
  constraint crm_showings_done check (status <> 'done' or done_at is not null),
  constraint crm_showings_cancel check (status not in ('cancelled', 'no_show') or nullif(cancel_reason, '') is not null),
  constraint crm_showings_weak check (coalesce(match_strength, 'none') not in ('weak', 'none') or nullif(weak_match_reason, '') is not null),
  constraint crm_showings_feedback_done check (feedback_at is null or status = 'done'),
  constraint crm_showings_interested_next check (interest is distinct from 'interested'
    or (next_action is not null and next_step_date is not null))
);
create index if not exists crm_showings_opp_idx on public.crm_showings (opportunity_id, scheduled_at desc);
create index if not exists crm_showings_property_idx on public.crm_showings (property_id, scheduled_at desc);
create index if not exists crm_showings_contact_idx on public.crm_showings (contact_id);
create index if not exists crm_showings_agent_idx on public.crm_showings (office_id, agent_id, scheduled_at);

-- Хийгдсэн → үйл ажиллагааны бүртгэл; эргэх холбоо → ангиллыг синк.
create or replace function public.crm_showing_sync()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_lead uuid;
  v_number text;
  v_act uuid;
begin
  if tg_op = 'UPDATE' and old.status = 'done' and new.status <> 'done' then
    raise exception 'CRM_SHOWING: хийгдсэн үзлэгийн төлөвийг буцаахгүй';
  end if;

  if new.status = 'done' and new.activity_id is null then
    select number into v_number from public.crm_properties where id = new.property_id;
    if new.opportunity_id is not null then
      select lead_id into v_lead from public.crm_opportunities where id = new.opportunity_id;
    end if;
    -- Идэвхтэй сэжимтэй бол дараагийн үйлдэл заавал (crm_activity_insert_guard).
    insert into public.crm_activities
      (office_id, contact_id, property_id, opportunity_id, lead_id, channel, purpose, summary,
       outcome, next_step, next_step_date, occurred_at, owner_id)
    values
      (new.office_id, new.contact_id, new.property_id, new.opportunity_id, v_lead, 'showing', 'follow_up',
       'Үзлэг хийгдсэн' || coalesce(' — ' || v_number, ''),
       'open', 'Үзлэгийн эргэх холбоо авах', coalesce(new.done_at, now())::date,
       coalesce(new.done_at, now()), new.agent_id)
    returning id into v_act;
    new.activity_id := v_act;
  end if;

  if new.activity_id is not null and new.feedback_category is not null
     and (tg_op = 'INSERT' or new.feedback_category is distinct from old.feedback_category) then
    update public.crm_activities
       set feedback_category = new.feedback_category
     where id = new.activity_id;
  end if;

  if new.feedback_category is not null and new.feedback_at is null then
    new.feedback_at := now();
  end if;
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists crm_showings_sync on public.crm_showings;
create trigger crm_showings_sync
  before insert or update on public.crm_showings
  for each row execute function public.crm_showing_sync();

drop trigger if exists crm_showings_immutable on public.crm_showings;
create trigger crm_showings_immutable
  before update on public.crm_showings
  for each row execute function public.crm_protect_immutable('office_id', 'property_id', 'created_by', 'created_at');

create or replace function public.crm_showing_audit()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    insert into public.crm_audit_log (office_id, actor_id, entity, entity_id, action, new_value)
    values (new.office_id, auth.uid(), 'crm_showings', new.id, 'insert',
            jsonb_build_object('property_id', new.property_id, 'scheduled_at', new.scheduled_at,
                               'match_strength', new.match_strength));
  elsif new.status is distinct from old.status then
    insert into public.crm_audit_log (office_id, actor_id, entity, entity_id, action, field, old_value, new_value, reason)
    values (new.office_id, auth.uid(), 'crm_showings', new.id, 'status', 'status',
            to_jsonb(old.status), to_jsonb(new.status), new.cancel_reason);
  end if;
  return new;
end $$;

drop trigger if exists crm_showings_audit on public.crm_showings;
create trigger crm_showings_audit
  after insert or update on public.crm_showings
  for each row execute function public.crm_showing_audit();

alter table public.crm_showings enable row level security;

drop policy if exists crm_showings_select on public.crm_showings;
create policy crm_showings_select on public.crm_showings for select
  using (
    office_id = (select public.crm_office_id())
    and (
      agent_id = auth.uid()
      or created_by = auth.uid()
      or (select public.crm_is_manager())
      or public.crm_is_team_of(agent_id)
      or (opportunity_id is not null and public.crm_can_view_opportunity(opportunity_id))
      or public.crm_can_edit_property(property_id)
    )
  );
drop policy if exists crm_showings_insert on public.crm_showings;
create policy crm_showings_insert on public.crm_showings for insert
  with check (
    office_id = (select public.crm_office_id())
    and created_by = auth.uid()
    and agent_id = auth.uid()
    and (select public.crm_my_staff_id()) is not null
    and public.crm_can_view_contact(contact_id)
    and (opportunity_id is null or public.crm_can_edit_opportunity(opportunity_id))
  );
drop policy if exists crm_showings_update on public.crm_showings;
create policy crm_showings_update on public.crm_showings for update
  using (
    office_id = (select public.crm_office_id())
    and (agent_id = auth.uid() or public.crm_is_team_of(agent_id) or (select public.crm_is_manager()))
  )
  with check (office_id = (select public.crm_office_id()));

grant select, insert, update on public.crm_showings to authenticated;

-- ── 2. Үнийн дүн шинжилгээ ──

create table if not exists public.crm_price_analyses (
  id uuid primary key default gen_random_uuid(),
  office_id uuid not null references public.offices(id) on delete restrict,
  opportunity_id uuid not null references public.crm_opportunities(id) on delete restrict,
  property_id uuid references public.crm_properties(id),
  comparables jsonb not null default '[]'::jsonb,
  price_min numeric(14,2),
  price_max numeric(14,2),
  recommended_price numeric(14,2) not null,
  note text,
  doc_id uuid references public.crm_documents(id),
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  constraint crm_price_analyses_comparables check (jsonb_typeof(comparables) = 'array'),
  constraint crm_price_analyses_range check (
    recommended_price > 0
    and (price_min is null or price_min > 0)
    and (price_max is null or price_max >= coalesce(price_min, 0))
  )
);
create index if not exists crm_price_analyses_opp_idx on public.crm_price_analyses (opportunity_id, created_at desc);

drop trigger if exists crm_price_analyses_immutable on public.crm_price_analyses;
create trigger crm_price_analyses_immutable
  before update on public.crm_price_analyses
  for each row execute function public.crm_protect_immutable(
    'office_id', 'opportunity_id', 'comparables', 'recommended_price', 'created_by', 'created_at');

alter table public.crm_price_analyses enable row level security;

drop policy if exists crm_price_analyses_select on public.crm_price_analyses;
create policy crm_price_analyses_select on public.crm_price_analyses for select
  using (
    office_id = (select public.crm_office_id())
    and public.crm_can_view_opportunity(opportunity_id)
  );
drop policy if exists crm_price_analyses_insert on public.crm_price_analyses;
create policy crm_price_analyses_insert on public.crm_price_analyses for insert
  with check (
    office_id = (select public.crm_office_id())
    and created_by = auth.uid()
    and (select public.crm_my_staff_id()) is not null
    and public.crm_can_edit_opportunity(opportunity_id)
  );

grant select, insert on public.crm_price_analyses to authenticated;
