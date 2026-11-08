-- ════════════════════════════════════════════════════════════
-- U4 crm-ownership-governance (PMC-CRM-PRO-001 v2.1 §6.26, §6.29.1)
--   1. crm_protect_immutable — нэгтгэлийн үед (crm.merge) харилцагчийн
--      холбоосыг шилжүүлэхийг зөвшөөрнө (өмнө нь сэжим, профайл, боломж,
--      үйл ажиллагааны contact_id immutable байсан тул нэгтгэл унадаг байв).
--   2. Нэг харилцагчид НЭГ л нээлттэй сэжим (new/active) — нөхцөлт unique
--      index + ойлгомжтой мессежтэй guard.
--   3. crm_find_duplicates — агентуудын хооронд давхардлыг масктай олох
--      definer RPC (RLS-ээр харагдахгүй харилцагчийг нэр/утсаар нь
--      нуусан хэлбэрээр, эзэмшигчийн нэртэй буцаана).
--   4. crm_merge_contacts — дахин бичив: GUC-ийг эхнээс нь тавина, хоёр
--      талд нээлттэй сэжим байвал (өөр эзэмшигчтэй бол) маргаан шаардана,
--      ижил эзэмшигчтэй бол хожуу сэжмийг архивлана; түрээсийн удирдлагын
--      гэрээ, маргаан/ашиг сонирхлын бүртгэлийг шилжүүлнэ.
-- ════════════════════════════════════════════════════════════

-- ── 1. Immutable guard: нэгтгэлийн GUC-тэй үед зөвхөн харилцагчийн холбоос ──

create or replace function public.crm_protect_immutable()
returns trigger language plpgsql as $$
declare
  col text;
  o jsonb := to_jsonb(old);
  n jsonb := to_jsonb(new);
  v_merge boolean := coalesce(current_setting('crm.merge', true), '') = '1';
begin
  foreach col in array tg_argv loop
    if n->col is distinct from o->col then
      if v_merge and col in ('contact_id', 'tenant_contact_id', 'landlord_contact_id', 'owner_contact_id') then
        continue;
      end if;
      raise exception 'CRM: өөрчлөх хориотой талбар (%)', col;
    end if;
  end loop;
  return new;
end $$;

-- ── 2. Нэг харилцагчид нэг нээлттэй сэжим ──

do $$
begin
  if exists (
    select 1 from public.crm_leads
    where status in ('new', 'active')
    group by contact_id having count(*) > 1
  ) then
    raise exception 'U4: нэг харилцагчид олон нээлттэй сэжим байна — эхлээд цэвэрлэнэ';
  end if;
end $$;

create unique index if not exists crm_leads_one_open_per_contact
  on public.crm_leads (contact_id) where status in ('new', 'active');

-- Index-ийн алдааны оронд ойлгомжтой мессеж (дэлгэцэд «CRM:»-ийн араас гарна).
create or replace function public.crm_lead_open_dup_guard()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_owner uuid;
begin
  if new.status not in ('new', 'active') then return new; end if;
  if tg_op = 'UPDATE' and old.status in ('new', 'active') and old.contact_id = new.contact_id then
    return new;
  end if;
  select l.owner_id into v_owner
  from public.crm_leads l
  where l.contact_id = new.contact_id
    and l.status in ('new', 'active')
    and l.id <> new.id
  limit 1;
  if found then
    if v_owner is not null and v_owner is distinct from coalesce(new.owner_id, auth.uid()) then
      raise exception 'CRM: энэ харилцагч өөр агентын нээлттэй сэжимд бүртгэлтэй — давхар сэжим үүсгэхгүй. Эзэмшлийн маргаан нээж болно';
    end if;
    raise exception 'CRM: энэ харилцагчид нээлттэй сэжим аль хэдийн бүртгэлтэй — тэр сэжмээр үргэлжлүүлнэ үү';
  end if;
  return new;
end $$;

drop trigger if exists crm_leads_open_dup_guard on public.crm_leads;
create trigger crm_leads_open_dup_guard
  before insert or update of status, contact_id on public.crm_leads
  for each row execute function public.crm_lead_open_dup_guard();

-- ── 3. Масклах туслахууд + давхардлын RPC ──

-- «Батбаяр Дорж» → «Б*** Д***»
create or replace function public.crm_mask_name(p text)
returns text language sql immutable as $$
  select coalesce(
    nullif(array_to_string(array(
      select left(w, 1) || '***'
      from unnest(regexp_split_to_array(trim(coalesce(p, '')), '\s+')) as w
      where w <> ''
    ), ' '), ''),
    '***');
$$;

-- «+976 9911 2233» → «•••• ••33»
create or replace function public.crm_mask_phone(p text)
returns text language sql immutable as $$
  select case
    when length(regexp_replace(coalesce(p, ''), '\D', '', 'g')) < 2 then null
    else '•••• ••' || right(regexp_replace(p, '\D', '', 'g'), 2)
  end;
$$;

-- Давхардлын түүхий тохирол (дотоод туслах; authenticated-д нээгдэхгүй).
create or replace function public.crm_dup_hits(
  p_office uuid, p_phone_norm text, p_email text, p_name text
) returns table (cid uuid, kind text, pri int)
language sql stable security definer set search_path = public as $$
  select p.contact_id, 'phone'::text, 1
  from public.crm_contact_phones p
  where p_phone_norm <> '' and p.office_id = p_office and p.normalized = p_phone_norm
  union all
  select e.contact_id, 'email'::text, 2
  from public.crm_contact_emails e
  where p_email <> '' and e.office_id = p_office and e.email = p_email
  union all
  select x.id, 'name'::text, 3
  from (
    select c.id from public.crm_contacts c
    where length(p_name) >= 3 and c.office_id = p_office and c.merged_into_id is null
      and c.display_name ilike '%' || replace(replace(p_name, '%', ''), '_', '') || '%'
    limit 25
  ) x;
$$;

-- Давхардлыг оффисын хэмжээнд хайна (RLS-ийг тойрно). Дуудагч харах эрхтэй
-- харилцагчийг бүтэн, бусдыг нь масктай буцаана. Харагдахгүй давхардал
-- олдвол аудитад бичнэ (хайлтын хэтрүүлэг хянах).
create or replace function public.crm_find_duplicates(
  p_phone text default null,
  p_email text default null,
  p_name text default null,
  p_exclude uuid default null
) returns table (
  contact_id uuid,
  match_kind text,
  can_view boolean,
  display_name text,
  masked_phone text,
  created_at timestamptz,
  branch_name text,
  open_lead_id uuid,
  open_lead_status text,
  owner_id uuid,
  owner_name text,
  owner_is_me boolean
) language plpgsql volatile security definer set search_path = public as $$
#variable_conflict use_column
declare
  v_office uuid := public.crm_office_id();
  v_me uuid := auth.uid();
  v_staff uuid := public.crm_my_staff_id();
  v_phone text := public.crm_normalize_phone(p_phone);
  v_email text := lower(trim(coalesce(p_email, '')));
  v_name text := trim(coalesce(p_name, ''));
  v_hidden int := 0;
begin
  if v_me is null or v_staff is null then
    raise exception 'CRM: та CRM-д бүртгэгдээгүй байна';
  end if;
  if v_phone = '' and v_email = '' and length(v_name) < 3 then
    return;
  end if;

  select count(distinct h.cid) into v_hidden
  from public.crm_dup_hits(v_office, v_phone, v_email, v_name) h
  where (p_exclude is null or h.cid <> p_exclude)
    and not public.crm_can_view_contact(h.cid);
  if v_hidden > 0 then
    insert into public.crm_audit_log (office_id, actor_id, entity, entity_id, action, new_value)
    values (v_office, v_me, 'crm_staff', v_staff, 'duplicate_check',
            jsonb_build_object('hidden_hits', v_hidden,
                               'by_phone', v_phone <> '', 'by_email', v_email <> '', 'by_name', length(v_name) >= 3));
  end if;

  return query
  with best as (
    select distinct on (h.cid) h.cid, h.kind, h.pri
    from public.crm_dup_hits(v_office, v_phone, v_email, v_name) h
    order by h.cid, h.pri
  )
  select
    c.id,
    b.kind,
    vis.ok,
    case when vis.ok then c.display_name else public.crm_mask_name(c.display_name) end,
    public.crm_mask_phone((
      select ph.raw from public.crm_contact_phones ph
      where ph.contact_id = c.id order by ph.is_primary desc limit 1)),
    c.created_at,
    br.name,
    ol.id,
    ol.status::text,
    ol.owner_id,
    pr.full_name,
    coalesce(ol.owner_id = v_me, false)
  from best b
  join public.crm_contacts c on c.id = b.cid
  cross join lateral (select public.crm_can_view_contact(c.id) as ok) vis
  left join public.crm_branches br on br.id = c.branch_id
  left join lateral (
    select l.id, l.status, l.owner_id
    from public.crm_leads l
    where l.contact_id = c.id and l.status in ('new', 'active')
    order by l.created_at
    limit 1
  ) ol on true
  left join public.profiles pr on pr.id = ol.owner_id
  where c.merged_into_id is null
    and (p_exclude is null or c.id <> p_exclude)
  order by b.pri, c.created_at
  limit 10;
end $$;

-- ── 4. Нэгтгэл (ҮАМ) ──

create or replace function public.crm_merge_contacts(
  p_primary uuid, p_merged uuid, p_choices jsonb, p_aml_approval_note text default null
) returns void language plpgsql security definer set search_path = public as $$
declare
  prim record; merg record;
  rec record;
  moved jsonb := '{}';
  n bigint;
  lp record; lm record;
  v_archived uuid;
begin
  if auth.uid() is not null and not public.has_crm_role('ops_qc') then
    raise exception 'CRM: бүртгэл нэгтгэх эрх зөвхөн Үйл ажиллагаа-ЧМТ-ийн зохицуулагчид бий';
  end if;
  if p_primary = p_merged then raise exception 'CRM: ижил бүртгэлийг нэгтгэхгүй'; end if;
  select * into prim from public.crm_contacts where id = p_primary;
  select * into merg from public.crm_contacts where id = p_merged;
  if prim is null or merg is null then raise exception 'CRM: бүртгэл олдсонгүй'; end if;
  if prim.office_id <> merg.office_id then raise exception 'CRM: өөр оффисын бүртгэл'; end if;
  if auth.uid() is not null and prim.office_id is distinct from public.crm_office_id() then
    raise exception 'CRM: оффисын эрхгүй';
  end if;
  if merg.merged_into_id is not null then raise exception 'CRM: аль хэдийн нэгтгэгдсэн бүртгэл'; end if;
  if prim.merged_into_id is not null then raise exception 'CRM: үндсэн бүртгэл өөр бүртгэлд нэгтгэгдсэн байна'; end if;

  -- МУТСТ кейстэй бол МУТСТ-ийн ажилтны зөвшөөрлийн тэмдэглэл заавал.
  if to_regclass('public.crm_aml_cases') is not null then
    execute 'select count(*) from public.crm_aml_cases where contact_id in ($1, $2) and status in (''open'', ''investigating'')'
      into n using p_primary, p_merged;
    if coalesce(n, 0) > 0 and nullif(trim(coalesce(p_aml_approval_note, '')), '') is null then
      raise exception 'CRM: МУТСТ-ийн кейстэй бүртгэл — МУТСТ-ийн ажилтны зөвшөөрлийн тэмдэглэл заавал';
    end if;
  end if;
  -- Хоёулаа идэвхтэй түрээсийн гэрээтэй бол гараар шийднэ.
  if to_regclass('public.crm_leases') is not null then
    execute 'select count(distinct x.c) from (
               select tenant_contact_id as c from public.crm_leases where status = ''active'' and tenant_contact_id in ($1, $2)
               union all
               select landlord_contact_id from public.crm_leases where status = ''active'' and landlord_contact_id in ($1, $2)
             ) x'
      into n using p_primary, p_merged;
    if coalesce(n, 0) >= 2 then
      raise exception 'CRM: хоёулаа идэвхтэй гэрээтэй — автоматаар нэгтгэхгүй, гараар шийднэ';
    end if;
    -- Батлагдсан түрээсийн гэрээний тал шууд солигдохгүй (гэрээний guard) —
    -- гэрээтэй бүртгэлийг үндсэн болгож нэгтгэнэ.
    execute 'select count(*) from public.crm_leases where status <> ''draft''
               and (tenant_contact_id = $1 or landlord_contact_id = $1)'
      into n using p_merged;
    if coalesce(n, 0) > 0 then
      raise exception 'CRM: нэгтгэгдэх бүртгэл түрээсийн гэрээтэй — тэр бүртгэлийг үндсэн болгож нэгтгэнэ үү';
    end if;
  end if;

  -- §6.26: хоёр талд нээлттэй сэжим байвал эзэмшлийг тодорхой болгоно.
  select * into lp from public.crm_leads
   where contact_id = p_primary and status in ('new', 'active') limit 1;
  select * into lm from public.crm_leads
   where contact_id = p_merged and status in ('new', 'active') limit 1;
  if lp.id is not null and lm.id is not null then
    if lp.owner_id is not null and lm.owner_id is not null and lp.owner_id <> lm.owner_id then
      raise exception 'CRM: хоёр бүртгэл өөр агентын нээлттэй сэжимтэй — эхлээд эзэмшлийн маргааныг шийдвэрлэнэ';
    end if;
  end if;

  -- Энэ мөчөөс GUC: immutable/lifecycle guard нэгтгэлийн өөрчлөлтийг зөвшөөрнө.
  perform set_config('crm.merge', '1', true);

  if lp.id is not null and lm.id is not null then
    -- Ижил (эсвэл нэг талд эзэмшигчгүй) — хожуу бүртгэгдсэн сэжмийг архивлана.
    if lm.created_at >= lp.created_at then
      v_archived := lm.id;
    else
      v_archived := lp.id;
    end if;
    update public.crm_leads set status = 'archived' where id = v_archived;
    moved := moved || jsonb_build_object('archived_duplicate_lead', v_archived);
  end if;

  -- Утас: давхардаагүйг шилжүүлж, үлдсэнийг устгана.
  update public.crm_contact_phones p set contact_id = p_primary, is_primary = false
   where p.contact_id = p_merged
     and not exists (select 1 from public.crm_contact_phones q
                     where q.contact_id = p_primary and q.normalized = p.normalized);
  delete from public.crm_contact_phones where contact_id = p_merged;
  update public.crm_contact_emails e set contact_id = p_primary, is_primary = false
   where e.contact_id = p_merged
     and not exists (select 1 from public.crm_contact_emails q
                     where q.contact_id = p_primary and q.email = e.email);
  delete from public.crm_contact_emails where contact_id = p_merged;
  insert into public.crm_contact_tags (contact_id, lookup_id, office_id)
  select p_primary, lookup_id, office_id from public.crm_contact_tags where contact_id = p_merged
  on conflict do nothing;
  delete from public.crm_contact_tags where contact_id = p_merged;

  update public.crm_leads set contact_id = p_primary where contact_id = p_merged;
  get diagnostics n = row_count;
  if n > 0 then moved := moved || jsonb_build_object('crm_leads.contact_id', n); end if;

  -- Хэлцлийн талууд: хаагдсан хэлцэлд ч шилжинэ (залруулгын GUC, нэгтгэлийн
  -- түүхэд бүртгэгдэнэ); нэг хэлцэлд ижил үүрэгтэй давхардлыг хасна.
  if to_regclass('public.crm_transaction_parties') is not null then
    perform set_config('crm.txn_correction', '1', true);
    delete from public.crm_transaction_parties m
     where m.contact_id = p_merged
       and exists (select 1 from public.crm_transaction_parties q
                   where q.transaction_id = m.transaction_id and q.role = m.role and q.contact_id = p_primary);
    update public.crm_transaction_parties set contact_id = p_primary where contact_id = p_merged;
    get diagnostics n = row_count;
    perform set_config('crm.txn_correction', '', true);
    if n > 0 then moved := moved || jsonb_build_object('crm_transaction_parties.contact_id', n); end if;
  end if;

  for rec in
    select * from (values
      ('crm_need_profiles',         'contact_id'),
      ('crm_owner_profiles',        'contact_id'),
      ('crm_activities',            'contact_id'),
      ('crm_opportunities',         'contact_id'),
      ('crm_leases',                'tenant_contact_id'),
      ('crm_leases',                'landlord_contact_id'),
      ('crm_properties',            'owner_contact_id'),
      ('crm_management_agreements', 'owner_contact_id'),
      ('crm_nps_surveys',           'contact_id'),
      ('crm_referrals',             'referrer_contact_id'),
      ('crm_complaints',            'contact_id'),
      ('crm_documents',             'contact_id'),
      ('crm_showings',              'contact_id'),
      ('crm_lead_disputes',         'contact_id'),
      ('crm_coi_declarations',      'contact_id'),
      ('crm_data_requests',         'contact_id')
    ) as t(tbl, col)
  loop
    if to_regclass('public.' || rec.tbl) is not null then
      begin
        execute format('update public.%I set %I = $1 where %I = $2', rec.tbl, rec.col, rec.col)
          using p_primary, p_merged;
        get diagnostics n = row_count;
        if n > 0 then moved := moved || jsonb_build_object(rec.tbl || '.' || rec.col, n); end if;
      exception when undefined_column then
        null;
      end;
    end if;
  end loop;

  update public.crm_contacts c set
    last_name     = case when p_choices ->> 'last_name'     = 'merged' then merg.last_name     else c.last_name     end,
    first_name    = case when p_choices ->> 'first_name'    = 'merged' then merg.first_name    else c.first_name    end,
    org_name      = case when p_choices ->> 'org_name'      = 'merged' then merg.org_name      else c.org_name      end,
    display_name  = case when p_choices ->> 'display_name'  = 'merged' then merg.display_name  else c.display_name  end,
    source_id     = case when p_choices ->> 'source_id'     = 'merged' then merg.source_id     else c.source_id     end,
    source_detail = case when p_choices ->> 'source_detail' = 'merged' then merg.source_detail else c.source_detail end,
    branch_id     = case when p_choices ->> 'branch_id'     = 'merged' then merg.branch_id     else c.branch_id     end,
    consent       = case when p_choices ->> 'consent'       = 'merged' then merg.consent       else c.consent       end,
    consent_at    = case when p_choices ->> 'consent'       = 'merged' then merg.consent_at    else c.consent_at    end,
    consent_channel = case when p_choices ->> 'consent'     = 'merged' then merg.consent_channel else c.consent_channel end,
    contact_types = (select coalesce(array_agg(distinct t), '{}')
                     from unnest(c.contact_types || merg.contact_types) t)
  where c.id = p_primary;

  update public.crm_contacts
     set lifecycle = 'archived', merged_into_id = p_primary
   where id = p_merged;

  perform set_config('crm.merge', '', true);

  insert into public.crm_contact_merges (office_id, primary_id, merged_id, secondary_source, field_choices, decided_by)
  values (prim.office_id, p_primary, p_merged,
          jsonb_build_object(
            'merged_number', merg.number,
            'merged_created_at', merg.created_at,
            'merged_created_by', merg.created_by,
            'merged_source_id', merg.source_id,
            'merged_source_detail', merg.source_detail,
            'earliest_created_at', least(prim.created_at, merg.created_at),
            'moved', moved,
            'aml_approval_note', p_aml_approval_note),
          coalesce(p_choices, '{}'::jsonb),
          coalesce(auth.uid(), prim.created_by));

  insert into public.crm_audit_log (office_id, actor_id, entity, entity_id, action, field, old_value, new_value, reason)
  values (prim.office_id, auth.uid(), 'crm_contacts', p_primary, 'merge', null,
          to_jsonb(p_merged), moved, p_aml_approval_note);
end $$;

revoke execute on function public.crm_mask_name(text) from anon, public;
revoke execute on function public.crm_mask_phone(text) from anon, public;
revoke execute on function public.crm_find_duplicates(text, text, text, uuid) from anon, public;
revoke execute on function public.crm_merge_contacts(uuid, uuid, jsonb, text) from anon, public;
revoke execute on function public.crm_lead_open_dup_guard() from anon, public;
revoke execute on function public.crm_dup_hits(uuid, text, text, text) from anon, public, authenticated;

grant execute on function public.crm_mask_name(text) to authenticated;
grant execute on function public.crm_mask_phone(text) to authenticated;
grant execute on function public.crm_find_duplicates(text, text, text, uuid) to authenticated;
grant execute on function public.crm_merge_contacts(uuid, uuid, jsonb, text) to authenticated;
