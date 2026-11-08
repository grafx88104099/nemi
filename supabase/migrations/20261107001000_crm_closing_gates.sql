-- ============================================================
-- PMC CRM — PRO-001 v2.1 нийцүүлэлт (U3 crm-deal-flow), 3/3.
-- Шилжих шалгуурын шинэ шалгагчид, хэлцэл хаах босго (§6.13, §6.14,
-- §6.16, §6.17), хэлцэл ↔ боломжийн синк.
--
--  1. crm_check_gate_rec — бүрэн дахин тодорхойлно:
--     • шинэ 10 шалгагч (утга бүхий холболт, санал болгосон, үзлэг,
--       сонирхол, сөрөг санал, хүлээн зөвшөөрсөн, уулзалт, үнийн дүн
--       шинжилгээ, листинг идэвхтэй, үл хөдлөх дээрх үзлэг);
--     • G1 урсгалаас хамаарна (худалдан авагч → хэрэгцээний профайл,
--       листинг → өмчлөгчийн профайл);
--     • дараагийн үйлдэл боломж дээр бүртгэгдсэн бол хүчинтэй;
--     • листингийн (PL-2) карт тухайн үл хөдлөх дээрх санал, хэлцлийг
--       харна (нэг эх үнэн).
--     Шошго нь lib/crm/gates.ts gateRequirementLabel-тэй ижил.
--  2. 000200-д идэвхгүй үүссэн шаардлагуудыг идэвхжүүлнэ.
--  3. Гэрээний загвар (лавлах contract_template), хяналт; хүлээлцэх
--     алхмын хугацаа (anchor = гэрээний огноо + offset).
--  4. Төлбөр: агент хэлцэлдээ нотолгоотой орлого бүртгэнэ (Санхүү
--     баталгаажуулна); түрээсийн гэрээний төлбөрт хэлцлийн холбоос.
--  5. crm_txn_closing_checks — хаалтын 9 босго (+МУТСТ) нэг эх үнэн;
--     crm_txn_status_guard хаалтад үүнийг шаардана.
--  6. crm_txn_status_after — хэлцэл гэрээ/төлбөр/хаагдсан болоход боломж
--     автоматаар зохих шат руу (crm.pipeline_transfer GUC); амжилттай
--     хаагдсан шат зөвхөн эндээс.
--  7. Шатны зөвлөмж (crm_stages.guidance).
-- ============================================================

-- ── 1. Шилжих шалгуурын шалгагч ──

create or replace function public.crm_check_gate_rec(o public.crm_opportunities, p_gate crm_gate_code)
returns text[] language plpgsql stable security definer set search_path = public as $$
declare
  req record;
  missing text[] := '{}';
  ok boolean;
  v_pct numeric;
  v_min numeric;
  v_kyc crm_kyc_status;
  v_label text;
  v_pl text;
  v_cfg jsonb;
begin
  select code into v_pl from public.crm_pipelines where id = o.pipeline_id;
  v_cfg := coalesce(public.crm_setting_at(o.office_id, 'deal_flow'), '{}'::jsonb);

  for req in
    select checker_kind, params
    from public.crm_gate_requirements
    where office_id = o.office_id
      and gate_code = p_gate
      and is_active
      and (pipeline_id is null or pipeline_id = o.pipeline_id)
  loop
    ok := false;

    case req.checker_kind

      when 'owner_set' then
        ok := o.owner_id is not null;

      when 'next_step_set' then
        ok := (nullif(o.next_step, '') is not null
               and o.next_step_date is not null
               and o.next_step_date >= current_date)
           or exists (
                select 1 from public.crm_activities a
                where (a.opportunity_id = o.id or a.contact_id = o.contact_id)
                  and nullif(a.next_step, '') is not null
                  and a.next_step_date is not null
                  and a.next_step_date >= current_date
              )
           or exists (
                select 1 from public.crm_leads l
                where l.contact_id = o.contact_id
                  and l.status in ('new', 'active')
                  and nullif(l.next_step, '') is not null
                  and l.next_step_date is not null
                  and l.next_step_date >= current_date
              );

      when 'need_profile_complete' then
        v_min := coalesce((req.params ->> 'min_pct')::numeric, 100);
        if v_pl = 'PL-2' then
          -- Листингийн урсгал: өмчлөгчийн идэвхтэй профайл.
          ok := exists (
            select 1 from public.crm_owner_profiles op2
            where op2.contact_id = o.contact_id and op2.status = 'active'
          );
        else
          select max(coalesce(np.completeness_pct, 0)) into v_pct
          from public.crm_need_profiles np
          where (o.need_profile_id is not null and np.id = o.need_profile_id)
             or (o.need_profile_id is null and np.contact_id = o.contact_id and np.status = 'active');
          -- Менежменттэй түрээс (PL-4) өмчлөгч талаас ч эхэлж болно.
          if v_pct is null and v_pl = 'PL-4' and exists (
               select 1 from public.crm_owner_profiles op2
               where op2.contact_id = o.contact_id and op2.status = 'active'
             ) then
            v_pct := 100;
          end if;
          ok := coalesce(v_pct, 0) >= v_min;
        end if;

      when 'kyc_verified' then
        select kyc_public_status into v_kyc from public.crm_contacts where id = o.contact_id;
        ok := v_kyc = 'verified';

      when 'aml_not_held' then
        ok := not o.aml_hold
          and not exists (
            select 1 from public.crm_aml_holds h
            join public.crm_transactions t on t.id = h.transaction_id
            where (t.opportunity_id = o.id
                   or (o.property_id is not null and t.property_id = o.property_id
                       and t.status in ('draft', 'contract', 'payment')))
              and h.released_at is null
          );

      when 'docs_complete' then
        v_min := coalesce((req.params ->> 'min_pct')::numeric, 100);
        select max(public.crm_txn_completeness_value(t.id)) into v_pct
        from public.crm_transactions t
        where (t.opportunity_id = o.id and t.status <> 'cancelled')
           or (o.property_id is not null and t.property_id = o.property_id
               and t.status in ('draft', 'contract', 'payment'));
        ok := coalesce(v_pct, 0) >= v_min;

      when 'role_evidence' then
        ok := exists (
          select 1 from public.crm_transaction_agent_roles r
          join public.crm_transactions t on t.id = r.transaction_id
          where (t.opportunity_id = o.id and t.status <> 'cancelled')
             or (o.property_id is not null and t.property_id = o.property_id
                 and t.status in ('draft', 'contract', 'payment'))
        );

      when 'payment_proof' then
        ok := exists (
          select 1 from public.crm_payments p
          join public.crm_transactions t on t.id = p.transaction_id
          where ((t.opportunity_id = o.id and t.status <> 'cancelled')
                 or (o.property_id is not null and t.property_id = o.property_id
                     and t.status in ('draft', 'contract', 'payment')))
            and p.kind = 'income' and p.finance_verified_at is not null
        );
        -- Боломжийн бүх идэвхтэй хэлцэл replacement (0₮) бол орлогын нотолгоо шаардахгүй.
        if not ok
           and exists (
             select 1 from public.crm_transactions t
             where t.opportunity_id = o.id and t.status <> 'cancelled'
           )
           and not exists (
             select 1 from public.crm_transactions t
             where t.opportunity_id = o.id and t.status <> 'cancelled' and t.type <> 'replacement'
           ) then
          ok := true;
        end if;

      when 'handover_done' then
        select coalesce(bool_and(h.done), false) into ok
        from public.crm_handover_items h
        join public.crm_transactions t on t.id = h.transaction_id
        where (t.opportunity_id = o.id and t.status <> 'cancelled')
           or (o.property_id is not null and t.property_id = o.property_id
               and t.status in ('draft', 'contract', 'payment'));
        ok := coalesce(ok, false);

      when 'listing_agreement' then
        ok := o.property_id is not null and exists (
          select 1 from public.crm_listing_agreements la
          where la.property_id = o.property_id
            and la.signed_on <= current_date
            and la.expires_on >= current_date
        );

      when 'offer_recorded' then
        ok := exists (select 1 from public.crm_opp_offer_ids(o.id));

      when 'post_sale_tasks' then
        ok := exists (
          select 1 from public.crm_task_links tl
          where tl.entity = 'opportunity' and tl.entity_id = o.id and tl.rule_code = 'D-09'
        )
        or exists (
          select 1 from public.crm_task_links tl
          join public.crm_transactions t
            on tl.entity = 'transaction' and tl.entity_id = t.id
          where t.opportunity_id = o.id and tl.rule_code = 'D-09'
        );

      when 'meaningful_contact' then
        -- Хариу авсан холболт (reached = false бол «Холбогдож чадаагүй»).
        ok := exists (
                select 1 from public.crm_activities a
                where (a.opportunity_id = o.id
                       or a.contact_id = o.contact_id
                       or (o.lead_id is not null and a.lead_id = o.lead_id))
                  and a.channel in ('call', 'chat', 'email', 'meeting', 'showing')
                  and a.reached is distinct from false
                  and a.occurred_at <= now()
              )
           or (o.lead_id is not null and exists (
                select 1 from public.crm_leads l
                where l.id = o.lead_id and l.first_contact_at is not null
              ));

      when 'match_suggested' then
        ok := o.property_id is not null
           or exists (
                select 1 from public.crm_matches m
                join public.crm_need_profiles np on np.id = m.need_profile_id
                where m.suggested_at is not null
                  and ((o.need_profile_id is not null and m.need_profile_id = o.need_profile_id)
                       or (o.need_profile_id is null and np.contact_id = o.contact_id and np.status = 'active'))
              );

      when 'showing_logged' then
        ok := exists (
                select 1 from public.crm_showings s
                where s.status = 'done'
                  and (s.opportunity_id = o.id or (s.opportunity_id is null and s.contact_id = o.contact_id))
              )
           or exists (
                select 1 from public.crm_activities a
                where a.channel = 'showing'
                  and (a.opportunity_id = o.id or a.contact_id = o.contact_id)
                  and a.occurred_at <= now()
              );

      when 'interest_confirmed' then
        ok := exists (
                select 1 from public.crm_showings s
                where s.status = 'done' and s.interest = 'interested'
                  and (s.opportunity_id = o.id or (s.opportunity_id is null and s.contact_id = o.contact_id))
              )
           or exists (
                select 1 from public.crm_matches m
                join public.crm_need_profiles np on np.id = m.need_profile_id
                where m.response = 'interested'
                  and ((o.need_profile_id is not null and m.need_profile_id = o.need_profile_id)
                       or (o.need_profile_id is null and np.contact_id = o.contact_id and np.status = 'active'))
                  and (o.property_id is null or m.property_id = o.property_id)
              );

      when 'counter_recorded' then
        ok := exists (
          select 1 from public.crm_offers f
          where f.id in (select public.crm_opp_offer_ids(o.id))
            and f.direction = 'counter'
        );

      when 'offer_accepted' then
        ok := exists (
          select 1 from public.crm_offers f
          where f.id in (select public.crm_opp_offer_ids(o.id))
            and f.status = 'accepted'
        );

      when 'meeting_scheduled' then
        ok := o.meeting_at is not null
           or exists (
                select 1 from public.crm_activities a
                where a.channel = 'meeting'
                  and (a.opportunity_id = o.id or a.contact_id = o.contact_id)
              );

      when 'price_analysis' then
        v_min := coalesce((req.params ->> 'min_comparables')::numeric,
                          (v_cfg ->> 'price_analysis_min_comparables')::numeric, 1);
        ok := exists (
          select 1 from public.crm_price_analyses pa
          where pa.opportunity_id = o.id
            and jsonb_array_length(pa.comparables) >= v_min
        );

      when 'property_active' then
        ok := o.property_id is not null and exists (
          select 1 from public.crm_properties pr
          where pr.id = o.property_id and pr.status = 'active'
        );

      when 'showing_on_property' then
        ok := o.property_id is not null and (
              exists (
                select 1 from public.crm_showings s
                where s.property_id = o.property_id and s.status = 'done'
              )
           or exists (
                select 1 from public.crm_activities a
                where a.property_id = o.property_id and a.channel = 'showing' and a.occurred_at <= now()
              ));

      else
        ok := false; -- үл мэдэх шалгагч — аюулгүй тал руу (дутуу)
    end case;

    if not ok then
      v_label := case req.checker_kind
        when 'need_profile_complete' then 'Хэрэгцээний профайл бүрэн бөглөгдсөн'
        when 'owner_set'             then 'Эзэмшигч оноогдсон'
        when 'next_step_set'         then 'Дараагийн үйлдэл, огноо бүртгэгдсэн'
        when 'kyc_verified'          then 'KYC баталгаажсан'
        when 'docs_complete'         then 'Баримт бичгийн бүрдэл ' || coalesce(req.params ->> 'min_pct', '100') || '%'
        when 'role_evidence'         then 'Үүргийн нотолгоо бүртгэгдсэн'
        when 'payment_proof'         then 'Төлбөрийн баримт баталгаажсан'
        when 'handover_done'         then 'Хүлээлцэх дууссан'
        when 'listing_agreement'     then 'Хүчинтэй листингийн гэрээ'
        when 'offer_recorded'        then 'Үнийн санал бүртгэгдсэн'
        when 'aml_not_held'          then 'МУТСТ түгжээгүй'
        when 'post_sale_tasks'       then 'Борлуулалтын дараах даалгавар үүссэн'
        when 'meaningful_contact'    then 'Утга бүхий холболт бүртгэгдсэн'
        when 'match_suggested'       then 'Үл хөдлөх санал болгосон'
        when 'showing_logged'        then 'Үзлэг хийгдэж бүртгэгдсэн'
        when 'interest_confirmed'    then 'Харилцагч сонирхлоо баталгаажуулсан'
        when 'counter_recorded'      then 'Сөрөг санал бүртгэгдсэн'
        when 'offer_accepted'        then 'Харилцагч нөхцөлийг хүлээн зөвшөөрсөн'
        when 'meeting_scheduled'     then 'Уулзалт товлогдсон'
        when 'price_analysis'        then 'Үнийн дүн шинжилгээ бүртгэгдсэн'
        when 'property_active'       then 'Листинг идэвхтэй төлөвтэй'
        when 'showing_on_property'   then 'Шалгуур хангасан худалдан авагчийн үзлэг бүртгэгдсэн'
        else 'Тодорхойгүй шаардлага'
      end;
      missing := missing || v_label;
    end if;
  end loop;

  select coalesce(array_agg(distinct m), '{}'::text[]) into missing from unnest(missing) as m;
  return missing;
end $$;

-- ── 2. Шинэ шаардлагуудыг идэвхжүүлэх ──

update public.crm_gate_requirements
   set is_active = true
 where checker_kind in ('meaningful_contact', 'match_suggested', 'showing_logged', 'interest_confirmed',
                        'counter_recorded', 'offer_accepted', 'meeting_scheduled', 'price_analysis',
                        'property_active', 'showing_on_property')
   and not is_active;

-- ── 3. Гэрээний загвар, хяналт; хүлээлцэх алхмын хугацаа ──

alter table public.crm_transaction_contracts
  add column if not exists template_code text,
  add column if not exists reviewed_by uuid references public.profiles(id),
  add column if not exists reviewed_at timestamptz,
  add column if not exists review_note text;

alter table public.crm_handover_items
  add column if not exists due_on date;

-- Гэрээний батлагдсан загварууд (Ш10 — Үйл ажиллагаа-ЧМТ лавлахаас шинэчилнэ).
insert into public.crm_lookups (office_id, kind, code, label, sort_order, is_active)
select o.office_id, 'contract_template', t.code, t.label, t.sort, true
from (select distinct office_id from public.crm_pipelines) o
cross join (values
  ('sale_standard',     'Худалдах, худалдан авах гэрээ — стандарт загвар', 1),
  ('rental_standard',   'Түрээсийн гэрээ — стандарт загвар',               2),
  ('managed_rental',    'Менежменттэй түрээсийн гэрээ — стандарт загвар',  3),
  ('international_sale','Олон улсын худалдааны гэрээ — стандарт загвар',   4)
) as t(code, label, sort)
on conflict (office_id, kind, code) do nothing;

-- Гэрээ хянах (deal_flow.contract_reviewer_roles; зохиогч өөрийгөө хянахгүй).
create or replace function public.crm_review_contract(p_contract uuid, p_note text default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  c public.crm_transaction_contracts;
  v_roles text[];
  v_status crm_txn_status;
begin
  select * into c from public.crm_transaction_contracts where id = p_contract for update;
  if c.id is null or c.office_id is distinct from public.crm_office_id() then
    raise exception 'CRM: гэрээ олдсонгүй эсвэл танд эрх алга';
  end if;
  select coalesce(array_agg(x), array['ops_qc', 'sales_director']) into v_roles
  from jsonb_array_elements_text(public.crm_setting_at(c.office_id, 'deal_flow') -> 'contract_reviewer_roles') x;
  if not exists (select 1 from unnest(public.crm_my_roles()) r where r::text = any (v_roles)) then
    raise exception 'CRM_TXN: гэрээ хянах эрх танд алга';
  end if;
  select status into v_status from public.crm_transactions where id = c.transaction_id;
  if v_status in ('closed', 'cancelled') then
    raise exception 'CRM_TXN: хаагдсан хэлцлийн гэрээг хянахгүй';
  end if;
  if c.doc_id is null then
    raise exception 'CRM_TXN: гарын үсэгтэй гэрээний хавсралтгүй бол хянахгүй';
  end if;
  if c.template_code is null then
    raise exception 'CRM_TXN: гэрээний батлагдсан загварыг сонгоогүй байна';
  end if;
  update public.crm_transaction_contracts
     set reviewed_by = auth.uid(), reviewed_at = now(), review_note = nullif(trim(p_note), '')
   where id = p_contract;
  insert into public.crm_audit_log (office_id, actor_id, entity, entity_id, action, field, new_value, reason)
  values (c.office_id, auth.uid(), 'crm_transactions', c.transaction_id, 'contract_reviewed', 'contract',
          jsonb_build_object('contract_id', c.id, 'number', c.number), nullif(trim(p_note), ''));
end $$;

-- ── 4. Төлбөр ──

-- Агент өөрийн хэлцэлд нотолгоотой төлбөр бүртгэнэ (Санхүү дараа нь баталгаажуулна).
-- Хуваарийн (үнийн) төлбөр = control, хөлсний нэхэмжлэхийн төлбөр = income
-- (шимтгэлийн суурь зөвхөн income тул үнийн төлбөр орлогод тооцогдохгүй).
drop policy if exists crm_payments_insert_deal on public.crm_payments;
create policy crm_payments_insert_deal on public.crm_payments for insert
  with check (
    office_id = (select public.crm_office_id())
    and created_by = auth.uid()
    and kind in ('income', 'control')
    and transaction_id is not null
    and doc_id is not null
    and finance_verified_at is null
    and public.crm_can_edit_txn(transaction_id)
  );

-- Түрээсийн гэрээний төлбөрт хэлцлийн холбоос (хаалтын төлбөрийн шалгалт хэлцлээр).
create or replace function public.crm_payment_insert_guard()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_txn uuid; inv public.crm_invoices;
begin
  if new.kind = 'income' then
    v_txn := new.transaction_id;
    if v_txn is null and new.invoice_id is not null then
      select * into inv from public.crm_invoices where id = new.invoice_id;
      v_txn := inv.transaction_id;
      if v_txn is null and inv.lease_id is not null then
        select transaction_id into v_txn from public.crm_leases where id = inv.lease_id;
      end if;
    end if;
    if v_txn is null and new.lease_id is not null then
      select transaction_id into v_txn from public.crm_leases where id = new.lease_id;
    end if;
    if v_txn is null and new.schedule_line_id is not null then
      select transaction_id into v_txn from public.crm_payment_schedule_lines where id = new.schedule_line_id;
    end if;
    if v_txn is not null and public.crm_txn_on_hold(v_txn) then
      raise exception 'CRM_PAYMENT: хэлцэл МУТСТ түгжээтэй — орлогын төлбөр бүртгэхийг хориглоно';
    end if;
    new.transaction_id := coalesce(new.transaction_id, v_txn);
  end if;

  if new.invoice_id is not null and new.lease_id is null then
    select lease_id into new.lease_id from public.crm_invoices where id = new.invoice_id;
  end if;
  if new.schedule_line_id is not null and new.transaction_id is null then
    select transaction_id into new.transaction_id
    from public.crm_payment_schedule_lines where id = new.schedule_line_id;
  end if;
  return new;
end $$;

-- Нөхөн бөглөлт: түрээсийн төлбөрт хэлцлийн холбоос.
update public.crm_payments p
   set transaction_id = l.transaction_id
  from public.crm_leases l
 where p.transaction_id is null and p.lease_id = l.id and l.transaction_id is not null;

-- ── 5. Хаалтын босго (§6.17) ──

create or replace function public.crm_txn_closing_checks(p_txn uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  t public.crm_transactions;
  v_cfg jsonb;
  v_rows jsonb := '[]'::jsonb;
  ok boolean;
  v_need_a crm_party_role;
  v_need_b crm_party_role;
  v_rule_active boolean;
  v_rule_dry boolean;
begin
  select * into t from public.crm_transactions where id = p_txn;
  if t.id is null then
    raise exception 'CRM_TXN: хэлцэл олдсонгүй';
  end if;
  if auth.uid() is not null and not public.crm_can_view_txn(p_txn) then
    raise exception 'CRM: хэлцэл олдсонгүй эсвэл танд эрх алга';
  end if;
  v_cfg := coalesce(public.crm_setting_at(t.office_id, 'deal_flow'), '{}'::jsonb);

  -- 1. Харилцагчийн баталгаа — нөхцөлийг хүлээн зөвшөөрсөн.
  ok := exists (
    select 1 from public.crm_offers f
    where f.id in (select public.crm_opp_offer_ids(t.opportunity_id)) and f.status = 'accepted'
  ) or (t.type in ('standard_rental', 'managed_rental', 'replacement') and exists (
    select 1 from public.crm_transaction_contracts c
    where c.transaction_id = t.id and c.doc_id is not null and c.signed_on is not null
  ));
  v_rows := v_rows || jsonb_build_object('code', 'client_acceptance', 'label', 'Харилцагчийн баталгаа', 'ok', ok,
    'hint', 'Харилцагч нөхцөлийг хүлээн зөвшөөрснийг саналын хэсэгт нотолгоотой бүртгэнэ');

  -- 2. Гэрээ — батлагдсан загвар, хяналт дууссан.
  ok := exists (
    select 1 from public.crm_transaction_contracts c
    where c.transaction_id = t.id and c.doc_id is not null
      and c.template_code is not null and c.reviewed_at is not null
  );
  v_rows := v_rows || jsonb_build_object('code', 'contract', 'label', 'Гэрээ', 'ok', ok,
    'hint', 'Батлагдсан загвараар, гарын үсэгтэй хавсралттай гэрээг Үйл ажиллагаа-ЧМТ хянана');

  -- 3. Төлбөр — хуваарийн мөр бүр төлөгдсөн (бүх төрлийн төлбөрөөр), төлбөр
  --    бүр нотолгоотой, Санхүүгээр баталгаажсан.
  ok := t.type = 'replacement' or (
        exists (select 1 from public.crm_payment_schedule_lines s where s.transaction_id = t.id)
    and not exists (
          select 1 from public.crm_payment_schedule_lines s
          where s.transaction_id = t.id
            and s.amount > coalesce((select sum(p.amount_mnt) from public.crm_payments p
                                     where p.schedule_line_id = s.id), 0))
    and not exists (select 1 from public.crm_payments p
                    where p.transaction_id = t.id
                      and (p.doc_id is null or p.finance_verified_at is null))
  );
  v_rows := v_rows || jsonb_build_object('code', 'payment', 'label', 'Төлбөр', 'ok', ok,
    'hint', 'Хуваарийн мөр бүр төлөгдөж, төлбөр бүр баримттай, Санхүүгээр баталгаажсан байна');

  -- 4. Баримт бичиг — шаардлагатай гол баримт бүрдсэн.
  ok := public.crm_txn_completeness_value(t.id) >= 100;
  v_rows := v_rows || jsonb_build_object('code', 'documents', 'label', 'Баримт бичиг', 'ok', ok,
    'hint', 'Шаардлагатай ангилал бүрийн баримтыг хавсаргана');

  -- 5. Шимтгэл, үйлчилгээний хөлс — нэхэмжлэх, төлбөрийн төлөв тодорхой.
  ok := t.type = 'replacement'
     or not coalesce((v_cfg ->> 'fee_invoice_required')::boolean, true)
     or exists (select 1 from public.crm_invoices i
                where i.transaction_id = t.id and i.type = 'brokerage_fee' and i.status = 'paid')
     or exists (select 1 from public.crm_transaction_approvals a
                where a.transaction_id = t.id and a.fee_change = 'waiver' and a.approved_at is not null);
  v_rows := v_rows || jsonb_build_object('code', 'fee', 'label', 'Шимтгэл, үйлчилгээний хөлс', 'ok', ok,
    'hint', 'Хөлсний нэхэмжлэх төлөгдсөн эсвэл чөлөөлөлт батлагдсан байна');

  -- 6. Хүлээлцэх.
  select coalesce(bool_and(h.done), false) into ok
  from public.crm_handover_items h where h.transaction_id = t.id;
  v_rows := v_rows || jsonb_build_object('code', 'handover', 'label', 'Хүлээлцэх', 'ok', coalesce(ok, false),
    'hint', 'Хүлээлцэх алхам бүрийг (түлхүүр, тоолуур, эд хогшил) тэмдэглэнэ');

  -- 7. CRM — оролцогчид, үүрэг бүрэн бүртгэгдсэн.
  if t.type in ('sale', 'international_sale') then
    v_need_a := 'seller'; v_need_b := 'buyer';
  else
    v_need_a := 'lessor'; v_need_b := 'lessee';
  end if;
  ok := exists (select 1 from public.crm_transaction_parties p where p.transaction_id = t.id and p.role = v_need_a)
    and exists (select 1 from public.crm_transaction_parties p where p.transaction_id = t.id and p.role = v_need_b)
    and exists (select 1 from public.crm_transaction_agent_roles r where r.transaction_id = t.id);
  v_rows := v_rows || jsonb_build_object('code', 'crm', 'label', 'CRM', 'ok', ok,
    'hint', 'Хоёр талын оролцогч болон агентын үүргийг бүртгэнэ');

  -- 8. Санхүү — орлого баталгаажсан.
  ok := t.type = 'replacement' or exists (
    select 1 from public.crm_payments p
    where p.transaction_id = t.id and p.kind = 'income' and p.finance_verified_at is not null
  );
  v_rows := v_rows || jsonb_build_object('code', 'finance', 'label', 'Санхүү', 'ok', ok,
    'hint', 'Санхүү орлогын төлбөрийг баталгаажуулна');

  -- 9. Борлуулалтын дараах үйлчилгээ — даалгавар үүссэн (дүрэм идэвхгүй/туршилтын горимд шаардахгүй).
  select is_active, dry_run into v_rule_active, v_rule_dry
  from public.crm_automation_rules where office_id = t.office_id and code = 'D-09';
  ok := exists (
          select 1 from public.crm_task_links tl
          where tl.rule_code = 'D-09'
            and ((tl.entity = 'transaction' and tl.entity_id = t.id)
              or (tl.entity = 'opportunity' and tl.entity_id = t.opportunity_id))
        )
     or (v_rule_active is not null and (not v_rule_active or coalesce(v_rule_dry, false)));
  v_rows := v_rows || jsonb_build_object('code', 'post_sale', 'label', 'Борлуулалтын дараах үйлчилгээ', 'ok', ok,
    'hint', 'Хаах үед эргэн холбогдох, санал болголтын даалгавар автоматаар үүснэ');

  -- + МУТСТ түгжээ.
  ok := not public.crm_txn_on_hold(t.id);
  v_rows := v_rows || jsonb_build_object('code', 'aml', 'label', 'МУТСТ түгжээгүй', 'ok', ok,
    'hint', 'МУТСТ ажилтан түгжээг суллах хүртэл хаахгүй');

  return v_rows;
end $$;

-- ── Төлөвийн машин: хаалтад босго бүрийг шаардана ──

create or replace function public.crm_txn_status_guard()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  missing text[];
  v numeric;
  need_a crm_party_role;
  need_b crm_party_role;
  v_checks jsonb;
begin
  if new.status = old.status then
    return new;
  end if;

  if not (
    (old.status = 'draft'    and new.status in ('contract', 'cancelled')) or
    (old.status = 'contract' and new.status in ('payment', 'cancelled')) or
    (old.status = 'payment'  and new.status in ('closed', 'cancelled'))
  ) then
    raise exception 'CRM_TXN: % → % шилжилт зөвшөөрөгдөөгүй', old.status, new.status;
  end if;

  if new.status in ('contract', 'payment', 'closed') and public.crm_txn_on_hold(new.id) then
    raise exception 'CRM_TXN: МУТСТ түгжээтэй — хэлцлийг урагшлуулахыг хориглоно';
  end if;

  if new.status = 'contract' then
    if new.type in ('sale', 'international_sale') then
      need_a := 'seller'; need_b := 'buyer';
    else
      need_a := 'lessor'; need_b := 'lessee';
    end if;
    if not exists (select 1 from public.crm_transaction_parties p where p.transaction_id = new.id and p.role = need_a)
       or not exists (select 1 from public.crm_transaction_parties p where p.transaction_id = new.id and p.role = need_b) then
      raise exception 'CRM_TXN: оролцогч талуудын бүртгэл дутуу — хоёр тал хоёул заавал';
    end if;
    if not exists (select 1 from public.crm_transaction_agent_roles r where r.transaction_id = new.id) then
      raise exception 'CRM_TXN: агентын үүргийн бүртгэл дутуу';
    end if;
    missing := public.crm_check_gate(new.opportunity_id, 'g4');
    if coalesce(array_length(missing, 1), 0) > 0 then
      raise exception 'CRM_GATE:%', array_to_string(missing, '|');
    end if;
    new.contracted_on := coalesce(new.contracted_on, current_date);
  end if;

  if new.status = 'payment' then
    if not exists (
      select 1 from public.crm_transaction_contracts c
      where c.transaction_id = new.id and c.doc_id is not null
    ) then
      raise exception 'CRM_TXN: гарын үсэгтэй хавсралт бүхий гэрээний бүртгэл дутуу';
    end if;
    if not exists (select 1 from public.crm_payment_schedule_lines s where s.transaction_id = new.id) then
      raise exception 'CRM_TXN: төлбөрийн хуваарь үүсээгүй байна';
    end if;
  end if;

  if new.status = 'closed' then
    if auth.uid() is not null and not public.has_crm_role('sales_director', 'ceo') then
      raise exception 'CRM_TXN: хаалтыг зөвхөн Борлуулалт хариуцсан захирал баталгаажуулна';
    end if;
    v := public.crm_txn_completeness_value(new.id);
    new.file_completeness_pct := v;
    -- Хаалтын босго (§6.17) — нэг эх үнэн.
    v_checks := public.crm_txn_closing_checks(new.id);
    select coalesce(array_agg(x ->> 'label'), '{}'::text[]) into missing
    from jsonb_array_elements(v_checks) x
    where not (x ->> 'ok')::boolean;
    if coalesce(array_length(missing, 1), 0) > 0 then
      raise exception 'CRM_GATE:%', array_to_string(missing, '|');
    end if;
    -- Урсгалд тохируулсан нэмэлт хаалтын шалгуур.
    missing := public.crm_check_gate(new.opportunity_id, 'g5');
    if coalesce(array_length(missing, 1), 0) > 0 then
      raise exception 'CRM_GATE:%', array_to_string(missing, '|');
    end if;
    new.closed_on := coalesce(new.closed_on, current_date);
  end if;

  if new.status = 'cancelled' then
    if auth.uid() is not null and not public.has_crm_role('sales_director', 'ceo') then
      raise exception 'CRM_TXN: цуцлалтыг зөвхөн Борлуулалт хариуцсан захирал шийдвэрлэнэ';
    end if;
    if nullif(new.cancellation_reason, '') is null then
      raise exception 'CRM_TXN: цуцлалтад шалтгааны ангилал заавал';
    end if;
    new.cancelled_at := coalesce(new.cancelled_at, now());
    new.cancelled_by := coalesce(new.cancelled_by, auth.uid());
  end if;

  return new;
end $$;

-- ── 6. Хэлцэл ↔ боломжийн синк ──

-- Боломжийг зорилтот шат руу (зөвхөн урагш) шилжүүлнэ. Шилжилтийн хүснэгт
-- биш хэлцлийн төлөв эх үнэн тул stage guard-ыг GUC-ээр алгасна (МУТСТ
-- хориг хэвээр үйлчилнэ).
create or replace function public.crm_sync_opp_stage(p_opp uuid, p_target text, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare
  o public.crm_opportunities;
  cur public.crm_stages;
  dst public.crm_stages;
  v_contract_sort int;
begin
  select * into o from public.crm_opportunities where id = p_opp;
  if o.id is null or o.state <> 'open' then
    return;
  end if;
  select * into cur from public.crm_stages where id = o.stage_id;

  if p_target = 'won' then
    select * into dst from public.crm_stages
    where pipeline_id = o.pipeline_id and is_terminal and terminal_state = 'won'
    order by sort_order limit 1;
  elsif p_target = 'contract' then
    select * into dst from public.crm_stages
    where pipeline_id = o.pipeline_id and code = 'contract' and not is_terminal;
  elsif p_target = 'payment' then
    select sort_order into v_contract_sort from public.crm_stages
    where pipeline_id = o.pipeline_id and code = 'contract';
    select * into dst from public.crm_stages
    where pipeline_id = o.pipeline_id and not is_terminal and is_closing_direction
      and sort_order > coalesce(v_contract_sort, 2147483647)
    order by sort_order limit 1;
  end if;

  if dst.id is null or dst.id = o.stage_id then
    return;
  end if;
  if not dst.is_terminal and cur.sort_order >= dst.sort_order then
    return; -- зөвхөн урагш
  end if;

  perform set_config('crm.pipeline_transfer', '1', true);
  perform set_config('crm.reason', p_reason, true);
  update public.crm_opportunities set stage_id = dst.id where id = p_opp;
  perform set_config('crm.pipeline_transfer', '', true);
  perform set_config('crm.reason', '', true);
end $$;

create or replace function public.crm_txn_status_after()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  tpl jsonb;
  item jsonb;
  i int := 0;
  scope_name text;
  v_offset int;
  v_default_offset int;
  r record;
  v_target text;
  v_reason text;
begin
  if new.status = old.status then
    return new;
  end if;

  insert into public.crm_audit_log (office_id, actor_id, entity, entity_id, action, field, old_value, new_value, reason)
  values (new.office_id, auth.uid(), 'crm_transactions', new.id, 'status', 'status',
          to_jsonb(old.status), to_jsonb(new.status), new.cancellation_reason);

  -- «Гэрээ» шатанд орсны дараа хүлээлцэх checklist автомат үүснэ; алхам
  -- бүрийн хугацаа = гэрээний огноо + offset_days (загвараас, үгүй бол тохиргоо).
  if new.status = 'contract'
     and not exists (select 1 from public.crm_handover_items h where h.transaction_id = new.id) then
    scope_name := case
      when new.type in ('sale', 'international_sale') then 'handover_sale'
      else 'handover_rental'
    end;
    v_default_offset := nullif(public.crm_setting_at(new.office_id, 'deal_flow') ->> 'handover_offset_days_default', '')::int;
    select items into tpl
    from public.crm_checklist_templates
    where office_id = new.office_id and scope = scope_name and is_active
    order by created_at desc limit 1;
    if tpl is not null then
      for item in select * from jsonb_array_elements(tpl) loop
        i := i + 1;
        v_offset := coalesce(nullif(item ->> 'offset_days', '')::int, v_default_offset);
        insert into public.crm_handover_items (office_id, transaction_id, label, sort_order, due_on)
        values (new.office_id, new.id, coalesce(item ->> 'label', 'Алхам ' || i), i,
                case when v_offset is not null then coalesce(new.contracted_on, current_date) + v_offset end);
      end loop;
    else
      insert into public.crm_handover_items (office_id, transaction_id, label, sort_order, due_on)
      select new.office_id, new.id, x.label, x.ord,
             case when v_default_offset is not null then coalesce(new.contracted_on, current_date) + v_default_offset end
      from (values
        ('Түлхүүр хүлээлгэн өгсөн', 1),
        ('Тоолуурын заалт бүртгэсэн', 2),
        ('Эд хогшлын жагсаалт үйлдсэн', 3),
        ('Хүлээлцэх акт гарын үсэгтэй хавсрагдсан', 4)
      ) as x(label, ord);
    end if;
  end if;

  -- Цуцлалт → шимтгэлийн буцаалтын ажил.
  if new.status = 'cancelled' then
    insert into public.crm_rule_runs (office_id, rule_code, entity, entity_id, status, result)
    values (new.office_id, 'F-462', 'crm_transactions', new.id, 'pending',
            jsonb_build_object('reason', new.cancellation_reason));
  end if;

  -- Боломжийн шат: хэлцлийн боломж + ижил үл хөдлөх дээр хаалтын чиглэлд
  -- байгаа нээлттэй боломжууд (листинг ба худалдан авагч тал нэг эх үнэнтэй).
  v_target := case new.status when 'contract' then 'contract' when 'payment' then 'payment'
                              when 'closed' then 'won' else null end;
  v_reason := case new.status when 'contract' then 'Хэлцэл гэрээний шатанд орсон'
                              when 'payment' then 'Хэлцэл төлбөрийн шатанд орсон'
                              when 'closed' then 'Хэлцэл амжилттай хаагдсан' else null end;
  if v_target is not null then
    perform public.crm_sync_opp_stage(new.opportunity_id, v_target, v_reason);
    for r in
      select o.id
      from public.crm_opportunities o
      join public.crm_stages s on s.id = o.stage_id
      where o.property_id = new.property_id
        and o.id <> new.opportunity_id
        and o.office_id = new.office_id
        and o.state = 'open'
        and s.is_closing_direction
    loop
      perform public.crm_sync_opp_stage(r.id, v_target, v_reason);
    end loop;
  end if;

  return new;
end $$;

-- Одоогийн өгөгдөл: хаагдсан хэлцэлтэй нээлттэй боломжийг амжилттай болгоно.
do $$
declare r record;
begin
  for r in
    select t.opportunity_id
    from public.crm_transactions t
    join public.crm_opportunities o on o.id = t.opportunity_id
    where t.status = 'closed' and o.state = 'open'
  loop
    perform public.crm_sync_opp_stage(r.opportunity_id, 'won', 'Хэлцэл амжилттай хаагдсан');
  end loop;
end $$;

-- ── 7. Шатны зөвлөмж ──

alter table public.crm_stages add column if not exists guidance text;

update public.crm_stages s
   set guidance = g.txt
  from public.crm_pipelines p,
  (values
    ('buyer', 'new',             'Эхний холболтыг хийж, хэрэгцээг товч асуугаад дараагийн үйлдлийг огноотой товло.'),
    ('buyer', 'contacted',       'Хэрэгцээний профайлыг бөглө: төсөв, санхүүжилт, хугацаа, шийдвэр гаргагч.'),
    ('buyer', 'qualified',       'Тохирох үл хөдлөхүүдийг шүүж, харилцагчид санал болго.'),
    ('buyer', 'matched',         'Үзлэгийг огноо, цаг, оролцогчтой товло. Сул тохиролд үндэслэл бич.'),
    ('buyer', 'showing',         'Үзлэгийн дараа 24 цагийн дотор эргэх холбоо авч ангилна.'),
    ('buyer', 'interested',      'Сонирхлоо баталгаажуулсан бол үнийн саналын нөхцөлийг бэлтгэ.'),
    ('buyer', 'offer',           'Саналын үнэ, төлбөр, санхүүжилт, хүлээлцэх, хүчинтэй хугацааг бүртгэ. Саналыг саатуулахгүй.'),
    ('buyer', 'negotiation',     'Сөрөг санал бүрийн байр суурь, саад, дараагийн алхмыг бүртгэ. Буултыг эрхийн дагуу батлуул.'),
    ('buyer', 'contract',        'Хэлцлийн хавтсыг нээж, оролцогч, үүрэг, гэрээ, төлбөрийн хуваарийг бүрдүүл.'),
    ('buyer', 'payment_closing', 'Төлбөрийн нотолгоо, баримт, хүлээлцэхийг дуусгаж хаалтын босгыг хангуул.'),
    ('listing', 'new',           'Өмчлөгчтэй холбогдож, үл хөдлөхийн мэдээллийг баталгаажуул.'),
    ('listing', 'contacted',     'Уулзалт буюу газар дээр нь үзэх цагийг товло.'),
    ('listing', 'meeting',       'Зах зээлийн харьцуулалт хийж, үнийн дүн шинжилгээг бүртгэ.'),
    ('listing', 'consult',       'Листингийн эрх, нөхцөлийг гэрээгээр баримтжуул.'),
    ('listing', 'agreement',     'Зураг, шошго, тайлбарыг бүрдүүлж листингийг идэвхжүүл.'),
    ('listing', 'active_listing','Шалгуур хангасан худалдан авагчдад үзүүлж, үзлэгийг бүртгэ.'),
    ('listing', 'showings',      'Ирсэн саналыг өмчлөгчид шууд дамжуул.'),
    ('listing', 'offer',         'Өмчлөгчийн хариу, сөрөг саналыг бүртгэ.'),
    ('listing', 'negotiation',   'Тохирсон нөхцөлийг өмчлөгчөөр нотолгоотой баталгаажуул.'),
    ('listing', 'contract',      'Хэлцлийн хавтсыг бүрдүүлж, гэрээг хянуул.'),
    ('listing', 'closing',       'Төлбөр, хүлээлцэх, баримтыг дуусгаж хаалтын босгыг хангуул.')
  ) as g(side, code, txt)
 where p.id = s.pipeline_id
   and s.guidance is null
   and s.code = g.code
   and ((g.side = 'buyer' and p.code in ('PL-1', 'PL-5')) or (g.side = 'listing' and p.code = 'PL-2'));

-- ── Grants ──

revoke execute on function public.crm_review_contract(uuid, text) from anon, public;
revoke execute on function public.crm_txn_closing_checks(uuid) from anon, public;
revoke execute on function public.crm_sync_opp_stage(uuid, text, text) from anon, public, authenticated;

grant execute on function public.crm_review_contract(uuid, text) to authenticated;
grant execute on function public.crm_txn_closing_checks(uuid) to authenticated;
