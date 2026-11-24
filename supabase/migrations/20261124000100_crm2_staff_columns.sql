-- 20261124000100_crm2_staff_columns.sql
-- Staff шуурхай бүртгэл: ЗӨВХӨН НЭМЭЛТ багана, хүснэгт, индекс, RLS (P2, P5, P6, P7, P10, P11, P12).
-- Одоогийн RPC/триггерийн үйлдэл өөрчлөгдөхгүй. Шинэ: origin/prefilled/media source/ui_events guard, түр guard
-- (owner_pending, kind ownership/id), contacts.source хэлбэр, түүхийн шинэ талбарууд (properties, brokerage, contacts).
--
-- DEPLOY: кодоос ӨМНӨ (types/database.ts шинэ баганыг уншина). Энэ багцын эхний миграц (0200…0700-аас өмнө).
--   Prod: backup-crm.mjs → BEGIN … ROLLBACK dry-run → apply-migration.mjs (зөвхөн main session).
--   ALTER TABLE богино хугацаанд түгжинэ — lock_timeout 3s. Түгжээний дараалал: listings → offices → crm2_*
--   (апп-ын зар бичих → crm2_listings_lock (crm2_properties унших) дараалалтай ижил). Ачаалал багатай үед;
--   40P01 (deadlock) / 55P03 (lock timeout) гарвал бүхэлдээ буцсан тул дахин ажиллуулна.
--   Давтан ажиллуулахад аюулгүй (idempotent). 0300/0400-ийн guard-ыг дарж бичихгүй (доорх «түр guard»).
--   Багцыг (0100…0700) нэг цонхонд дараалан ажиллуулна. Түр guard-ууд (owner_pending, kind ownership/id,
--   source_public_url, contacts.source хэлбэр) энэ хооронд клиентийн бичилтийг хаана. Багцын дараах шалгалт (0 байх):
--     select count(*) from crm2_brokerage_files where kind in ('ownership','id') and (storage.foldername(storage_path))[4] is distinct from 'restricted';
--     (0700-аас өмнө) select count(*) from crm2_property_media where source_public_url is not null;
-- Шинэ FK crm2_properties.source_listing_id → listings: crm2_properties↔listings хооронд 2 дахь FK болно —
--   embed хийхдээ !crm2_properties_listing_id_fkey / !crm2_properties_source_listing_id_fkey заана
--   (одоо ийм embed алга; apply-ийн дараа C:/Nemi/tools/check-embeds.mjs ажиллуулна).
--   crm2_duplicate_flags / crm2_duplicate_candidates нь crm2_properties руу 2 FK-тэй (шинэ хүснэгт, embed-д hint заана).
--
-- Rollback (гараар, урвуу дарааллаар):
--   drop table if exists public.crm2_nudge_log, public.crm2_digest_log, public.crm2_duplicate_candidates,
--     public.crm2_duplicate_flags, public.crm2_ui_events;
--   drop function if exists public.crm2_ui_events_guard();
--   drop trigger if exists crm2_properties_origin_guard on public.crm2_properties; drop function if exists public.crm2_properties_origin_guard();
--   drop trigger if exists crm2_brokerage_prefilled_guard on public.crm2_brokerage_contracts;
--   drop function if exists public.crm2_brokerage_prefilled_guard();
--   drop trigger if exists crm2_property_media_source_guard on public.crm2_property_media;
--   drop function if exists public.crm2_property_media_source_guard();
--   (0300/0400 буцаагаагүй бол:) drop trigger if exists crm2_brokerage_files_kind_guard on public.crm2_brokerage_files;
--     drop function if exists public.crm2_brokerage_files_kind_guard();
--     drop trigger if exists crm2_property_private_pending_guard on public.crm2_property_private;
--     drop function if exists public.crm2_property_private_pending_guard();
--   (crm2_properties_track, crm2_brokerage_track, crm2_contacts_track-ийг 20261113000100-ийн аргументаар дахин үүсгэнэ)
--   alter table public.crm2_contacts drop constraint if exists crm2_contacts_source_chk;
--   alter table public.crm2_property_media drop column if exists source_public_url;
--   alter table public.crm2_brokerage_files drop column if exists kind;
--   alter table public.crm2_brokerage_contracts drop column if exists approver_file_checked, drop column if exists prefilled,
--     drop column if exists file_at_office, drop column if exists signer_note, drop column if exists signer_differs,
--     drop column if exists no_special_terms;
--   alter table public.crm2_contacts drop column if exists consent, drop column if exists name_unverified,
--     drop column if exists source_note, drop column if exists source;
--   alter table public.crm2_property_private drop column if exists owner_pending;
--   alter table public.crm2_properties drop column if exists rent_deposit_months, drop column if exists rent_advance_months,
--     drop column if exists parking_spaces, drop column if exists unconfirmed, drop column if exists client_key,
--     drop column if exists source_listing_id, drop column if exists source;

set local lock_timeout = '3s';
-- FK нэмэхэд listings/offices дээр ShareRowExclusive хэрэгтэй — апп-тай ижил дарааллаар (listings эхэлж) авна.
-- Унших (AccessShare) хаагдахгүй; зар бичих нь энэ транзакц дуустал (< 1 с) хүлээнэ.
lock table public.listings, public.offices in share row exclusive mode;

-- ── 1. crm2_properties ─────────────────────────────────────────────────────
alter table public.crm2_properties
  add column if not exists source text not null default 'manual',
  add column if not exists source_listing_id uuid references public.listings(id) on delete set null,
  add column if not exists client_key uuid,
  add column if not exists unconfirmed text[] not null default '{}'::text[],
  add column if not exists parking_spaces smallint,
  add column if not exists rent_advance_months smallint,
  add column if not exists rent_deposit_months smallint;

alter table public.crm2_properties drop constraint if exists crm2_properties_source_chk;
alter table public.crm2_properties add constraint crm2_properties_source_chk
  check (source in ('manual', 'paste', 'share', 'listing'));

-- Автоматаар (текст задлах, зараас, оффисын анхдагч) бөглөгдөж, агент хараахан батлаагүй талбарууд.
-- Жагсаалт = lib/crm2/checklist.ts UNCONFIRMABLE_KEYS (staff-migrations.test.ts шалгана).
alter table public.crm2_properties drop constraint if exists crm2_properties_unconfirmed_chk;
alter table public.crm2_properties add constraint crm2_properties_unconfirmed_chk check (
  cardinality(unconfirmed) <= 40
  and unconfirmed <@ array[
    'category', 'property_type', 'project', 'district', 'location_text', 'lat', 'area_m2', 'rooms', 'floor',
    'building_floors', 'price', 'currency', 'price_period', 'price_basis', 'year_in_use', 'features',
    'parking_spaces', 'rent_advance_months', 'rent_deposit_months', 'advantages', 'notes', 'available_from',
    'listing_agent_id', 'contract_agent_id', 'photo_agent_id']::text[]);

alter table public.crm2_properties drop constraint if exists crm2_properties_parking_spaces_chk;
alter table public.crm2_properties add constraint crm2_properties_parking_spaces_chk
  check (parking_spaces is null or parking_spaces between 0 and 50);

alter table public.crm2_properties drop constraint if exists crm2_properties_rent_terms_chk;
alter table public.crm2_properties add constraint crm2_properties_rent_terms_chk check (
  (rent_advance_months is null or rent_advance_months between 0 and 24)
  and (rent_deposit_months is null or rent_deposit_months between 0 and 24));

comment on column public.crm2_properties.source is 'Ноорог хаанаас үүссэн: manual | paste | share | listing (P2 хэмжилт).';
comment on column public.crm2_properties.source_listing_id is 'Хуулсан эх зар (синк хийхгүй). listing_id-ийг зөвхөн нийтлэх үед холбоно (P12).';
comment on column public.crm2_properties.client_key is 'Төхөөрөмжийн ноорогийн түлхүүр — сүлжээ тасарсны дараах давтан илгээлтийг idempotent болгоно.';
comment on column public.crm2_properties.unconfirmed is 'Автоматаар бөглөгдсөн, баталгаажаагүй талбарын түлхүүр. RPC-ээс гадуур зөвхөн багасна (crm2_properties_origin_guard).';

-- Нэг хэрэглэгчийн нэг төхөөрөмжийн ноорог = нэг хөрөнгө.
create unique index if not exists crm2_properties_client_key_uq
  on public.crm2_properties (office_id, created_by, client_key) where client_key is not null;
-- Нэг зараас нэг л хөрөнгө: багана бүрт unique индекс (энэ + crm2_properties_listing_uidx), хоёр баганын
-- хооронд (өөр мөрийн source_listing_id ↔ listing_id) crm2_properties_origin_guard зарын түгжээтэйгээр шалгана.
create unique index if not exists crm2_properties_source_listing_uq
  on public.crm2_properties (source_listing_id) where source_listing_id is not null;
-- Давхардлын шалгалт (P11): төсөл + давхар.
create index if not exists crm2_properties_dup_idx
  on public.crm2_properties (office_id, project_id, floor) where project_id is not null;

-- Эх сурвалжийн багануудыг хэрэглэгч шууд өөрчлөхгүй (RPC/систем л). BEFORE триггерүүд нэрийн
-- дарааллаар: crm2_properties_guard → crm2_properties_origin_guard (guard-ын listing_id-г тэглэсний ДАРАА шалгана).
-- crm2_properties_guard updated_at/updated_by-г өөрчлөлтөөр тамгалдаг тул энд буцаасан талбар (source г.м.)
-- эсвэл эх зар устсаны (FK set null) дараа бодит өөрчлөлтгүй мөрийн тамгыг сэргээнэ.
create or replace function public.crm2_properties_origin_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sys_cols text[] := array['search_text', 'updated_at', 'updated_by', 'brokerage_end_date', 'price_total']; -- crm2_properties_guard-тай ижил
  v_detach boolean := false;
  v_links uuid[];
  v_l uuid;
begin
  if tg_op = 'UPDATE' then
    -- FK «on delete set null» (эх зар устсан).
    v_detach := old.source_listing_id is not null and new.source_listing_id is null
                and not exists (select 1 from public.listings l where l.id = old.source_listing_id);
  end if;
  if not public.crm2_in_rpc() then
    if tg_op = 'INSERT' then
      new.source_listing_id := null;
      if new.source = 'listing' then
        new.source := 'manual';
      end if;
    else
      new.source := old.source;
      new.client_key := old.client_key;
      if new.source_listing_id is distinct from old.source_listing_id and not v_detach then
        new.source_listing_id := old.source_listing_id;
      end if;
      -- Баталгаажаагүй жагсаалт RPC-ээс гадуур зөвхөн багасна (нэмэх нь quick create / import RPC).
      if not (new.unconfirmed <@ old.unconfirmed) then
        raise exception 'CRM: баталгаажаагүй жагсаалтыг зөвхөн багасгана';
      end if;
    end if;
  end if;

  -- Нэг зар — нэг хөрөнгө (хоёр баганын хооронд). Зар бүрээр түгжиж, импорт ↔ нийтлэлийн уралдааныг дараалуулна.
  -- Нэг мөрийн source_listing_id = listing_id (өөрийн эх зарыг нийтлэхэд холбосон) зөвшөөрөгдөнө.
  v_links := array(select distinct u from unnest(array[
      case when new.source_listing_id is not null
                and (tg_op = 'INSERT' or new.source_listing_id is distinct from old.source_listing_id)
           then new.source_listing_id end,
      case when new.listing_id is not null
                and (tg_op = 'INSERT' or new.listing_id is distinct from old.listing_id)
           then new.listing_id end]) u where u is not null order by 1);
  foreach v_l in array v_links loop
    perform pg_advisory_xact_lock(hashtextextended('crm2_listing_link:' || v_l::text, 0));
    if exists (select 1 from public.crm2_properties x
                where x.id <> new.id
                  and ((v_l = new.source_listing_id and x.listing_id = v_l)
                       or (v_l = new.listing_id and x.source_listing_id = v_l))) then
      raise exception 'CRM: энэ зар өөр хөрөнгөтэй холбогдсон байна';
    end if;
  end loop;

  -- Буцаасан талбараас өөр өөрчлөлтгүй бол «засварласан» тамгыг сэргээнэ (эх зар устсан нь систем өөрчлөлт).
  if tg_op = 'UPDATE'
     and (to_jsonb(new) - v_sys_cols - case when v_detach then 'source_listing_id' else '' end)
         = (to_jsonb(old) - v_sys_cols - case when v_detach then 'source_listing_id' else '' end) then
    new.updated_at := old.updated_at;
    new.updated_by := old.updated_by;
  end if;
  return new;
end $$;

revoke all on function public.crm2_properties_origin_guard() from public, anon, authenticated;     -- ШИНЭ

drop trigger if exists crm2_properties_origin_guard on public.crm2_properties;
create trigger crm2_properties_origin_guard
  before insert or update on public.crm2_properties
  for each row execute function public.crm2_properties_origin_guard();

-- Түүхэнд шинэ талбаруудыг нэмнэ (prod-ийн одоогийн жагсаалт + 4 багана).
drop trigger if exists crm2_properties_track on public.crm2_properties;
create trigger crm2_properties_track
  after insert or update on public.crm2_properties
  for each row execute function public.crm2_track_changes(
    'property', 'status', 'category', 'property_type', 'price', 'currency', 'price_period', 'price_basis',
    'available_from', 'availability_note', 'last_verified_at', 'listing_agent_id', 'contract_agent_id',
    'photo_agent_id', 'project_id', 'district', 'location_text', 'address_detail', 'lat', 'lng', 'pin_address',
    'area_m2', 'rooms', 'floor', 'building_floors', 'year_in_use', 'operating_cost', 'operating_cost_currency',
    'operating_cost_period', 'operating_cost_note', 'condition', 'view_note', 'notes', 'advantages', 'features',
    'field_notes', 'parking_spaces', 'rent_advance_months', 'rent_deposit_months', 'unconfirmed'); -- ШИНЭ: unconfirmed

-- ── 2. crm2_property_private: хүлээгдэж буй эзэн (R1) ─────────────────────── -- ШИНЭ
-- crm2_property_private-ийн RLS-ийг өвлөнө (хувийн талбар харах эрхтэй хүн л уншина).
-- Бичих нь ЗӨВХӨН «Эзэн» RPC (20261124000400, transaction-local туг crm2.owner_pending) эсвэл service role;
--   клиент зөвхөн null болгож цэвэрлэнэ — crm2_property_private_pending_guard (доор түр хувилбар, 0400-тай ИЖИЛ бие;
--   0400 сольж тавина).
-- Түүх: crm2_property_private_track-д НЭМЭХГҮЙ. 0400-ийн crm2_property_private_pending_log зөвхөн нууцалсан хэлбэрийг
--   (төлөв, утас/нэр байгаа эсэх, эх сурвалж) entity 'property_private'-аар бичнэ — утас, нэр crm2_history-д орохгүй;
--   crm2_can_view_history('property_private') = crm2_can_view_property_private (хувийн талбар харах эрхтэн).
alter table public.crm2_property_private                                                         -- ШИНЭ
  add column if not exists owner_pending jsonb;                                                  -- ШИНЭ
alter table public.crm2_property_private drop constraint if exists crm2_property_private_owner_pending_chk; -- ШИНЭ
alter table public.crm2_property_private add constraint crm2_property_private_owner_pending_chk check ( -- ШИНЭ
  owner_pending is null
  or (jsonb_typeof(owner_pending) = 'object' and pg_column_size(owner_pending) < 2000));
comment on column public.crm2_property_private.owner_pending is                                  -- ШИНЭ
  'Холбогдоогүй эзний оролт (needs_choice/foreign/no_access/invalid_phone): түлхүүр phone, name, source, source_note, status, at. Эцсийн төлөвт null болно. Зөвхөн RPC бичнэ.';

-- Түр guard (0400-тай ИЖИЛ бие). Байхгүй үед л үүсгэнэ — давтан ажиллуулахад 0400-ийн хувилбарыг дарахгүй.
do $do$
begin
  if to_regprocedure('public.crm2_property_private_pending_guard()') is null then
    execute $f$
      create function public.crm2_property_private_pending_guard()
      returns trigger
      language plpgsql
      security definer
      set search_path = public
      as $body$
      begin
        if new.owner_pending is distinct from old.owner_pending
           and new.owner_pending is not null
           and auth.uid() is not null
           and coalesce(current_setting('crm2.owner_pending', true), '') <> '1' then
          raise exception 'CRM: эзний шалгах мэдээллийг зөвхөн «Эзэн» үйлдлээр өөрчилнө';
        end if;
        return new;
      end $body$
    $f$;
    revoke all on function public.crm2_property_private_pending_guard() from public, anon, authenticated;
  end if;
  if not exists (select 1 from pg_trigger where tgrelid = 'public.crm2_property_private'::regclass
                    and tgname = 'crm2_property_private_pending_guard' and not tgisinternal) then
    create trigger crm2_property_private_pending_guard
      before update on public.crm2_property_private
      for each row execute function public.crm2_property_private_pending_guard();
  end if;
end $do$;

-- ── 3. crm2_contacts (эзний эх сурвалж, «нэр баталгаажаагүй», зөвшөөрөл) ─────
alter table public.crm2_contacts
  add column if not exists source text,
  add column if not exists source_note text,
  add column if not exists name_unverified boolean not null default false,
  add column if not exists consent text not null default 'unknown';

alter table public.crm2_contacts drop constraint if exists crm2_contacts_source_note_chk;
alter table public.crm2_contacts add constraint crm2_contacts_source_note_chk
  check (source_note is null or char_length(source_note) <= 200);
alter table public.crm2_contacts drop constraint if exists crm2_contacts_consent_chk;
alter table public.crm2_contacts add constraint crm2_contacts_consent_chk
  check (consent in ('unknown', 'verbal', 'written', 'declined'));
-- source-ийн утгыг crm2_contacts_guard тохиргооны жагсаалтаар (contact.sources) шалгана (20261124000300).
-- Энд зөвхөн кодын хэлбэр (SETTING_CODE_RE, lib/crm2/settings-policies.ts) — 0300-аас өмнө чөлөөт текст орохгүй.
alter table public.crm2_contacts drop constraint if exists crm2_contacts_source_chk;
alter table public.crm2_contacts add constraint crm2_contacts_source_chk
  check (source is null or source ~ '^[a-z][a-z0-9_]{0,39}$');

-- Түүх: зөвшөөрөл (consent), нэр баталгаажаагүй, эх сурвалж. source_note (чөлөөт текст) түүхэнд орохгүй.
-- АНХААР: 20261124000300 §11 энэ триггерийг дахин үүсгэдэг — тэнд 'consent'-ийг хадгална.
drop trigger if exists crm2_contacts_track on public.crm2_contacts;
create trigger crm2_contacts_track
  after insert or update on public.crm2_contacts
  for each row execute function public.crm2_track_changes('contact', 'full_name', 'note', 'responsible_agent_id', 'status',
                                                          'source', 'name_unverified', 'consent');

-- ── 4. crm2_brokerage_contracts (P7) ───────────────────────────────────────
alter table public.crm2_brokerage_contracts
  add column if not exists no_special_terms boolean not null default false,
  add column if not exists signer_differs boolean not null default false,
  add column if not exists signer_note text,                                                     -- ШИНЭ
  add column if not exists file_at_office boolean not null default false,
  add column if not exists prefilled text[] not null default '{}'::text[],
  add column if not exists approver_file_checked boolean;

alter table public.crm2_brokerage_contracts drop constraint if exists crm2_brokerage_prefilled_chk;
alter table public.crm2_brokerage_contracts add constraint crm2_brokerage_prefilled_chk
  check (prefilled <@ array['number', 'start_date', 'end_date', 'commission']::text[]);
alter table public.crm2_brokerage_contracts drop constraint if exists crm2_brokerage_signer_note_chk; -- ШИНЭ
alter table public.crm2_brokerage_contracts add constraint crm2_brokerage_signer_note_chk       -- ШИНЭ
  check (signer_note is null or char_length(signer_note) <= 500);

comment on column public.crm2_brokerage_contracts.prefilled is 'Оффисын анхдагчаар бөглөгдөж, агент баталгаажуулаагүй талбар — илгээхэд хоосон байх ёстой. RPC-ээс гадуур зөвхөн багасна.';
comment on column public.crm2_brokerage_contracts.file_at_office is '«Гэрээ оффист үлдсэн, дараа хавсаргана» — зөвхөн сануулга; файлын шаардлагыг хангахгүй.';
comment on column public.crm2_brokerage_contracts.signer_note is 'Гарын үсэг зурсан хүн эзнээс өөр бол түүний холбоо/эрх (≤500).'; -- ШИНЭ

comment on column public.crm2_brokerage_contracts.approver_file_checked is 'Батлагч файлыг гэрээтэй тулгасан эсэх — зөвхөн батлах RPC тавина; ноорог/илгээсэн төлөвт үргэлж null.'; -- ШИНЭ

-- Урьдчилан бөглөсөн жагсаалт RPC-ээс гадуур зөвхөн багасна (INSERT чөлөөтэй).         -- ШИНЭ
-- approver_file_checked: клиент тавихгүй (INSERT → null, UPDATE → хуучин утга); ноорог/илгээсэн төлөвт
--   (буцаасан, буцааж авсан, дахин илгээсэн) үргэлж null — батлагчийн тэмдэг хуурамчаар үлдэхгүй.
-- BEFORE триггерүүд нэрийн дарааллаар: crm2_brokerage_guard (төлөвийг тогтооно) → crm2_brokerage_prefilled_guard.
-- SECURITY DEFINER: crm2_in_rpc()-г authenticated дуудах эрхгүй (бусад guard-тай адил).
create or replace function public.crm2_brokerage_prefilled_guard()                               -- ШИНЭ
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sys boolean := public.crm2_in_rpc();
begin
  if not v_sys then
    if tg_op = 'INSERT' then
      new.approver_file_checked := null;
    else
      new.approver_file_checked := old.approver_file_checked;
    end if;
  end if;
  if new.status in ('draft', 'pending') then
    new.approver_file_checked := null;
  end if;
  if tg_op = 'UPDATE' and not v_sys and not (new.prefilled <@ old.prefilled) then
    raise exception 'CRM: урьдчилан бөглөсөн жагсаалтыг зөвхөн багасгана';
  end if;
  return new;
end $$;

revoke all on function public.crm2_brokerage_prefilled_guard() from public, anon, authenticated;   -- ШИНЭ

drop trigger if exists crm2_brokerage_prefilled_guard on public.crm2_brokerage_contracts;       -- ШИНЭ
create trigger crm2_brokerage_prefilled_guard                                                    -- ШИНЭ
  before insert or update on public.crm2_brokerage_contracts
  for each row execute function public.crm2_brokerage_prefilled_guard();

-- Түүхэнд шинэ талбаруудыг нэмнэ (20261113000100-ийн жагсаалт + 4 багана).               -- ШИНЭ
drop trigger if exists crm2_brokerage_track on public.crm2_brokerage_contracts;                 -- ШИНЭ
create trigger crm2_brokerage_track                                                              -- ШИНЭ
  after insert or update on public.crm2_brokerage_contracts
  for each row execute function public.crm2_track_changes(
    'brokerage', 'status', 'number', 'owner_contact_id', 'start_date', 'end_date', 'terms', 'commission_type',
    'commission_value', 'commission_currency', 'commission_note', 'responsible_agent_id', 'approved_by',
    'approval_note', 'rejection_note', 'termination_reason',
    'prefilled', 'no_special_terms', 'signer_differs', 'file_at_office');                      -- ШИНЭ

-- ── 5. crm2_brokerage_files.kind (R19) ─────────────────────────────────────── -- ШИНЭ
-- Одоогийн мөрүүд (5) анхдагчаар 'contract' болно (fast default — мөр дахин бичихгүй, триггер ажиллахгүй).
alter table public.crm2_brokerage_files                                                          -- ШИНЭ
  add column if not exists kind text not null default 'contract';                                -- ШИНЭ
alter table public.crm2_brokerage_files drop constraint if exists crm2_brokerage_files_kind_chk; -- ШИНЭ
alter table public.crm2_brokerage_files add constraint crm2_brokerage_files_kind_chk             -- ШИНЭ
  check (kind in ('contract', 'ownership', 'id', 'other'));
comment on column public.crm2_brokerage_files.kind is 'contract | ownership | id | other. ownership/id нь хязгаарлагдмал зам, харах эрх (20261124000300).'; -- ШИНЭ

-- Түр guard: 0300 (хязгаарлагдсан хавтас, хандах эрх) орохоос өмнө ownership/id баримт хадгалахгүй.
-- 0300 ижил нэртэй функц/триггерээр сольно. Байхгүй үед л үүсгэнэ — давтан ажиллуулахад 0300-г дарахгүй.
do $do$
begin
  if to_regprocedure('public.crm2_brokerage_files_kind_guard()') is null then
    execute $f$
      create function public.crm2_brokerage_files_kind_guard()
      returns trigger
      language plpgsql
      security definer
      set search_path = public
      as $body$
      begin
        if new.kind in ('ownership', 'id') then
          raise exception 'CRM: өмчлөл/иргэний үнэмлэхийн баримтыг одоогоор хадгалах боломжгүй';
        end if;
        return new;
      end $body$
    $f$;
    revoke all on function public.crm2_brokerage_files_kind_guard() from public, anon, authenticated;
  end if;
  if not exists (select 1 from pg_trigger where tgrelid = 'public.crm2_brokerage_files'::regclass
                    and tgname = 'crm2_brokerage_files_kind_guard' and not tgisinternal) then
    create trigger crm2_brokerage_files_kind_guard
      before insert or update on public.crm2_brokerage_files
      for each row execute function public.crm2_brokerage_files_kind_guard();
  end if;
end $do$;

-- ── 6. crm2_property_media (зараас хуулсан зураг — гарал үүслийн тэмдэг) ──────
alter table public.crm2_property_media
  add column if not exists source_public_url text;
alter table public.crm2_property_media drop constraint if exists crm2_property_media_source_url_chk;
-- Зөвхөн замын хэлбэрийг шалгана; хостод итгэхгүй. Апп энэ URL-аар ХЭЗЭЭ Ч татахгүй (storage API, path). -- ШИНЭ
-- «.» / «..» хэсэг, давхар «//», «\», кодлосон цэг/зураас/«\» (%2e %2f %5c)-ийг хүлээж авахгүй.
alter table public.crm2_property_media add constraint crm2_property_media_source_url_chk check (
  source_public_url is null
  or (char_length(source_public_url) <= 1000
      and source_public_url ~ '^https://[^/?#]+/storage/v1/object/public/listings/[^?#]+$'
      and source_public_url !~ '(/\.{1,2}(/|$)|^https://.*//|\\|%2[eEfF]|%5[cC])'));               -- ШИНЭ
comment on column public.crm2_property_media.source_public_url is 'Хуулсан эх зарын зургийн URL — зөвхөн гарал үүслийн тэмдэг (нийтлэхэд дахин тамгална). Зөвхөн RPC тавина.'; -- ШИНЭ
-- Хэрэглэгч энэ баганыг өөрөө тавихгүй: crm2_property_media_guard (20261124000700) + доорх guard (0700-аас
-- өмнө ч хамгаална; нэрээр crm2_property_media_guard-ын ДАРАА ажиллана — UPDATE-д 0700 өөрөө түрүүлж татгалзана).
create or replace function public.crm2_property_media_source_guard()                              -- ШИНЭ
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.crm2_in_rpc() then
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.source_public_url := null;
  elsif new.source_public_url is distinct from old.source_public_url then
    raise exception 'CRM: медиагийн файлыг солихгүй — шинээр нэмнэ үү';
  end if;
  return new;
end $$;
revoke all on function public.crm2_property_media_source_guard() from public, anon, authenticated; -- ШИНЭ
drop trigger if exists crm2_property_media_source_guard on public.crm2_property_media;           -- ШИНЭ
create trigger crm2_property_media_source_guard                                                    -- ШИНЭ
  before insert or update on public.crm2_property_media
  for each row execute function public.crm2_property_media_source_guard();

-- ── 7. UI хэмжилт (P2): хувийн утга ХАДГАЛАХГҮЙ — зөвхөн тоо, туг ─────────────
create table if not exists public.crm2_ui_events (
  id bigint generated always as identity primary key,
  office_id uuid not null references public.offices(id) on delete cascade,
  -- «Хасах»-ын бүрэн устгалд хамт устна; ажлын түүхэнд тоологдохгүй (20261124007000).
  profile_id uuid not null references public.profiles(id) on delete cascade,
  event text not null check (event ~ '^[a-z][a-z0-9_]{1,39}$'),
  flow text check (flow in ('quick', 'full', 'card', 'import', 'share', 'paste')),
  property_id uuid references public.crm2_properties(id) on delete set null,
  duration_ms integer check (duration_ms between 0 and 86400000),
  taps smallint check (taps between 0 and 10000),
  fields_filled smallint check (fields_filled between 0 and 300),
  meta jsonb not null default '{}'::jsonb
    check (jsonb_typeof(meta) = 'object' and pg_column_size(meta) <= 2000),
  created_at timestamptz not null default now()
);
create index if not exists crm2_ui_events_office_created_idx on public.crm2_ui_events (office_id, created_at desc);
create index if not exists crm2_ui_events_profile_created_idx on public.crm2_ui_events (profile_id, created_at desc);
alter table public.crm2_ui_events enable row level security;
drop policy if exists crm2_ui_events_insert on public.crm2_ui_events;
-- property_id: зөвхөн харах эрхтэй хөрөнгө (бусад оффисын uuid-ийг FK-ээр «байна/алга» шалгах боломжгүй).
create policy crm2_ui_events_insert on public.crm2_ui_events
  for insert to authenticated
  with check (profile_id = (select auth.uid())
              and office_id = (select public.crm_office_id())
              and (select public.crm2_is_member())
              and (property_id is null or public.crm2_can_view_property(property_id)));

-- meta: ≤20 түлхүүр (код), утга нь тоо (|x| < 10 000 000 — 8 оронтой утасны дугаар орохгүй), туг, null эсвэл
-- код (^[a-z][a-z0-9_]{0,39}$ — нэр, утас, чөлөөт текст орохгүй). created_at-ийг сервер тавина.
-- Клиентийн (PostgREST шууд) бичилтэд хязгаар: 1 профайл минутад 60, өдөрт 2000 (route-ийн api_rate_limits-ээс гадна).
create or replace function public.crm2_ui_events_guard()                                         -- ШИНЭ
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_k text;
  v_v jsonb;
begin
  if jsonb_typeof(new.meta) is distinct from 'object' then
    return new;  -- meta-ийн CHECK (object) татгалзана
  end if;
  if (select count(*) from jsonb_object_keys(new.meta)) > 20 then
    raise exception 'CRM: хэмжилтийн meta хэт олон түлхүүртэй';
  end if;
  for v_k, v_v in select e.key, e.value from jsonb_each(new.meta) e loop
    if v_k !~ '^[a-z][a-z0-9_]{0,39}$'
       or not (jsonb_typeof(v_v) in ('boolean', 'null')
               or (jsonb_typeof(v_v) = 'number' and abs((v_v #>> '{}')::numeric) < 10000000)
               or (jsonb_typeof(v_v) = 'string' and (v_v #>> '{}') ~ '^[a-z][a-z0-9_]{0,39}$')) then
      raise exception 'CRM: хэмжилтийн meta зөвхөн код, тоо, тугтай байна';
    end if;
  end loop;
  new.created_at := now();
  if auth.uid() is not null then
    if (select count(*) from public.crm2_ui_events e
         where e.profile_id = new.profile_id and e.created_at > now() - interval '1 minute') >= 60
       or (select count(*) from public.crm2_ui_events e
            where e.profile_id = new.profile_id and e.created_at > now() - interval '1 day') >= 2000 then
      raise exception 'CRM: хэмжилтийн бичлэг хэт олон — түр хүлээнэ үү';
    end if;
  end if;
  return new;
end $$;
revoke all on function public.crm2_ui_events_guard() from public, anon, authenticated;            -- ШИНЭ
drop trigger if exists crm2_ui_events_guard on public.crm2_ui_events;                            -- ШИНЭ
create trigger crm2_ui_events_guard                                                              -- ШИНЭ
  before insert on public.crm2_ui_events
  for each row execute function public.crm2_ui_events_guard();
drop policy if exists crm2_ui_events_select on public.crm2_ui_events;
create policy crm2_ui_events_select on public.crm2_ui_events
  for select to authenticated
  using (office_id = (select public.crm_office_id())
         and ((select public.crm_is_manager()) or (select public.crm2_can_manage_settings())));
revoke all on public.crm2_ui_events from anon;
revoke update, delete, truncate on public.crm2_ui_events from authenticated;

-- ── 8. Давхардлын дараалал (P11) — бичих нь зөвхөн RPC ─────────────────────
create table if not exists public.crm2_duplicate_flags (
  id uuid primary key default gen_random_uuid(),
  office_id uuid not null references public.offices(id) on delete cascade,
  property_id uuid not null references public.crm2_properties(id) on delete cascade,
  match_property_id uuid not null references public.crm2_properties(id) on delete cascade,
  reasons text[] not null default '{}'::text[]
    check (reasons <@ array['project_floor_area', 'owner_phone', 'listing']::text[]),
  kind text not null default 'distinct' check (kind in ('distinct', 'access')),
  agent_note text check (agent_note is null or char_length(agent_note) <= 1000),
  status text not null default 'open' check (status in ('open', 'distinct', 'duplicate', 'dismissed')),
  flagged_by uuid not null,
  flagged_at timestamptz not null default now(),
  decided_by uuid,
  decided_at timestamptz,
  decision_note text check (decision_note is null or char_length(decision_note) <= 1000),
  unique (property_id, match_property_id),
  check (property_id <> match_property_id)
);
create index if not exists crm2_duplicate_flags_open_idx on public.crm2_duplicate_flags (office_id, status) where status = 'open';
alter table public.crm2_duplicate_flags enable row level security;
drop policy if exists crm2_duplicate_flags_select on public.crm2_duplicate_flags;
-- R16 далд токен: тэмдэглэсэн агент зөвхөн ХАРАХ ЭРХТЭЙ илэрцийн мөрийг шууд уншина — харах эрхгүй хөрөнгийн
-- uuid (match_property_id) PostgREST-ээр гарахгүй; ийм мөрийг crm2_property_duplicate_flags (0400) нууцалж өгнө.
-- Менежер, тэмдэглэсэн агентын ахлагч бүх мөрийг харна (шийдвэр гаргана). 20261124000400-тай ИЖИЛ бодлого.
create policy crm2_duplicate_flags_select on public.crm2_duplicate_flags
  for select to authenticated
  using (office_id = (select public.crm_office_id())
         and (select public.crm2_is_member())
         and ((select public.crm_is_manager())
              or public.crm2_is_lead_of(flagged_by)
              or (flagged_by = (select auth.uid()) and public.crm2_can_view_property(match_property_id))));
revoke all on public.crm2_duplicate_flags from anon;
revoke insert, update, delete, truncate on public.crm2_duplicate_flags from authenticated;

-- Давхардлын нэр нь далд токен (R16): crm2_property_duplicates бичнэ, crm2_flag_duplicate      -- ШИНЭ
-- токеныг сервер дээр тайлна. Хэрэглэгч шууд уншихгүй (RLS асаалттай, бодлогогүй).
create table if not exists public.crm2_duplicate_candidates (                                    -- ШИНЭ
  token uuid primary key default gen_random_uuid(),
  office_id uuid not null references public.offices(id) on delete cascade,
  property_id uuid not null references public.crm2_properties(id) on delete cascade,
  match_property_id uuid not null references public.crm2_properties(id) on delete cascade,
  reasons text[] not null default '{}'::text[]
    check (reasons <@ array['project_floor_area', 'owner_phone', 'listing']::text[]),
  created_by uuid,
  created_at timestamptz not null default now(),
  unique (property_id, match_property_id),
  check (property_id <> match_property_id)
);
create index if not exists crm2_duplicate_candidates_created_idx                                 -- ШИНЭ
  on public.crm2_duplicate_candidates (created_at);
alter table public.crm2_duplicate_candidates enable row level security;                          -- ШИНЭ
revoke all on public.crm2_duplicate_candidates from anon, authenticated;                         -- ШИНЭ

-- ── 9. Өдрийн нэгтгэсэн сануулга (P10) — зөвхөн систем (service role / definer) ──
create table if not exists public.crm2_digest_log (
  profile_id uuid not null,
  office_id uuid not null references public.offices(id) on delete cascade,
  digest_date date not null,
  counts jsonb not null,
  property_ids uuid[] not null default '{}'::uuid[],
  notified_at timestamptz not null default now(),
  pushed_at timestamptz,
  primary key (profile_id, digest_date)
);
create table if not exists public.crm2_nudge_log (
  property_id uuid not null references public.crm2_properties(id) on delete cascade,
  reason text not null check (reason in ('owner', 'contract', 'contract_file', 'approve')),
  profile_id uuid not null,
  last_sent date not null,
  times integer not null default 1,
  primary key (property_id, reason, profile_id)
);
alter table public.crm2_digest_log enable row level security;
alter table public.crm2_nudge_log enable row level security;
revoke all on public.crm2_digest_log from anon, authenticated;
revoke all on public.crm2_nudge_log from anon, authenticated;

notify pgrst, 'reload schema';
