-- ============================================================
-- PMC CRM — Урсгал/боломж, шат+гейт guard, үйл ажиллагаа (U4).
-- DESIGN.md §2.8, §2.3 (гейт), §3.2; F-300–312, F-350–362, P-02–P-06.
--
-- Дараалал: owner_profiles FK (000250-ийн үлдэгдэл) → crm_opportunities →
-- crm_stage_history → crm_activities → crm_offers → crm_task_links →
-- helpers (crm_check_gate) → stage guard → RPC → RLS → grants.
-- crm_need_profiles/crm_owner_profiles 000250-д (crm_matches-ийн FK-ийн
-- өмнө), crm_matches 000300-д аль хэдийн үүссэн — энд ДАВХАРДУУЛАХГҮЙ.
-- ============================================================

-- ── 000250-ийн хойшлуулсан FK: owner_profiles.property_id → crm_properties (000300) ──

alter table public.crm_owner_profiles
  add constraint crm_owner_profiles_property_fkey
  foreign key (property_id) references public.crm_properties(id);

-- ════════════════════════════════════════════════════════════
-- ХҮСНЭГТҮҮД
-- ════════════════════════════════════════════════════════════

-- ── Боломж (M5, F-350–362) ──

create table public.crm_opportunities (
  id uuid primary key default gen_random_uuid(),
  office_id uuid not null references public.offices(id) on delete restrict,
  pipeline_id uuid not null,
  stage_id uuid not null,
  contact_id uuid not null references public.crm_contacts(id) on delete restrict,
  property_id uuid references public.crm_properties(id),
  need_profile_id uuid references public.crm_need_profiles(id),
  lead_id uuid references public.crm_leads(id),   -- P-01→PL шилжилтийн мөрдөлт (сэжимээс үүссэн бол)
  owner_id uuid not null references public.profiles(id),
  branch_id uuid references public.crm_branches(id),
  amount numeric(14,2),
  currency text not null default 'MNT',
  expected_close_on date,                    -- F-359
  state crm_opp_state not null default 'open',
  lost_reason_id uuid references public.crm_lookups(id),
  lost_note text,                            -- F-356
  aml_hold boolean not null default false,   -- denormalized (U5-ийн hold trigger синклэнэ)
  stage_entered_at timestamptz not null default now(),
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, office_id),                    -- tenant-нийцэлтэй composite FK-ийн зорилтот (§2.4)
  constraint crm_opp_lost_reason check (state <> 'lost' or lost_reason_id is not null),
  -- Нэрийг PostgREST embed hint-тэй (crm_opportunities_pipeline_id_fkey г.м.) таарууллаа.
  constraint crm_opportunities_pipeline_id_fkey
    foreign key (pipeline_id, office_id) references public.crm_pipelines (id, office_id) on delete restrict,
  constraint crm_opportunities_stage_id_fkey
    foreign key (stage_id, office_id)    references public.crm_stages (id, office_id) on delete restrict
);
create index crm_opp_stage_idx   on public.crm_opportunities (office_id, pipeline_id, stage_id) where state = 'open';
create index crm_opp_owner_idx   on public.crm_opportunities (office_id, owner_id, state);
create index crm_opp_contact_idx on public.crm_opportunities (contact_id);  -- crm_can_view_contact()-д ЗААВАЛ
create index crm_opp_lead_idx    on public.crm_opportunities (lead_id);
create index crm_opp_property_idx on public.crm_opportunities (property_id);

-- ── Шатны түүх (F-357) ──

create table public.crm_stage_history (
  id uuid primary key default gen_random_uuid(),
  office_id uuid not null,
  opportunity_id uuid not null references public.crm_opportunities(id) on delete cascade,
  from_stage_id uuid references public.crm_stages(id),
  to_stage_id uuid not null references public.crm_stages(id),
  reason text,
  moved_by uuid references public.profiles(id),
  entered_at timestamptz not null default now(),
  left_at timestamptz
);
create index crm_stage_history_opp_idx on public.crm_stage_history (opportunity_id, entered_at);

-- ── Үйл ажиллагаа (M4, F-300–312) — 4.5.1 толийн хаалттай enum-ууд CHECK-ээр ──

create table public.crm_activities (
  id uuid primary key default gen_random_uuid(),
  office_id uuid not null references public.offices(id) on delete restrict,
  contact_id uuid not null references public.crm_contacts(id) on delete restrict,
  property_id uuid references public.crm_properties(id),
  opportunity_id uuid references public.crm_opportunities(id),
  lead_id uuid references public.crm_leads(id),
  channel crm_activity_channel not null,
  purpose text not null,
  summary text not null,
  attitude text,
  new_info text,                             -- F-311: профайл шинэчлэх сануулгын эх
  objection_id uuid references public.crm_lookups(id),
  outcome crm_activity_outcome not null default 'open',
  next_step text,
  next_step_date date,                       -- идэвхтэй сэжимд заавал (app + trigger, F-302)
  occurred_at timestamptz not null,          -- болсон огноо
  backdated boolean not null default false,  -- F-307: trigger тавина
  feedback_category text,                    -- үзлэгийн 24ц санал (F-310)
  owner_id uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),  -- бүртгэсэн огноо, immutable
  constraint crm_activities_purpose check
    (purpose in ('screening', 'follow_up', 'offer', 'negotiation', 'service', 'other')),
  constraint crm_activities_attitude check
    (attitude is null or attitude in ('positive', 'neutral', 'objection', 'not_ready')),
  constraint crm_activities_feedback check
    (feedback_category is null
     or feedback_category in ('price', 'location', 'layout', 'condition', 'financing', 'other'))
);
create index crm_activities_contact_idx  on public.crm_activities (contact_id, occurred_at desc);
create index crm_activities_opp_idx      on public.crm_activities (opportunity_id, occurred_at desc);
create index crm_activities_lead_idx     on public.crm_activities (lead_id);
create index crm_activities_property_idx on public.crm_activities (property_id, occurred_at desc);
create index crm_activities_owner_idx    on public.crm_activities (office_id, owner_id, occurred_at desc);

-- ── Санал/хэлэлцээр (P-02 §2.4) ──

create table public.crm_offers (
  id uuid primary key default gen_random_uuid(),
  office_id uuid not null references public.offices(id) on delete restrict,
  opportunity_id uuid not null references public.crm_opportunities(id) on delete cascade,
  direction text not null,                   -- 'offer' (санал) | 'counter' (сөрөг санал)
  amount numeric(14,2) not null,
  terms jsonb,
  valid_until date,
  relayed_at timestamptz,                    -- дамжуулсан огноог систем хадгална (саатуулахыг хориглоно)
  position text,                             -- сүүлийн байр суурь
  obstacle text,                             -- саад
  next_step text,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  constraint crm_offers_direction check (direction in ('offer', 'counter'))
);
create index crm_offers_opp_idx on public.crm_offers (opportunity_id, created_at desc);

-- ── D2: tasks ↔ CRM объектын холбоос ──

create table public.crm_task_links (
  task_id uuid not null references public.tasks(id) on delete cascade,
  entity text not null,                      -- 'lead'|'opportunity'|'activity'|'property'|'transaction'|...
  entity_id uuid not null,
  rule_code text,                            -- 'D-01'…'D-30' автомат бол
  primary key (task_id, entity, entity_id)
);
create index crm_task_links_entity_idx on public.crm_task_links (entity, entity_id);

-- ════════════════════════════════════════════════════════════
-- HELPER ФУНКЦУУД
-- ════════════════════════════════════════════════════════════

-- Боломжийг харах эрх (§3.2): эзэмшигч/үүсгэгч/баг(team_lead)/менежер +
-- PL-6 хязгаарлалт; finance/aml_officer унших.
create or replace function public.crm_can_view_opportunity(o uuid)
returns boolean language plpgsql stable security definer set search_path = public as $$
declare ok boolean := false;
begin
  select exists (
    select 1 from public.crm_opportunities op
    where op.id = o
      and op.office_id = public.crm_office_id()
      and public.crm_can_view_pl6(op.pipeline_id)
      and (
        op.owner_id = auth.uid()
        or op.created_by = auth.uid()
        or public.crm_is_team_of(op.owner_id)
        or public.crm_is_manager()
        or public.has_crm_role('finance', 'aml_officer')
      )
  ) into ok;
  return ok;
end $$;

-- Боломжийг ЗАСАХ эрх: эзэмшигч / багийн ахлагч (багийнх) / менежер.
create or replace function public.crm_can_edit_opportunity(o uuid)
returns boolean language plpgsql stable security definer set search_path = public as $$
declare ok boolean := false;
begin
  select exists (
    select 1 from public.crm_opportunities op
    where op.id = o
      and op.office_id = public.crm_office_id()
      and public.crm_can_view_pl6(op.pipeline_id)
      and (
        op.owner_id = auth.uid()
        or public.crm_is_team_of(op.owner_id)
        or public.crm_is_manager()
      )
  ) into ok;
  return ok;
end $$;

-- ── Гейт шалгагч (G0–G6, F-354/F-416; §2.3) ──
-- Дотоод хувилбар: боломжийн МӨРӨӨР шалгана (INSERT-ийн NEW-д ч ажиллана).
-- SECURITY DEFINER ЗААВАЛ: aml/docs/payment checker-ууд дуудагчийн RLS-д
-- хаалттай хүснэгтүүдээс уншина (§2.3-ын тайлбар). Хожмын нэгжийн (000500+)
-- хүснэгтүүдийг to_regclass guard + dynamic SQL + exception-хамгаалалттай
-- асууна: хүснэгт байхгүй/бүтэц зөрвөл тухайн шаардлага ДУТУУ гэж үзнэ
-- (аюулгүй тал руу).
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
begin
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
        -- Боломж дээрх сүүлийн үйл ажиллагаа ЭСВЭЛ идэвхтэй сэжим дараагийн
        -- алхам + ирээдүйн (өнөөдрөөс хойшгүй биш) огноотой байх (алтан дүрэм).
        ok := exists (
                select 1 from public.crm_activities a
                where a.contact_id = o.contact_id
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
        select max(coalesce(np.completeness_pct, 0)) into v_pct
        from public.crm_need_profiles np
        where (o.need_profile_id is not null and np.id = o.need_profile_id)
           or (o.need_profile_id is null and np.contact_id = o.contact_id and np.status = 'active');
        -- Өмчлөгч талын урсгалд (PL-2/PL-4 г.м.) идэвхтэй owner profile = бүрэн.
        if v_pct is null and exists (
             select 1 from public.crm_owner_profiles op2
             where op2.contact_id = o.contact_id and op2.status = 'active'
           ) then
          v_pct := 100;
        end if;
        ok := coalesce(v_pct, 0) >= v_min;

      when 'kyc_verified' then
        select kyc_public_status into v_kyc from public.crm_contacts where id = o.contact_id;
        ok := v_kyc = 'verified';

      when 'aml_not_held' then
        ok := not o.aml_hold;
        if ok and to_regclass('public.crm_aml_holds') is not null
              and to_regclass('public.crm_transactions') is not null then
          begin
            execute 'select not exists (
                       select 1 from public.crm_aml_holds h
                       join public.crm_transactions t on t.id = h.transaction_id
                       where t.opportunity_id = $1 and h.released_at is null)'
              into ok using o.id;
            ok := coalesce(ok, true);
          exception when others then
            ok := false;
          end;
        end if;

      when 'docs_complete' then
        v_min := coalesce((req.params ->> 'min_pct')::numeric, 100);
        v_pct := null;
        if to_regclass('public.crm_transactions') is not null then
          begin
            execute 'select max(file_completeness_pct) from public.crm_transactions
                     where opportunity_id = $1 and status <> ''cancelled'''
              into v_pct using o.id;
          exception when others then
            v_pct := null;
          end;
        end if;
        ok := coalesce(v_pct, 0) >= v_min;

      when 'role_evidence' then
        ok := false;
        if to_regclass('public.crm_transaction_agent_roles') is not null then
          begin
            execute 'select exists (
                       select 1 from public.crm_transaction_agent_roles r
                       join public.crm_transactions t on t.id = r.transaction_id
                       where t.opportunity_id = $1 and t.status <> ''cancelled'')'
              into ok using o.id;
            ok := coalesce(ok, false);
          exception when others then
            ok := false;
          end;
        end if;

      when 'payment_proof' then
        ok := false;
        if to_regclass('public.crm_payments') is not null then
          begin
            execute 'select exists (
                       select 1 from public.crm_payments p
                       join public.crm_transactions t on t.id = p.transaction_id
                       where t.opportunity_id = $1
                         and p.kind = ''income'' and p.verified_at is not null)'
              into ok using o.id;
            ok := coalesce(ok, false);
          exception when others then
            ok := false;
          end;
        end if;

      when 'handover_done' then
        ok := false;
        if to_regclass('public.crm_handover_items') is not null then
          begin
            execute 'select coalesce(bool_and(h.done), false)
                     from public.crm_handover_items h
                     join public.crm_transactions t on t.id = h.transaction_id
                     where t.opportunity_id = $1 and t.status <> ''cancelled'''
              into ok using o.id;
            ok := coalesce(ok, false);
          exception when others then
            ok := false;
          end;
        end if;

      when 'listing_agreement' then
        ok := o.property_id is not null and exists (
          select 1 from public.crm_listing_agreements la
          where la.property_id = o.property_id
            and la.signed_on <= current_date
            and la.expires_on >= current_date
        );

      when 'offer_recorded' then
        ok := exists (select 1 from public.crm_offers f where f.opportunity_id = o.id);

      when 'post_sale_tasks' then
        ok := exists (
          select 1 from public.crm_task_links tl
          where tl.entity = 'opportunity' and tl.entity_id = o.id and tl.rule_code = 'D-09'
        );
        if not ok and to_regclass('public.crm_transactions') is not null then
          begin
            execute 'select exists (
                       select 1 from public.crm_task_links tl
                       join public.crm_transactions t
                         on tl.entity = ''transaction'' and tl.entity_id = t.id
                       where t.opportunity_id = $1 and tl.rule_code = ''D-09'')'
              into ok using o.id;
            ok := coalesce(ok, false);
          exception when others then
            ok := false;
          end;
        end if;

      else
        ok := false; -- үл мэдэх checker — аюулгүй тал руу (дутуу)
    end case;

    if not ok then
      v_label := case req.checker_kind
        when 'need_profile_complete' then 'Хэрэгцээний профайл бүрэн'
        when 'owner_set'             then 'Эзэмшигч оноогдсон'
        when 'next_step_set'         then 'Дараагийн алхам огноотой'
        when 'kyc_verified'          then 'KYC баталгаажсан'
        when 'docs_complete'         then 'Баримтын бүрдэл 100%'
        when 'role_evidence'         then 'Үүргийн нотолгоо бүртгэгдсэн'
        when 'payment_proof'         then 'Төлбөрийн баримт баталгаажсан'
        when 'handover_done'         then 'Хүлээлцэх дууссан'
        when 'listing_agreement'     then 'Идэвхтэй листингийн гэрээ'
        when 'offer_recorded'        then 'Санал бүртгэгдсэн'
        when 'aml_not_held'          then 'МУТСТ түгжээгүй'
        when 'post_sale_tasks'       then 'Хэлцлийн дараах даалгавар үүссэн'
        else req.checker_kind
      end;
      missing := missing || v_label;
    end if;
  end loop;

  select coalesce(array_agg(distinct m), '{}'::text[]) into missing from unnest(missing) as m;
  return missing;
end $$;

-- Нийтийн wrapper (UI-ийн гейт checklist + trigger хоёул нэг эх үнэнтэй).
create or replace function public.crm_check_gate(p_opportunity uuid, p_gate crm_gate_code)
returns text[] language plpgsql stable security definer set search_path = public as $$
declare o public.crm_opportunities;
begin
  select * into o from public.crm_opportunities where id = p_opportunity;
  if o.id is null then
    raise exception 'CRM: боломж олдсонгүй';
  end if;
  if auth.uid() is not null and o.office_id is distinct from public.crm_office_id() then
    raise exception 'CRM: оффисын эрхгүй';
  end if;
  return public.crm_check_gate_rec(o, p_gate);
end $$;

-- ════════════════════════════════════════════════════════════
-- TRIGGER ФУНКЦУУД
-- ════════════════════════════════════════════════════════════

-- Боломж ҮҮСГЭХЭД: шат нь урсгалдаа хамаарах, терминал биш, эхний шатны
-- гейт (жишээ нь G0 — эзэмшигч + дараагийн алхам) хангагдсан байх.
create or replace function public.crm_opportunity_insert_guard()
returns trigger language plpgsql security definer set search_path = public as $$
declare st public.crm_stages; missing text[];
begin
  select * into st from public.crm_stages where id = new.stage_id;
  if st.id is null or st.pipeline_id <> new.pipeline_id then
    raise exception 'CRM: шат урсгалд тохирохгүй';
  end if;
  if st.is_terminal then
    raise exception 'CRM: терминал шатанд боломж шууд үүсгэхгүй';
  end if;
  if st.gate_code is not null then
    missing := public.crm_check_gate_rec(new, st.gate_code);
    if coalesce(array_length(missing, 1), 0) > 0 then
      raise exception 'CRM_GATE:%', array_to_string(missing, '|');
    end if;
  end if;
  new.state := 'open';
  new.stage_entered_at := now();
  return new;
end $$;

-- ── ГОЛ МЕХАНИЗМ: шатны шилжилтийн guard (F-352/354/355/356/360, Д-08/Д-12) ──
-- 1) transitions хүснэгтэд мөр байх; 2) дуудагчийн дүр ⊆ allowed_roles
-- ('skip' seed-ээр зөвхөн sales_director); 3) requires_reason/backward →
-- 'crm.reason' GUC заавал; 4) зорилтот шатны гейт (дутуу жагсаалт
-- CRM_GATE:-тэй exception-д); 5) aml_hold + хаалтын чиглэл → хориг;
-- 6) терминал шат → state, lost-д шалтгаан заавал.
-- Канбан drag-drop мөн адил энэ trigger-ээр (F-352 «ижил босго»).
create or replace function public.crm_opportunity_stage_guard()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  tr public.crm_stage_transitions;
  st public.crm_stages;
  missing text[];
  v_reason text := nullif(current_setting('crm.reason', true), '');
  v_transfer boolean := coalesce(current_setting('crm.pipeline_transfer', true), '') = '1';
  v_roles crm_role[] := public.crm_my_roles();
begin
  if new.stage_id = old.stage_id and new.pipeline_id = old.pipeline_id then
    return new;
  end if;

  select * into st from public.crm_stages where id = new.stage_id;
  if st.id is null or st.pipeline_id <> new.pipeline_id then
    raise exception 'CRM: шат урсгалд тохирохгүй';
  end if;

  if not v_transfer then
    if new.pipeline_id <> old.pipeline_id then
      raise exception 'CRM: урсгал солих зөвхөн шилжүүлэх үйлдлээр (F-361)';
    end if;

    select * into tr from public.crm_stage_transitions
    where from_stage_id = old.stage_id and to_stage_id = new.stage_id;
    if tr.id is null then
      raise exception 'CRM: шилжилт зөвшөөрөгдөөгүй — шат алгасах хориотой (F-355)';
    end if;

    if auth.uid() is not null and not (v_roles && tr.allowed_roles) then
      raise exception 'CRM: энэ шилжилтийг хийх эрхгүй дүр';
    end if;

    if (tr.requires_reason or tr.kind = 'backward') and v_reason is null then
      raise exception 'CRM: энэ шилжилтэд шалтгаан заавал (F-355)';
    end if;

    if st.gate_code is not null then
      missing := public.crm_check_gate_rec(new, st.gate_code);
      if coalesce(array_length(missing, 1), 0) > 0 then
        raise exception 'CRM_GATE:%', array_to_string(missing, '|');
      end if;
    end if;
  end if;

  -- Д-12/F-360: МУТСТ түгжээтэй боломж хаалтын чиглэлийн шат руу орохгүй
  -- (урсгал шилжүүлэлтийн үед ч).
  if new.aml_hold and st.is_closing_direction then
    raise exception 'CRM: МУТСТ түгжээтэй — Гэрээ/Хаалтын чиглэлийн шат руу шилжүүлэхийг хориглоно (Д-12)';
  end if;

  if st.is_terminal and st.terminal_state is not null then
    if st.terminal_state = 'lost' and new.lost_reason_id is null then
      raise exception 'CRM: алдсан шалтгаан ангиллаар заавал (F-356)';
    end if;
    new.state := st.terminal_state;
  elsif not st.is_terminal then
    new.state := 'open';
  end if;

  new.stage_entered_at := now();
  return new;
end $$;

-- Шатны түүх + аудит (F-357) — AFTER, definer (stage_history-д insert policy үгүй).
create or replace function public.crm_opportunity_stage_history()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_reason text := nullif(current_setting('crm.reason', true), '');
begin
  if tg_op = 'INSERT' then
    insert into public.crm_stage_history (office_id, opportunity_id, from_stage_id, to_stage_id, reason, moved_by)
    values (new.office_id, new.id, null, new.stage_id, null, auth.uid());
    insert into public.crm_audit_log (office_id, actor_id, entity, entity_id, action, new_value)
    values (new.office_id, auth.uid(), 'crm_opportunities', new.id, 'insert',
            jsonb_build_object('pipeline_id', new.pipeline_id, 'stage_id', new.stage_id,
                               'contact_id', new.contact_id, 'owner_id', new.owner_id));
    return new;
  end if;

  if new.stage_id is distinct from old.stage_id or new.pipeline_id is distinct from old.pipeline_id then
    update public.crm_stage_history
       set left_at = now()
     where opportunity_id = new.id and left_at is null;
    insert into public.crm_stage_history (office_id, opportunity_id, from_stage_id, to_stage_id, reason, moved_by)
    values (new.office_id, new.id, old.stage_id, new.stage_id, v_reason, auth.uid());
    insert into public.crm_audit_log (office_id, actor_id, entity, entity_id, action, field, old_value, new_value, reason)
    values (new.office_id, auth.uid(), 'crm_opportunities', new.id, 'stage', 'stage_id',
            to_jsonb(old.stage_id), to_jsonb(new.stage_id), v_reason);
  end if;
  return new;
end $$;

-- Эзэмшигч солигдоход түүх (зарчим 6; лог crm_ownership_history-д).
-- Эрх: зөвхөн RPC (crm.reassign GUC) эсвэл team_lead+ дүр.
create or replace function public.crm_opportunity_owner_change()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_reason text := nullif(current_setting('crm.reason', true), '');
begin
  if new.owner_id is distinct from old.owner_id then
    if auth.uid() is not null
       and coalesce(current_setting('crm.reassign', true), '') <> '1'
       and not public.has_crm_role('team_lead', 'sales_director', 'ops_qc', 'sysadmin') then
      raise exception 'CRM: боломжийн эзэмшигчийг зөвхөн шилжүүлэлтийн үйлдлээр солино';
    end if;
    insert into public.crm_ownership_history
      (office_id, entity, entity_id, old_owner_id, new_owner_id, reason_code, note, decided_by)
    values
      (new.office_id, 'opportunity', new.id, old.owner_id, new.owner_id,
       coalesce(v_reason, 'client_request'),
       nullif(current_setting('crm.reason_note', true), ''), auth.uid());
  end if;
  return new;
end $$;

-- Үйл ажиллагааны insert guard: F-307 backdated туг + F-302 идэвхтэй сэжимд
-- дараагийн алхам/огноогүй хадгалалт хориотой.
create or replace function public.crm_activity_insert_guard()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_status crm_lifecycle;
begin
  new.backdated := new.occurred_at::date < current_date;
  if new.lead_id is not null then
    select status into v_status from public.crm_leads where id = new.lead_id;
    if v_status = 'active'
       and (nullif(new.next_step, '') is null or new.next_step_date is null) then
      raise exception 'CRM: идэвхтэй сэжимд дараагийн алхам + огноо заавал (F-302)';
    end if;
  end if;
  return new;
end $$;

-- Саналын дамжуулалтын огноог систем хадгална (P-02 §2.4 — саатуулах хориотой).
create or replace function public.crm_offer_insert_defaults()
returns trigger language plpgsql as $$
begin
  new.relayed_at := coalesce(new.relayed_at, now());
  return new;
end $$;

-- ── Trigger залгалтууд ──

create trigger crm_opportunities_updated
  before update on public.crm_opportunities
  for each row execute function public.crm_set_updated_at();
create trigger crm_opportunities_immutable
  before update on public.crm_opportunities
  for each row execute function public.crm_protect_immutable('office_id', 'contact_id', 'created_by', 'created_at');
create trigger crm_opportunities_insert_guard
  before insert on public.crm_opportunities
  for each row execute function public.crm_opportunity_insert_guard();
create trigger crm_opportunities_stage_guard
  before update on public.crm_opportunities
  for each row execute function public.crm_opportunity_stage_guard();
create trigger crm_opportunities_owner_change
  before update of owner_id on public.crm_opportunities
  for each row execute function public.crm_opportunity_owner_change();
create trigger crm_opportunities_history
  after insert or update on public.crm_opportunities
  for each row execute function public.crm_opportunity_stage_history();

create trigger crm_activities_insert_guard
  before insert on public.crm_activities
  for each row execute function public.crm_activity_insert_guard();
create trigger crm_activities_immutable
  before update on public.crm_activities
  for each row execute function public.crm_protect_immutable('office_id', 'contact_id', 'owner_id', 'created_at');

create trigger crm_offers_defaults
  before insert on public.crm_offers
  for each row execute function public.crm_offer_insert_defaults();
create trigger crm_offers_immutable
  before update on public.crm_offers
  for each row execute function public.crm_protect_immutable('office_id', 'opportunity_id', 'direction', 'amount', 'relayed_at', 'created_by', 'created_at');

-- ════════════════════════════════════════════════════════════
-- RPC-ууд
-- ════════════════════════════════════════════════════════════

-- Шат шилжүүлэх — SECURITY INVOKER: RLS update policy + stage guard дуудагчийн
-- эрхээр яг адил ажиллана (канбан drag = карт доторх товч = «ижил босго»).
-- p_reason нь transaction-scoped GUC-ээр guard/түүхэнд дамжина.
create or replace function public.crm_move_opportunity_stage(
  p_opp uuid, p_to_stage uuid, p_reason text default null,
  p_lost_reason_id uuid default null, p_lost_note text default null
) returns void language plpgsql as $$
declare n int;
begin
  if nullif(p_reason, '') is not null then
    perform set_config('crm.reason', p_reason, true);
  end if;
  update public.crm_opportunities
     set stage_id = p_to_stage,
         lost_reason_id = coalesce(p_lost_reason_id, lost_reason_id),
         lost_note = coalesce(p_lost_note, lost_note)
   where id = p_opp;
  get diagnostics n = row_count;
  if n = 0 then
    raise exception 'CRM: боломж олдсонгүй эсвэл танд эрх алга';
  end if;
end $$;

-- Урсгал хооронд шилжүүлэх (F-361): түүх хадгалагдаж, шинэ урсгалын эхний
-- тохирох шатанд (ижил кодтой шат, үгүй бол эхний терминал-бус шат).
-- SECURITY DEFINER — transitions хүснэгтэд урсгал хоорондын мөр байхгүй тул
-- guard-ын шилжилтийн шалгалтыг 'crm.pipeline_transfer' GUC-ээр алгасна;
-- гэхдээ AML хориг (Д-12) хэвээр үйлчилнэ. Эрхийг функц дотор шалгана.
create or replace function public.crm_transfer_opportunity_pipeline(
  p_opp uuid, p_to_pipeline_code text, p_reason text
) returns void language plpgsql security definer set search_path = public as $$
declare
  o public.crm_opportunities;
  pl public.crm_pipelines;
  st_code text;
  new_stage uuid;
begin
  if nullif(p_reason, '') is null then
    raise exception 'CRM: урсгал шилжүүлэхэд шалтгаан заавал (F-361)';
  end if;
  select * into o from public.crm_opportunities where id = p_opp;
  if o.id is null then raise exception 'CRM: боломж олдсонгүй'; end if;
  if auth.uid() is not null and o.office_id is distinct from public.crm_office_id() then
    raise exception 'CRM: оффисын эрхгүй';
  end if;
  if auth.uid() is not null
     and o.owner_id <> auth.uid()
     and not public.crm_is_team_of(o.owner_id)
     and not public.crm_is_manager() then
    raise exception 'CRM: энэ боломжийг шилжүүлэх эрх алга';
  end if;
  if o.state <> 'open' then
    raise exception 'CRM: зөвхөн нээлттэй боломжийг урсгал хооронд шилжүүлнэ';
  end if;

  select * into pl from public.crm_pipelines
  where office_id = o.office_id and code = p_to_pipeline_code and is_active;
  if pl.id is null then raise exception 'CRM: зорилтот урсгал олдсонгүй'; end if;
  if pl.id = o.pipeline_id then raise exception 'CRM: боломж энэ урсгалд аль хэдийн байна'; end if;
  if auth.uid() is not null and not public.crm_can_view_pl6(pl.id) then
    raise exception 'CRM: хязгаарлагдмал урсгал руу шилжүүлэх эрх алга';
  end if;

  select code into st_code from public.crm_stages where id = o.stage_id;
  select id into new_stage from public.crm_stages
  where pipeline_id = pl.id and code = st_code and not is_terminal;
  if new_stage is null then
    select id into new_stage from public.crm_stages
    where pipeline_id = pl.id and not is_terminal
    order by sort_order limit 1;
  end if;
  if new_stage is null then raise exception 'CRM: зорилтот урсгалд идэвхтэй шат алга'; end if;

  perform set_config('crm.pipeline_transfer', '1', true);
  perform set_config('crm.reason', p_reason, true);
  update public.crm_opportunities
     set pipeline_id = pl.id, stage_id = new_stage
   where id = p_opp;
  perform set_config('crm.pipeline_transfer', '', true);
  perform set_config('crm.reason', '', true);

  insert into public.crm_audit_log (office_id, actor_id, entity, entity_id, action, field, old_value, new_value, reason)
  values (o.office_id, auth.uid(), 'crm_opportunities', p_opp, 'pipeline_transfer', 'pipeline_id',
          to_jsonb(o.pipeline_id), to_jsonb(pl.id), p_reason);
end $$;

-- Боломжийн эзэмшигч шилжүүлэх (crm_reassign_lead-ийн ижил хэв; P-10/Д-11-д ч хэрэглэгдэнэ).
create or replace function public.crm_reassign_opportunity(
  p_opp uuid, p_new_owner uuid, p_reason text, p_note text default null
) returns void language plpgsql security definer set search_path = public as $$
declare o public.crm_opportunities;
begin
  if auth.uid() is not null and not public.has_crm_role('team_lead', 'sales_director', 'ops_qc', 'sysadmin') then
    raise exception 'CRM: танд боломж шилжүүлэх эрх алга';
  end if;
  if p_reason is null or p_reason not in ('sla_breach', 'inactivity', 'client_request', 'zoning', 'offboarding', 'initial') then
    raise exception 'CRM: шилжүүлэлтийн шалтгааны код буруу';
  end if;
  select * into o from public.crm_opportunities where id = p_opp;
  if o.id is null then raise exception 'CRM: боломж олдсонгүй'; end if;
  if auth.uid() is not null and o.office_id is distinct from public.crm_office_id() then
    raise exception 'CRM: оффисын эрхгүй';
  end if;
  if auth.uid() is not null
     and public.has_crm_role('team_lead')
     and not public.has_crm_role('sales_director', 'ops_qc', 'sysadmin')
     and not public.crm_is_team_of(o.owner_id) then
    raise exception 'CRM: багийн ахлагч зөвхөн өөрийн багийн боломжийг шилжүүлнэ';
  end if;
  if not exists (
    select 1 from public.crm_staff s
    where s.profile_id = p_new_owner and s.office_id = o.office_id and s.is_active
  ) then
    raise exception 'CRM: шинэ эзэмшигч идэвхтэй CRM ажилтан биш байна';
  end if;
  perform set_config('crm.reassign', '1', true);
  perform set_config('crm.reason', p_reason, true);
  perform set_config('crm.reason_note', coalesce(p_note, ''), true);
  update public.crm_opportunities set owner_id = p_new_owner where id = p_opp;
  perform set_config('crm.reassign', '', true);
  perform set_config('crm.reason', '', true);
  perform set_config('crm.reason_note', '', true);
  insert into public.crm_audit_log (office_id, actor_id, entity, entity_id, action, field, old_value, new_value, reason)
  values (o.office_id, auth.uid(), 'crm_opportunities', p_opp, 'reassign', 'owner_id',
          to_jsonb(o.owner_id), to_jsonb(p_new_owner), p_reason || coalesce(': ' || p_note, ''));
end $$;

-- ── crm_can_view_contact ӨРГӨТГӨЛ (000200-ын дизайн тэмдэглэл): боломжийн
-- эзэмшигч/үүсгэгч/багийн ахлагч тухайн харилцагчийг харна. ──
create or replace function public.crm_can_view_contact(c uuid)
returns boolean language plpgsql stable security definer set search_path = public as $$
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
                 or (l.owner_id is not null and public.crm_is_team_of(l.owner_id)))
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
end $$;

-- ════════════════════════════════════════════════════════════
-- RLS
-- ════════════════════════════════════════════════════════════

alter table public.crm_opportunities enable row level security;
alter table public.crm_stage_history enable row level security;
alter table public.crm_activities    enable row level security;
alter table public.crm_offers        enable row level security;
alter table public.crm_task_links    enable row level security;

-- Боломж (§3.2): эзэмшигч/баг/менежер + PL-6 шүүлт; finance/aml унших.
create policy crm_opportunities_select on public.crm_opportunities for select
  using (
    office_id = (select public.crm_office_id())
    and public.crm_can_view_pl6(pipeline_id)
    and (
      owner_id = auth.uid()
      or created_by = auth.uid()
      or public.crm_is_team_of(owner_id)
      or (select public.crm_is_manager())
      or (select public.has_crm_role('finance', 'aml_officer'))
    )
  );
create policy crm_opportunities_insert on public.crm_opportunities for insert
  with check (
    office_id = (select public.crm_office_id())
    and created_by = auth.uid()
    and (select public.crm_my_staff_id()) is not null
    and public.crm_can_view_pl6(pipeline_id)
    and (select public.has_crm_role('agent', 'team_lead', 'sales_director', 'ops_qc', 'property_manager', 'ceo'))
  );
create policy crm_opportunities_update on public.crm_opportunities for update
  using (
    office_id = (select public.crm_office_id())
    and (
      owner_id = auth.uid()
      or public.crm_is_team_of(owner_id)
      or (select public.crm_is_manager())
    )
  )
  with check (office_id = (select public.crm_office_id()));

-- Шатны түүх: боломжийн эрх дагана; бичилт зөвхөн definer trigger (policy үгүй).
create policy crm_stage_history_select on public.crm_stage_history for select
  using (
    office_id = (select public.crm_office_id())
    and public.crm_can_view_opportunity(opportunity_id)
  );

-- Үйл ажиллагаа: contact-ийн эрх дагана; insert зөвхөн өөрийн нэрээр;
-- засвар — зохиогч 24 цагт (нарийн цонх settings-ээс action-д), дараа нь ops_qc.
create policy crm_activities_select on public.crm_activities for select
  using (
    office_id = (select public.crm_office_id())
    and public.crm_can_view_contact(contact_id)
  );
create policy crm_activities_insert on public.crm_activities for insert
  with check (
    office_id = (select public.crm_office_id())
    and owner_id = auth.uid()
    and (select public.crm_my_staff_id()) is not null
    and public.crm_can_view_contact(contact_id)
  );
create policy crm_activities_update on public.crm_activities for update
  using (
    office_id = (select public.crm_office_id())
    and (
      (owner_id = auth.uid() and created_at > now() - interval '24 hours')
      or (select public.has_crm_role('ops_qc'))
    )
  )
  with check (office_id = (select public.crm_office_id()));

-- Санал/хэлэлцээр: боломжийн эрх дагана; бүртгэл нэг л удаа (update/delete policy үгүй).
create policy crm_offers_select on public.crm_offers for select
  using (
    office_id = (select public.crm_office_id())
    and public.crm_can_view_opportunity(opportunity_id)
  );
create policy crm_offers_insert on public.crm_offers for insert
  with check (
    office_id = (select public.crm_office_id())
    and created_by = auth.uid()
    and (select public.crm_my_staff_id()) is not null
    and public.crm_can_edit_opportunity(opportunity_id)
  );

-- Даалгаврын холбоос: даалгавраа хардаг хүн холбоосыг харна (tasks RLS дотор нь үйлчилнэ).
create policy crm_task_links_select on public.crm_task_links for select
  using (exists (select 1 from public.tasks t where t.id = task_id));
create policy crm_task_links_insert on public.crm_task_links for insert
  with check (
    (select public.crm_my_staff_id()) is not null
    and exists (
      select 1 from public.tasks t
      where t.id = task_id and t.office_id = (select public.crm_office_id())
    )
  );

-- ════════════════════════════════════════════════════════════
-- GRANT / REVOKE (§2.2 definer дүрэм)
-- ════════════════════════════════════════════════════════════

revoke execute on function public.crm_can_view_opportunity(uuid) from anon, public;
revoke execute on function public.crm_can_edit_opportunity(uuid) from anon, public;
revoke execute on function public.crm_check_gate_rec(public.crm_opportunities, crm_gate_code) from anon, public;
revoke execute on function public.crm_check_gate(uuid, crm_gate_code) from anon, public;
revoke execute on function public.crm_move_opportunity_stage(uuid, uuid, text, uuid, text) from anon, public;
revoke execute on function public.crm_transfer_opportunity_pipeline(uuid, text, text) from anon, public;
revoke execute on function public.crm_reassign_opportunity(uuid, uuid, text, text) from anon, public;

grant execute on function public.crm_can_view_opportunity(uuid) to authenticated;
grant execute on function public.crm_can_edit_opportunity(uuid) to authenticated;
grant execute on function public.crm_check_gate(uuid, crm_gate_code) to authenticated;
grant execute on function public.crm_move_opportunity_stage(uuid, uuid, text, uuid, text) to authenticated;
grant execute on function public.crm_transfer_opportunity_pipeline(uuid, text, text) to authenticated;
grant execute on function public.crm_reassign_opportunity(uuid, uuid, text, text) to authenticated;

-- Дотоод record-хувилбарыг authenticated-аас хураана (зөвхөн trigger/wrapper дуудна).
revoke execute on function public.crm_check_gate_rec(public.crm_opportunities, crm_gate_code) from authenticated;

-- ГАЖИЛТ: supabase_realtime publication-д crm_* хүснэгт НЭМЭХГҮЙ (foundation-тай ижил).
