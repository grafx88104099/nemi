-- ============================================================
-- PMC CRM — PRO-001 v2.1 нийцүүлэлт (U3 crm-deal-flow), 1/3.
-- Боломжийн дараагийн үйлдэл, үнийн саналын бүтэц (§6.13, §6.16).
--
--  1. crm_opportunities: дараагийн үйлдэл + огноо (боломж үүсгэх үед G0-г
--     хангах эх; үйл ажиллагаа бүртгэгдэхэд автоматаар шинэчлэгдэнэ),
--     өмчлөгчтэй уулзалтын товлол (§6.14), хүлээгдэж буй цэвэр хөлс
--     (§6.19.12, Ш6 = компанийн цэвэр хөлс).
--  2. crm_offers: санал гаргасан тал, сөрөг саналын холбоо, төлөв,
--     хүлээн авсан огноо (дамжуулсантай зөрүүгээр саатлыг харна), нөхцөлийн
--     тусдаа талбарууд, хүчинтэй хугацаа, дараагийн үйлдлийн огноо,
--     нотолгоо, харилцагчийн хүлээн зөвшөөрлийн баталгаа, материаллаг
--     буултын зөвшөөрөл.
--  3. RPC: саналын шийдвэр (хүлээн зөвшөөрөх/татгалзах/буцаах), буултын
--     зөвшөөрөл хүсэх/шийдэх, хүрээний саналын жагсаалт (листингийн карт
--     худалдан авагч талын саналыг харна).
--  4. crm_settings 'deal_flow' — босгын анхны утгууд (БХЗ өөрчилнө).
-- Дахин тавихад аюулгүй.
-- ============================================================

-- ── 1. Боломжийн шинэ баганууд ──

alter table public.crm_opportunities
  add column if not exists next_step text,
  add column if not exists next_step_date date,
  add column if not exists meeting_at timestamptz,
  add column if not exists meeting_place text,
  add column if not exists expected_fee_mnt numeric(14,2);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'crm_opp_expected_fee_nonneg') then
    alter table public.crm_opportunities
      add constraint crm_opp_expected_fee_nonneg check (expected_fee_mnt is null or expected_fee_mnt >= 0);
  end if;
end $$;

-- Үйл ажиллагаа боломжтой холбогдож дараагийн үйлдэлтэй бүртгэгдэхэд
-- боломжийн дараагийн үйлдлийг шинэчилнэ (нэг эх — карт, канбан, cron).
create or replace function public.crm_activity_sync_opp_next_step()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.opportunity_id is not null
     and nullif(new.next_step, '') is not null
     and new.next_step_date is not null then
    update public.crm_opportunities
       set next_step = new.next_step,
           next_step_date = new.next_step_date
     where id = new.opportunity_id
       and state = 'open'
       and (next_step is distinct from new.next_step or next_step_date is distinct from new.next_step_date);
  end if;
  return new;
end $$;

drop trigger if exists crm_activities_sync_opp_next_step on public.crm_activities;
create trigger crm_activities_sync_opp_next_step
  after insert on public.crm_activities
  for each row execute function public.crm_activity_sync_opp_next_step();

-- Одоо байгаа нээлттэй боломжид сүүлийн үйл ажиллагааны дараагийн үйлдлийг нөхөн бичнэ.
update public.crm_opportunities o
   set next_step = a.next_step, next_step_date = a.next_step_date
  from (
    select distinct on (opportunity_id) opportunity_id, next_step, next_step_date
    from public.crm_activities
    where opportunity_id is not null and nullif(next_step, '') is not null and next_step_date is not null
    order by opportunity_id, occurred_at desc
  ) a
 where a.opportunity_id = o.id and o.next_step is null;

-- ── 2. Үнийн саналын бүтэц ──

alter table public.crm_offers
  add column if not exists parent_offer_id uuid references public.crm_offers(id),
  add column if not exists side text,
  add column if not exists status text not null default 'open',
  add column if not exists received_at timestamptz,
  add column if not exists payment_terms text,
  add column if not exists financing text,
  add column if not exists handover_on date,
  add column if not exists inclusions text,
  add column if not exists exclusions text,
  add column if not exists next_step_date date,
  add column if not exists doc_id uuid references public.crm_documents(id),
  add column if not exists asking_amount numeric(14,2),
  add column if not exists concession_pct numeric(7,2),
  add column if not exists approval_status text not null default 'not_required',
  add column if not exists approval_requested_by uuid references public.profiles(id),
  add column if not exists approval_requested_at timestamptz,
  add column if not exists approval_note text,
  add column if not exists approved_by uuid references public.profiles(id),
  add column if not exists approved_at timestamptz,
  add column if not exists accepted_at timestamptz,
  add column if not exists accepted_by uuid references public.profiles(id),
  add column if not exists acceptance_channel text,
  add column if not exists acceptance_note text,
  add column if not exists acceptance_doc_id uuid references public.crm_documents(id),
  add column if not exists decided_at timestamptz,
  add column if not exists decided_by uuid references public.profiles(id),
  add column if not exists decision_note text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'crm_offers_side') then
    alter table public.crm_offers add constraint crm_offers_side
      check (side is null or side in ('buyer', 'seller'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'crm_offers_status') then
    alter table public.crm_offers add constraint crm_offers_status
      check (status in ('open', 'countered', 'accepted', 'rejected', 'withdrawn', 'expired'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'crm_offers_approval_status') then
    alter table public.crm_offers add constraint crm_offers_approval_status
      check (approval_status in ('not_required', 'pending', 'approved', 'rejected'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'crm_offers_acceptance_channel') then
    alter table public.crm_offers add constraint crm_offers_acceptance_channel
      check (acceptance_channel is null
             or acceptance_channel in ('in_person', 'email', 'message', 'phone', 'other'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'crm_offers_accepted_evidence') then
    alter table public.crm_offers add constraint crm_offers_accepted_evidence
      check (status <> 'accepted' or (accepted_at is not null and acceptance_channel is not null));
  end if;
end $$;

create index if not exists crm_offers_parent_idx on public.crm_offers (parent_offer_id);
create index if not exists crm_offers_status_idx on public.crm_offers (office_id, status);

-- Нөхөн бөглөлт: хүлээн авсан огноо = дамжуулсан огноо, хожмын сөрөг
-- саналтай анхны санал «Сөрөг санал ирсэн», тал чиглэлээс.
update public.crm_offers set received_at = coalesce(relayed_at, created_at) where received_at is null;
update public.crm_offers f
   set status = 'countered'
 where f.status = 'open' and f.direction = 'offer'
   and exists (select 1 from public.crm_offers c
               where c.opportunity_id = f.opportunity_id and c.direction = 'counter' and c.created_at > f.created_at);
update public.crm_offers set side = case when direction = 'offer' then 'buyer' else 'seller' end where side is null;

-- ── Тохиргоо: deal_flow ──

do $$
declare
  o record;
  v_creator uuid;
begin
  for o in select distinct office_id from public.crm_settings loop
    if exists (select 1 from public.crm_settings
               where office_id = o.office_id and key = 'deal_flow' and valid_to is null) then
      continue;
    end if;
    select created_by into v_creator
    from public.crm_settings where office_id = o.office_id
    order by created_at limit 1;
    insert into public.crm_settings (office_id, key, value, created_by, note)
    values (o.office_id, 'deal_flow',
      '{"material_concession_pct":5,
        "concession_approver_roles":["sales_director","ceo"],
        "contract_reviewer_roles":["ops_qc","sales_director"],
        "acceptance_evidence_required":true,
        "offer_valid_days_default":3,
        "price_analysis_min_comparables":3,
        "stage_stale_days":{"default":14,"new":3,"contacted":5,"offer":7,"negotiation":10},
        "fee_invoice_required":true,
        "handover_offset_days_default":7,
        "export_roles":["sales_director","ops_qc","finance","ceo"]}'::jsonb,
      v_creator, 'PRO-001 v2.1 — хэлцлийн урсгалын анхны босго');
  end loop;
end $$;

-- ── Саналын insert-ийн утгууд (огноо, асуусан үнэ, буултын хувь) ──

create or replace function public.crm_offer_insert_defaults()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_price numeric;
  v_service crm_service_kind;
  v_parent public.crm_offers;
  v_opp public.crm_opportunities;
  v_pct numeric;
begin
  new.relayed_at := coalesce(new.relayed_at, now());
  new.received_at := coalesce(new.received_at, new.relayed_at);
  if new.received_at > now() + interval '5 minutes' then
    raise exception 'CRM_OFFER: хүлээн авсан огноо ирээдүйд байж болохгүй';
  end if;
  new.status := 'open';
  new.side := coalesce(new.side, case when new.direction = 'offer' then 'buyer' else 'seller' end);

  select * into v_opp from public.crm_opportunities where id = new.opportunity_id;

  if new.parent_offer_id is not null then
    select * into v_parent from public.crm_offers where id = new.parent_offer_id;
    if v_parent.id is null or v_parent.office_id <> new.office_id then
      raise exception 'CRM_OFFER: хариу өгөх санал олдсонгүй';
    end if;
    if v_parent.opportunity_id <> new.opportunity_id and not exists (
         select 1 from public.crm_opportunities po
         where po.id = v_parent.opportunity_id
           and po.property_id is not null and po.property_id = v_opp.property_id
       ) then
      raise exception 'CRM_OFFER: хариу санал өөр үл хөдлөхийн саналд холбогдохгүй';
    end if;
    if v_parent.status not in ('open', 'countered') then
      raise exception 'CRM_OFFER: шийдвэрлэгдсэн саналд хариу бүртгэхгүй';
    end if;
  end if;

  -- Асуусан үнэ (үл хөдлөхийн одоогийн үнэ) — буултын хувийн суурь.
  if v_opp.property_id is not null then
    select service_kind, case when service_kind = 'sale' then price else rent_price end
      into v_service, v_price
    from public.crm_properties where id = v_opp.property_id;
    new.asking_amount := coalesce(new.asking_amount, v_price);
  end if;
  if coalesce(new.asking_amount, 0) > 0 then
    v_pct := round((new.asking_amount - new.amount) * 100 / new.asking_amount, 2);
    new.concession_pct := greatest(v_pct, 0);
  end if;
  new.approval_status := 'not_required';
  return new;
end $$;

-- Хариу санал бүртгэгдэхэд эх санал «Сөрөг санал ирсэн» болно.
create or replace function public.crm_offer_after_insert()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.parent_offer_id is not null then
    update public.crm_offers set status = 'countered'
     where id = new.parent_offer_id and status = 'open';
  end if;
  return new;
end $$;

drop trigger if exists crm_offers_after_insert on public.crm_offers;
create trigger crm_offers_after_insert
  after insert on public.crm_offers
  for each row execute function public.crm_offer_after_insert();

-- ── Тусламж: боломжийн хүрээний саналууд ──
-- Худалдан авагч тал: өөрийн саналууд + тэдгээрт ирсэн хариу.
-- Листинг (PL-2): тухайн үл хөдлөх дээрх бүх саналыг харна (§6.14 «санал ирсэн»).
create or replace function public.crm_opp_offer_ids(p_opp uuid)
returns setof uuid language sql stable security definer set search_path = public as $$
  with o as (
    select op.id, op.property_id, pl.code as pl
    from public.crm_opportunities op
    join public.crm_pipelines pl on pl.id = op.pipeline_id
    where op.id = p_opp
  )
  select f.id from public.crm_offers f, o where f.opportunity_id = o.id
  union
  select c.id from public.crm_offers c, o
  where c.parent_offer_id in (select f2.id from public.crm_offers f2 where f2.opportunity_id = o.id)
  union
  select f.id from public.crm_offers f
  join public.crm_opportunities fo on fo.id = f.opportunity_id, o
  where o.pl = 'PL-2' and o.property_id is not null and fo.property_id = o.property_id
$$;

-- Боломжийн хүрээний санал засах эрх: саналын боломжийг засах эрхтэй эсвэл
-- ижил үл хөдлөх дээр нээлттэй боломжтой (листинг/худалдан авагч талын агент).
create or replace function public.crm_can_act_on_offer(p_offer uuid)
returns boolean language plpgsql stable security definer set search_path = public as $$
declare f public.crm_offers; v_prop uuid;
begin
  select * into f from public.crm_offers where id = p_offer;
  if f.id is null or f.office_id is distinct from public.crm_office_id() then
    return false;
  end if;
  if public.crm_can_edit_opportunity(f.opportunity_id) then
    return true;
  end if;
  select property_id into v_prop from public.crm_opportunities where id = f.opportunity_id;
  return v_prop is not null and exists (
    select 1 from public.crm_opportunities o
    where o.property_id = v_prop and o.state = 'open' and public.crm_can_edit_opportunity(o.id)
  );
end $$;

-- Боломжийн картад харуулах саналын жагсаалт (definer: листингийн агент
-- худалдан авагчийн боломжийг RLS-ээр харахгүй тул). Харилцагчийн
-- мэдээлэл буцаахгүй — зөвхөн саналын нөхцөл, бүртгэсэн агент.
create or replace function public.crm_get_opp_offers(p_opp uuid)
returns table (
  id uuid, opportunity_id uuid, own boolean, direction text, side text, status text, amount numeric,
  asking_amount numeric, concession_pct numeric, terms jsonb, payment_terms text, financing text,
  handover_on date, inclusions text, exclusions text, valid_until date, received_at timestamptz,
  relayed_at timestamptz, "position" text, obstacle text, next_step text, next_step_date date,
  parent_offer_id uuid, doc_id uuid, approval_status text, approval_note text, approved_at timestamptz,
  accepted_at timestamptz, acceptance_channel text, acceptance_note text, acceptance_doc_id uuid,
  decided_at timestamptz, decision_note text, created_by uuid, created_by_name text, created_at timestamptz
) language plpgsql stable security definer set search_path = public as $$
begin
  if not public.crm_can_view_opportunity(p_opp) then
    raise exception 'CRM: боломж олдсонгүй эсвэл танд эрх алга';
  end if;
  return query
  select f.id, f.opportunity_id, f.opportunity_id = p_opp, f.direction, f.side, f.status, f.amount,
         f.asking_amount, f.concession_pct, f.terms, f.payment_terms, f.financing,
         f.handover_on, f.inclusions, f.exclusions, f.valid_until, f.received_at,
         f.relayed_at, f.position, f.obstacle, f.next_step, f.next_step_date,
         f.parent_offer_id, f.doc_id, f.approval_status, f.approval_note, f.approved_at,
         f.accepted_at, f.acceptance_channel, f.acceptance_note, f.acceptance_doc_id,
         f.decided_at, f.decision_note, f.created_by, pr.full_name, f.created_at
  from public.crm_offers f
  left join public.profiles pr on pr.id = f.created_by
  where f.id in (select public.crm_opp_offer_ids(p_opp))
  order by f.created_at desc;
end $$;

-- ── 3. Саналын шийдвэр ──

-- Материаллаг буултын зөвшөөрөл шаардлагатай эсэх (deal_flow.material_concession_pct).
create or replace function public.crm_offer_needs_approval(f public.crm_offers)
returns boolean language plpgsql stable security definer set search_path = public as $$
declare v_limit numeric;
begin
  v_limit := nullif(public.crm_setting_at(f.office_id, 'deal_flow') ->> 'material_concession_pct', '')::numeric;
  if v_limit is null then
    return false;
  end if;
  return coalesce(f.concession_pct, 0) > v_limit;
end $$;

-- Хүлээн зөвшөөрөх / татгалзах / буцаах (§6.16: харилцагчийн зөвшөөрөлгүй
-- нөхцөл зөвшөөрөхгүй — суваг, нотолгоо заавал; материаллаг буулт эрхийн
-- матрицаар батлагдсан байх).
create or replace function public.crm_decide_offer(
  p_offer uuid, p_action text, p_channel text default null,
  p_note text default null, p_doc uuid default null
) returns text language plpgsql security definer set search_path = public as $$
declare
  f public.crm_offers;
  v_cfg jsonb;
  v_new text;
begin
  select * into f from public.crm_offers where id = p_offer for update;
  if f.id is null or not public.crm_can_act_on_offer(p_offer) then
    raise exception 'CRM: санал олдсонгүй эсвэл танд эрх алга';
  end if;
  if f.status not in ('open', 'countered') then
    raise exception 'CRM_OFFER: санал аль хэдийн шийдвэрлэгдсэн';
  end if;
  v_cfg := coalesce(public.crm_setting_at(f.office_id, 'deal_flow'), '{}'::jsonb);

  if p_action = 'accept' then
    if f.status <> 'open' then
      raise exception 'CRM_OFFER: хариу санал ирсэн саналыг биш, сүүлийн саналыг хүлээн зөвшөөрнө';
    end if;
    if f.valid_until is not null and f.valid_until < current_date then
      raise exception 'CRM_OFFER: саналын хүчинтэй хугацаа дууссан';
    end if;
    if nullif(p_channel, '') is null then
      raise exception 'CRM_OFFER: харилцагч ямар хэлбэрээр зөвшөөрснийг заавал сонгоно';
    end if;
    if coalesce((v_cfg ->> 'acceptance_evidence_required')::boolean, true)
       and p_doc is null and length(coalesce(trim(p_note), '')) < 10 then
      raise exception 'CRM_OFFER: харилцагчийн зөвшөөрлийн нотолгоо (файл эсвэл дэлгэрэнгүй тэмдэглэл) заавал';
    end if;
    if public.crm_offer_needs_approval(f) and f.approval_status <> 'approved' then
      raise exception 'CRM_OFFER: материаллаг буулт — эрх бүхий удирдлагын зөвшөөрөл шаардлагатай';
    end if;
    update public.crm_offers
       set status = 'accepted', accepted_at = now(), accepted_by = auth.uid(),
           acceptance_channel = p_channel, acceptance_note = nullif(trim(p_note), ''),
           acceptance_doc_id = p_doc, decided_at = now(), decided_by = auth.uid()
     where id = p_offer;
    v_new := 'accepted';
  elsif p_action in ('reject', 'withdraw', 'expire') then
    if nullif(trim(p_note), '') is null then
      raise exception 'CRM_OFFER: шийдвэрийн тайлбар заавал';
    end if;
    v_new := case p_action when 'reject' then 'rejected' when 'withdraw' then 'withdrawn' else 'expired' end;
    update public.crm_offers
       set status = v_new, decided_at = now(), decided_by = auth.uid(), decision_note = trim(p_note)
     where id = p_offer;
  else
    raise exception 'CRM_OFFER: үйлдэл буруу';
  end if;

  insert into public.crm_audit_log (office_id, actor_id, entity, entity_id, action, field, old_value, new_value, reason)
  values (f.office_id, auth.uid(), 'crm_offers', f.id, 'status', 'status',
          to_jsonb(f.status), to_jsonb(v_new), nullif(trim(p_note), ''));
  return v_new;
end $$;

-- Материаллаг буултын зөвшөөрөл хүсэх (агент).
create or replace function public.crm_request_offer_approval(p_offer uuid, p_note text)
returns void language plpgsql security definer set search_path = public as $$
declare f public.crm_offers;
begin
  select * into f from public.crm_offers where id = p_offer for update;
  if f.id is null or not public.crm_can_act_on_offer(p_offer) then
    raise exception 'CRM: санал олдсонгүй эсвэл танд эрх алга';
  end if;
  if f.status <> 'open' then
    raise exception 'CRM_OFFER: зөвхөн нээлттэй саналд зөвшөөрөл хүснэ';
  end if;
  if not public.crm_offer_needs_approval(f) then
    raise exception 'CRM_OFFER: энэ саналд буултын зөвшөөрөл шаардлагагүй';
  end if;
  if nullif(trim(p_note), '') is null then
    raise exception 'CRM_OFFER: буултын үндэслэл заавал';
  end if;
  update public.crm_offers
     set approval_status = 'pending', approval_requested_by = auth.uid(),
         approval_requested_at = now(), approval_note = trim(p_note),
         approved_by = null, approved_at = null
   where id = p_offer;
  insert into public.crm_audit_log (office_id, actor_id, entity, entity_id, action, field, new_value, reason)
  values (f.office_id, auth.uid(), 'crm_offers', f.id, 'approval_requested', 'approval_status',
          to_jsonb('pending'::text), trim(p_note));
end $$;

-- Буултыг шийдэх (deal_flow.concession_approver_roles).
create or replace function public.crm_decide_offer_approval(p_offer uuid, p_approve boolean, p_note text default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  f public.crm_offers;
  v_roles text[];
begin
  select * into f from public.crm_offers where id = p_offer for update;
  if f.id is null or f.office_id is distinct from public.crm_office_id() then
    raise exception 'CRM: санал олдсонгүй эсвэл танд эрх алга';
  end if;
  select coalesce(array_agg(x), array['sales_director']) into v_roles
  from jsonb_array_elements_text(public.crm_setting_at(f.office_id, 'deal_flow') -> 'concession_approver_roles') x;
  if not exists (select 1 from unnest(public.crm_my_roles()) r where r::text = any (v_roles)) then
    raise exception 'CRM: буултыг батлах эрх танд алга';
  end if;
  if f.approval_status <> 'pending' then
    raise exception 'CRM_OFFER: зөвшөөрлийн хүсэлт хүлээгдээгүй байна';
  end if;
  if f.approval_requested_by = auth.uid() then
    raise exception 'CRM_OFFER: өөрийн хүсэлтийг өөрөө батлахгүй';
  end if;
  if not p_approve and nullif(trim(p_note), '') is null then
    raise exception 'CRM_OFFER: татгалзсан шалтгаан заавал';
  end if;
  update public.crm_offers
     set approval_status = case when p_approve then 'approved' else 'rejected' end,
         approved_by = auth.uid(), approved_at = now(),
         approval_note = coalesce(nullif(trim(p_note), ''), approval_note)
   where id = p_offer;
  insert into public.crm_audit_log (office_id, actor_id, entity, entity_id, action, field, new_value, reason)
  values (f.office_id, auth.uid(), 'crm_offers', f.id, 'approval_decided', 'approval_status',
          to_jsonb(case when p_approve then 'approved' else 'rejected' end), nullif(trim(p_note), ''));
end $$;

-- ── Grants ──

revoke execute on function public.crm_opp_offer_ids(uuid) from anon, public, authenticated;
revoke execute on function public.crm_can_act_on_offer(uuid) from anon, public;
revoke execute on function public.crm_offer_needs_approval(public.crm_offers) from anon, public;
revoke execute on function public.crm_get_opp_offers(uuid) from anon, public;
revoke execute on function public.crm_decide_offer(uuid, text, text, text, uuid) from anon, public;
revoke execute on function public.crm_request_offer_approval(uuid, text) from anon, public;
revoke execute on function public.crm_decide_offer_approval(uuid, boolean, text) from anon, public;

grant execute on function public.crm_can_act_on_offer(uuid) to authenticated;
grant execute on function public.crm_get_opp_offers(uuid) to authenticated;
grant execute on function public.crm_decide_offer(uuid, text, text, text, uuid) to authenticated;
grant execute on function public.crm_request_offer_approval(uuid, text) to authenticated;
grant execute on function public.crm_decide_offer_approval(uuid, boolean, text) to authenticated;
