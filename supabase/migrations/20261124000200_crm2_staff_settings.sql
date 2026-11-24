-- 20261124000200_crm2_staff_settings.sql
-- Staff шуурхай бүртгэл: оффисын 15 шинэ тохиргоо (feature flag, туршилтын агент, гэрээний анхдагч,
-- эх сурвалжийн ангилал, давхардлын шалгалт, зургийн доод тоо, өмчлөлийн баримт, сануулга, AI) аюулгүй
-- анхдагчтай + property.features-д 3 шинэ утга (security, storage, kids_playground — нийтийн facet толь).
--
-- crm2_setting_default / crm2_setting_keys / crm2_set_setting-ийг БҮТНЭЭР солино: prod-ын ОДООГИЙН
-- тодорхойлолт (pg_get_functiondef, 2026-11-24) + «-- ШИНЭ» гэж тэмдэглэсэн мөрүүд. Бусад үйлдэл өөрчлөгдөхгүй.
-- crm2_reset_setting, crm2_setting, crm2_settings_effective-д хүрэхгүй (шинэ түлхүүрийг автоматаар дэмжинэ).
-- crm2_settings 0 мөртэй тул бүх оффис анхдагчаар ажиллана — apply хийхэд шинэ үйлдэл гарахгүй.
--
-- АЮУЛГҮЙ АНХДАГЧ: staff.quick_add = "off" (хуучин форм бүгдэд), staff.quick_add_pilot = [],
--   digest.scope = "pilot" (жагсаалт хоосон → хэнд ч явахгүй), ai.listing_parse = false,
--   brokerage.default_commission = {} (шимтгэл урьдчилан бөглөхгүй), brokerage.activation_mode = "auto" (одоогийнх),
--   property.min_images = 1 (одоогийнх), brokerage.require_ownership_doc = false.
-- property.features: зөвхөн зөвшөөрөгдсөн жагсаалт өргөжнө, одоогийн мөр хүчингүй болохгүй.
-- contact.sources: 10 кодын ангилал; label-ууд lib/crm2/settings.ts-тэй ЯГ ижил; 'other' заавал.
--
-- DEPLOY: 20261124000100-ийн дараа (энэ файл түүнээс хамаарахгүй), Batch 2 кодоос ӨМНӨ.
--   TS parseCrm2Settings DB буцаагаагүй түлхүүрт анхдагч хэрэглэдэг тул код түрүүлж гарсан ч аюулгүй.
--   Prod: BEGIN … ROLLBACK dry-run → apply-migration.mjs (зөвхөн main session).
-- vitest: lib/crm2/__tests__/labels.test.ts хамгийн сүүлийн crm2_setting_default/crm2_setting_keys-ийг уншина.
--
-- Rollback (гараар): 20261113000100_crm2_foundation.sql-ийн crm2_setting_default / crm2_setting_keys /
--   crm2_set_setting-ийг дахин ажиллуулж (prod-той ижил), дараа нь
--   delete from public.crm2_settings where key in ('property.category_hints', 'property.duplicate_check',
--     'property.min_images', 'brokerage.default_term_months', 'brokerage.default_commission',
--     'brokerage.activation_mode', 'brokerage.require_special_terms', 'brokerage.require_ownership_doc',
--     'contact.sources', 'staff.quick_add', 'staff.quick_add_pilot', 'digest.scope', 'digest.owner_days',
--     'digest.pending_days', 'ai.listing_parse');
--   property.features-ийг хуучин 6 утгаар буцаахаас өмнө security/storage/kids_playground ашигласан
--   crm2_properties.features / crm2_requirements.required_features мөрийг шалгана.

set local lock_timeout = '3s';

create or replace function public.crm2_setting_default(p_key text)
returns jsonb
language sql
immutable
as $$
  select (case p_key
    when 'property.visibility'            then '"office"'
    when 'property.agent_direct_statuses' then '[]'
    when 'property.activation_required'   then '["location_text", "price", "listing_agent_id", "contract_agent_id"]'
    when 'property.same_agent_multi_role' then 'true'
    when 'property.category_labels'       then '{"rent": "Түрээслэх", "lease": "Хөлслөх", "managed_rent": "Менежментийн үйлчилгээтэй түрээс", "sale": "Зарах"}'
    when 'property.types'                 then '{"apartment": "Орон сууц", "house": "Хувийн сууц", "office": "Оффис", "commercial": "Худалдаа, үйлчилгээ", "land": "Газар", "garage": "Гараж, агуулах", "other": "Бусад"}'
    when 'property.districts'             then '["Баянгол", "Баянзүрх", "Сонгинохайрхан", "Сүхбаатар", "Хан-Уул", "Чингэлтэй", "Налайх", "Багануур", "Багахангай"]'
    -- ШИНЭ: security, storage, kids_playground
    when 'property.features'              then '{"parking": "Зогсоол", "garage": "Гараж", "furnished": "Тавилгатай", "balcony": "Тагт", "elevator": "Лифт", "pets": "Тэжээвэр амьтан зөвшөөрнө", "security": "Харуул, камертай", "storage": "Агуулахтай", "kids_playground": "Хүүхдийн тоглоомын талбай"}'
    -- ШИНЭ: ангиллын чипийн тайлбар (lease-ийг оффис тодорхойлтол тайлбаргүй)
    when 'property.category_hints'        then '{"rent": "Сарын түрээсээр", "managed_rent": "Түрээс + оффисын менежментийн үйлчилгээ", "sale": "Худалдах, нийт үнээр"}'
    -- ШИНЭ (доорх мөр)
    when 'property.duplicate_check'       then 'true'
    -- ШИНЭ (доорх мөр)
    when 'property.min_images'            then '1'
    when 'brokerage.require_owner'        then 'true'
    when 'brokerage.require_file'         then 'true'
    when 'brokerage.remind_days_before'   then '[30, 7, 1]'
    when 'brokerage.on_expiry'            then '"contract_ended"'
    -- ШИНЭ (доорх мөр)
    when 'brokerage.default_term_months'  then '12'
    -- ШИНЭ (доорх мөр)
    when 'brokerage.default_commission'   then '{}'
    -- ШИНЭ (доорх мөр)
    when 'brokerage.activation_mode'      then '"auto"'
    -- ШИНЭ (доорх мөр)
    when 'brokerage.require_special_terms' then 'true'
    -- ШИНЭ (доорх мөр)
    when 'brokerage.require_ownership_doc' then 'false'
    when 'approvals.team_lead'            then 'true'
    when 'approvals.office_admin'         then 'false'
    when 'approvals.allow_self'           then '"managers"'
    when 'roles.work'                     then '["agent", "team_lead", "sales_director", "ops_qc", "ceo", "property_manager"]'
    when 'roles.approve'                  then '["sales_director", "ops_qc", "ceo"]'
    when 'roles.finance'                  then '["finance"]'
    when 'contact.foreign_deal'           then '"deny"'
    when 'contact.require_phone'          then 'true'
    -- ШИНЭ: эзний эх сурвалжийн 10 кодын ангилал ('other' заавал)
    when 'contact.sources'                then '{"digital": "Онлайн суваг (сошиал, сайт)", "referral": "Танилаар (реферал)", "prospecting": "Идэвхтэй хайлт", "walk_in": "Оффисоор ирсэн", "open_house": "Нээлттэй үзэлт, арга хэмжээ", "listing_inquiry": "Зарын лавлагаа", "personal_network": "Хувийн сүлжээ", "international": "Олон улсын / түнш", "pm_cross": "Менежментийн үйлчилгээнээс", "other": "Бусад (тайлбартай)"}'
    when 'deal.open_property_statuses'    then '["active"]'
    when 'deal.auto_advance'              then 'true'
    when 'deal.property_agents_can_view'  then 'true'
    when 'deal.cancel_reasons'            then '{"price": "Үнэ таараагүй", "location": "Байршил таараагүй", "size": "Хэмжээ, өрөө таараагүй", "condition": "Хөрөнгийн байдал таалагдаагүй", "timing": "Хугацаа таараагүй", "chose_other": "Өөр хөрөнгө сонгосон", "financing": "Санхүүжилт бүрдээгүй", "no_response": "Холбоо тасарсан", "owner_withdrew": "Эзэн татгалзсан", "other": "Бусад"}'
    when 'showing.require_feedback'       then 'true'
    when 'activity.edit_window_hours'     then '72'
    when 'media.max_images'               then '40'
    when 'media.max_videos'               then '5'
    when 'media.max_image_mb'             then '15'
    when 'media.max_video_mb'             then '50'
    when 'docs.max_file_mb'               then '20'
    when 'docs.max_files_per_contract'    then '20'
    -- ШИНЭ (доорх мөр)
    when 'staff.quick_add'                then '"off"'
    -- ШИНЭ (доорх мөр)
    when 'staff.quick_add_pilot'          then '[]'
    -- ШИНЭ (доорх мөр)
    when 'digest.scope'                   then '"pilot"'
    -- ШИНЭ (доорх мөр)
    when 'digest.owner_days'              then '1'
    -- ШИНЭ (доорх мөр)
    when 'digest.pending_days'            then '2'
    -- ШИНЭ (доорх мөр)
    when 'ai.listing_parse'               then 'false'
  end)::jsonb;
$$;

create or replace function public.crm2_setting_keys()
returns text[]
language sql
immutable
as $$
  select array[
    'property.visibility', 'property.agent_direct_statuses', 'property.activation_required',
    'property.same_agent_multi_role', 'property.category_labels', 'property.types',
    'property.districts', 'property.features',
    'property.category_hints', 'property.duplicate_check', 'property.min_images', -- ШИНЭ
    'brokerage.require_owner', 'brokerage.require_file', 'brokerage.remind_days_before', 'brokerage.on_expiry',
    'brokerage.default_term_months', 'brokerage.default_commission', 'brokerage.activation_mode', -- ШИНЭ
    'brokerage.require_special_terms', 'brokerage.require_ownership_doc', -- ШИНЭ
    'approvals.team_lead', 'approvals.office_admin', 'approvals.allow_self',
    'roles.work', 'roles.approve', 'roles.finance',
    'contact.foreign_deal', 'contact.require_phone',
    'contact.sources', -- ШИНЭ
    'deal.open_property_statuses', 'deal.auto_advance', 'deal.property_agents_can_view', 'deal.cancel_reasons',
    'showing.require_feedback', 'activity.edit_window_hours',
    'media.max_images', 'media.max_videos', 'media.max_image_mb', 'media.max_video_mb',
    'docs.max_file_mb', 'docs.max_files_per_contract',  -- ШИНЭ
    'staff.quick_add', 'staff.quick_add_pilot', 'digest.scope', 'digest.owner_days', 'digest.pending_days', -- ШИНЭ
    'ai.listing_parse' -- ШИНЭ
  ];
$$;

create or replace function public.crm2_set_setting(p_key text, p_value jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_office uuid := public.crm_office_id();
  v_default jsonb := public.crm2_setting_default(p_key);
  v_old jsonb;
  v_allowed text[];
  v_num numeric;
  v_min numeric;
  v_max numeric;
  v_flag text;
begin
  if not public.crm2_can_manage_settings() then
    raise exception 'CRM: тохиргоо өөрчлөх эрхгүй';
  end if;
  -- Эрх/батлалтын тохиргоогоор өөрийгөө батлагч, хувийн мэдээлэл харагч болгохоос сэргийлнэ.
  if (p_key like 'roles.%' or p_key like 'approvals.%') and not public.has_crm_role('ceo') then
    raise exception 'CRM: эрх ба батлалтын тохиргоог зөвхөн ерөнхий захирал өөрчилнө';
  end if;
  if p_key in ('roles.approve', 'roles.finance') and p_value ? 'sysadmin' then
    raise exception 'CRM: системийн админ дүрд батлах/санхүүгийн эрх олгохгүй';
  end if;
  if v_default is null then
    raise exception 'CRM: тодорхойгүй тохиргоо (%)', p_key;
  end if;
  if p_value is null or jsonb_typeof(p_value) <> jsonb_typeof(v_default) then
    raise exception 'CRM: тохиргооны утгын төрөл буруу (%)', p_key;
  end if;

  if jsonb_typeof(v_default) = 'string' then
    v_allowed := case p_key
      when 'property.visibility' then array['office', 'team', 'own']
      when 'approvals.allow_self' then array['nobody', 'managers', 'all']
      when 'brokerage.on_expiry' then array['contract_ended', 'keep']
      when 'contact.foreign_deal' then array['deny', 'allow']
      when 'staff.quick_add' then array['off', 'pilot', 'all'] -- ШИНЭ
      when 'digest.scope' then array['off', 'pilot', 'all'] -- ШИНЭ
      when 'brokerage.activation_mode' then array['auto', 'manual'] -- ШИНЭ
    end;
    if v_allowed is not null and not ((p_value #>> '{}') = any (v_allowed)) then
      raise exception 'CRM: тохиргооны утга буруу (%)', p_key;
    end if;

  elsif jsonb_typeof(v_default) = 'number' then
    v_num := (p_value #>> '{}')::numeric;
    select lo, hi into v_min, v_max from (values
      ('activity.edit_window_hours', 0, 8760),
      ('media.max_images', 1, 200),
      ('media.max_videos', 0, 50),
      ('media.max_image_mb', 1, 50),
      ('media.max_video_mb', 1, 50),
      ('docs.max_file_mb', 1, 20),
      ('docs.max_files_per_contract', 1, 100),  -- ШИНЭ
      ('property.min_images', 0, 20), -- ШИНЭ
      ('brokerage.default_term_months', 1, 60), -- ШИНЭ
      ('digest.owner_days', 0, 14), -- ШИНЭ
      ('digest.pending_days', 1, 14) -- ШИНЭ
    ) as r(k, lo, hi) where r.k = p_key;
    if v_num <> trunc(v_num) or v_num < coalesce(v_min, 0) or v_num > coalesce(v_max, 100000) then
      raise exception 'CRM: тохиргооны тоо хязгаараас гадуур (%: %–%)', p_key, v_min, v_max;
    end if;

  elsif jsonb_typeof(v_default) = 'array' then
    -- (CASE-г хаалтанд: PL/pgSQL IF нөхцөл эхний THEN дээр зогсдог.)
    if jsonb_array_length(p_value) > (case when p_key = 'property.districts' then 60 else 20 end) then
      raise exception 'CRM: жагсаалт хэт урт (%)', p_key;
    end if;
    if p_key = 'brokerage.remind_days_before' then
      if exists (select 1 from jsonb_array_elements(p_value) e
                  where jsonb_typeof(e) <> 'number'
                     or (e #>> '{}')::numeric <> trunc((e #>> '{}')::numeric)
                     or (e #>> '{}')::numeric not between 0 and 365) then
        raise exception 'CRM: сануулгын өдөр 0–365 бүхэл тоо байна';
      end if;
    elsif p_key = 'property.districts' then
      if jsonb_array_length(p_value) = 0
         or exists (select 1 from jsonb_array_elements(p_value) e
                     where jsonb_typeof(e) <> 'string'
                        or char_length(e #>> '{}') not between 1 and 60
                        or (e #>> '{}') <> btrim(e #>> '{}'))
         or (select count(distinct x) from jsonb_array_elements_text(p_value) x) <> jsonb_array_length(p_value) then
        raise exception 'CRM: дүүргийн жагсаалт буруу (хоосон биш, 1–60 тэмдэгт, давхардалгүй)';
      end if;
    -- ШИНЭ: туршилтын агент = энэ оффисын идэвхтэй ажилтны profile id (uuid мөр, давхардалгүй, ≤ 20).
    -- ШИНЭ: CASE нь uuid хэлбэрийг cast-аас ӨМНӨ шалгана (буруу мөр cast алдаа биш, энэ мессежээр унана).
    elsif p_key = 'staff.quick_add_pilot' then -- ШИНЭ
      if exists (select 1 from jsonb_array_elements(p_value) e -- ШИНЭ
                  where case -- ШИНЭ
                    when jsonb_typeof(e) <> 'string' then true -- ШИНЭ
                    when (e #>> '{}') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then true -- ШИНЭ
                    else not exists (select 1 from public.crm_staff s -- ШИНЭ
                                      where s.profile_id = (e #>> '{}')::uuid -- ШИНЭ
                                        and s.office_id = v_office and s.is_active) -- ШИНЭ
                  end) -- ШИНЭ
         or (select count(distinct x) from jsonb_array_elements_text(p_value) x) <> jsonb_array_length(p_value) then -- ШИНЭ
        raise exception 'CRM: туршилтын агентын жагсаалт буруу (оффисын идэвхтэй ажилтан, давхардалгүй)'; -- ШИНЭ
      end if; -- ШИНЭ
    else
      v_allowed := case
        when p_key like 'roles.%' then enum_range(null::public.crm_role)::text[]
        when p_key = 'property.agent_direct_statuses' then array['suspended', 'rented', 'sold', 'contract_ended', 'archived']
        when p_key = 'deal.open_property_statuses' then array['active', 'suspended']
        when p_key = 'property.activation_required' then array[
          'project', 'district', 'location_text', 'address_detail', 'pin', 'area_m2', 'rooms', 'floor', 'price',
          'year_in_use', 'property_type', 'listing_agent_id', 'contract_agent_id', 'photo_agent_id',
          'owner', 'showing_instructions', 'images',  -- ШИНЭ
          'owner_source', 'owner_name', 'unconfirmed'] -- ШИНЭ (crm2_property_missing 20261124000300)
      end;
      if v_allowed is null then
        raise exception 'CRM: жагсаалтын шалгалт тодорхойгүй (%)', p_key;
      end if;
      if exists (select 1 from jsonb_array_elements(p_value) e  -- ШИНЭ
                  where jsonb_typeof(e) <> 'string' or not ((e #>> '{}') = any (v_allowed))) then
        raise exception 'CRM: жагсаалтад зөвшөөрөгдөөгүй утга байна (%)', p_key;
      end if;
      if p_key in ('roles.work', 'roles.approve', 'deal.open_property_statuses') and jsonb_array_length(p_value) = 0 then
        raise exception 'CRM: энэ жагсаалт хоосон байж болохгүй (%)', p_key;
      end if;
    end if;

  elsif jsonb_typeof(v_default) = 'object' then
    if (select count(*) from jsonb_each(p_value)) > 40 then
      raise exception 'CRM: жагсаалт хэт урт (%)', p_key;
    end if;
    if exists (select 1 from jsonb_each(p_value) e
                where e.key !~ '^[a-z][a-z0-9_]{0,39}$'
                   or jsonb_typeof(e.value) <> 'string'
                   or char_length(btrim(e.value #>> '{}')) not between 1 and 80) then
      raise exception 'CRM: түлхүүр/нэрийн хэлбэр буруу (%)', p_key;
    end if;
    if p_key = 'property.category_labels'
       and (select array_agg(k order by k) from jsonb_object_keys(p_value) k)
           <> array['lease', 'managed_rent', 'rent', 'sale'] then
      raise exception 'CRM: 4 ангиллын нэрийг бүгдийг өгнө';
    end if;
    if p_key = 'deal.cancel_reasons' and not (p_value ? 'other') then
      raise exception 'CRM: цуцлах шалтгаанд «other» байх ёстой';
    end if;
    -- ШИНЭ: тайлбар/шимтгэлийн анхдагч — 4 ангиллын дурын дэд олонлог (хоосон {} зөвшөөрнө; нэр ≤ 80 дээр шалгагдсан).
    if p_key in ('property.category_hints', 'brokerage.default_commission') -- ШИНЭ
       and exists (select 1 from jsonb_object_keys(p_value) k -- ШИНЭ
                    where k not in ('rent', 'lease', 'managed_rent', 'sale')) then -- ШИНЭ
      raise exception 'CRM: зөвхөн 4 ангиллын түлхүүр (%)', p_key; -- ШИНЭ
    end if; -- ШИНЭ
    -- ШИНЭ: '<төрөл>:<утга>' — percent ≤ 100, rent_x 0.1–12, fixed ≥ 0. CASE нь regex-ийг cast-аас ӨМНӨ шалгана.
    if p_key = 'brokerage.default_commission' and exists ( -- ШИНЭ
         select 1 from jsonb_each_text(p_value) e -- ШИНЭ
          where case -- ШИНЭ
            when e.value !~ '^(percent|rent_x|fixed):[0-9]{1,10}(\.[0-9]{1,2})?$' then true -- ШИНЭ
            when split_part(e.value, ':', 1) = 'percent' then split_part(e.value, ':', 2)::numeric > 100 -- ШИНЭ
            when split_part(e.value, ':', 1) = 'rent_x' -- ШИНЭ
              then split_part(e.value, ':', 2)::numeric not between 0.1 and 12 -- ШИНЭ
            else false -- ШИНЭ
          end) then -- ШИНЭ
      raise exception 'CRM: шимтгэлийн анхдагч буруу (жишээ: percent:3, rent_x:1, fixed:500000)'; -- ШИНЭ
    end if; -- ШИНЭ
    if p_key = 'contact.sources' and not (p_value ? 'other') then -- ШИНЭ
      raise exception 'CRM: эх сурвалжид «other» байх ёстой'; -- ШИНЭ
    end if; -- ШИНЭ
  end if;

  select s.value into v_old from public.crm2_settings s where s.office_id = v_office and s.key = p_key;
  insert into public.crm2_settings (office_id, key, value, updated_by, updated_at)
  values (v_office, p_key, p_value, auth.uid(), now())
  on conflict (office_id, key) do update
    set value = excluded.value, updated_by = excluded.updated_by, updated_at = excluded.updated_at;
  perform public.crm2_log(v_office, 'settings', v_office, 'update', p_key, coalesce(v_old, v_default), p_value);
  -- Төрөл/ангилал/онцлогийн нэр хайлтын текстэд орсон тул шинэчилнэ.
  if p_key in ('property.types', 'property.category_labels', 'property.features') then
    v_flag := public.crm2_rpc_begin(null);
    update public.crm2_properties set search_text = search_text where office_id = v_office;
    perform public.crm2_rpc_end(v_flag);
  end if;
  return p_value;
end $$;

notify pgrst, 'reload schema';
