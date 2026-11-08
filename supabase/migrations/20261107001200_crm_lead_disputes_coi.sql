-- ════════════════════════════════════════════════════════════
-- U4 crm-ownership-governance (PMC-CRM-PRO-001 v2.1 §5, §6.26, §7)
-- Сэжимийн эзэмшлийн маргаан (эхний шат) + ашиг сонирхлын зөрчил.
--
--   • crm_lead_disputes — маргаан: гаргагч, хариуцагч (одоогийн эзэмшигч),
--     хоёр талын нотолгоо, Багийн ахлагч / ҮАМ-ийн хяналтын дүгнэлт,
--     Борлуулалт хариуцсан захирлын шийдвэр, давж заалдах.
--   • crm_coi_declarations — ажилтны ашиг сонирхлын мэдүүлэг (харилцагч эсвэл
--     хамаарал бүхий ажилтантай).
--   • crm_lead_dispute_conflict() — шийдвэрлэгчийн зөрчлийг тодорхойлно:
--     тал болох, сэжмийг өөрөө чиглүүлсэн (бүртгэсэн/эзэмшигч оноосон),
--     талуудын үүрэг, хувийг баталсан, өөрөө оролцсон, хамаарал бүхий этгээд.
--   • Шийдвэрийг зөвхөн RPC-ээр; BEFORE UPDATE trigger нь ямар ч замаар
--     (service role-оор ч) зөрчилтэй этгээдийн шийдвэрийг ХААНА (§5 v2.1).
--   • Давж заалдахыг CEO шийднэ (PMC-SAL-POL-001 §8-ийн хүрээнд).
-- ════════════════════════════════════════════════════════════

-- ── Хүснэгтүүд ──

create table if not exists public.crm_lead_disputes (
  id uuid primary key default gen_random_uuid(),
  office_id uuid not null references public.offices(id) on delete restrict,
  lead_id uuid not null references public.crm_leads(id) on delete restrict,
  contact_id uuid not null references public.crm_contacts(id) on delete restrict,
  kind text not null default 'ownership',
  claimant_id uuid not null references public.profiles(id),
  respondent_id uuid references public.profiles(id),
  status text not null default 'open',
  claim text not null,
  claimant_evidence jsonb not null default '[]',
  respondent_note text,
  respondent_evidence jsonb not null default '[]',
  responded_at timestamptz,
  review_note text,
  review_recommendation text,
  reviewed_by uuid references public.profiles(id),
  reviewed_at timestamptz,
  escalation_reason text,
  escalated_by uuid references public.profiles(id),
  escalated_at timestamptz,
  decision text,
  decision_rationale text,
  decided_by uuid references public.profiles(id),
  decided_at timestamptz,
  decided_owner_id uuid references public.profiles(id),
  appeal_text text,
  appealed_by uuid references public.profiles(id),
  appealed_at timestamptz,
  appeal_decision text,
  appeal_rationale text,
  appeal_decided_by uuid references public.profiles(id),
  appeal_decided_at timestamptz,
  withdrawn_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint crm_lead_disputes_kind check (kind in ('ownership', 'client_request', 'cross_branch')),
  constraint crm_lead_disputes_status check (status in
    ('open', 'under_review', 'escalated', 'decided', 'appealed', 'closed', 'withdrawn')),
  constraint crm_lead_disputes_claim check (length(trim(claim)) >= 10),
  constraint crm_lead_disputes_recommendation check (review_recommendation is null
    or review_recommendation in ('claimant', 'respondent')),
  constraint crm_lead_disputes_decision check (decision is null or decision in ('claimant', 'respondent')),
  constraint crm_lead_disputes_appeal_decision check (appeal_decision is null
    or appeal_decision in ('upheld', 'overturned')),
  constraint crm_lead_disputes_decided check (decision is null
    or (decided_by is not null and decided_at is not null and length(trim(coalesce(decision_rationale, ''))) >= 10)),
  constraint crm_lead_disputes_parties check (respondent_id is null or respondent_id <> claimant_id),
  constraint crm_lead_disputes_evidence check (jsonb_typeof(claimant_evidence) = 'array'
    and jsonb_typeof(respondent_evidence) = 'array')
);
create index if not exists crm_lead_disputes_office_idx on public.crm_lead_disputes (office_id, status, created_at desc);
create index if not exists crm_lead_disputes_lead_idx on public.crm_lead_disputes (lead_id);
create index if not exists crm_lead_disputes_contact_idx on public.crm_lead_disputes (contact_id);
create index if not exists crm_lead_disputes_claimant_idx on public.crm_lead_disputes (claimant_id);
create index if not exists crm_lead_disputes_respondent_idx on public.crm_lead_disputes (respondent_id);
-- Нэг гаргагч нэг сэжимд нэг л нээлттэй маргаантай.
create unique index if not exists crm_lead_disputes_one_active
  on public.crm_lead_disputes (lead_id, claimant_id)
  where status in ('open', 'under_review', 'escalated', 'appealed');

create table if not exists public.crm_coi_declarations (
  id uuid primary key default gen_random_uuid(),
  office_id uuid not null references public.offices(id) on delete restrict,
  profile_id uuid not null references public.profiles(id),
  contact_id uuid references public.crm_contacts(id) on delete restrict,
  related_profile_id uuid references public.profiles(id),
  relation text not null,
  note text,
  declared_at timestamptz not null default now(),
  revoked_at timestamptz,
  revoke_note text,
  created_at timestamptz not null default now(),
  constraint crm_coi_subject check (contact_id is not null or related_profile_id is not null),
  constraint crm_coi_relation check (relation in ('family', 'business', 'personal', 'self', 'other')),
  constraint crm_coi_self check (related_profile_id is null or related_profile_id <> profile_id),
  constraint crm_coi_other_note check (relation <> 'other' or length(trim(coalesce(note, ''))) >= 5)
);
create index if not exists crm_coi_profile_idx on public.crm_coi_declarations (office_id, profile_id) where revoked_at is null;
create index if not exists crm_coi_contact_idx on public.crm_coi_declarations (contact_id) where revoked_at is null;

-- ── Туслах: тухайн оффист ажилтан тухайн дүртэй юу (auth-аас үл хамаарна) ──

create or replace function public.crm_profile_has_role(p_profile uuid, p_office uuid, variadic p_roles crm_role[])
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.crm_staff s
    where s.profile_id = p_profile and s.office_id = p_office and s.is_active
      and s.roles && p_roles
  );
$$;

-- ── Шийдвэрлэгчийн зөрчил (null = зөрчилгүй) ──
-- Буцаах код: party | routed | approved_shares | involved | coi | not_found

create or replace function public.crm_lead_dispute_conflict(p_dispute uuid, p_profile uuid)
returns text language plpgsql stable security definer set search_path = public as $$
declare d public.crm_lead_disputes;
begin
  select * into d from public.crm_lead_disputes where id = p_dispute;
  if d.id is null then return 'not_found'; end if;
  if p_profile is null then return 'party'; end if;

  if p_profile = d.claimant_id or p_profile = d.respondent_id then
    return 'party';
  end if;

  -- Өөрийн чиглүүлсэн: сэжмийг өөрөө бүртгэсэн эсвэл эзэмшигчийг өөрөө оноосон/шилжүүлсэн.
  if exists (select 1 from public.crm_leads l where l.id = d.lead_id and l.created_by = p_profile)
     or exists (select 1 from public.crm_ownership_history h
                where h.entity = 'lead' and h.entity_id = d.lead_id and h.decided_by = p_profile
                  and h.reason_code <> 'dispute') then
    return 'routed';
  end if;

  -- Талуудын үүрэг, хувийг баталсан (тухайн харилцагчийн хэлцлийн урамшуулал).
  if exists (
    select 1
    from public.crm_commission_status_history sh
    join public.crm_commission_records r on r.id = sh.record_id
    join public.crm_transactions t on t.id = r.transaction_id
    join public.crm_opportunities o on o.id = t.opportunity_id
    where o.contact_id = d.contact_id
      and sh.decided_by = p_profile
      and sh.to_status in ('reviewed', 'approved')
      and r.recipient_profile_id in (d.claimant_id, d.respondent_id)
  ) then
    return 'approved_shares';
  end if;

  -- Өөрөө оролцсон: харилцагчийг бүртгэсэн, үйл ажиллагаа хийсэн, боломж эзэмшсэн.
  if exists (select 1 from public.crm_contacts c where c.id = d.contact_id and c.created_by = p_profile)
     or exists (select 1 from public.crm_activities a where a.contact_id = d.contact_id and a.owner_id = p_profile)
     or exists (select 1 from public.crm_opportunities o
                where o.contact_id = d.contact_id and (o.owner_id = p_profile or o.created_by = p_profile)) then
    return 'involved';
  end if;

  -- Хамаарал бүхий этгээд (мэдүүлсэн ашиг сонирхол).
  if exists (
    select 1 from public.crm_coi_declarations k
    where k.profile_id = p_profile and k.office_id = d.office_id and k.revoked_at is null
      and (k.contact_id = d.contact_id
           or k.related_profile_id = d.claimant_id
           or k.related_profile_id = d.respondent_id)
  ) then
    return 'coi';
  end if;

  return null;
end $$;

-- ── Guard: агуулга immutable, шийдвэр зөвхөн зөрчилгүй, эрхтэй этгээдээр ──

create or replace function public.crm_lead_dispute_guard()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_conflict text;
begin
  if new.office_id is distinct from old.office_id
     or new.lead_id is distinct from old.lead_id
     or new.claimant_id is distinct from old.claimant_id
     or new.respondent_id is distinct from old.respondent_id
     or new.claim is distinct from old.claim
     or new.kind is distinct from old.kind
     or new.created_at is distinct from old.created_at then
    raise exception 'CRM: маргааны үндсэн мэдээлэл өөрчлөгдөхгүй';
  end if;
  if new.contact_id is distinct from old.contact_id
     and coalesce(current_setting('crm.merge', true), '') <> '1' then
    raise exception 'CRM: маргааны харилцагч өөрчлөгдөхгүй';
  end if;

  -- Эхний шатны шийдвэр
  if old.decision is not null and (new.decision is distinct from old.decision
       or new.decided_by is distinct from old.decided_by
       or new.decision_rationale is distinct from old.decision_rationale) then
    raise exception 'CRM: маргааны шийдвэр өөрчлөгдөхгүй — давж заалдах замаар';
  end if;
  if old.decision is null and new.decision is not null then
    if new.decided_by is null then
      raise exception 'CRM: шийдвэр гаргасан этгээд заавал';
    end if;
    if old.status = 'escalated' then
      if not public.crm_profile_has_role(new.decided_by, new.office_id, 'ceo') then
        raise exception 'CRM: дээд шатанд шилжсэн маргааныг CEO шийднэ';
      end if;
    elsif not public.crm_profile_has_role(new.decided_by, new.office_id, 'sales_director') then
      raise exception 'CRM: сэжимийн эзэмшлийн маргааныг эхний шатанд Борлуулалт хариуцсан захирал шийднэ';
    end if;
    v_conflict := public.crm_lead_dispute_conflict(new.id, new.decided_by);
    if v_conflict is not null then
      raise exception 'CRM: ашиг сонирхлын зөрчилтэй тул энэ маргааныг шийдэх боломжгүй (%)', v_conflict;
    end if;
  end if;

  -- Давж заалдах шатны шийдвэр
  if old.appeal_decision is not null and new.appeal_decision is distinct from old.appeal_decision then
    raise exception 'CRM: давж заалдах шийдвэр өөрчлөгдөхгүй';
  end if;
  if old.appeal_decision is null and new.appeal_decision is not null then
    if new.appeal_decided_by is null
       or not public.crm_profile_has_role(new.appeal_decided_by, new.office_id, 'ceo') then
      raise exception 'CRM: давж заалдах хүсэлтийг CEO шийднэ';
    end if;
    if new.appeal_decided_by = new.decided_by then
      raise exception 'CRM: эхний шатны шийдвэр гаргагч давж заалдахыг шийдэхгүй';
    end if;
    v_conflict := public.crm_lead_dispute_conflict(new.id, new.appeal_decided_by);
    if v_conflict is not null then
      raise exception 'CRM: ашиг сонирхлын зөрчилтэй тул давж заалдах хүсэлтийг шийдэх боломжгүй (%)', v_conflict;
    end if;
    if length(trim(coalesce(new.appeal_rationale, ''))) < 10 then
      raise exception 'CRM: давж заалдах шийдвэрт үндэслэл заавал';
    end if;
  end if;

  new.updated_at := now();
  return new;
end $$;

drop trigger if exists crm_lead_disputes_guard on public.crm_lead_disputes;
create trigger crm_lead_disputes_guard
  before update on public.crm_lead_disputes
  for each row execute function public.crm_lead_dispute_guard();

drop trigger if exists crm_lead_disputes_audit on public.crm_lead_disputes;
create trigger crm_lead_disputes_audit
  after insert or update on public.crm_lead_disputes
  for each row execute function public.crm_audit_config_change();

create or replace function public.crm_coi_guard()
returns trigger language plpgsql as $$
begin
  if new.office_id is distinct from old.office_id
     or new.profile_id is distinct from old.profile_id
     or new.related_profile_id is distinct from old.related_profile_id
     or new.relation is distinct from old.relation
     or new.declared_at is distinct from old.declared_at
     or new.created_at is distinct from old.created_at then
    raise exception 'CRM: мэдүүлгийг засахгүй — цуцлаад шинээр мэдүүлнэ';
  end if;
  if new.contact_id is distinct from old.contact_id
     and coalesce(current_setting('crm.merge', true), '') <> '1' then
    raise exception 'CRM: мэдүүлгийг засахгүй — цуцлаад шинээр мэдүүлнэ';
  end if;
  if old.revoked_at is not null and new.revoked_at is distinct from old.revoked_at then
    raise exception 'CRM: цуцлагдсан мэдүүлэг өөрчлөгдөхгүй';
  end if;
  return new;
end $$;

drop trigger if exists crm_coi_declarations_guard on public.crm_coi_declarations;
create trigger crm_coi_declarations_guard
  before update on public.crm_coi_declarations
  for each row execute function public.crm_coi_guard();
drop trigger if exists crm_coi_declarations_audit on public.crm_coi_declarations;
create trigger crm_coi_declarations_audit
  after insert or update on public.crm_coi_declarations
  for each row execute function public.crm_audit_config_change();

-- ── RLS ──

alter table public.crm_lead_disputes enable row level security;
alter table public.crm_coi_declarations enable row level security;

-- Талууд, тэдгээрийн багийн ахлагч, удирдлага харна. Бичилт зөвхөн RPC-ээр.
create policy crm_lead_disputes_select on public.crm_lead_disputes for select
  using (
    office_id = (select public.crm_office_id())
    and (
      claimant_id = (select auth.uid())
      or respondent_id = (select auth.uid())
      or (select public.has_crm_role('sales_director', 'ops_qc', 'ceo'))
      or public.crm_is_team_of(claimant_id)
      or (respondent_id is not null and public.crm_is_team_of(respondent_id))
    )
  );

create policy crm_coi_declarations_select on public.crm_coi_declarations for select
  using (
    office_id = (select public.crm_office_id())
    and (profile_id = (select auth.uid())
         or (select public.has_crm_role('sales_director', 'ops_qc', 'ceo')))
  );
create policy crm_coi_declarations_insert on public.crm_coi_declarations for insert
  with check (
    office_id = (select public.crm_office_id())
    and profile_id = (select auth.uid())
    and (select public.crm_my_staff_id()) is not null
    and revoked_at is null
  );
create policy crm_coi_declarations_update on public.crm_coi_declarations for update
  using (office_id = (select public.crm_office_id()) and profile_id = (select auth.uid()))
  with check (office_id = (select public.crm_office_id()) and profile_id = (select auth.uid()));

-- ── RPC-ууд ──

-- Нотолгооны массивыг шалгаж цэвэрлэнэ: [{kind, text, at?, ref_id?}] ≤ 20.
create or replace function public.crm_clean_evidence(p jsonb)
returns jsonb language plpgsql stable as $$
declare out jsonb := '[]'; e jsonb;
begin
  if p is null or jsonb_typeof(p) <> 'array' then return '[]'; end if;
  if jsonb_array_length(p) > 20 then
    raise exception 'CRM: нотолгоо дээд тал нь 20 мөр';
  end if;
  for e in select * from jsonb_array_elements(p) loop
    if jsonb_typeof(e) <> 'object' then continue; end if;
    if coalesce(e->>'kind', '') not in ('first_contact', 'activity', 'message', 'document', 'client_statement', 'other') then
      raise exception 'CRM: нотолгооны төрөл буруу';
    end if;
    if length(trim(coalesce(e->>'text', ''))) < 3 then
      raise exception 'CRM: нотолгооны тайлбар хоосон байна';
    end if;
    out := out || jsonb_build_array(jsonb_strip_nulls(jsonb_build_object(
      'kind', e->>'kind',
      'text', left(trim(e->>'text'), 1000),
      'at', nullif(e->>'at', ''),
      'ref_id', nullif(e->>'ref_id', ''),
      'added_at', now()
    )));
  end loop;
  return out;
end $$;

-- Маргаан нээх: харилцагчийн нээлттэй сэжмийн эзэмшигчийн эсрэг.
create or replace function public.crm_open_lead_dispute(
  p_contact uuid, p_claim text, p_evidence jsonb default '[]', p_kind text default 'ownership'
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_me uuid := auth.uid();
  v_office uuid := public.crm_office_id();
  l public.crm_leads;
  v_id uuid;
begin
  if v_me is null or public.crm_my_staff_id() is null then
    raise exception 'CRM: та CRM-д бүртгэгдээгүй байна';
  end if;
  if p_kind not in ('ownership', 'client_request', 'cross_branch') then
    raise exception 'CRM: маргааны төрөл буруу';
  end if;
  if length(trim(coalesce(p_claim, ''))) < 10 then
    raise exception 'CRM: маргааны үндэслэлийг дэлгэрэнгүй бичнэ үү (10+ тэмдэгт)';
  end if;
  select * into l from public.crm_leads
   where contact_id = p_contact and office_id = v_office and status in ('new', 'active')
   order by created_at limit 1;
  if l.id is null then
    raise exception 'CRM: энэ харилцагчид нээлттэй сэжим алга — маргаан шаардлагагүй';
  end if;
  if l.owner_id = v_me then
    raise exception 'CRM: энэ сэжим аль хэдийн таных';
  end if;
  if exists (select 1 from public.crm_lead_disputes
             where lead_id = l.id and claimant_id = v_me
               and status in ('open', 'under_review', 'escalated', 'appealed')) then
    raise exception 'CRM: энэ сэжмийн талаар таны нээлттэй маргаан бий';
  end if;

  insert into public.crm_lead_disputes
    (office_id, lead_id, contact_id, kind, claimant_id, respondent_id, claim, claimant_evidence)
  values
    (v_office, l.id, p_contact, p_kind, v_me, l.owner_id, trim(p_claim), public.crm_clean_evidence(p_evidence))
  returning id into v_id;
  return v_id;
end $$;

-- Нотолгоо нэмэх (тал бүр өөрийн хэсэгт; хариуцагч тайлбараа бичнэ).
create or replace function public.crm_add_dispute_evidence(
  p_dispute uuid, p_note text default null, p_evidence jsonb default '[]'
) returns void language plpgsql security definer set search_path = public as $$
declare d public.crm_lead_disputes; v_me uuid := auth.uid(); v_ev jsonb;
begin
  select * into d from public.crm_lead_disputes where id = p_dispute;
  if d.id is null or d.office_id is distinct from public.crm_office_id() then
    raise exception 'CRM: маргаан олдсонгүй';
  end if;
  if d.status not in ('open', 'under_review', 'escalated') then
    raise exception 'CRM: шийдвэрлэгдсэн маргаанд нотолгоо нэмэхгүй';
  end if;
  v_ev := public.crm_clean_evidence(p_evidence);
  if v_me = d.claimant_id then
    if jsonb_array_length(v_ev) = 0 then raise exception 'CRM: нотолгоо оруулна уу'; end if;
    update public.crm_lead_disputes
       set claimant_evidence = claimant_evidence || v_ev
     where id = p_dispute;
  elsif v_me = d.respondent_id then
    if jsonb_array_length(v_ev) = 0 and length(trim(coalesce(p_note, ''))) < 5 then
      raise exception 'CRM: тайлбар эсвэл нотолгоо оруулна уу';
    end if;
    update public.crm_lead_disputes
       set respondent_evidence = respondent_evidence || v_ev,
           respondent_note = coalesce(nullif(trim(coalesce(p_note, '')), ''), respondent_note),
           responded_at = now()
     where id = p_dispute;
  else
    raise exception 'CRM: нотолгоог зөвхөн маргааны талууд оруулна';
  end if;
end $$;

-- Хяналт (Багийн ахлагч — R, ҮАМ — R/C): дүгнэлт + санал.
create or replace function public.crm_review_lead_dispute(
  p_dispute uuid, p_note text, p_recommendation text default null
) returns void language plpgsql security definer set search_path = public as $$
declare d public.crm_lead_disputes; v_me uuid := auth.uid();
begin
  select * into d from public.crm_lead_disputes where id = p_dispute;
  if d.id is null or d.office_id is distinct from public.crm_office_id() then
    raise exception 'CRM: маргаан олдсонгүй';
  end if;
  if d.status not in ('open', 'under_review', 'escalated') then
    raise exception 'CRM: шийдвэрлэгдсэн маргааныг дахин хянахгүй';
  end if;
  if v_me in (d.claimant_id, d.respondent_id) then
    raise exception 'CRM: маргааны тал хяналтын дүгнэлт бичихгүй';
  end if;
  if not (public.has_crm_role('ops_qc')
          or (public.has_crm_role('team_lead')
              and (public.crm_is_team_of(d.claimant_id)
                   or (d.respondent_id is not null and public.crm_is_team_of(d.respondent_id))))) then
    raise exception 'CRM: хяналтын дүгнэлтийг талуудын Багийн ахлагч эсвэл Үйл ажиллагаа-ЧМТ бичнэ';
  end if;
  if length(trim(coalesce(p_note, ''))) < 10 then
    raise exception 'CRM: хяналтын дүгнэлтийг дэлгэрэнгүй бичнэ үү';
  end if;
  if p_recommendation is not null and p_recommendation not in ('claimant', 'respondent') then
    raise exception 'CRM: санал буруу';
  end if;
  update public.crm_lead_disputes
     set review_note = trim(p_note),
         review_recommendation = p_recommendation,
         reviewed_by = v_me,
         reviewed_at = now(),
         status = case when status = 'open' then 'under_review' else status end
   where id = p_dispute;
end $$;

-- Дээд шатанд (CEO) шилжүүлэх — зөрчилтэй эсвэл шийдэх захирал байхгүй үед.
create or replace function public.crm_escalate_lead_dispute(p_dispute uuid, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare d public.crm_lead_disputes; v_me uuid := auth.uid();
begin
  select * into d from public.crm_lead_disputes where id = p_dispute;
  if d.id is null or d.office_id is distinct from public.crm_office_id() then
    raise exception 'CRM: маргаан олдсонгүй';
  end if;
  if d.status not in ('open', 'under_review') then
    raise exception 'CRM: энэ төлөвтэй маргааныг шилжүүлэхгүй';
  end if;
  if not public.has_crm_role('sales_director', 'ops_qc', 'team_lead') then
    raise exception 'CRM: танд маргааныг дээд шатанд шилжүүлэх эрх алга';
  end if;
  if length(trim(coalesce(p_reason, ''))) < 5 then
    raise exception 'CRM: шилжүүлэх шалтгаанаа бичнэ үү';
  end if;
  update public.crm_lead_disputes
     set status = 'escalated', escalation_reason = trim(p_reason), escalated_by = v_me, escalated_at = now()
   where id = p_dispute;
end $$;

-- Эзэмшигчийг маргааны шийдвэрээр солих (дотоод).
create or replace function public.crm_dispute_set_owner(p_lead uuid, p_owner uuid, p_note text)
returns void language plpgsql security definer set search_path = public as $$
declare l public.crm_leads;
begin
  select * into l from public.crm_leads where id = p_lead;
  if l.id is null then raise exception 'CRM: сэжим олдсонгүй'; end if;
  if l.owner_id is not distinct from p_owner then return; end if;
  if not exists (select 1 from public.crm_staff s
                 where s.profile_id = p_owner and s.office_id = l.office_id and s.is_active) then
    raise exception 'CRM: шинэ эзэмшигч идэвхтэй CRM ажилтан биш байна';
  end if;
  perform set_config('crm.reassign', '1', true);
  perform set_config('crm.reason', 'dispute', true);
  perform set_config('crm.reason_note', coalesce(p_note, ''), true);
  update public.crm_leads set owner_id = p_owner where id = p_lead;
  perform set_config('crm.reassign', '', true);
  perform set_config('crm.reason', '', true);
  perform set_config('crm.reason_note', '', true);
  -- Нээлттэй даалгавруудыг шинэ эзэмшигч рүү.
  if to_regclass('public.crm_task_links') is not null then
    update public.tasks t set responsible_id = p_owner
     where t.id in (select tl.task_id from public.crm_task_links tl where tl.entity = 'lead' and tl.entity_id = p_lead)
       and t.status in ('pending', 'in_progress')
       and t.responsible_id is not distinct from l.owner_id;
  end if;
  if l.next_step_task_id is not null then
    update public.tasks set responsible_id = p_owner
     where id = l.next_step_task_id and status in ('pending', 'in_progress');
  end if;
  insert into public.crm_audit_log (office_id, actor_id, entity, entity_id, action, field, old_value, new_value, reason)
  values (l.office_id, auth.uid(), 'crm_leads', p_lead, 'reassign', 'owner_id',
          to_jsonb(l.owner_id), to_jsonb(p_owner), 'dispute: ' || coalesce(p_note, ''));
end $$;

-- Эхний шатны шийдвэр (Борлуулалт хариуцсан захирал; дээд шатанд шилжсэнийг CEO).
create or replace function public.crm_decide_lead_dispute(
  p_dispute uuid, p_decision text, p_rationale text
) returns void language plpgsql security definer set search_path = public as $$
declare
  d public.crm_lead_disputes;
  v_me uuid := auth.uid();
  v_conflict text;
  v_owner uuid;
begin
  select * into d from public.crm_lead_disputes where id = p_dispute for update;
  if d.id is null or d.office_id is distinct from public.crm_office_id() then
    raise exception 'CRM: маргаан олдсонгүй';
  end if;
  if d.status not in ('open', 'under_review', 'escalated') then
    raise exception 'CRM: маргаан аль хэдийн шийдвэрлэгдсэн эсвэл хаагдсан';
  end if;
  if d.status = 'escalated' then
    if not public.has_crm_role('ceo') then
      raise exception 'CRM: дээд шатанд шилжсэн маргааныг CEO шийднэ';
    end if;
  elsif not public.has_crm_role('sales_director') then
    raise exception 'CRM: сэжимийн эзэмшлийн маргааныг эхний шатанд Борлуулалт хариуцсан захирал шийднэ';
  end if;
  v_conflict := public.crm_lead_dispute_conflict(p_dispute, v_me);
  if v_conflict is not null then
    raise exception 'CRM: ашиг сонирхлын зөрчилтэй тул энэ маргааныг шийдэх боломжгүй (%)', v_conflict;
  end if;
  if p_decision not in ('claimant', 'respondent') then
    raise exception 'CRM: шийдвэрийн утга буруу';
  end if;
  if length(trim(coalesce(p_rationale, ''))) < 10 then
    raise exception 'CRM: шийдвэрийн үндэслэлийг дэлгэрэнгүй бичнэ үү';
  end if;

  v_owner := case when p_decision = 'claimant' then d.claimant_id else coalesce(d.respondent_id, d.claimant_id) end;

  update public.crm_lead_disputes
     set decision = p_decision,
         decision_rationale = trim(p_rationale),
         decided_by = v_me,
         decided_at = now(),
         decided_owner_id = v_owner,
         status = 'decided'
   where id = p_dispute;

  if p_decision = 'claimant' then
    perform public.crm_dispute_set_owner(d.lead_id, v_owner, trim(p_rationale));
  end if;
end $$;

-- Давж заалдах (талууд, шийдвэрээс хойш тохиргооны хоногт).
create or replace function public.crm_appeal_lead_dispute(p_dispute uuid, p_text text)
returns void language plpgsql security definer set search_path = public as $$
declare d public.crm_lead_disputes; v_me uuid := auth.uid(); v_days int;
begin
  select * into d from public.crm_lead_disputes where id = p_dispute;
  if d.id is null or d.office_id is distinct from public.crm_office_id() then
    raise exception 'CRM: маргаан олдсонгүй';
  end if;
  if v_me not in (d.claimant_id, coalesce(d.respondent_id, d.claimant_id)) then
    raise exception 'CRM: давж заалдах хүсэлтийг маргааны тал гаргана';
  end if;
  if d.status <> 'decided' then
    raise exception 'CRM: зөвхөн шийдвэрлэгдсэн маргааныг давж заалдана';
  end if;
  v_days := coalesce((public.crm_setting_at(d.office_id, 'lead_dispute') ->> 'appeal_days')::int, 5);
  if d.decided_at < now() - make_interval(days => v_days) then
    raise exception 'CRM: давж заалдах хугацаа (% хоног) өнгөрсөн', v_days;
  end if;
  if length(trim(coalesce(p_text, ''))) < 10 then
    raise exception 'CRM: давж заалдах үндэслэлийг дэлгэрэнгүй бичнэ үү';
  end if;
  update public.crm_lead_disputes
     set status = 'appealed', appeal_text = trim(p_text), appealed_by = v_me, appealed_at = now()
   where id = p_dispute;
end $$;

-- Давж заалдахын шийдвэр (CEO): хэвээр үлдээх эсвэл эсрэгээр нь өөрчлөх.
create or replace function public.crm_decide_lead_appeal(
  p_dispute uuid, p_outcome text, p_rationale text
) returns void language plpgsql security definer set search_path = public as $$
declare d public.crm_lead_disputes; v_me uuid := auth.uid(); v_conflict text; v_owner uuid;
begin
  select * into d from public.crm_lead_disputes where id = p_dispute for update;
  if d.id is null or d.office_id is distinct from public.crm_office_id() then
    raise exception 'CRM: маргаан олдсонгүй';
  end if;
  if d.status <> 'appealed' then
    raise exception 'CRM: давж заалдах хүсэлт алга';
  end if;
  if not public.has_crm_role('ceo') then
    raise exception 'CRM: давж заалдах хүсэлтийг CEO шийднэ';
  end if;
  if v_me = d.decided_by then
    raise exception 'CRM: эхний шатны шийдвэр гаргагч давж заалдахыг шийдэхгүй';
  end if;
  v_conflict := public.crm_lead_dispute_conflict(p_dispute, v_me);
  if v_conflict is not null then
    raise exception 'CRM: ашиг сонирхлын зөрчилтэй тул давж заалдах хүсэлтийг шийдэх боломжгүй (%)', v_conflict;
  end if;
  if p_outcome not in ('upheld', 'overturned') then
    raise exception 'CRM: шийдвэрийн утга буруу';
  end if;
  if length(trim(coalesce(p_rationale, ''))) < 10 then
    raise exception 'CRM: шийдвэрийн үндэслэлийг дэлгэрэнгүй бичнэ үү';
  end if;

  update public.crm_lead_disputes
     set appeal_decision = p_outcome,
         appeal_rationale = trim(p_rationale),
         appeal_decided_by = v_me,
         appeal_decided_at = now(),
         status = 'closed'
   where id = p_dispute;

  if p_outcome = 'overturned' then
    v_owner := case when d.decision = 'claimant' then d.respondent_id else d.claimant_id end;
    if v_owner is not null then
      perform public.crm_dispute_set_owner(d.lead_id, v_owner, 'давж заалдах: ' || trim(p_rationale));
    end if;
  end if;
end $$;

-- Гаргагч маргаанаа татах.
create or replace function public.crm_withdraw_lead_dispute(p_dispute uuid)
returns void language plpgsql security definer set search_path = public as $$
declare d public.crm_lead_disputes;
begin
  select * into d from public.crm_lead_disputes where id = p_dispute;
  if d.id is null or d.office_id is distinct from public.crm_office_id() then
    raise exception 'CRM: маргаан олдсонгүй';
  end if;
  if auth.uid() is distinct from d.claimant_id then
    raise exception 'CRM: маргааныг зөвхөн гаргагч татна';
  end if;
  if d.status not in ('open', 'under_review', 'escalated') then
    raise exception 'CRM: энэ төлөвтэй маргааныг татахгүй';
  end if;
  update public.crm_lead_disputes set status = 'withdrawn', withdrawn_at = now() where id = p_dispute;
end $$;

-- Маргааны баримт (системийн нотолгоо, хувийн мэдээлэлгүй): хоёр талын
-- бүртгэл, холболт, үйл ажиллагааны тоо. Талууд, хянагч, удирдлага харна.
create or replace function public.crm_lead_dispute_facts(p_dispute uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare d public.crm_lead_disputes; l record; c record; v_me uuid := auth.uid(); r jsonb;
begin
  select * into d from public.crm_lead_disputes where id = p_dispute;
  if d.id is null or d.office_id is distinct from public.crm_office_id() then
    raise exception 'CRM: маргаан олдсонгүй';
  end if;
  if not (v_me in (d.claimant_id, coalesce(d.respondent_id, d.claimant_id))
          or public.has_crm_role('sales_director', 'ops_qc', 'ceo')
          or public.crm_is_team_of(d.claimant_id)
          or (d.respondent_id is not null and public.crm_is_team_of(d.respondent_id))) then
    raise exception 'CRM: танд энэ маргааныг харах эрх алга';
  end if;
  select * into l from public.crm_leads where id = d.lead_id;
  select id, created_at, created_by into c from public.crm_contacts where id = d.contact_id;

  r := jsonb_build_object(
    'contact_created_at', c.created_at,
    'contact_created_by_respondent', c.created_by = d.respondent_id,
    'contact_created_by_claimant', c.created_by = d.claimant_id,
    'lead_created_at', l.created_at,
    'lead_created_by_respondent', l.created_by = d.respondent_id,
    'lead_status', l.status,
    'first_contact_at', to_jsonb(l) -> 'first_contact_at',
    'last_contact_at', l.last_contact_at,
    'next_step_date', l.next_step_date,
    'unprotected', l.unprotected,
    'respondent_activities', (select count(*) from public.crm_activities a
                              where a.contact_id = d.contact_id and a.owner_id = d.respondent_id),
    'respondent_last_activity_at', (select max(a.occurred_at) from public.crm_activities a
                                    where a.contact_id = d.contact_id and a.owner_id = d.respondent_id),
    'claimant_activities', (select count(*) from public.crm_activities a
                            where a.contact_id = d.contact_id and a.owner_id = d.claimant_id),
    'owner_changes', (select count(*) from public.crm_ownership_history h
                      where h.entity = 'lead' and h.entity_id = d.lead_id),
    'merged_from_claimant', exists (
      select 1 from public.crm_contact_merges m
      where m.primary_id = d.contact_id
        and (m.secondary_source ->> 'merged_created_by')::uuid = d.claimant_id)
  );
  return r;
end $$;

-- Маргаан нээгдэхэд хариуцагч агент (одоогийн эзэмшигч) ч мэдэгдэл авна
-- (матрицад «agent» байхгүй бол шууд хүлээн авагч агентад очдоггүй).
update public.crm_notification_matrix
   set recipient_roles = array_append(recipient_roles, 'agent'::crm_role)
 where event_code = 'lead_dispute_opened'
   and not ('agent'::crm_role = any (recipient_roles));

-- ── Grant ──

revoke execute on function public.crm_profile_has_role(uuid, uuid, crm_role[]) from anon, public;
revoke execute on function public.crm_lead_dispute_conflict(uuid, uuid) from anon, public;
revoke execute on function public.crm_clean_evidence(jsonb) from anon, public;
revoke execute on function public.crm_open_lead_dispute(uuid, text, jsonb, text) from anon, public;
revoke execute on function public.crm_add_dispute_evidence(uuid, text, jsonb) from anon, public;
revoke execute on function public.crm_review_lead_dispute(uuid, text, text) from anon, public;
revoke execute on function public.crm_escalate_lead_dispute(uuid, text) from anon, public;
revoke execute on function public.crm_dispute_set_owner(uuid, uuid, text) from anon, public, authenticated;
revoke execute on function public.crm_decide_lead_dispute(uuid, text, text) from anon, public;
revoke execute on function public.crm_appeal_lead_dispute(uuid, text) from anon, public;
revoke execute on function public.crm_decide_lead_appeal(uuid, text, text) from anon, public;
revoke execute on function public.crm_withdraw_lead_dispute(uuid) from anon, public;
revoke execute on function public.crm_lead_dispute_facts(uuid) from anon, public;

grant execute on function public.crm_profile_has_role(uuid, uuid, crm_role[]) to authenticated;
grant execute on function public.crm_lead_dispute_conflict(uuid, uuid) to authenticated;
grant execute on function public.crm_open_lead_dispute(uuid, text, jsonb, text) to authenticated;
grant execute on function public.crm_add_dispute_evidence(uuid, text, jsonb) to authenticated;
grant execute on function public.crm_review_lead_dispute(uuid, text, text) to authenticated;
grant execute on function public.crm_escalate_lead_dispute(uuid, text) to authenticated;
grant execute on function public.crm_decide_lead_dispute(uuid, text, text) to authenticated;
grant execute on function public.crm_appeal_lead_dispute(uuid, text) to authenticated;
grant execute on function public.crm_decide_lead_appeal(uuid, text, text) to authenticated;
grant execute on function public.crm_withdraw_lead_dispute(uuid) to authenticated;
grant execute on function public.crm_lead_dispute_facts(uuid) to authenticated;
