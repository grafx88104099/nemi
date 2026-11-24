-- 20261124000500_crm2_activation_digest.sql
-- P3 + P7(f) + P10: гэрээ батлагдсан ч идэвхжээгүй үед мэдэгдэл; идэвхжүүлэх арга (auto/manual);
-- өдөрт НЭГ нэгтгэсэн сануулга (19:00 УБ = 11:00 UTC), шөнийн цагт явахгүй, нэг зүйлийг 3 хоногт нэгээс олон сануулахгүй.
--
-- Өөрчлөгдөх prod функц:
--   crm2_brokerage_approve — СИГНАТУР +p_file_checked (DROP+CREATE; хуучин 3 нэрлэсэн арг-тай дуудлага ажиллана);
--     brokerage.activation_mode='manual' бол автоматаар идэвхжүүлэхгүй; дутуу/бэлэн мэдэгдэл нэмэгдэнэ.
--     brokerage.require_file=true үед батлагч «файлыг шалгаагүй» (p_file_checked=false) гэж илгээвэл татгалзана;
--     NULL (хуучин клиент — асуугаагүй) зөвшөөрнө. approver_file_checked = p_file_checked (NULL = асуугаагүй). -- ШИНЭ
--   crm2_brokerage_guard — approver_file_checked-ийг зөвхөн RPC бичнэ (INSERT-д хоосолно). -- ШИНЭ
--   crm2_brokerage_track — 20261124000100-ийн жагсаалт + approver_file_checked (түүхэнд). -- ШИНЭ
--   crm2_daily_maintenance — activate_on_start мөрийг чимээгүй цэвэрлэдэг байсныг мэдэгдэлтэй болгоно; ui_events/nudge/
--     digest_log ба 30 хоногоос хуучин crm2_duplicate_candidates цэвэрлэгээ. -- ШИНЭ
--     Эдгээр crm2_activation_blocked/ready нь зөвхөн апп доторх мэдэгдэл (SQL-ээс push явдаггүй; push зөвхөн
--     crm2_digest_log.pushed_at-аар, 19:00 digest-д). -- ШИНЭ
-- Шинэ: crm2_daily_digest() + pg_cron 'crm2-digest' (0 11 * * *). owner_pending-тэй хөрөнгийг 'owner' гэж тоолно. -- ШИНЭ
-- Бүгд prod-ын ОДООГИЙН тодорхойлолтоос (pg_get_functiondef, 2026-11-24) + «-- ШИНЭ» мөрүүд.
-- Регресс хамгаалалт: activation_mode анхдагч 'auto' → одоогийн автомат идэвхжүүлэлт хэвээр; digest.scope анхдагч
--   'pilot' + хоосон туршилтын жагсаалт → хэнд ч сануулга явахгүй; одоогийн approveBrokerage (p_file_checked-гүй)
--   apply хийсний дараа ч ажиллана. -- ШИНЭ
--
-- DEPLOY: 20261124000100 (approver_file_checked, file_at_office, source, owner_pending, crm2_ui_events,
--   crm2_nudge_log, crm2_digest_log, crm2_duplicate_candidates) ба 20261124000200 (brokerage.activation_mode,
--   digest.*, staff.quick_add_pilot түлхүүр) -ийн ДАРАА. Энэ migration-ийг TS-ээс ӨМНӨ apply хийнэ: шинэ
--   approveBrokerage p_file_checked дамжуулдаг тул хуучин 3 арг-тай функц дээр PostgREST татгалзана. -- ШИНЭ
--   Дараагийн migration-д (UI амьд болсны дараа) нөхцлийг «p_file_checked is not true» болгож чангална. -- ШИНЭ
-- Rollback (бүтнээр): -- ШИНЭ
--   drop function if exists public.crm2_brokerage_approve(uuid, text, timestamptz, boolean);
--   -- 20261113000100-ийн create function public.crm2_brokerage_approve(p_contract uuid, p_note text default null,
--   --   p_expected_updated_at timestamptz default null) ... -ийг дахин ажиллуулна, дараа нь:
--   revoke all on function public.crm2_brokerage_approve(uuid, text, timestamptz) from public, anon;
--   grant execute on function public.crm2_brokerage_approve(uuid, text, timestamptz) to authenticated, service_role;
--   -- 20261113000100-ийн create or replace function public.crm2_daily_maintenance() ... (буцаах утгад 'blocked' байхгүй
--   --   болно — үүнийг уншдаг TS байвал хамт буцаана);
--   -- 20261113000100-ийн create or replace function public.crm2_brokerage_guard() ...;
--   -- 20261124000100-ийн crm2_brokerage_track trigger (approver_file_checked-гүй жагсаалт);
--   select cron.unschedule(jobid) from cron.job where jobname = 'crm2-digest';
--   drop function if exists public.crm2_daily_digest();
--   notify pgrst, 'reload schema';

set local lock_timeout = '3s';

-- ── 1. Батлах: файлын шалгалт + идэвхжүүлэх арга + дутуу/бэлэн мэдэгдэл ─────────
drop function if exists public.crm2_brokerage_approve(uuid, text, timestamptz);
drop function if exists public.crm2_brokerage_approve(uuid, text, timestamptz, boolean); -- ШИНЭ (дахин apply хийхэд аюулгүй)
create function public.crm2_brokerage_approve(
  p_contract uuid,
  p_note text default null,
  p_expected_updated_at timestamptz default null,
  p_file_checked boolean default null -- ШИНЭ
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_b public.crm2_brokerage_contracts;
  v_p public.crm2_properties;
  v_missing text[];
  v_pmissing text[] := '{}';
  v_pstatus public.crm2_property_status;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  v_today date := public.crm2_today();
  v_flag text;
  v_mode text; -- ШИНЭ
  v_agents uuid[]; -- ШИНЭ
begin
  if not public.crm2_is_member() then
    raise exception 'CRM: эрх алга';
  end if;
  select * into v_b from public.crm2_brokerage_contracts
   where id = p_contract and office_id = public.crm_office_id() for update;
  if not found then
    raise exception 'CRM: гэрээ олдсонгүй';
  end if;
  -- Зөвхөн илгээсэн (агуулга нь түгжигдсэн) гэрээг батална; менежер нэг товшилтоор
  -- бол илгээгээд дараа нь батална.
  if v_b.status <> 'pending' then
    raise exception 'CRM: зөвхөн батлуулахаар илгээсэн гэрээг батална (төлөв: %)', v_b.status;
  end if;
  if p_expected_updated_at is not null and p_expected_updated_at is distinct from v_b.updated_at then
    raise exception 'CRM: гэрээ таныг харснаас хойш өөрчлөгдсөн — дахин шалгаад батална уу';
  end if;
  select * into v_p from public.crm2_properties where id = v_b.property_id for update;
  -- Өөрийн гэрээ эсвэл өөрийн (үүрэгт агент болсон) хөрөнгийн гэрээг батлахгүй.
  if not public.crm2_brokerage_approver(v_b.responsible_agent_id)
     or not public.crm2_self_ok(array[v_b.responsible_agent_id, v_b.submitted_by, v_b.created_by,
                                      v_p.listing_agent_id, v_p.contract_agent_id, v_p.photo_agent_id]) then
    raise exception 'CRM: энэ гэрээг батлах эрхгүй (өөрийн гэрээг өөр эрх бүхий хүн батална)';
  end if;
  v_missing := public.crm2_brokerage_missing(v_b.id);
  if cardinality(v_missing) > 0 then
    raise exception 'CRM: гэрээнд дутуу: %', public.crm2_missing_text(v_missing);
  end if;
  -- ШИНЭ: файл шаардлагатай бол батлагч файлыг гэрээтэй тулгаж шалгаснаа баталгаажуулна.
  -- Шилжилтийн үе: NULL (хуучин клиент асуугаагүй) зөвшөөрнө; зөвхөн тодорхой «шалгаагүй» (false)-г татгалзана.
  if public.crm2_setting_bool('brokerage.require_file', v_b.office_id) and p_file_checked is false then -- ШИНЭ
    raise exception 'CRM: гэрээний файлыг шалгаснаа баталгаажуулна уу'; -- ШИНЭ
  end if; -- ШИНЭ
  v_mode := coalesce(public.crm2_setting('brokerage.activation_mode', v_b.office_id) #>> '{}', 'auto'); -- ШИНЭ

  v_flag := public.crm2_rpc_begin(v_note);
  update public.crm2_brokerage_contracts
     set status = 'active', approved_by = auth.uid(), approved_at = now(), approval_note = v_note,
         rejected_by = null, rejected_at = null, rejection_note = null,  -- ШИНЭ
         approver_file_checked = p_file_checked -- ШИНЭ (NULL = асуугаагүй)
   where id = v_b.id;

  -- Гэрээний trigger brokerage_end_date-г шинэчилсэн тул мөрийг дахин уншина.
  select * into v_p from public.crm2_properties where id = v_b.property_id;
  v_pstatus := v_p.status;
  if v_p.status in ('draft', 'contract_ended') then
    if v_b.start_date <= v_today then
      v_pmissing := public.crm2_property_missing(v_p.id);
      if cardinality(v_pmissing) = 0 and v_mode = 'auto' then -- ШИНЭ (v_mode)
        update public.crm2_properties set status = 'active', status_reason = null where id = v_p.id;
        v_pstatus := 'active';
      end if;
    else
      update public.crm2_brokerage_contracts set activate_on_start = true where id = v_b.id;
    end if;
  end if;
  update public.crm2_requests
     set status = 'cancelled', decided_by = auth.uid(), decided_at = now(), decision_note = 'Гэрээ батлагдсан'
   where kind = 'property_status' and target_id = v_p.id and status = 'pending'
     and v_pstatus = 'active' and payload->>'to' = 'active';
  perform public.crm2_rpc_end(v_flag);

  perform public.crm2_notify(array[v_b.responsible_agent_id, v_b.submitted_by, v_b.created_by],
    'crm2_brokerage_decided', 'Зуучлалын гэрээ батлагдлаа', v_p.code || ' · ' || v_b.number,
    '/agent/crm/staff/' || v_p.id::text);
  -- ШИНЭ: гэрээ батлагдсан ч хөрөнгө идэвхжээгүй бол юу дутууг эсвэл гараар идэвхжүүлэхийг мэдэгдэнэ.
  if v_pstatus <> 'active' and v_p.status in ('draft', 'contract_ended') and v_b.start_date <= v_today then -- ШИНЭ
    v_agents := array[v_b.responsible_agent_id, v_b.submitted_by, v_b.created_by, -- ШИНЭ
                      v_p.listing_agent_id, v_p.contract_agent_id]; -- ШИНЭ
    if cardinality(v_pmissing) > 0 then -- ШИНЭ
      perform public.crm2_notify(v_agents, 'crm2_activation_blocked', -- ШИНЭ
        'Гэрээ батлагдсан, идэвхжүүлэхэд дутуу', -- ШИНЭ
        v_p.code || ': ' || public.crm2_missing_text(v_pmissing), '/agent/crm/staff/' || v_p.id::text); -- ШИНЭ
    else -- ШИНЭ
      perform public.crm2_notify(v_agents, 'crm2_activation_ready', -- ШИНЭ
        'Гэрээ батлагдлаа — хөрөнгийг идэвхжүүлнэ үү', v_p.code || ' · ' || v_b.number, -- ШИНЭ
        '/agent/crm/staff/' || v_p.id::text); -- ШИНЭ
    end if; -- ШИНЭ
  end if; -- ШИНЭ
  return jsonb_build_object(
    'contract_status', 'active',
    'property_status', v_pstatus,
    'property_missing', to_jsonb(v_pmissing),
    'activate_on_start', v_b.start_date > v_today,  -- ШИНЭ
    'activation_mode', v_mode -- ШИНЭ
  );
end $$;
revoke all on function public.crm2_brokerage_approve(uuid, text, timestamptz, boolean) from public, anon;
grant execute on function public.crm2_brokerage_approve(uuid, text, timestamptz, boolean) to authenticated, service_role;

-- ── 1b. approver_file_checked: зөвхөн RPC бичнэ + түүхэнд (ШИНЭ) ───────────────
-- prod-ын crm2_brokerage_guard + «-- ШИНЭ» мөрүүд: ноорог дээр PostgREST-ээр хуурамч баталгаа бичихгүй.
create or replace function public.crm2_brokerage_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sys boolean := public.crm2_in_rpc();
  v_me uuid := auth.uid();
  v_prop record;
  v_prev record;
  v_meta text[] := array['updated_at', 'updated_by'];
begin
  if tg_op = 'INSERT' then
    select x.office_id, x.contract_agent_id, x.listing_agent_id into v_prop
      from public.crm2_properties x where x.id = new.property_id;
    if not found then
      raise exception 'CRM: хөрөнгө олдсонгүй';
    end if;
    new.office_id := v_prop.office_id;
    if v_me is not null then new.created_by := v_me; end if;
    if not v_sys or v_me is not null then
      -- Хэрэглэгчээс ирсэн мөр үргэлж ноорог; батлалтын талбар хоосон.
      if not v_sys then
        new.status := 'draft';
      end if;
      new.submitted_by := null; new.submitted_at := null;
      new.approved_by := null; new.approved_at := null; new.approval_note := null;
      new.approver_file_checked := null; -- ШИНЭ
      new.rejected_by := null; new.rejected_at := null; new.rejection_note := null;
      new.terminated_by := null; new.terminated_at := null; new.termination_reason := null;
      new.activate_on_start := false;
    end if;
    new.responsible_agent_id := coalesce(new.responsible_agent_id, v_prop.contract_agent_id, v_prop.listing_agent_id, new.created_by);
    perform public.crm2_assert_staff(new.responsible_agent_id, new.office_id, 'Гэрээний хариуцсан агент');
    if new.previous_id is not null then
      select b.property_id, b.version, b.status into v_prev
        from public.crm2_brokerage_contracts b where b.id = new.previous_id;
      if not found or v_prev.property_id <> new.property_id then
        raise exception 'CRM: өмнөх гэрээ энэ хөрөнгийнх биш';
      end if;
      if v_prev.status not in ('active', 'expired') then
        raise exception 'CRM: зөвхөн батлагдсан гэрээг сунгана';
      end if;
      new.version := v_prev.version + 1;
    else
      new.version := 1;
    end if;
    new.number := btrim(coalesce(new.number, ''));
    if new.number = '' then
      loop
        new.number := public.crm2_next_code(new.office_id, 'brokerage');
        exit when not exists (select 1 from public.crm2_brokerage_contracts b
                               where b.office_id = new.office_id and b.number = new.number);
      end loop;
    elsif exists (select 1 from public.crm2_brokerage_contracts b
                   where b.office_id = new.office_id and b.number = new.number) then
      raise exception 'CRM: «%» дугаартай гэрээ аль хэдийн бүртгэлтэй', new.number;
    end if;
    new.created_at := now();
  else
    if new.office_id <> old.office_id or new.property_id <> old.property_id
       or new.previous_id is distinct from old.previous_id or new.version <> old.version
       or new.created_by <> old.created_by or new.created_at <> old.created_at then
      raise exception 'CRM: гэрээний хөрөнгө, хувилбарын холбоосыг өөрчлөхгүй';
    end if;
    if not v_sys and (
         new.status <> old.status
         or new.submitted_by is distinct from old.submitted_by or new.submitted_at is distinct from old.submitted_at
         or new.approved_by is distinct from old.approved_by or new.approved_at is distinct from old.approved_at
         or new.approval_note is distinct from old.approval_note
         or new.approver_file_checked is distinct from old.approver_file_checked -- ШИНЭ
         or new.rejected_by is distinct from old.rejected_by or new.rejected_at is distinct from old.rejected_at
         or new.rejection_note is distinct from old.rejection_note
         or new.terminated_by is distinct from old.terminated_by or new.terminated_at is distinct from old.terminated_at
         or new.termination_reason is distinct from old.termination_reason
         or new.activate_on_start <> old.activate_on_start) then
      raise exception 'CRM: гэрээний төлөв, батлалтыг тусгай үйлдлээр өөрчилнө';
    end if;
    if old.status <> 'draft' and not v_sys
       and (to_jsonb(new) - v_meta) is distinct from (to_jsonb(old) - v_meta) then
      raise exception 'CRM: илгээсэн/батлагдсан гэрээг засахгүй — буцааж аваад засах эсвэл шинэ хувилбар үүсгэнэ үү';
    end if;
    if new.responsible_agent_id is distinct from old.responsible_agent_id then
      perform public.crm2_assert_staff(new.responsible_agent_id, new.office_id, 'Гэрээний хариуцсан агент');
    end if;
    new.number := btrim(new.number);
    if new.number = '' then
      raise exception 'CRM: гэрээний дугаар хоосон байж болохгүй';
    end if;
    if new.number <> old.number and exists (
         select 1 from public.crm2_brokerage_contracts b
          where b.office_id = new.office_id and b.number = new.number and b.id <> new.id) then
      raise exception 'CRM: «%» дугаартай гэрээ аль хэдийн бүртгэлтэй', new.number;
    end if;
  end if;
  -- Гэрээний эзэн: харах эрхгүй харилцагчийг холбохгүй (сунгалт өмнөх хувилбарын эзнийг өвлөнө).
  if new.owner_contact_id is not null and v_me is not null
     and (tg_op = 'INSERT' or new.owner_contact_id is distinct from old.owner_contact_id)
     and not public.crm2_can_view_contact(new.owner_contact_id)
     and not exists (select 1 from public.crm2_brokerage_contracts p
                      where p.id = new.previous_id and p.owner_contact_id = new.owner_contact_id) then
    raise exception 'CRM: энэ харилцагчийг харах эрхгүй тул гэрээний эзнээр холбохгүй';
  end if;
  new.updated_at := now();
  new.updated_by := v_me;
  return new;
end $$;

-- 20261124000100-ийн жагсаалт + approver_file_checked. -- ШИНЭ
drop trigger if exists crm2_brokerage_track on public.crm2_brokerage_contracts;
create trigger crm2_brokerage_track
  after insert or update on public.crm2_brokerage_contracts
  for each row execute function public.crm2_track_changes(
    'brokerage', 'status', 'number', 'owner_contact_id', 'start_date', 'end_date', 'terms', 'commission_type',
    'commission_value', 'commission_currency', 'commission_note', 'responsible_agent_id', 'approved_by',
    'approval_note', 'rejection_note', 'termination_reason',
    'prefilled', 'no_special_terms', 'signer_differs', 'file_at_office',
    'approver_file_checked'); -- ШИНЭ

-- ── 2. Өдөр тутмын шалгалт: чимээгүй алгасахгүй + хадгалах хугацааны цэвэрлэгээ ──
create or replace function public.crm2_daily_maintenance()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_today date := public.crm2_today();
  v_flag text;
  v_r record;
  v_expired int := 0;
  v_activated int := 0;
  v_blocked int := 0; -- ШИНЭ
  v_ended int := 0;
  v_reminded int := 0;
  v_failed int := 0;
  v_days int[];
  v_left int;
  v_new int;
  v_leads uuid[];
  v_missing text[]; -- ШИНЭ
  v_mode text; -- ШИНЭ
begin
  if auth.uid() is not null then
    raise exception 'CRM: зөвхөн системийн ажил';
  end if;
  v_flag := public.crm2_rpc_begin('Өдөр тутмын шалгалт');

  -- Мөр бүр тусдаа (subtransaction): нэг мөрийн алдаа бүх оффисын ажлыг зогсоохгүй.
  for v_r in
    select b.id from public.crm2_brokerage_contracts b
     where b.status = 'active' and b.end_date < v_today
  loop
    begin
      update public.crm2_brokerage_contracts set status = 'expired', activate_on_start = false where id = v_r.id;
      v_expired := v_expired + 1;
    exception when others then
      v_failed := v_failed + 1;
      raise warning 'crm2_daily: expire % failed: %', v_r.id, sqlerrm;
    end;
  end loop;

  -- ШИНЭ: идэвхжүүлж чадаагүй/гараар идэвхжүүлэх хөрөнгийг мэдэгдэнэ (өмнө нь чимээгүй алгасдаг байв).
  for v_r in
    select b.id, b.property_id, b.office_id, b.number, b.responsible_agent_id, b.submitted_by, b.created_by, -- ШИНЭ
           x.code, x.status as pstatus, x.listing_agent_id, x.contract_agent_id -- ШИНЭ
      from public.crm2_brokerage_contracts b
      join public.crm2_properties x on x.id = b.property_id -- ШИНЭ
     where b.status = 'active' and b.activate_on_start and b.start_date <= v_today and b.end_date >= v_today
  loop
    begin
      if v_r.pstatus in ('draft', 'contract_ended') then -- ШИНЭ
        v_missing := public.crm2_property_missing(v_r.property_id); -- ШИНЭ
        v_mode := coalesce(public.crm2_setting('brokerage.activation_mode', v_r.office_id) #>> '{}', 'auto'); -- ШИНЭ
        if cardinality(v_missing) = 0 and v_mode = 'auto' then -- ШИНЭ
          update public.crm2_properties set status = 'active', status_reason = null where id = v_r.property_id;
          v_activated := v_activated + 1;
        elsif cardinality(v_missing) > 0 then -- ШИНЭ
          perform public.crm2_notify( -- ШИНЭ
            array[v_r.responsible_agent_id, v_r.submitted_by, v_r.created_by, v_r.listing_agent_id, v_r.contract_agent_id], -- ШИНЭ
            'crm2_activation_blocked', 'Гэрээ эхэлсэн ч хөрөнгө идэвхжсэнгүй', -- ШИНЭ
            v_r.code || ': ' || public.crm2_missing_text(v_missing), '/agent/crm/staff/' || v_r.property_id::text); -- ШИНЭ
          v_blocked := v_blocked + 1; -- ШИНЭ
        else -- ШИНЭ
          perform public.crm2_notify( -- ШИНЭ
            array[v_r.responsible_agent_id, v_r.submitted_by, v_r.created_by, v_r.listing_agent_id, v_r.contract_agent_id], -- ШИНЭ
            'crm2_activation_ready', 'Гэрээ эхэллээ — хөрөнгийг идэвхжүүлнэ үү', v_r.code || ' · ' || v_r.number, -- ШИНЭ
            '/agent/crm/staff/' || v_r.property_id::text); -- ШИНЭ
        end if; -- ШИНЭ
      end if;
      update public.crm2_brokerage_contracts set activate_on_start = false where id = v_r.id;
    exception when others then
      v_failed := v_failed + 1;
      raise warning 'crm2_daily: activate % failed: %', v_r.id, sqlerrm;
    end;
  end loop;

  for v_r in
    select x.id from public.crm2_properties x
     where x.status in ('active', 'suspended')
       and not public.crm2_property_has_valid_contract(x.id)
  loop
    begin
      if public.crm2_end_property_if_uncovered(v_r.id, 'Зуучлалын гэрээний хугацаа дууссан') then
        v_ended := v_ended + 1;
      end if;
    exception when others then
      v_failed := v_failed + 1;
      raise warning 'crm2_daily: end property % failed: %', v_r.id, sqlerrm;
    end;
  end loop;

  for v_r in
    select b.id, b.office_id, b.property_id, b.end_date, b.number, b.responsible_agent_id, x.code
      from public.crm2_brokerage_contracts b  -- ШИНЭ
      join public.crm2_properties x on x.id = b.property_id  -- ШИНЭ
     where b.status = 'active'
       and b.end_date >= v_today
       and not exists (select 1 from public.crm2_brokerage_contracts n
                        where n.previous_id = b.id and n.status in ('pending', 'active'))
  loop
    begin
      v_left := v_r.end_date - v_today;
      select coalesce(array_agg((e #>> '{}')::int), '{}') into v_days
        from jsonb_array_elements(public.crm2_setting('brokerage.remind_days_before', v_r.office_id)) e;
      with ins as (
        insert into public.crm2_reminder_log (contract_id, end_date, days_before, office_id)
        select v_r.id, v_r.end_date, d, v_r.office_id from unnest(v_days) d where d >= v_left
        on conflict do nothing
        returning 1)
      select count(*) into v_new from ins;
      if v_new > 0 then
        select coalesce(array_agg(t.lead_profile_id), '{}') into v_leads
          from public.crm_staff s
          join public.crm_teams t on t.id = s.team_id
         where s.profile_id = v_r.responsible_agent_id and s.office_id = v_r.office_id
           and t.lead_profile_id is not null;
        perform public.crm2_notify(array[v_r.responsible_agent_id] || v_leads, 'crm2_brokerage_expiring',
          'Зуучлалын гэрээ дуусах дөхлөө',
          v_r.code || ' · ' || v_r.number || ' — ' || to_char(v_r.end_date, 'YYYY-MM-DD')
            || ' (' || v_left || ' хоног үлдлээ)',
          '/agent/crm/staff/' || v_r.property_id::text);  -- ШИНЭ
        v_reminded := v_reminded + 1;
      end if;
    exception when others then
      v_failed := v_failed + 1;
      raise warning 'crm2_daily: remind % failed: %', v_r.id, sqlerrm;
    end;
  end loop;

  -- ШИНЭ: хэмжилт, сануулгын тэмдэг, давхардлын түр token-ий хадгалах хугацаа.
  begin -- ШИНЭ
    delete from public.crm2_ui_events where created_at < now() - interval '180 days'; -- ШИНЭ
    delete from public.crm2_nudge_log where last_sent < v_today - 60; -- ШИНЭ
    delete from public.crm2_digest_log where digest_date < v_today - 90; -- ШИНЭ
    delete from public.crm2_duplicate_candidates where created_at < now() - interval '30 days'; -- ШИНЭ
  exception when others then -- ШИНЭ
    v_failed := v_failed + 1; -- ШИНЭ
    raise warning 'crm2_daily: purge failed: %', sqlerrm; -- ШИНЭ
  end; -- ШИНЭ

  perform public.crm2_rpc_end(v_flag);
  return jsonb_build_object('expired', v_expired, 'activated', v_activated,  -- ШИНЭ
                            'blocked', v_blocked, -- ШИНЭ
                            'ended', v_ended, 'reminded', v_reminded, 'failed', v_failed);  -- ШИНЭ
end $$;

-- ── 3. Өдрийн нэгтгэсэн сануулга (ШИНЭ функц) ───────────────────────────────
-- Зөвхөн систем (pg_cron, auth.uid() null). 09–21 УБ-аас гадуур юу ч хийхгүй. Хэрэглэгч бүрт өдөрт НЭГ мэдэгдэл
-- (crm2_digest_log PK), нэг (хөрөнгө, шалтгаан)-ыг 3 хоногт нэг удаа (crm2_nudge_log), crm_notification_prefs-ийн
-- 'crm2_incomplete_digest' суваг хоосон бол явуулахгүй, digest.scope = off | pilot (staff.quick_add_pilot) | all.
-- Мэдэгдлийн бичвэрт зөвхөн тоо — эзний нэр, утас орохгүй.
-- Хүлээн авагч нь тухайн оффисын ИДЭВХТЭЙ ажилтан бөгөөд crm_office_id()-тэй адил дүрмээр (profiles, эс бөгөөс
-- agents) тухайн оффист харьяалагдана. 'approve' зөвхөн батлах эрхтэй хүнд (crm2_self_ok-ийн дүрэм; хоосон бол
-- roles.approve эрхтнүүд). Оффис бүр, хэрэглэгч бүр тусдаа subtransaction — нэгний алдаа бусдыг зогсоохгүй.
create or replace function public.crm2_daily_digest()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_today date := public.crm2_today();
  v_local timestamp := now() at time zone 'Asia/Ulaanbaatar';
  v_monday boolean := extract(isodow from (now() at time zone 'Asia/Ulaanbaatar')) = 1;
  v_o record;
  v_a record;
  v_c record;
  v_scope text;
  v_pilot jsonb;
  v_owner_days int;
  v_pending_days int;
  v_allow text;
  v_approve_roles public.crm_role[];
  v_managers constant public.crm_role[] := array['sales_director', 'ops_qc', 'ceo']::public.crm_role[];
  v_ids uuid[];
  v_body text;
  v_sent int := 0;
  v_failed int := 0;
begin
  if auth.uid() is not null then
    raise exception 'CRM: зөвхөн системийн ажил';
  end if;
  -- Шөнийн цагт хэзээ ч явуулахгүй (cron хоцорсон/дахин ажилласан ч).
  if extract(hour from v_local) < 9 or extract(hour from v_local) >= 21 then
    return jsonb_build_object('skipped', 'quiet_hours');
  end if;

  -- Түр хүснэгтийг pg_temp-ээр бүрэн нэрлэнэ (public дахь ижил нэртэй объект руу хазайхгүй).
  -- (agent, property_id, reason) давтагдахгүй: нэг хөрөнгөд хоёр pending гэрээ байсан ч нэг мөр.
  drop table if exists pg_temp.crm2_digest_items;
  create temp table crm2_digest_items (
    office_id uuid, agent uuid, property_id uuid, reason text,
    unique (agent, property_id, reason)) on commit drop;

  for v_o in select distinct s.office_id from public.crm_staff s where s.is_active loop
    begin
      v_scope := coalesce(public.crm2_setting('digest.scope', v_o.office_id) #>> '{}', 'off');
      if v_scope <> 'off' then
        v_pilot := coalesce(public.crm2_setting('staff.quick_add_pilot', v_o.office_id), '[]'::jsonb);
        v_owner_days := coalesce((public.crm2_setting('digest.owner_days', v_o.office_id) #>> '{}')::int, 1);
        v_pending_days := coalesce((public.crm2_setting('digest.pending_days', v_o.office_id) #>> '{}')::int, 2);
        v_allow := coalesce(public.crm2_setting_text('approvals.allow_self', v_o.office_id), 'managers');
        v_approve_roles := public.crm2_setting_roles('roles.approve', v_o.office_id);

        -- Ноорог: эзэнгүй эсвэл эзэн шийдэгдээгүй (owner_pending) / гэрээгүй / гэрээ оффист үлдсэн
        -- (зараас үүсгэсэн нь зөвхөн даваа гарагт).
        insert into pg_temp.crm2_digest_items (office_id, agent, property_id, reason)
        select v_o.office_id, coalesce(x.listing_agent_id, x.created_by), x.id, r.reason
          from public.crm2_properties x
          left join public.crm2_property_private pp on pp.property_id = x.id
         cross join lateral (values
            (case when pp.owner_contact_id is null or pp.owner_pending is not null then 'owner' end),
            (case when not exists (select 1 from public.crm2_brokerage_contracts b
                                    where b.property_id = x.id and b.status in ('draft', 'pending', 'active'))
                  then 'contract' end),
            (case when exists (select 1 from public.crm2_brokerage_contracts b
                                where b.property_id = x.id and b.status = 'draft' and b.file_at_office)
                  then 'contract_file' end)
          ) r(reason)
         where x.office_id = v_o.office_id
           and x.status = 'draft'
           and x.created_at <= now() - make_interval(days => v_owner_days)
           and r.reason is not null
           and (x.source <> 'listing' or v_monday)
        on conflict do nothing;

        -- Ноорог биш (идэвхтэй г.м.) хөрөнгийн шийдэгдээгүй эзэн (owner_pending) мөн 'owner'.
        -- Нас нь owner_pending.at (зөвхөн «Эзэн» RPC бичнэ) — хувийн мөрийн бусад засвар хугацааг сунгахгүй.
        insert into pg_temp.crm2_digest_items (office_id, agent, property_id, reason)
        select v_o.office_id, coalesce(x.listing_agent_id, x.created_by), x.id, 'owner'
          from public.crm2_properties x
          join public.crm2_property_private pp on pp.property_id = x.id
         where x.office_id = v_o.office_id
           and x.status in ('active', 'suspended', 'contract_ended')
           and pp.owner_pending is not null
           and coalesce(case when pg_input_is_valid(pp.owner_pending ->> 'at', 'timestamptz')
                             then (pp.owner_pending ->> 'at')::timestamptz end,
                        pp.updated_at) <= now() - make_interval(days => v_owner_days)
        on conflict do nothing;

        -- Батлагчид: N хоногоос дээш хүлээгдэж буй гэрээ — зөвхөн батлах эрхтэй хүнд
        -- (crm2_brokerage_approve-ийн crm2_self_ok-той ижил: оролцогч биш, эсвэл allow_self зөвшөөрнө).
        for v_c in
          select b.property_id, b.responsible_agent_id,
                 array_remove(array[b.responsible_agent_id, b.submitted_by, b.created_by,
                                    x.listing_agent_id, x.contract_agent_id, x.photo_agent_id], null) as involved
            from public.crm2_brokerage_contracts b
            join public.crm2_properties x on x.id = b.property_id
           where b.office_id = v_o.office_id
             and b.status = 'pending'
             and b.submitted_at <= now() - make_interval(days => v_pending_days)
        loop
          select coalesce(array_agg(s.profile_id), '{}') into v_ids
            from unnest(public.crm2_approver_ids(v_o.office_id, array[v_c.responsible_agent_id])) a(id)
            join public.crm_staff s on s.profile_id = a.id and s.office_id = v_o.office_id and s.is_active
            join public.profiles p on p.id = s.profile_id
                 and coalesce(p.office_id, (select ag.office_id from public.agents ag
                                             where ag.profile_id = p.id limit 1)) = v_o.office_id
           where v_allow = 'all' or s.profile_id <> all (v_c.involved)
              or (v_allow = 'managers' and s.roles && v_managers);
          if cardinality(v_ids) = 0 then
            -- Ахлагч нь өөрөө оролцогч/идэвхгүй бол roles.approve эрхтнүүд рүү.
            select coalesce(array_agg(s.profile_id), '{}') into v_ids
              from public.crm_staff s
              join public.profiles p on p.id = s.profile_id
                   and coalesce(p.office_id, (select ag.office_id from public.agents ag
                                               where ag.profile_id = p.id limit 1)) = v_o.office_id
             where s.office_id = v_o.office_id and s.is_active
               and s.roles && v_approve_roles
               and (v_allow = 'all' or s.profile_id <> all (v_c.involved)
                    or (v_allow = 'managers' and s.roles && v_managers));
          end if;
          insert into pg_temp.crm2_digest_items (office_id, agent, property_id, reason)
          select v_o.office_id, u, v_c.property_id, 'approve' from unnest(v_ids) u
          on conflict do nothing;
        end loop;

        delete from pg_temp.crm2_digest_items i
         where i.office_id = v_o.office_id
           and (i.agent is null
                or (v_scope = 'pilot' and not (v_pilot ? i.agent::text))
                -- Тухайн оффисын идэвхтэй гишүүн биш (шилжсэн, идэвхгүй, оффисгүй профайл) бол явуулахгүй.
                or not exists (select 1 from public.crm_staff s join public.profiles p on p.id = s.profile_id
                                where s.profile_id = i.agent and s.office_id = i.office_id and s.is_active
                                  and coalesce(p.office_id, (select ag.office_id from public.agents ag
                                                              where ag.profile_id = p.id limit 1)) = i.office_id)
                or exists (select 1 from public.crm2_nudge_log n
                            where n.property_id = i.property_id and n.reason = i.reason
                              and n.profile_id = i.agent and n.last_sent > v_today - 3)
                or exists (select 1 from public.crm_notification_prefs np
                            where np.profile_id = i.agent and np.event_code = 'crm2_incomplete_digest'
                              and cardinality(np.channels) = 0)
                or exists (select 1 from public.crm2_digest_log d
                            where d.profile_id = i.agent and d.digest_date = v_today));
      end if;
    exception when others then
      v_failed := v_failed + 1;
      raise warning 'crm2_digest office % failed: %', v_o.office_id, sqlerrm;
    end;
  end loop;

  for v_a in
    select i.agent,
           (array_agg(i.office_id))[1] as office_id,
           count(distinct i.property_id) filter (where i.reason <> 'approve') as props,
           count(*) filter (where i.reason = 'owner') as n_owner,
           count(*) filter (where i.reason = 'contract') as n_contract,
           count(*) filter (where i.reason = 'contract_file') as n_file,
           count(distinct i.property_id) filter (where i.reason = 'approve') as n_approve,
           array_agg(distinct i.property_id) as pids
      from pg_temp.crm2_digest_items i
     group by i.agent
  loop
    begin
      v_body := concat_ws('. ',
        case when v_a.props > 0 then v_a.props || ' хөрөнгө дутуу: ' || concat_ws(', ',
          case when v_a.n_owner > 0 then v_a.n_owner || ' эзэн' end,
          case when v_a.n_contract > 0 then v_a.n_contract || ' гэрээ' end,
          case when v_a.n_file > 0 then v_a.n_file || ' гэрээний файл' end) end,
        case when v_a.n_approve > 0 then v_a.n_approve || ' гэрээ батлахыг хүлээж байна' end);
      insert into public.crm2_digest_log (profile_id, office_id, digest_date, counts, property_ids)
      values (v_a.agent, v_a.office_id, v_today,
              jsonb_build_object('properties', v_a.props, 'owner', v_a.n_owner, 'contract', v_a.n_contract,
                                 'contract_file', v_a.n_file, 'approve', v_a.n_approve),
              v_a.pids);
      perform public.crm2_notify(array[v_a.agent], 'crm2_incomplete_digest', 'Өнөөдрийн дутуу бүртгэл', v_body,
        case when v_a.props > 0 then '/agent/crm/staff/incomplete' else '/agent/crm/approvals' end);
      insert into public.crm2_nudge_log (property_id, reason, profile_id, last_sent, times)
      select distinct i.property_id, i.reason, i.agent, v_today, 1
        from pg_temp.crm2_digest_items i where i.agent = v_a.agent
      on conflict (property_id, reason, profile_id) do update
        set last_sent = excluded.last_sent, times = public.crm2_nudge_log.times + 1;
      v_sent := v_sent + 1;
    exception when others then
      v_failed := v_failed + 1;
      raise warning 'crm2_digest: % failed: %', v_a.agent, sqlerrm;
    end;
  end loop;
  return jsonb_build_object('sent', v_sent, 'failed', v_failed);
end $$;
revoke all on function public.crm2_daily_digest() from public, anon, authenticated;

do $$
declare
  j record;
begin
  for j in select jobid from cron.job where jobname = 'crm2-digest' loop
    perform cron.unschedule(j.jobid);
  end loop;
  -- 11:00 UTC = 19:00 Улаанбаатар (UTC+8, зуны цаггүй).
  perform cron.schedule('crm2-digest', '0 11 * * *', $cmd$select public.crm2_daily_digest()$cmd$);
end $$;

notify pgrst, 'reload schema';
