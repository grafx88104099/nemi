-- 20261124000300_crm2_owner_contract_rules.sql
-- P6/P7/P3: эзний эх сурвалж ба «нэр баталгаажаагүй», гэрээний шинэ шаардлага (зөвхөн НООРОГ илгээхэд),
-- өмчлөл/иргэний үнэмлэхийн баримтын хязгаарлагдсан хандалт, идэвхжүүлэх шаардлагын шинэ сонголт,
-- хөрөнгийн эзэн → ноорог гэрээний эзэн (нэг чиглэл).
--
-- Өөрчлөгдөх prod функц (prod-ын одоогийн тодорхойлолт + «-- ШИНЭ» мөрүүд): crm2_contacts_guard,
--   crm2_create_contact (СИГНАТУР +3 параметр — DROP+CREATE), crm2_brokerage_missing, crm2_missing_text,
--   crm2_property_missing, crm2_storage_doc_access. Policy crm2_brokerage_files_select-ийг дахин үүсгэнэ.
--   Trigger crm2_contacts_track-ийг 20261124000100-тэй ИЖИЛ жагсаалтаар (source, name_unverified, consent) дахин
--   үүсгэнэ — source_note (чөлөөт текст) түүхэнд орохгүй.
-- Шинэ: crm2_can_view_restricted_brokerage, crm2_brokerage_files_kind_guard (+trigger),
--   crm2_private_owner_to_drafts (+trigger).
--
-- DEPLOY: 20261124000100 (owner/source/kind/signer_note/unconfirmed багана) ба 20261124000200
--   (contact.sources, brokerage.require_special_terms, brokerage.require_ownership_doc, property.min_images)-ийн
--   ДАРАА, 20261124000400-аас ӨМНӨ. Хуучин 5 нэрлэсэн аргументтай crm2_create_contact дуудлага
--   (lib/crm2/actions/contacts.ts) хэвээр ажиллана. Prod: BEGIN … ROLLBACK dry-run → apply.
--   АНХААР (special_terms): brokerage.require_special_terms анхдагч 'true' (0200) тул энэ миграц орсноос хойш
--   нөхцөл хоосон ноорог гэрээ «онцгой нөхцөл» дутуу гэж илгээгдэхгүй. Одоогийн код үүнийг зөвхөн «Нөхцөл»
--   талбараар арилгана — «онцгой нөхцөлгүй» (no_special_terms) сонголттой гэрээний доод цонхыг ЭНЭ миграцтай
--   НЭГ deploy-д гаргана (миграцыг кодын deploy-н яг өмнө ажиллуулна).
-- Регресс хамгаалалт:
--   * Гэрээний шинэ дутуу түлхүүрүүд (owner_name, special_terms, signer_authority, defaults_unconfirmed,
--     ownership_doc, role_unconfirmed) ЗӨВХӨН status='draft' үед — батлуулахаар илгээсэн (pending) гэрээний
--     батлалт шинээр гацахгүй. Эзний эх сурвалж гэрээг гацаахгүй (зөвхөн property.activation_required-ийн
--     'owner_source' сонголтоор, «Бүртгэл» бүлэгт). 'file' нь file_at_office-ийг үл тооцно (өмнөх шигээ);
--     ноорогт зөвхөн kind='contract' файл тооцогдоно (өмчлөл/иргэний үнэмлэх/бусад биш), pending-д өмнөх шигээ.
--   * Өмчлөл/иргэний үнэмлэхийн баримт: файлын нэрийг (file_name) ерөнхий нэрээр сольж, замын сүүлийн хэсэг
--     uuid.ext байхыг шаардана — crm2_history (brokerage_file)-д баримтын нэр/эзний нэр гарахгүй.
--   * 'restricted' хавтасгүй замын хандалт яг өмнөх шигээ (одоогийн 5 файл kind='contract', хавтасгүй).
--   * property.min_images анхдагч 1 = өмнөх «дор хаяж 1 зураг».
-- Rollback (гараар): 20261113000100-ийн crm2_contacts_guard, crm2_brokerage_missing, crm2_missing_text,
--   crm2_property_missing, crm2_storage_doc_access-ийг дахин ажиллуулна;
--   drop function crm2_create_contact(text, jsonb, text, uuid, boolean, text, text, boolean) хийгээд 5 аргтайг сэргээж
--   grant execute … to authenticated, service_role;
--   drop policy crm2_brokerage_files_select + 20261113000100-ийн хувилбараар дахин үүсгэнэ;
--   drop trigger crm2_brokerage_files_kind_guard on crm2_brokerage_files; drop function crm2_brokerage_files_kind_guard();
--   drop trigger crm2_private_owner_to_drafts on crm2_property_private; drop function crm2_private_owner_to_drafts();
--   drop function crm2_can_view_restricted_brokerage(uuid);
--   drop trigger crm2_contacts_track on crm2_contacts + 20261113000100-ийн хувилбараар дахин үүсгэнэ
--   (crm2_track_changes('contact', 'full_name', 'note', 'responsible_agent_id', 'status')).

set local lock_timeout = '3s';

-- ── 1. Харилцагчийн guard: нэр баталгаажаагүй, эх сурвалж ──────────────────
create or replace function public.crm2_contacts_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  c_unverified constant text := 'Нэр баталгаажаагүй';  -- ШИНЭ
begin
  new.full_name := btrim(regexp_replace(coalesce(new.full_name, ''), '\s+', ' ', 'g'));  -- ШИНЭ: coalesce
  if tg_op = 'INSERT' then
    -- ШИНЭ: нэр мэдэгдэхгүй эзэнд зохиомол нэр бичихгүй — ЗӨВХӨН бүртгэхэд тогтмол тэмдэглэгээ + туг.
    --   Тэмдэглэгээтэй ижил нэр (том/жижиг үсэг үл хамаарна) мөн «баталгаажаагүй» гэж тооцогдоно.
    if new.full_name = '' or lower(new.full_name) = lower(c_unverified) then  -- ШИНЭ
      new.full_name := c_unverified;                                          -- ШИНЭ
      new.name_unverified := true;                                            -- ШИНЭ
    else                                                                      -- ШИНЭ
      new.name_unverified := false;                                           -- ШИНЭ
    end if;                                                                   -- ШИНЭ
    if auth.uid() is not null then new.created_by := auth.uid(); end if;
    if new.created_by is null then
      raise exception 'CRM: бүртгэсэн хүн тодорхойгүй';
    end if;
    new.responsible_agent_id := coalesce(new.responsible_agent_id, new.created_by);
    perform public.crm2_assert_staff(new.responsible_agent_id, new.office_id, 'Хариуцсан агент');
    new.code := public.crm2_next_code(new.office_id, 'contact');
    new.status := 'active';
    new.archived_at := null;
    new.created_at := now();
  else
    -- ШИНЭ: засахад хоосон нэр өмнөх шигээ хориотой; тэмдэглэгээг гараар тавихгүй;
    --   нэр тэмдэглэгээнээс өөр болбол туг унтарна, нэр өөрчлөгдөөгүй бол туг хэвээр.
    if new.full_name = '' then                                                       -- ШИНЭ
      raise exception 'CRM: нэр оруулна уу';                                         -- ШИНЭ
    end if;                                                                          -- ШИНЭ
    if new.full_name is distinct from old.full_name then                             -- ШИНЭ
      if lower(new.full_name) = lower(c_unverified) then                             -- ШИНЭ
        raise exception 'CRM: «%» тэмдэглэгээг нэр болгохгүй — эзний нэрийг оруулна уу', c_unverified;  -- ШИНЭ
      end if;                                                                        -- ШИНЭ
      new.name_unverified := false;                                                  -- ШИНЭ
    else                                                                             -- ШИНЭ
      new.name_unverified := old.name_unverified;                                    -- ШИНЭ
    end if;                                                                          -- ШИНЭ
    if new.code <> old.code or new.office_id <> old.office_id
       or new.created_by <> old.created_by or new.created_at <> old.created_at then
      raise exception 'CRM: харилцагчийн код, оффисыг өөрчлөхгүй';
    end if;
    if new.responsible_agent_id <> old.responsible_agent_id then
      if not public.crm2_in_rpc() then
        raise exception 'CRM: хариуцсан агентыг шилжүүлэх үйлдлээр солино';
      end if;
      perform public.crm2_assert_staff(new.responsible_agent_id, new.office_id, 'Хариуцсан агент');
    end if;
    if new.status <> old.status then
      new.archived_at := case when new.status = 'archived' then now() end;
    else
      new.archived_at := old.archived_at;
    end if;
  end if;
  -- ШИНЭ: эх сурвалж оффисын жагсаалтад (contact.sources) байх ёстой.
  new.source := nullif(btrim(coalesce(new.source, '')), '');                                -- ШИНЭ
  new.source_note := nullif(btrim(coalesce(new.source_note, '')), '');                      -- ШИНЭ
  if new.source is not null and (tg_op = 'INSERT' or new.source is distinct from old.source) -- ШИНЭ
     and not (public.crm2_setting('contact.sources', new.office_id) ? new.source) then      -- ШИНЭ
    raise exception 'CRM: эх сурвалж жагсаалтад алга (%)', new.source;                      -- ШИНЭ
  end if;                                                                                   -- ШИНЭ
  -- Дугаарын хэсгээр («2233») ч хайгдана; RLS харах эрхтэй харилцагчаар хязгаарлана.
  new.search_text := lower(concat_ws(' ', new.code, new.full_name, new.note,
    (select string_agg(ph.phone_norm || ' ' || right(ph.phone_norm, 8), ' ')
       from public.crm2_contact_phones ph where ph.contact_id = new.id)));
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end $$;

-- ── 2. crm2_create_contact (+ source, source_note, name_unverified) — СИГНАТУР өөрчлөгдөнө ──
drop function if exists public.crm2_create_contact(text, jsonb, text, uuid, boolean);
create or replace function public.crm2_create_contact(
  p_full_name text,
  p_phones jsonb,
  p_note text default null,
  p_agent uuid default null,
  p_allow_duplicate boolean default false,
  p_source text default null,              -- ШИНЭ
  p_source_note text default null,         -- ШИНЭ
  p_name_unverified boolean default false  -- ШИНЭ
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_office uuid := public.crm_office_id();
  v_agent uuid := coalesce(p_agent, auth.uid());
  v_norms text[];
  v_dups jsonb;
  v_id uuid;
  v_code text;
  v_item jsonb;
  v_phone text;
  v_first boolean := true;
  v_name text := nullif(btrim(coalesce(p_full_name, '')), '');  -- ШИНЭ
begin
  if not public.crm2_can_work() then
    raise exception 'CRM: харилцагч бүртгэх эрхгүй';
  end if;
  if v_agent <> auth.uid() and not (public.crm_is_manager() or public.crm2_is_lead_of(v_agent)) then
    raise exception 'CRM: өөр агентад харилцагч бүртгэх эрхгүй';
  end if;
  -- ШИНЭ: нэргүй бүртгэл зөвхөн «нэр баталгаажаагүй» гэж тодорхой хүссэн үед.
  if v_name is null and not coalesce(p_name_unverified, false) then  -- ШИНЭ
    raise exception 'CRM: нэр оруулна уу';                           -- ШИНЭ
  end if;                                                            -- ШИНЭ
  if p_phones is not null and jsonb_typeof(p_phones) <> 'array' then
    raise exception 'CRM: дугаарын жагсаалт буруу';
  end if;
  select coalesce(array_agg(distinct n), '{}') into v_norms
    from (
      select public.crm2_normalize_phone(case when jsonb_typeof(e) = 'object' then e->>'phone' else e #>> '{}' end) n
        from jsonb_array_elements(coalesce(p_phones, '[]'::jsonb)) e
    ) q
   where n <> '';
  if cardinality(v_norms) = 0 and public.crm2_setting_bool('contact.require_phone') then
    raise exception 'CRM: дор хаяж нэг зөв утасны дугаар оруулна уу';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'contact_id', c.id,
           'code', c.code,
           'display_name', case when public.crm2_can_view_contact(c.id) then c.full_name else public.crm2_mask_name(c.full_name) end,
           'can_open', public.crm2_can_view_contact(c.id),
           'responsible_agent_name', public.crm2_profile_name(c.responsible_agent_id))), '[]'::jsonb)
    into v_dups
    from public.crm2_contacts c
   where c.office_id = v_office
     and exists (select 1 from public.crm2_contact_phones ph
                  where ph.contact_id = c.id and ph.phone_norm = any (v_norms));

  if jsonb_array_length(v_dups) > 0 and not coalesce(p_allow_duplicate, false) then
    return jsonb_build_object('contact_id', null, 'code', null, 'duplicates', v_dups);
  end if;

  -- ШИНЭ: source, source_note; хоосон нэр → guard «Нэр баталгаажаагүй» + name_unverified = true.
  insert into public.crm2_contacts (office_id, full_name, note, responsible_agent_id, created_by, source, source_note)  -- ШИНЭ
  values (v_office, coalesce(v_name, ''), nullif(btrim(coalesce(p_note, '')), ''), v_agent, auth.uid(),            -- ШИНЭ
          nullif(btrim(coalesce(p_source, '')), ''), left(nullif(btrim(coalesce(p_source_note, '')), ''), 200))   -- ШИНЭ
  returning id, code into v_id, v_code;

  for v_item in select e from jsonb_array_elements(coalesce(p_phones, '[]'::jsonb)) e loop
    v_phone := case when jsonb_typeof(v_item) = 'object' then v_item->>'phone' else v_item #>> '{}' end;
    continue when public.crm2_normalize_phone(v_phone) = '';
    insert into public.crm2_contact_phones (contact_id, phone, label, is_primary, created_by)
    values (v_id, v_phone,
            case when jsonb_typeof(v_item) = 'object' then nullif(btrim(coalesce(v_item->>'label', '')), '') end,
            v_first, auth.uid())
    on conflict (contact_id, phone_norm) do nothing;
    v_first := false;
  end loop;

  return jsonb_build_object('contact_id', v_id, 'code', v_code, 'duplicates', v_dups);
end $$;
revoke all on function public.crm2_create_contact(text, jsonb, text, uuid, boolean, text, text, boolean) from public, anon;
grant execute on function public.crm2_create_contact(text, jsonb, text, uuid, boolean, text, text, boolean) to authenticated, service_role;

-- ── 3. Гэрээний дутуу зүйлс (шинэ зүйлс — зөвхөн ноорогт) ─────────────────
create or replace function public.crm2_brokerage_missing(p_contract uuid)
returns text[]
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_b public.crm2_brokerage_contracts;
  v_missing text[] := '{}';
  v_owner record;  -- ШИНЭ
  v_prop record;   -- ШИНЭ
begin
  select * into v_b from public.crm2_brokerage_contracts where id = p_contract;
  if not found then
    return array['contract'];
  end if;
  if v_b.start_date is null then v_missing := array_append(v_missing, 'start_date'); end if;
  if v_b.end_date is null then
    v_missing := array_append(v_missing, 'end_date');
  elsif v_b.end_date < public.crm2_today() then
    v_missing := array_append(v_missing, 'end_date_past');
  end if;
  if v_b.commission_type is null or v_b.commission_value is null then
    v_missing := array_append(v_missing, 'commission');
  end if;
  if public.crm2_setting_bool('brokerage.require_owner', v_b.office_id) and v_b.owner_contact_id is null then
    v_missing := array_append(v_missing, 'owner');
  end if;
  -- file_at_office («гэрээ оффист үлдсэн») энд тооцогдохгүй — зөвхөн сануулга.
  -- ШИНЭ: ноорогт зөвхөн гэрээний файл (kind='contract'); илгээсэн/батлагдсанд өмнөх шигээ аль ч файл.
  if public.crm2_setting_bool('brokerage.require_file', v_b.office_id)
     and not exists (select 1 from public.crm2_brokerage_files f where f.contract_id = v_b.id  -- ШИНЭ
                        and (v_b.status <> 'draft' or f.kind = 'contract')) then                   -- ШИНЭ
    v_missing := array_append(v_missing, 'file');
  end if;
  -- ШИНЭ: зөвхөн ноорог (илгээх үед). Илгээсэн/батлагдсан гэрээний батлалт өөрчлөгдөхгүй.
  --   Эзний эх сурвалж энд шаардагдахгүй (property.activation_required-ийн 'owner_source').
  if v_b.status = 'draft' then                                                                    -- ШИНЭ
    if v_b.owner_contact_id is not null then                                                      -- ШИНЭ
      select c.name_unverified into v_owner                                                       -- ШИНЭ
        from public.crm2_contacts c where c.id = v_b.owner_contact_id;                            -- ШИНЭ
      if found and coalesce(v_owner.name_unverified, false) then                                  -- ШИНЭ
        v_missing := array_append(v_missing, 'owner_name');                                       -- ШИНЭ
      end if;                                                                                     -- ШИНЭ
    end if;                                                                                       -- ШИНЭ
    if public.crm2_setting_bool('brokerage.require_special_terms', v_b.office_id)                 -- ШИНЭ
       and coalesce(btrim(v_b.terms), '') = '' and not v_b.no_special_terms then                  -- ШИНЭ
      v_missing := array_append(v_missing, 'special_terms');                                      -- ШИНЭ
    end if;                                                                                       -- ШИНЭ
    if v_b.signer_differs and coalesce(btrim(v_b.signer_note), '') = '' then                      -- ШИНЭ
      v_missing := array_append(v_missing, 'signer_authority');                                   -- ШИНЭ
    end if;                                                                                       -- ШИНЭ
    if cardinality(v_b.prefilled) > 0 then                                                        -- ШИНЭ
      v_missing := array_append(v_missing, 'defaults_unconfirmed');                               -- ШИНЭ
    end if;                                                                                       -- ШИНЭ
    if public.crm2_setting_bool('brokerage.require_ownership_doc', v_b.office_id)                 -- ШИНЭ
       and not exists (select 1 from public.crm2_brokerage_files f                                -- ШИНЭ
                        where f.contract_id = v_b.id and f.kind = 'ownership') then               -- ШИНЭ
      v_missing := array_append(v_missing, 'ownership_doc');                                      -- ШИНЭ
    end if;                                                                                       -- ШИНЭ
    select x.contract_agent_id, x.unconfirmed into v_prop                                         -- ШИНЭ
      from public.crm2_properties x where x.id = v_b.property_id;                                 -- ШИНЭ
    if v_prop.contract_agent_id is null or 'contract_agent_id' = any (v_prop.unconfirmed) then    -- ШИНЭ
      v_missing := array_append(v_missing, 'role_unconfirmed');                                   -- ШИНЭ
    end if;                                                                                       -- ШИНЭ
  end if;                                                                                         -- ШИНЭ
  return v_missing;
end $$;

-- ── 4. Дутуу зүйлсийн текст (lib/crm2/labels.ts MISSING_ITEM_LABEL-тэй ижил байна) ──
create or replace function public.crm2_missing_text(p_items text[])
returns text
language sql
immutable
as $$
  select string_agg(case x
      when 'district' then 'дүүрэг'
      when 'price_period' then 'үнийн хугацаа ангилалтай таарахгүй'
      when 'location_text' then 'байршил'
      when 'address_detail' then 'байршлын дэлгэрэнгүй'
      when 'pin' then 'газрын зургийн цэг'
      when 'project' then 'төсөл'
      when 'property_type' then 'хөрөнгийн төрөл'
      when 'area_m2' then 'хэмжээ'
      when 'rooms' then 'өрөөний тоо'
      when 'floor' then 'давхар'
      when 'price' then 'үнэ'
      when 'year_in_use' then 'ашиглалтад орсон он'
      when 'listing_agent_id' then 'хөрөнгө авчирсан агент'   -- ШИНЭ (P1 шошго)
      when 'contract_agent_id' then 'гэрээ байгуулсан агент'  -- ШИНЭ (P1 шошго)
      when 'photo_agent_id' then 'зураг авсан агент'
      when 'owner' then 'эзэн'
      when 'owner_source' then 'эзний эх сурвалж'                                         -- ШИНЭ
      when 'owner_name' then 'эзний нэр (баталгаажаагүй)'                                -- ШИНЭ
      when 'owner_pending' then 'эзнийг шалгах шаардлагатай'                             -- ШИНЭ
      when 'showing_instructions' then 'үзүүлэх заавар'
      when 'images' then 'зураг'
      when 'unconfirmed' then 'баталгаажаагүй утга'                                      -- ШИНЭ
      when 'brokerage_contract' then 'батлагдсан, хүчинтэй зуучлалын гэрээ'
      when 'start_date' then 'эхлэх огноо'
      when 'end_date' then 'дуусах огноо'
      when 'end_date_past' then 'дуусах огноо өнгөрсөн'
      when 'commission' then 'шимтгэл'
      when 'file' then 'гэрээний файл'
      when 'special_terms' then 'онцгой нөхцөл (эсвэл «онцгой нөхцөлгүй»)'               -- ШИНЭ
      when 'signer_authority' then 'гарын үсэг зурах эрхийн тайлбар'                     -- ШИНЭ
      when 'defaults_unconfirmed' then 'оффисын анхдагч утгыг баталгаажуулаагүй'         -- ШИНЭ
      when 'ownership_doc' then 'өмчлөлийн баримт'                                       -- ШИНЭ
      when 'role_unconfirmed' then 'гэрээ байгуулсан агентыг баталгаажуулаагүй'          -- ШИНЭ
      else x end, ', ')
    from unnest(p_items) x;
$$;

-- ── 5. Идэвхжүүлэх шаардлага (шинэ сонголтууд — оффис тохиргоогоор асаавал л) ─────
create or replace function public.crm2_property_missing(p_property uuid)
returns text[]
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_p public.crm2_properties;
  v_priv public.crm2_property_private;
  v_owner public.crm2_contacts;  -- ШИНЭ
  v_req text;
  v_missing text[] := '{}';
  v_hit boolean;
begin
  select * into v_p from public.crm2_properties where id = p_property;
  if not found then
    return array['property'];
  end if;
  select * into v_priv from public.crm2_property_private where property_id = p_property;
  if v_priv.owner_contact_id is not null then                                           -- ШИНЭ
    select * into v_owner from public.crm2_contacts where id = v_priv.owner_contact_id; -- ШИНЭ
  end if;                                                                               -- ШИНЭ
  for v_req in select jsonb_array_elements_text(public.crm2_setting('property.activation_required', v_p.office_id)) loop
    v_hit := case v_req
      when 'project' then v_p.project_id is null
      when 'district' then v_p.district is null
      when 'location_text' then coalesce(btrim(v_p.location_text), '') = ''
      when 'address_detail' then coalesce(btrim(v_p.address_detail), '') = ''
      when 'pin' then v_p.lat is null
      when 'area_m2' then v_p.area_m2 is null
      when 'rooms' then v_p.rooms is null
      when 'floor' then v_p.floor is null
      when 'price' then v_p.price is null
      when 'year_in_use' then v_p.year_in_use is null
      when 'property_type' then v_p.property_type is null
      when 'listing_agent_id' then v_p.listing_agent_id is null
      when 'contract_agent_id' then v_p.contract_agent_id is null
      when 'photo_agent_id' then v_p.photo_agent_id is null
      when 'owner' then v_priv.owner_contact_id is null
      when 'owner_source' then v_priv.owner_contact_id is null or v_owner.source is null                -- ШИНЭ
      when 'owner_name' then v_priv.owner_contact_id is null or coalesce(v_owner.name_unverified, false) -- ШИНЭ
      when 'showing_instructions' then coalesce(btrim(v_priv.showing_instructions), '') = ''
      -- ШИНЭ: дор хаяж property.min_images зураг (анхдагч 1 = өмнөх «зураг байх»).
      when 'images' then (select count(*) from public.crm2_property_media m                             -- ШИНЭ
                           where m.property_id = p_property and m.kind = 'image')                       -- ШИНЭ
                         < coalesce(public.crm2_setting_int('property.min_images', v_p.office_id), 1)   -- ШИНЭ
      -- ШИНЭ: нийтэд гарах автомат утга баталгаажаагүй (PUBLISH_CONFIRM_KEYS, lib/crm2/checklist.ts-тэй ижил).
      when 'unconfirmed' then coalesce(v_p.unconfirmed, '{}'::text[]) && array[                         -- ШИНЭ
        'category', 'property_type', 'project', 'district', 'location_text', 'lat', 'area_m2', 'rooms',  -- ШИНЭ
        'floor', 'building_floors', 'price', 'currency', 'price_period', 'price_basis', 'year_in_use',  -- ШИНЭ
        'features', 'parking_spaces', 'rent_advance_months', 'rent_deposit_months', 'advantages',       -- ШИНЭ
        'available_from']::text[]                                                                       -- ШИНЭ
      else false
    end;
    if v_hit then
      v_missing := array_append(v_missing, v_req);
    end if;
  end loop;
  -- Зарах = нийт үнэ; түрээс = хугацаатай үнэ (тааруулалтад харьцуулагдахуйц байлгана).
  if (v_p.category = 'sale' and v_p.price_period <> 'total')
     or (v_p.category in ('rent', 'managed_rent') and v_p.price_period = 'total') then
    v_missing := array_append(v_missing, 'price_period');
  end if;
  if not public.crm2_property_has_valid_contract(p_property) then
    v_missing := array_append(v_missing, 'brokerage_contract');
  end if;
  return v_missing;
end $$;

-- ── 6. Өмчлөл / иргэний үнэмлэхийн баримтыг харах эрх (ШИНЭ) ───────────────
-- Гэрээний хариуцагч, гэрээ үүсгэгч, энэ гэрээг батлах эрхтэй хүн (crm2_brokerage_approver — батлах болон
-- батлагчийн хавсаргах эрхтэй ЯГ ижил: roles.approve, ахлагч, тохиргоогоор оффисын админ) эсвэл менежер л.
-- Гэрээг харах эрх (crm2_can_view_brokerage)-тэй ХАМТ шалгагдана (policy/storage дээр AND).
create or replace function public.crm2_can_view_restricted_brokerage(p_contract uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.crm2_brokerage_contracts b
     where b.id = p_contract
       and b.office_id = public.crm_office_id()
       and public.crm2_is_member()
       and (b.responsible_agent_id = auth.uid()
            or b.created_by = auth.uid()
            or public.crm2_brokerage_approver(b.responsible_agent_id)  -- ШИНЭ: батлагчтай ижил олонлог
            or public.crm_is_manager())
  );
$$;
revoke all on function public.crm2_can_view_restricted_brokerage(uuid) from public, anon;
grant execute on function public.crm2_can_view_restricted_brokerage(uuid) to authenticated, service_role;

-- ── 7. Storage: {office}/brokerage/{contract}/restricted/… уншиж/устгахад нэмэлт эрх ─
create or replace function public.crm2_storage_doc_access(p_name text, p_mode text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select (storage.foldername(p_name))[1] = public.crm_office_id()::text
     and (storage.foldername(p_name))[2] = 'brokerage'
     and case p_mode
           when 'read'   then public.crm2_can_view_brokerage(public.crm2_uuid((storage.foldername(p_name))[3]))
           when 'write'  then public.crm2_can_attach_brokerage(public.crm2_uuid((storage.foldername(p_name))[3]))
           when 'delete' then public.crm2_can_detach_brokerage(public.crm2_uuid((storage.foldername(p_name))[3]))
           else false
         end
     -- ШИНЭ: 'restricted' хавтас (өмчлөл/иргэний үнэмлэх) — унших, бичих, устгахад хязгаарлагдсан эрх
     --   (уншиж, цэвэрлэж чадахгүй хүн тэнд бичихгүй).
     and ((storage.foldername(p_name))[4] is distinct from 'restricted'                                 -- ШИНЭ
          or public.crm2_can_view_restricted_brokerage(public.crm2_uuid((storage.foldername(p_name))[3])));  -- ШИНЭ
$$;

-- ── 8. Гэрээний файлын мөр: ownership/id-г зөвхөн хязгаарлагдсан хүмүүс харна (ШИНЭ) ──
drop policy if exists crm2_brokerage_files_select on public.crm2_brokerage_files;
create policy crm2_brokerage_files_select on public.crm2_brokerage_files
  for select to authenticated
  using (office_id = (select public.crm_office_id())
         and public.crm2_can_view_brokerage(contract_id)
         and (kind not in ('ownership', 'id') or public.crm2_can_view_restricted_brokerage(contract_id)));  -- ШИНЭ

-- ── 9. kind ⇔ зам: ownership/id ⇔ {office}/brokerage/{contract}/restricted/… (ШИНЭ) ──
-- BEFORE триггерүүд нэрийн дарааллаар: crm2_brokerage_files_guard (замын угтвар, UPDATE хориг) → энэ.
create or replace function public.crm2_brokerage_files_kind_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_restricted boolean := coalesce((storage.foldername(new.storage_path))[4] = 'restricted', false);
  v_ext text;
begin
  if (new.kind in ('ownership', 'id')) is distinct from v_restricted then
    raise exception 'CRM: өмчлөл/иргэний үнэмлэхийн баримт зөвхөн хязгаарлагдсан хавтаст (restricted), бусад файл түүнээс гадна хадгалагдана';
  end if;
  if v_restricted then
    -- Нэмж буй хүн хязгаарлагдсан баримтыг харах эрхтэй (эс бөгөөс мөрөө харж, устгаж чадахгүй).
    if auth.uid() is not null and not public.crm2_can_view_restricted_brokerage(new.contract_id) then
      raise exception 'CRM: өмчлөл/иргэний үнэмлэхийн баримтыг гэрээний хариуцагч, батлагч эсвэл менежер л нэмнэ';
    end if;
    -- Түүх (crm2_history, brokerage_file) зам, нэрийг бичдэг: замд зөвхөн uuid.өргөтгөл, нэр ерөнхий.
    if new.storage_path !~ '/restricted/[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12}\.[A-Za-z0-9]{1,8}$' then
      raise exception 'CRM: хязгаарлагдсан баримтын файлын нэр буруу (uuid.өргөтгөл байна)';
    end if;
    v_ext := lower(substring(new.storage_path from '\.([A-Za-z0-9]{1,8})$'));
    new.file_name := case new.kind when 'ownership' then 'Өмчлөлийн баримт' else 'Иргэний үнэмлэх' end
                     || '.' || v_ext;
  end if;
  return new;
end $$;
revoke all on function public.crm2_brokerage_files_kind_guard() from public, anon, authenticated;
grant execute on function public.crm2_brokerage_files_kind_guard() to service_role;

drop trigger if exists crm2_brokerage_files_kind_guard on public.crm2_brokerage_files;
create trigger crm2_brokerage_files_kind_guard
  before insert or update on public.crm2_brokerage_files
  for each row execute function public.crm2_brokerage_files_kind_guard();

-- ── 10. Хөрөнгийн эзэн → НООРОГ гэрээний эзэн (нэг чиглэл; илгээсэн/батлагдсанд ХЭЗЭЭ Ч хүрэхгүй) ──
-- Зөвхөн тухайн ноорогийг засах эрхтэй хэрэглэгчийн өөрчлөлтөөр (service role / эрхгүй бол хуулахгүй).
create or replace function public.crm2_private_owner_to_drafts()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.owner_contact_id is not null and new.owner_contact_id is distinct from old.owner_contact_id then
    update public.crm2_brokerage_contracts b
       set owner_contact_id = new.owner_contact_id
     where b.property_id = new.property_id
       and b.status = 'draft'
       and not b.signer_differs
       and (b.owner_contact_id is null or b.owner_contact_id = old.owner_contact_id)
       and public.crm2_can_edit_brokerage_draft(b.id);  -- ШИНЭ
  end if;
  return null;
end $$;
revoke all on function public.crm2_private_owner_to_drafts() from public, anon, authenticated;
grant execute on function public.crm2_private_owner_to_drafts() to service_role;

drop trigger if exists crm2_private_owner_to_drafts on public.crm2_property_private;
create trigger crm2_private_owner_to_drafts
  after update of owner_contact_id on public.crm2_property_private
  for each row execute function public.crm2_private_owner_to_drafts();

-- ── 11. Харилцагчийн түүх: эх сурвалж, нэр баталгаажсан эсэх, зөвшөөрөл (ШИНЭ) ─
-- 20261124000100-ийн жагсаалттай ЯГ ижил: 'consent'-ийг хадгална; source_note (чөлөөт текст — нэр, утас орж
-- болзошгүй) түүхэнд ОРОХГҮЙ. (Өмнөх хувилбар consent-ийг хасаж, source_note-ийг нэмж байсан — combined sim илрүүлэв.)
drop trigger if exists crm2_contacts_track on public.crm2_contacts;
create trigger crm2_contacts_track
  after insert or update on public.crm2_contacts
  for each row execute function public.crm2_track_changes('contact', 'full_name', 'note', 'responsible_agent_id', 'status',
                                                          'source', 'name_unverified', 'consent');

notify pgrst, 'reload schema';
