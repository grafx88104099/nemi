-- ════════════════════════════════════════════════════════════
-- U4 crm-ownership-governance (PMC-CRM-PRO-001 v2.1 §5, §6.26, §6.28.11,
-- §6.32, §7)
--   • Тохиргооны эрх: Борлуулалт хариуцсан захирал босго, оноо, SLA,
--     хуваарилалтын түлхүүрүүдийг; Маркетинг зардлын түлхүүр болон эх
--     сурвалжийн лавлахыг засна (эерэг жагсаалт).
--   • Гарах ажилтны guard: сэжим (эргэлтэд эзэмшигчтэй ч), боломж,
--     үл хөдлөхийн үүрэг; эзэмшлийн түүхтэй ажилтныг батлагдсан хүлээлцэх
--     актгүйгээр идэвхгүй болгохгүй. CRM-ээс гадуурх замд нэг шалгалт.
--   • Экспортын хүсэлт, зөвшөөрөл, хязгаар, бүртгэл.
--   • Хувь хүний мэдээллийн хүсэлт (танилцах, засах, устгах) ба
--     нэргүйжүүлэх RPC (хадгалах хугацаа, нээлттэй ажил шалгана).
-- ════════════════════════════════════════════════════════════

-- ── 1. Тохиргоо, лавлахын бичих эрх ──

create or replace function public.crm_setting_writable(p_key text)
returns boolean language sql stable security definer set search_path = public as $$
  select public.has_crm_role('sysadmin', 'ops_qc')
      or (public.has_crm_role('sales_director') and p_key in (
            'lead_score_weights', 'lead_score_factors', 'lead_grade_thresholds',
            'inactivity_thresholds', 'recycle_thresholds', 'recontact_frequency', 'recontact_ranges',
            'automation_thresholds', 'sla_policy', 'sla_first_contact_min',
            'lead_assignment', 'lead_accept', 'pool_settings', 'lead_dispute',
            'match_weights', 'match_thresholds', 'weekly_targets', 'agent_score_weights'))
      or (public.has_crm_role('marketing') and p_key in ('marketing_costs'));
$$;

create or replace function public.crm_lookup_writable(p_kind text)
returns boolean language sql stable security definer set search_path = public as $$
  select public.has_crm_role('sysadmin', 'ops_qc')
      or (public.has_crm_role('marketing') and p_kind in ('lead_source'));
$$;

drop policy if exists crm_settings_insert on public.crm_settings;
drop policy if exists crm_settings_update on public.crm_settings;
create policy crm_settings_insert on public.crm_settings for insert
  with check (office_id = (select public.crm_office_id())
              and created_by = auth.uid()
              and public.crm_setting_writable(key));
create policy crm_settings_update on public.crm_settings for update
  using (office_id = (select public.crm_office_id()) and public.crm_setting_writable(key))
  with check (office_id = (select public.crm_office_id()) and public.crm_setting_writable(key));

drop policy if exists crm_lookups_insert on public.crm_lookups;
drop policy if exists crm_lookups_update on public.crm_lookups;
create policy crm_lookups_insert on public.crm_lookups for insert
  with check (office_id = (select public.crm_office_id()) and public.crm_lookup_writable(kind));
create policy crm_lookups_update on public.crm_lookups for update
  using (office_id = (select public.crm_office_id()) and public.crm_lookup_writable(kind))
  with check (office_id = (select public.crm_office_id()) and public.crm_lookup_writable(kind));

-- ── 2. Гарах ажилтан ──

create or replace function public.crm_staff_deactivate_guard()
returns trigger language plpgsql security definer set search_path = public as $$
declare b jsonb; n int;
begin
  if old.is_active and not new.is_active then
    perform set_config('crm.guard_internal', '1', true);
    b := public.crm_offboarding_blockers(new.profile_id);
    perform set_config('crm.guard_internal', '', true);
    n := coalesce((b ->> 'leads')::int, 0) + coalesce((b ->> 'opportunities')::int, 0)
       + coalesce((b ->> 'property_roles')::int, 0);
    if n > 0 then
      raise exception 'CRM: хүлээлцэх дуусаагүй — энэ ажилтанд % нээлттэй бичлэг байна', n;
    end if;
    if coalesce((b ->> 'had_ownership')::boolean, false)
       and not coalesce((b ->> 'approved_act')::boolean, false) then
      raise exception 'CRM: хүлээлцэх дуусаагүй — батлагдсан хүлээлцэх акт шаардлагатай';
    end if;
  end if;
  return new;
end $$;

-- Trigger-ийн дотроос дуудахад дүрийн шалгалтыг алгасна.
create or replace function public.crm_offboarding_blockers_internal_ok()
returns boolean language sql stable as $$
  select coalesce(current_setting('crm.guard_internal', true), '') = '1';
$$;

-- Ажилтны нээлттэй эзэмшлийн тоо (CRM болон CRM-ээс гадуурх замын нэг шалгалт).
-- Trigger-ийн дотроос (GUC) дуудахад дүрийн шалгалтыг алгасна.
create or replace function public.crm_offboarding_blockers(p_profile uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  s record;
  v_leads int := 0; v_opps int := 0; v_roles int := 0;
  v_history boolean := false; v_act boolean := false;
begin
  if auth.uid() is not null
     and not public.crm_offboarding_blockers_internal_ok()
     and not public.has_crm_role('sales_director', 'ops_qc', 'sysadmin', 'ceo')
     and not public.is_admin()
     and coalesce(public.jwt_role()::text, '') <> 'office_admin' then
    raise exception 'CRM: танд энэ мэдээллийг харах эрх алга';
  end if;
  select * into s from public.crm_staff where profile_id = p_profile order by is_active desc limit 1;
  if s.id is null then
    return jsonb_build_object('has_staff', false);
  end if;
  if auth.uid() is not null and not public.crm_offboarding_blockers_internal_ok()
     and not public.is_admin() and s.office_id is distinct from public.crm_office_id() then
    raise exception 'CRM: оффисын эрхгүй';
  end if;
  select count(*) into v_leads from public.crm_leads
   where owner_id = p_profile and status in ('new', 'active', 'recycled');
  select count(*) into v_opps from public.crm_opportunities
   where owner_id = p_profile and state = 'open';
  select count(*) into v_roles
  from public.crm_property_roles r join public.crm_properties p on p.id = r.property_id
   where r.agent_profile_id = p_profile and p.status not in ('sold', 'withdrawn');
  v_history := exists (select 1 from public.crm_ownership_history h
                       where h.old_owner_id = p_profile or h.new_owner_id = p_profile)
            or exists (select 1 from public.crm_leads l where l.owner_id = p_profile)
            or exists (select 1 from public.crm_opportunities o where o.owner_id = p_profile)
            or exists (select 1 from public.crm_property_roles r where r.agent_profile_id = p_profile);
  v_act := exists (select 1 from public.crm_handover_acts a where a.staff_id = s.id and a.approved_at is not null);
  return jsonb_build_object(
    'has_staff', true,
    'staff_id', s.id,
    'office_id', s.office_id,
    'is_active', s.is_active,
    'offboarding', s.offboarding,
    'leads', v_leads,
    'opportunities', v_opps,
    'property_roles', v_roles,
    'had_ownership', v_history,
    'approved_act', v_act
  );
end $$;

-- Багийн ахлагч өөрийн багийн гарах ажилтны актыг бэлтгэнэ (батлах нь БХЗ).
drop policy if exists crm_handover_acts_insert on public.crm_handover_acts;
create policy crm_handover_acts_insert on public.crm_handover_acts for insert
  with check (
    office_id = (select public.crm_office_id())
    and (
      (select public.has_crm_role('sales_director', 'sysadmin'))
      or ((select public.has_crm_role('team_lead'))
          and exists (select 1 from public.crm_staff s
                      where s.id = crm_handover_acts.staff_id
                        and s.team_id is not null
                        and s.team_id = (select public.crm_my_team())))
    )
  );

drop policy if exists crm_handover_acts_select on public.crm_handover_acts;
create policy crm_handover_acts_select on public.crm_handover_acts for select
  using (
    office_id = (select public.crm_office_id())
    and (
      (select public.has_crm_role('sales_director', 'ops_qc', 'ceo', 'sysadmin'))
      or exists (select 1 from public.crm_staff s
                 where s.id = crm_handover_acts.staff_id and s.profile_id = auth.uid())
      or ((select public.has_crm_role('team_lead'))
          and exists (select 1 from public.crm_staff s
                      where s.id = crm_handover_acts.staff_id
                        and s.team_id is not null
                        and s.team_id = (select public.crm_my_team())))
    )
  );

drop policy if exists crm_handover_acts_update on public.crm_handover_acts;
create policy crm_handover_acts_update on public.crm_handover_acts for update
  using (
    office_id = (select public.crm_office_id())
    and (
      (select public.has_crm_role('sales_director', 'sysadmin'))
      or ((select public.has_crm_role('team_lead'))
          and exists (select 1 from public.crm_staff s
                      where s.id = crm_handover_acts.staff_id
                        and s.team_id is not null
                        and s.team_id = (select public.crm_my_team())))
    )
  )
  with check (
    office_id = (select public.crm_office_id())
    and (
      (select public.has_crm_role('sales_director', 'sysadmin'))
      or ((select public.has_crm_role('team_lead'))
          and exists (select 1 from public.crm_staff s
                      where s.id = crm_handover_acts.staff_id
                        and s.team_id is not null
                        and s.team_id = (select public.crm_my_team())))
    )
  );

-- Батлах үйлдлийг зөвхөн Борлуулалт хариуцсан захирал (§7 «Агент гарахад»).
create or replace function public.crm_handover_act_guard()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if old.approved_at is not null then
    raise exception 'CRM: батлагдсан хүлээлцэх акт өөрчлөгдөхгүй';
  end if;
  if new.approved_at is not null and new.approved_by is null then
    raise exception 'CRM: актыг батлахад баталсан этгээд заавал';
  end if;
  if new.approved_at is not null and old.approved_at is null
     and not public.crm_profile_has_role(new.approved_by, new.office_id, 'sales_director') then
    raise exception 'CRM: хүлээлцэх актыг Борлуулалт хариуцсан захирал батална';
  end if;
  return new;
end $$;

-- ── 3. Экспортын хүсэлт (§6.32, §7) ──

create table if not exists public.crm_export_requests (
  id uuid primary key default gen_random_uuid(),
  office_id uuid not null references public.offices(id) on delete restrict,
  requested_by uuid not null references public.profiles(id),
  scope text not null,
  filters jsonb not null default '{}',
  reason text not null,
  row_estimate int,
  status text not null default 'requested',
  max_rows int,
  decided_by uuid references public.profiles(id),
  decided_at timestamptz,
  decision_note text,
  expires_at timestamptz,
  completed_at timestamptz,
  row_count int,
  created_at timestamptz not null default now(),
  constraint crm_export_scope check (scope in ('contacts', 'leads', 'transactions')),
  constraint crm_export_status check (status in ('requested', 'approved', 'rejected', 'completed', 'expired', 'cancelled')),
  constraint crm_export_reason check (length(trim(reason)) >= 10),
  constraint crm_export_not_self check (decided_by is null or decided_by <> requested_by),
  constraint crm_export_decided check (status in ('requested', 'cancelled') or decided_by is not null
                                       or status = 'completed')
);
create index if not exists crm_export_requests_idx on public.crm_export_requests (office_id, status, created_at desc);
create index if not exists crm_export_requests_by_idx on public.crm_export_requests (requested_by, created_at desc);

alter table public.crm_export_requests enable row level security;
create policy crm_export_requests_select on public.crm_export_requests for select
  using (office_id = (select public.crm_office_id())
         and (requested_by = (select auth.uid())
              or (select public.has_crm_role('ops_qc', 'sales_director', 'ceo'))));
create policy crm_export_requests_insert on public.crm_export_requests for insert
  with check (office_id = (select public.crm_office_id())
              and requested_by = (select auth.uid())
              and status = 'requested'
              and decided_by is null
              and (select public.crm_my_staff_id()) is not null);

drop trigger if exists crm_export_requests_audit on public.crm_export_requests;
create trigger crm_export_requests_audit
  after insert or update on public.crm_export_requests
  for each row execute function public.crm_audit_config_change();

create or replace function public.crm_decide_export_request(
  p_request uuid, p_approve boolean, p_note text default null, p_max_rows int default null
) returns void language plpgsql security definer set search_path = public as $$
declare r public.crm_export_requests; v_hours numeric; v_me uuid := auth.uid();
begin
  select * into r from public.crm_export_requests where id = p_request for update;
  if r.id is null or r.office_id is distinct from public.crm_office_id() then
    raise exception 'CRM: хүсэлт олдсонгүй';
  end if;
  if r.status <> 'requested' then raise exception 'CRM: хүсэлт аль хэдийн шийдвэрлэгдсэн'; end if;
  if not public.has_crm_role('ops_qc', 'sales_director') then
    raise exception 'CRM: экспортын хүсэлтийг Үйл ажиллагаа-ЧМТ эсвэл Борлуулалт хариуцсан захирал шийднэ';
  end if;
  if v_me = r.requested_by then raise exception 'CRM: өөрийн хүсэлтийг өөрөө шийдэхгүй'; end if;
  if not p_approve and length(trim(coalesce(p_note, ''))) < 5 then
    raise exception 'CRM: татгалзсан шалтгаанаа бичнэ үү';
  end if;
  v_hours := public.crm_setting_num(r.office_id, 'export_limits', '{request_valid_hours}', 24);
  update public.crm_export_requests
     set status = case when p_approve then 'approved' else 'rejected' end,
         decided_by = v_me, decided_at = now(),
         decision_note = nullif(trim(coalesce(p_note, '')), ''),
         max_rows = case when p_approve then coalesce(p_max_rows, r.row_estimate) end,
         expires_at = case when p_approve then now() + make_interval(hours => v_hours::int) end
   where id = p_request;
end $$;

-- Зөвшөөрөгдсөн хүсэлтийг ашиглаж дуусгах (экспорт хийх action дуудна).
create or replace function public.crm_consume_export_request(p_request uuid, p_rows int)
returns void language plpgsql security definer set search_path = public as $$
declare r public.crm_export_requests;
begin
  select * into r from public.crm_export_requests where id = p_request for update;
  if r.id is null or r.requested_by is distinct from auth.uid() then
    raise exception 'CRM: экспортын зөвшөөрөл олдсонгүй';
  end if;
  if r.status <> 'approved' then raise exception 'CRM: экспортын хүсэлт зөвшөөрөгдөөгүй'; end if;
  if r.expires_at is not null and r.expires_at < now() then
    update public.crm_export_requests set status = 'expired' where id = p_request;
    raise exception 'CRM: экспортын зөвшөөрлийн хугацаа дууссан';
  end if;
  if r.max_rows is not null and p_rows > r.max_rows then
    raise exception 'CRM: зөвшөөрсөн мөрийн тоо (%)-оос их байна', r.max_rows;
  end if;
  update public.crm_export_requests
     set status = 'completed', completed_at = now(), row_count = p_rows
   where id = p_request;
end $$;

-- ── 4. Хувь хүний мэдээллийн хүсэлт, нэргүйжүүлэх (§6.32) ──

create table if not exists public.crm_data_requests (
  id uuid primary key default gen_random_uuid(),
  office_id uuid not null references public.offices(id) on delete restrict,
  contact_id uuid not null references public.crm_contacts(id) on delete restrict,
  kind text not null,
  channel text,
  note text,
  status text not null default 'received',
  received_at timestamptz not null default now(),
  decided_by uuid references public.profiles(id),
  decided_at timestamptz,
  decision_note text,
  completed_at timestamptz,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  constraint crm_data_requests_kind check (kind in ('access', 'rectify', 'erase')),
  constraint crm_data_requests_status check (status in ('received', 'approved', 'rejected', 'completed')),
  constraint crm_data_requests_decided check (status = 'received' or decided_by is not null)
);
create index if not exists crm_data_requests_idx on public.crm_data_requests (office_id, status, received_at desc);

alter table public.crm_data_requests enable row level security;
create policy crm_data_requests_select on public.crm_data_requests for select
  using (office_id = (select public.crm_office_id())
         and (created_by = (select auth.uid())
              or (select public.has_crm_role('ops_qc', 'sales_director', 'ceo'))));
create policy crm_data_requests_insert on public.crm_data_requests for insert
  with check (office_id = (select public.crm_office_id())
              and created_by = (select auth.uid())
              and status = 'received'
              and decided_by is null
              and (public.crm_can_view_contact(contact_id) or (select public.has_crm_role('ops_qc'))));

drop trigger if exists crm_data_requests_audit on public.crm_data_requests;
create trigger crm_data_requests_audit
  after insert or update on public.crm_data_requests
  for each row execute function public.crm_audit_config_change();

-- Устгах хүсэлтийг гүйцэтгэх саад (хоосон массив = гүйцэтгэж болно).
create or replace function public.crm_anonymize_blockers(p_contact uuid)
returns text[] language plpgsql stable security definer set search_path = public as $$
declare
  out text[] := '{}';
  v_office uuid;
  v_years numeric;
  n bigint;
begin
  select office_id into v_office from public.crm_contacts where id = p_contact;
  if v_office is null then return array['not_found']; end if;
  if exists (select 1 from public.crm_leads where contact_id = p_contact and status in ('new', 'active', 'recycled')) then
    out := out || 'open_lead';
  end if;
  if exists (select 1 from public.crm_opportunities where contact_id = p_contact and state = 'open') then
    out := out || 'open_opportunity';
  end if;
  if to_regclass('public.crm_leases') is not null then
    execute 'select count(*) from public.crm_leases where status in (''draft'', ''active'', ''renewed'')
               and (tenant_contact_id = $1 or landlord_contact_id = $1)' into n using p_contact;
    if coalesce(n, 0) > 0 then out := out || 'active_lease'; end if;
  end if;
  if to_regclass('public.crm_aml_cases') is not null then
    execute 'select count(*) from public.crm_aml_cases where contact_id = $1 and status in (''open'', ''investigating'', ''str_sent'')'
      into n using p_contact;
    if coalesce(n, 0) > 0 then out := out || 'aml_case'; end if;
  end if;
  -- Хадгалах хугацаа: хэлцлийн хамгийн сүүлийн огнооноос тоолно.
  v_years := greatest(
    public.crm_setting_num(v_office, 'contact_retention_years', '{}', 5),
    public.crm_setting_num(v_office, 'aml_doc_retention_years', '{}', 5));
  if exists (
    select 1 from public.crm_transaction_parties tp
    join public.crm_transactions t on t.id = tp.transaction_id
    where tp.contact_id = p_contact
      and (t.status not in ('closed', 'cancelled')
           or coalesce(t.updated_at, t.created_at) > now() - make_interval(years => v_years::int))
  ) then
    out := out || 'retention';
  end if;
  return out;
end $$;

create or replace function public.crm_decide_data_request(p_request uuid, p_approve boolean, p_note text)
returns void language plpgsql security definer set search_path = public as $$
declare r public.crm_data_requests;
begin
  select * into r from public.crm_data_requests where id = p_request for update;
  if r.id is null or r.office_id is distinct from public.crm_office_id() then
    raise exception 'CRM: хүсэлт олдсонгүй';
  end if;
  if not public.has_crm_role('ops_qc') then
    raise exception 'CRM: хувь хүний мэдээллийн хүсэлтийг Үйл ажиллагаа-ЧМТ шийднэ';
  end if;
  if r.status <> 'received' then raise exception 'CRM: хүсэлт аль хэдийн шийдвэрлэгдсэн'; end if;
  if length(trim(coalesce(p_note, ''))) < 5 then
    raise exception 'CRM: шийдвэрийн тайлбар бичнэ үү';
  end if;
  update public.crm_data_requests
     set status = case when p_approve then 'approved' else 'rejected' end,
         decided_by = auth.uid(), decided_at = now(), decision_note = trim(p_note)
   where id = p_request;
end $$;

-- Танилцах/засах хүсэлт гүйцэтгэгдсэнийг тэмдэглэх.
create or replace function public.crm_complete_data_request(p_request uuid)
returns void language plpgsql security definer set search_path = public as $$
declare r public.crm_data_requests;
begin
  select * into r from public.crm_data_requests where id = p_request for update;
  if r.id is null or r.office_id is distinct from public.crm_office_id() then
    raise exception 'CRM: хүсэлт олдсонгүй';
  end if;
  if not public.has_crm_role('ops_qc') then
    raise exception 'CRM: хүсэлтийг Үйл ажиллагаа-ЧМТ гүйцэтгэнэ';
  end if;
  if r.status <> 'approved' then raise exception 'CRM: зөвшөөрөгдсөн хүсэлт биш'; end if;
  if r.kind = 'erase' then raise exception 'CRM: устгах хүсэлтийг нэргүйжүүлэх үйлдлээр гүйцэтгэнэ'; end if;
  update public.crm_data_requests set status = 'completed', completed_at = now() where id = p_request;
end $$;

-- Нэргүйжүүлэх: нэр, утас, и-мэйл, шошго, эх сурвалжийн тайлбарыг арилгана;
-- бүртгэлийн дугаар, огноо, хэлцлийн нотолгоо хадгалагдана.
create or replace function public.crm_anonymize_contact(p_request uuid)
returns void language plpgsql security definer set search_path = public as $$
declare r public.crm_data_requests; b text[]; c public.crm_contacts;
begin
  select * into r from public.crm_data_requests where id = p_request for update;
  if r.id is null or r.office_id is distinct from public.crm_office_id() then
    raise exception 'CRM: хүсэлт олдсонгүй';
  end if;
  if not public.has_crm_role('ops_qc') then
    raise exception 'CRM: нэргүйжүүлэх эрх зөвхөн Үйл ажиллагаа-ЧМТ-д бий';
  end if;
  if r.kind <> 'erase' or r.status <> 'approved' then
    raise exception 'CRM: зөвшөөрөгдсөн устгах хүсэлт шаардлагатай';
  end if;
  b := public.crm_anonymize_blockers(r.contact_id);
  if array_length(b, 1) > 0 then
    raise exception 'CRM: нэргүйжүүлэх боломжгүй — %', array_to_string(b, ', ');
  end if;
  select * into c from public.crm_contacts where id = r.contact_id;

  delete from public.crm_contact_phones where contact_id = r.contact_id;
  delete from public.crm_contact_emails where contact_id = r.contact_id;
  delete from public.crm_contact_tags where contact_id = r.contact_id;
  update public.crm_leads set channel_ref = null where contact_id = r.contact_id;

  perform set_config('crm.anonymize', '1', true);
  update public.crm_contacts
     set last_name = null,
         first_name = case when kind = 'person' then 'Нэргүй' else null end,
         org_name = case when kind = 'company' then 'Нэргүйжүүлсэн' else null end,
         display_name = 'Нэргүйжүүлсэн харилцагч',
         source_detail = null,
         consent = 'declined',
         consent_at = now(),
         consent_channel = null,
         lifecycle = 'archived'
   where id = r.contact_id;
  perform set_config('crm.anonymize', '', true);

  update public.crm_data_requests set status = 'completed', completed_at = now() where id = p_request;
  insert into public.crm_audit_log (office_id, actor_id, entity, entity_id, action, reason)
  values (r.office_id, auth.uid(), 'crm_contacts', r.contact_id, 'anonymize', 'data_request:' || r.id::text);
end $$;

-- ── 5. Анхны тохиргоо ──

do $$
declare
  o record;
  v_creator uuid;
  k record;
begin
  for o in select distinct office_id from public.crm_settings loop
    select created_by into v_creator
    from public.crm_settings where office_id = o.office_id
    order by created_at limit 1;
    for k in
      select * from (values
        ('export_limits', '{"direct_max_rows": 500, "request_valid_hours": 24}'::jsonb,
                          'Экспорт: удирдлагын шууд экспортын дээд мөр, зөвшөөрлийн хүчинтэй хугацаа (цаг)'),
        ('contact_retention_years', '5'::jsonb,
                          'Хувь хүний мэдээллийн хадгалах хугацаа (жил) — PMC-QMS-DOC-001-ээр баталгаажуулна')
      ) as t(key, value, note)
    loop
      if not exists (select 1 from public.crm_settings
                     where office_id = o.office_id and key = k.key and valid_to is null) then
        insert into public.crm_settings (office_id, key, value, created_by, note)
        values (o.office_id, k.key, k.value, v_creator, 'PRO-001 v2.1 — ' || k.note);
      end if;
    end loop;
  end loop;
end $$;

-- ── Grant ──

revoke execute on function public.crm_setting_writable(text) from anon, public;
revoke execute on function public.crm_lookup_writable(text) from anon, public;
revoke execute on function public.crm_offboarding_blockers(uuid) from anon, public;
revoke execute on function public.crm_offboarding_blockers_internal_ok() from anon, public;
revoke execute on function public.crm_decide_export_request(uuid, boolean, text, int) from anon, public;
revoke execute on function public.crm_consume_export_request(uuid, int) from anon, public;
revoke execute on function public.crm_anonymize_blockers(uuid) from anon, public;
revoke execute on function public.crm_decide_data_request(uuid, boolean, text) from anon, public;
revoke execute on function public.crm_complete_data_request(uuid) from anon, public;
revoke execute on function public.crm_anonymize_contact(uuid) from anon, public;

grant execute on function public.crm_setting_writable(text) to authenticated;
grant execute on function public.crm_lookup_writable(text) to authenticated;
grant execute on function public.crm_offboarding_blockers(uuid) to authenticated;
grant execute on function public.crm_offboarding_blockers_internal_ok() to authenticated;
grant execute on function public.crm_decide_export_request(uuid, boolean, text, int) to authenticated;
grant execute on function public.crm_consume_export_request(uuid, int) to authenticated;
grant execute on function public.crm_anonymize_blockers(uuid) to authenticated;
grant execute on function public.crm_decide_data_request(uuid, boolean, text) to authenticated;
grant execute on function public.crm_complete_data_request(uuid) to authenticated;
grant execute on function public.crm_anonymize_contact(uuid) to authenticated;
