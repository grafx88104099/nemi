-- 20261124000400_crm2_quick_create.sql
-- P6(d) + P8 + P11: нэг transaction-д хөрөнгө + эзэн (контакт, утас) + хувийн талбар; давхардлын шалгалт.
-- Баталгаа:
--   * эзний утас ХЭЗЭЭ Ч алга болохгүй — эзэн холбогдоогүй бол crm2_property_private.owner_pending-д хадгална;
--   * утсаар эзнийг ЧИМЭЭГҮЙ холбохгүй — харах эрхтэй давхцал → 'needs_choice'; зөвхөн {contact_id} холбоно;
--   * давхардлын шалгалт зөвхөн дуудагчийн засах эрхтэй хөрөнгийн ХАДГАЛСАН өгөгдлийг уншина; илэрц бүрт
--     тэмдэгт (token) өгнө. 'owner_phone' шалтгааныг зөвхөн тухайн хөрөнгийн хувийн талбарыг (эзэн) харах
--     эрхтэй үед буцаана (эс бөгөөс утсаар тааралт мөр ч гаргахгүй) — харах эрхгүй хөрөнгө зөвхөн төсөл/давхар/
--     талбайн тааралтаар, кодгүй, id-гүй гарна. Тиймээс өөрийн ноорогт утас тавьж бусдын хөрөнгийн эзнийг
--     тааж мэдэх боломжгүй (утасны дугаар оффисын харилцагчид бүртгэлтэй эсэхийг crm2_create_contact-ийн
--     нууцалсан давхардлын мэдэгдэл аль хэдийн хэлдэг — энэ нь шинэ мэдээлэл биш);
--   * owner_pending-ийн өөрчлөлт түүхэнд зөвхөн нууцалсан хэлбэрээр (төлөв, утас/нэр байгаа эсэх) бичигдэнэ —
--     утасны дугаар crm2_history-д ОРОХГҮЙ (20261124000100-ийн шийдвэр хэвээр);
--   * автоматаар бөглөгдсөн утгын баталгаажуулалт (unconfirmed багасах) бүр crm2_properties_track-аар
--     ('update', field 'unconfirmed', хуучин/шинэ жагсаалт) түүхэнд бичигдэнэ; «Зөв» товчоор хийсэн бол reason-д тэмдэглэнэ.
-- Шинэ функц: crm2_resolve_owner (дотоод), crm2_quick_create_replay (дотоод), crm2_owner_pending_redact (дотоод),
--   crm2_create_property_quick, crm2_set_property_owner, crm2_property_duplicates(p_property),
--   crm2_flag_duplicate(p_property, p_token, …), crm2_property_duplicate_flags(p_property), crm2_resolve_duplicate,
--   crm2_confirm_property_fields; шинэ trigger crm2_property_private_pending_guard (BEFORE),
--   crm2_property_private_pending_log (AFTER). crm2_property_private_track ӨӨРЧЛӨГДӨХГҮЙ.
--   crm2_duplicate_flags_select бодлого: тэмдэглэсэн агент зөвхөн харах эрхтэй илэрцийн мөрийг шууд уншина.
-- Prod-ын одоогийн функцийг ОРЛУУЛАХГҮЙ (бүгд шинэ). Хуучин createProperty (шууд insert) замыг ХӨНДӨХГҮЙ —
--   «Бүрэн форм» хэвээр ажиллана.
-- Нууцлал: өөр агентын харилцагчийг автоматаар холбохгүй (status 'foreign' + нууцалсан нэр);
--   давхардлын илэрцэд эзний нэр/утас, хаяг ХЭЗЭЭ Ч буцаахгүй; харах эрхгүй хөрөнгийн код, төлөв, агентыг ч өгөхгүй;
--   шийдвэрийн түүх, мэдэгдэлд харах эрхгүй хөрөнгийн кодыг бичихгүй.
--
-- DEPLOY: 20261124000100 (owner_pending, client_key, unconfirmed, crm2_duplicate_candidates, crm2_duplicate_flags),
--   20261124000200 (property.duplicate_check), 20261124000300 (crm2_create_contact 8 арг)-ийн ДАРАА, Batch 2 кодоос ӨМНӨ.
--   Prod: BEGIN … ROLLBACK dry-run → apply-migration.mjs (зөвхөн main session).
-- Rollback (гараар):
--   drop trigger if exists crm2_property_private_pending_guard on public.crm2_property_private;
--   drop trigger if exists crm2_property_private_pending_log on public.crm2_property_private;
--   drop function if exists public.crm2_property_private_pending_guard(), public.crm2_property_private_pending_log(),
--     public.crm2_owner_pending_redact(jsonb);
--   drop function if exists public.crm2_confirm_property_fields(uuid, text[]), public.crm2_resolve_duplicate(uuid, text, text),
--     public.crm2_property_duplicate_flags(uuid),
--     public.crm2_flag_duplicate(uuid, uuid, text, text), public.crm2_set_property_owner(uuid, jsonb),
--     public.crm2_create_property_quick(jsonb, jsonb, jsonb), public.crm2_quick_create_replay(uuid),
--     public.crm2_property_duplicates(uuid), public.crm2_resolve_owner(jsonb);
--   (бодлогыг 20261124000100-ийн хувилбараар буцааж үүсгэнэ)
--   notify pgrst, 'reload schema';

set local lock_timeout = '3s';

-- Төслийн ноорог (dry-run)-оос үлдэж болзошгүй хуучин сигнатурууд — нэг л хувилбар үлдэнэ.
drop function if exists public.crm2_property_duplicates(uuid, uuid, integer, numeric, text);  -- ШИНЭ
drop function if exists public.crm2_flag_duplicate(uuid, uuid, text[], text, text);           -- ШИНЭ

-- ── 0. owner_pending: зөвхөн «Эзэн» RPC бичнэ, өөрчлөлт бүр нууцалсан хэлбэрээр түүхэнд ─────  -- ШИНЭ
-- owner_pending-ийг давхардлын шалгалт уншдаг тул хэрэглэгч шууд (PostgREST) утас бичиж «oracle» хийхгүй.
-- Цэвэрлэх (null) нь хор хөнөөлгүй тул зөвшөөрнө. Зөвхөн энэ guard-ын тусгай transaction-local туг
-- (crm2.owner_pending) эсвэл service role бичнэ — ерөнхий crm2_rpc_begin тугийг ашиглахгүй (гэрээний
-- ноорогт дамжих каскад жирийн хэрэглэгчийн дүрмээр ажиллана). BEFORE trigger нэрийн дарааллаар
-- crm2_property_private_guard → crm2_property_private_pending_guard.
create or replace function public.crm2_property_private_pending_guard()   -- ШИНЭ
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.owner_pending is distinct from old.owner_pending
     and new.owner_pending is not null
     and auth.uid() is not null
     and coalesce(current_setting('crm2.owner_pending', true), '') <> '1' then
    raise exception 'CRM: эзний шалгах мэдээллийг зөвхөн «Эзэн» үйлдлээр өөрчилнө';
  end if;
  return new;
end $$;
revoke all on function public.crm2_property_private_pending_guard() from public, anon, authenticated;   -- ШИНЭ

drop trigger if exists crm2_property_private_pending_guard on public.crm2_property_private;   -- ШИНЭ
create trigger crm2_property_private_pending_guard                                            -- ШИНЭ
  before update on public.crm2_property_private
  for each row execute function public.crm2_property_private_pending_guard();

-- Түүхэнд зөвхөн нууцалсан хэлбэр: төлөв, утас/нэр байгаа эсэх, эх сурвалжийн ангилал. Утас, нэр ОРОХГҮЙ.
create or replace function public.crm2_owner_pending_redact(p jsonb)   -- ШИНЭ
returns jsonb
language sql
immutable
set search_path = public
as $$
  select case when p is null then null else jsonb_build_object(
    'status', p->>'status',
    'has_phone', nullif(btrim(coalesce(p->>'phone', '')), '') is not null,
    'has_name', nullif(btrim(coalesce(p->>'name', '')), '') is not null,
    'source', p->>'source') end;
$$;
revoke all on function public.crm2_owner_pending_redact(jsonb) from public, anon, authenticated;   -- ШИНЭ

create or replace function public.crm2_property_private_pending_log()   -- ШИНЭ
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.crm2_log(new.office_id, 'property_private', new.property_id, 'update', 'owner_pending',
    public.crm2_owner_pending_redact(old.owner_pending), public.crm2_owner_pending_redact(new.owner_pending),
    new.property_id);
  return null;
end $$;
revoke all on function public.crm2_property_private_pending_log() from public, anon, authenticated;   -- ШИНЭ

drop trigger if exists crm2_property_private_pending_log on public.crm2_property_private;     -- ШИНЭ
create trigger crm2_property_private_pending_log                                              -- ШИНЭ
  after update on public.crm2_property_private
  for each row when (old.owner_pending is distinct from new.owner_pending)
  execute function public.crm2_property_private_pending_log();

-- ── 1. Эзнийг утсаар шийдвэрлэх (дотоод туслах; клиентэд нээхгүй) ─────────────
-- p_owner: null | {"contact_id": uuid} | {"phone": text, "full_name": text|null, "source": text|null,
--                                         "source_note": text|null, "allow_duplicate": bool}
-- Буцаах status: none | linked | created (эцсийн) ; needs_choice | foreign | no_access | invalid_phone (эцсийн бус).
create or replace function public.crm2_resolve_owner(p_owner jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_office uuid := public.crm_office_id();
  v_id uuid;
  v_code text;
  v_full text;
  v_phone text;
  v_norm text;
  v_name text;
  v_allow boolean;
  v_res jsonb;
begin
  if p_owner is null or jsonb_typeof(p_owner) <> 'object' then
    return jsonb_build_object('status', 'none');
  end if;
  -- Зөвхөн тодорхой сонгосон харилцагч (contact_id) холбогдоно.
  if nullif(p_owner->>'contact_id', '') is not null then
    v_id := (p_owner->>'contact_id')::uuid;
    if public.crm2_can_view_contact(v_id) then
      return jsonb_build_object('status', 'linked', 'contact_id', v_id);
    end if;
    return jsonb_build_object('status', 'no_access');
  end if;
  v_phone := left(nullif(btrim(coalesce(p_owner->>'phone', '')), ''), 40);
  if v_phone is null then
    return jsonb_build_object('status', 'none');
  end if;
  v_norm := public.crm2_normalize_phone(v_phone);
  if length(v_norm) < 8 then
    return jsonb_build_object('status', 'invalid_phone');
  end if;
  v_allow := coalesce((p_owner->>'allow_duplicate')::boolean, false);                    -- ШИНЭ
  if not v_allow then                                                                     -- ШИНЭ
    -- Харах эрхтэй ижил дугаартай хүн → агент өөрөө сонгоно (ЧИМЭЭГҮЙ холбохгүй).
    select c.id, c.code, c.full_name into v_id, v_code, v_full
      from public.crm2_contacts c
     where c.office_id = v_office
       and exists (select 1 from public.crm2_contact_phones ph where ph.contact_id = c.id and ph.phone_norm = v_norm)
       and public.crm2_can_view_contact(c.id)
     order by (c.status = 'active') desc, c.created_at
     limit 1;
    if v_id is not null then                                                              -- ШИНЭ
      return jsonb_build_object('status', 'needs_choice',
        'match', jsonb_build_object('contact_id', v_id, 'code', v_code, 'full_name', v_full));
    end if;
  end if;
  v_name := left(nullif(btrim(coalesce(p_owner->>'full_name', '')), ''), 160);
  v_res := public.crm2_create_contact(
    p_full_name => v_name,
    p_phones => jsonb_build_array(jsonb_build_object('phone', v_phone)),
    p_note => null,
    p_agent => auth.uid(),
    p_allow_duplicate => v_allow,
    p_source => nullif(btrim(coalesce(p_owner->>'source', '')), ''),
    p_source_note => nullif(btrim(coalesce(p_owner->>'source_note', '')), ''),
    p_name_unverified => v_name is null);
  if v_res->>'contact_id' is null then
    -- Өөр агентын харилцагч: зөвхөн нууцалсан нэр, код, хариуцсан агент (шилжүүлэх хүсэлтэд).
    return jsonb_build_object('status', 'foreign', 'duplicates', v_res->'duplicates');
  end if;
  return jsonb_build_object('status', 'created', 'contact_id', (v_res->>'contact_id')::uuid);
end $$;
revoke all on function public.crm2_resolve_owner(jsonb) from public, anon, authenticated;

-- ── 2. Давхардсан байж болзошгүй хөрөнгө (оффис дотор, хадгалсан өгөгдлөөр) ──  -- ШИНЭ (1 аргумент)
-- Зөвхөн дуудагчийн засах эрхтэй хөрөнгийн төсөл/давхар/талбай, эзний утсыг (холбосон харилцагчийн утас эсвэл
-- owner_pending.phone) уншина. Илэрц бүрт crm2_duplicate_candidates-д тэмдэгт (token) үүсгэнэ (дуудагчид
-- харуулсан шалтгаантай — тэмдэглэл ч тэр л шалтгааныг хадгална). Дуудагчид:
--   * 'owner_phone' шалтгаан зөвхөн илэрцийн хувийн талбарыг харах эрхтэй үед гарна, эс бөгөөс тооцогдохгүй
--     (зөвхөн утсаар таарсан мөр огт гарахгүй, тэмдэгт ч үүсэхгүй);
--   * харах эрхгүй хөрөнгийн id, код, төлөв, агент null.
-- Нэг хөрөнгийн зэрэгцээ шалгалтыг дараалуулна (бие биеийн тэмдэгтийг устгахгүй).                   -- ШИНЭ
create or replace function public.crm2_property_duplicates(p_property uuid)
returns table (token uuid, property_id uuid, code text, status public.crm2_property_status, can_open boolean,
               reasons text[], agent_name text)
language plpgsql
volatile
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_p public.crm2_properties;
  v_phones text[];
  v_c record;
  v_token uuid;
  v_ids uuid[] := '{}'::uuid[];
begin
  if p_property is null or not public.crm2_can_edit_property(p_property) then
    raise exception 'CRM: энэ хөрөнгийн давхардлыг шалгах эрхгүй';
  end if;
  perform pg_advisory_xact_lock(hashtext('crm2_dup:' || p_property::text));                      -- ШИНЭ
  select * into v_p from public.crm2_properties x where x.id = p_property;
  if not public.crm2_setting_bool('property.duplicate_check', v_p.office_id) then
    -- ШИНЭ: шалгалт унтарсан бол хуучин тэмдэгт ашиглагдахгүй.
    delete from public.crm2_duplicate_candidates d where d.property_id = v_p.id;
    return;
  end if;

  select coalesce(array_agg(distinct q.n), '{}'::text[]) into v_phones
    from (
      select ph.phone_norm as n
        from public.crm2_property_private pp
        join public.crm2_contact_phones ph on ph.contact_id = pp.owner_contact_id
       where pp.property_id = v_p.id
      union
      select public.crm2_normalize_phone(pp.owner_pending->>'phone')
        from public.crm2_property_private pp
       where pp.property_id = v_p.id and pp.owner_pending is not null
    ) q
   where length(q.n) >= 8;

  for v_c in
    select vis.id, vis.status, vis.code, vis.listing_agent_id, vis.reasons, vis.shown, vis.open
      from (
        select cand.*,
               public.crm2_can_view_property(cand.id) as open,
               case when 'owner_phone' = any (cand.reasons)
                         and not public.crm2_can_view_property_private(cand.id)
                    then array_remove(cand.reasons, 'owner_phone') else cand.reasons end as shown   -- ШИНЭ
          from (
        select x.id, x.status, x.code, x.listing_agent_id,
               array_remove(array[
                 case when v_p.project_id is not null and v_p.floor is not null and v_p.area_m2 is not null
                           and x.project_id = v_p.project_id and x.floor = v_p.floor
                           and x.area_m2 between v_p.area_m2 - 2 and v_p.area_m2 + 2
                      then 'project_floor_area' end,
                 case when cardinality(v_phones) > 0 and (
                        exists (select 1 from public.crm2_property_private pp
                                  join public.crm2_contact_phones ph on ph.contact_id = pp.owner_contact_id
                                 where pp.property_id = x.id and ph.phone_norm = any (v_phones))
                        or exists (select 1 from public.crm2_property_private pp
                                    where pp.property_id = x.id and pp.owner_pending is not null
                                      and public.crm2_normalize_phone(pp.owner_pending->>'phone') = any (v_phones)))
                      then 'owner_phone' end
               ], null) as reasons
          from public.crm2_properties x
         where x.office_id = v_p.office_id
           and x.id <> v_p.id
           and x.status <> 'archived'
           and ((v_p.project_id is not null and x.project_id = v_p.project_id and x.floor = v_p.floor)
                or cardinality(v_phones) > 0)
          ) cand
         where cardinality(cand.reasons) > 0
      ) vis
     where cardinality(vis.shown) > 0                                                            -- ШИНЭ
     order by cardinality(vis.shown) desc, vis.id
     limit 5
  loop
    insert into public.crm2_duplicate_candidates as d
      (office_id, property_id, match_property_id, reasons, created_by, created_at)
    values (v_p.office_id, v_p.id, v_c.id, v_c.shown, auth.uid(), now())
    on conflict (property_id, match_property_id) do update
      set reasons = excluded.reasons, created_by = excluded.created_by, created_at = excluded.created_at
    returning d.token into v_token;
    v_ids := v_ids || v_c.id;
    token := v_token;
    property_id := case when v_c.open then v_c.id end;
    code := case when v_c.open then v_c.code end;
    status := case when v_c.open then v_c.status end;
    can_open := v_c.open;
    reasons := v_c.shown;                                                                        -- ШИНЭ
    agent_name := case when v_c.open then public.crm2_profile_name(v_c.listing_agent_id) end;
    return next;
  end loop;

  -- Одоо таарахгүй болсон хуучин тэмдэгтийг хүчингүй болгоно.
  delete from public.crm2_duplicate_candidates d
   where d.property_id = v_p.id and not (d.match_property_id = any (v_ids));
  return;
end $$;
revoke all on function public.crm2_property_duplicates(uuid) from public, anon;
grant execute on function public.crm2_property_duplicates(uuid) to authenticated, service_role;

-- ── 3. Давтан илгээлтийн хариу (дотоод) ─────────────────────────────────────  -- ШИНЭ
-- Хадгалсан эзний төлөв: холбосон бол linked, owner_pending байвал pending_review, эс бөгөөс none.
-- Давхардлыг дахин тооцно.
create or replace function public.crm2_quick_create_replay(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code text;
  v_priv public.crm2_property_private;
  v_owner jsonb;
  v_dups jsonb := '[]'::jsonb;
begin
  select x.code into v_code from public.crm2_properties x where x.id = p_id;
  select * into v_priv from public.crm2_property_private pp where pp.property_id = p_id;
  v_owner := case
    when v_priv.owner_contact_id is not null
      then jsonb_build_object('status', 'linked', 'contact_id', v_priv.owner_contact_id)
    when v_priv.owner_pending is not null
      then jsonb_build_object('status', 'pending_review', 'pending_saved', true)
    else jsonb_build_object('status', 'none')
  end;
  if public.crm2_can_edit_property(p_id) then
    select coalesce(jsonb_agg(to_jsonb(d)), '[]'::jsonb) into v_dups
      from public.crm2_property_duplicates(p_id) d;
  end if;
  return jsonb_build_object('property_id', p_id, 'code', v_code, 'replayed', true,
                            'owner', v_owner, 'duplicates', v_dups);
end $$;
revoke all on function public.crm2_quick_create_replay(uuid) from public, anon, authenticated;

-- ── 4. Шуурхай бүртгэл — нэг transaction ─────────────────────────────────────
-- p_property: crm2_properties-ийн баганын нэртэй jsonb (+ project_name, client_key). Зөвхөн доорх жагсаалтын
--   баганыг уншина; төлөв, код, зарын холбоос, баталгаажуулалт зэргийг guard тэглэнэ.
-- p_private: {"owner_note": text, "showing_instructions": text}
create or replace function public.crm2_create_property_quick(
  p_property jsonb,
  p_owner jsonb default null,
  p_private jsonb default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_office uuid := public.crm_office_id();
  v_me uuid := auth.uid();
  v_r public.crm2_properties;
  v_key uuid;
  v_project uuid;
  v_pname text;
  v_fold text;
  v_unconf text[];
  v_id uuid;
  v_code text;
  v_owner jsonb := jsonb_build_object('status', 'none');
  v_owner_id uuid;
  v_pending jsonb;
  v_note text;
  v_show text;
  v_dups jsonb := '[]'::jsonb;
begin
  if v_office is null or v_me is null or not public.crm2_can_work() then
    raise exception 'CRM: хөрөнгө бүртгэх эрхгүй';
  end if;
  if p_property is null or jsonb_typeof(p_property) <> 'object' or pg_column_size(p_property) > 64000 then
    raise exception 'CRM: оролт буруу';
  end if;
  if p_owner is not null and jsonb_typeof(p_owner) not in ('object', 'null') then
    raise exception 'CRM: оролт буруу';
  end if;
  v_key := nullif(p_property->>'client_key', '')::uuid;

  -- Idempotent: сүлжээ тасарсны дараах давтан илгээлт шинэ хөрөнгө үүсгэхгүй.
  if v_key is not null then
    -- Ижил түлхүүртэй зэрэгцээ дуудлагыг дараалуулна (transaction дуустал).          -- ШИНЭ
    perform pg_advisory_xact_lock(hashtext(v_office::text || v_me::text || v_key::text));   -- ШИНЭ
    select x.id into v_id from public.crm2_properties x
     where x.office_id = v_office and x.created_by = v_me and x.client_key = v_key;
    if v_id is not null then
      return public.crm2_quick_create_replay(v_id);                                  -- ШИНЭ
    end if;
  end if;

  v_r := jsonb_populate_record(null::public.crm2_properties, p_property);
  if v_r.category is null then
    raise exception 'CRM: ангиллыг сонгоно уу';
  end if;
  v_unconf := coalesce(v_r.unconfirmed, '{}'::text[]);
  v_project := v_r.project_id;
  v_pname := nullif(btrim(coalesce(p_property->>'project_name', '')), '');

  -- Төсөл шийдвэрлэх + insert нэг дэд transaction-д: давтан илгээлт (unique_violation) үүсгэсэн төслийг
  -- буцаана (өнчин төсөл үлдэхгүй).                                                            -- ШИНЭ
  begin                                                                               -- ШИНЭ
    if v_project is null and v_pname is not null then
      -- ШИНЭ: яг ижил нэр (name_key) → баталгаажсан; эс бөгөөс цэг таслал → зай, олон зай → нэг зай,
      --   том жижгийг үл хайхран тулгана (тоо, үгийн хил хадгалагдана: «Зайсан 1 2» ≠ «Зайсан 12»).
      --   Ийм ойролцоо тааралт эсвэл шинэ төсөл бол 'project' баталгаажаагүй.
      select pr.id into v_project from public.crm2_projects pr
       where pr.office_id = v_office
         and pr.name_key = lower(regexp_replace(btrim(v_pname), '\s+', ' ', 'g'));
      if v_project is null then
        v_fold := lower(btrim(regexp_replace(regexp_replace(v_pname, '[^[:alnum:][:space:]]+', ' ', 'g'), '\s+', ' ', 'g')));
        if v_fold <> '' then
          select pr.id into v_project from public.crm2_projects pr
           where pr.office_id = v_office
             and lower(btrim(regexp_replace(regexp_replace(pr.name, '[^[:alnum:][:space:]]+', ' ', 'g'), '\s+', ' ', 'g'))) = v_fold
           order by pr.is_active desc, pr.created_at
           limit 1;
        end if;
        if v_project is null then
          v_project := public.crm2_ensure_project(v_pname);
        end if;
        v_unconf := array_append(array_remove(v_unconf, 'project'), 'project');
      end if;
    end if;
    v_unconf := array(select distinct u from unnest(v_unconf) u where u is not null order by 1);

    insert into public.crm2_properties (
      office_id, created_by, category, property_type, project_id, district, location_text, address_detail,
      lat, lng, pin_address, area_m2, rooms, floor, building_floors, price, currency, price_period, price_basis,
      year_in_use, operating_cost, operating_cost_currency, operating_cost_period, operating_cost_note,
      condition, view_note, notes, advantages, features, field_notes, available_from, availability_note,
      listing_agent_id, contract_agent_id, photo_agent_id,
      source, client_key, unconfirmed, parking_spaces, rent_advance_months, rent_deposit_months
    ) values (
      v_office, v_me, v_r.category, v_r.property_type, v_project, v_r.district, v_r.location_text, v_r.address_detail,
      v_r.lat, v_r.lng, v_r.pin_address, v_r.area_m2, v_r.rooms, v_r.floor, v_r.building_floors, v_r.price,
      coalesce(v_r.currency, 'MNT'),
      coalesce(v_r.price_period, (case when v_r.category = 'sale' then 'total' else 'month' end)::public.crm2_price_period),
      coalesce(v_r.price_basis, 'total'::public.crm2_price_basis),
      v_r.year_in_use, v_r.operating_cost, coalesce(v_r.operating_cost_currency, 'MNT'),
      coalesce(v_r.operating_cost_period, 'month'::public.crm2_price_period), v_r.operating_cost_note,
      v_r.condition, v_r.view_note, v_r.notes, v_r.advantages, coalesce(v_r.features, '{}'::text[]),
      coalesce(v_r.field_notes, '{}'::jsonb), v_r.available_from, v_r.availability_note,
      coalesce(v_r.listing_agent_id, v_me),
      v_r.contract_agent_id,                                                          -- ШИНЭ: дуудагчаар нөхөхгүй
      v_r.photo_agent_id,
      case when v_r.source in ('manual', 'paste', 'share') then v_r.source else 'manual' end,
      v_key, v_unconf,
      v_r.parking_spaces, v_r.rent_advance_months, v_r.rent_deposit_months
    ) returning id, code into v_id, v_code;
  exception when unique_violation then                                                -- ШИНЭ
    if v_key is null then
      raise;
    end if;
    select x.id into v_id from public.crm2_properties x
     where x.office_id = v_office and x.created_by = v_me and x.client_key = v_key;
    if v_id is null then
      raise;
    end if;
    return public.crm2_quick_create_replay(v_id);
  end;

  v_owner := public.crm2_resolve_owner(p_owner);
  v_owner_id := nullif(v_owner->>'contact_id', '')::uuid;
  -- ШИНЭ: эцсийн бус төлөвт бичсэн утас, нэр, эх сурвалжийг хадгална (утас алга болохгүй).
  if v_owner->>'status' in ('needs_choice', 'foreign', 'no_access', 'invalid_phone') then   -- ШИНЭ
    v_pending := jsonb_build_object(
      'phone', left(nullif(btrim(coalesce(p_owner->>'phone', '')), ''), 40),
      'name', left(nullif(btrim(coalesce(p_owner->>'full_name', '')), ''), 160),
      'source', left(nullif(btrim(coalesce(p_owner->>'source', '')), ''), 40),
      'source_note', left(nullif(btrim(coalesce(p_owner->>'source_note', '')), ''), 200),
      'status', v_owner->>'status',
      'at', now());
    v_owner := v_owner || jsonb_build_object('pending_saved', true);
  end if;

  v_note := left(nullif(btrim(coalesce(p_private->>'owner_note', '')), ''), 4000);
  v_show := left(nullif(btrim(coalesce(p_private->>'showing_instructions', '')), ''), 4000);
  if v_owner_id is not null or v_pending is not null or v_note is not null or v_show is not null then
    -- ШИНЭ: зөвхөн owner_pending guard-ын туг; бусад trigger (гэрээний ноорог руу каскад) жирийн дүрмээр.
    perform set_config('crm2.owner_pending', '1', true);
    update public.crm2_property_private
       set owner_contact_id = coalesce(v_owner_id, owner_contact_id),
           owner_pending = case when v_owner_id is not null then null else coalesce(v_pending, owner_pending) end,  -- ШИНЭ
           owner_note = coalesce(v_note, owner_note),
           showing_instructions = coalesce(v_show, showing_instructions)
     where property_id = v_id;
    perform set_config('crm2.owner_pending', '', true);
  end if;

  -- ШИНЭ: хадгалсан өгөгдлөөр (эзний утас/owner_pending орно) давхардлыг тооцно.
  select coalesce(jsonb_agg(to_jsonb(d)), '[]'::jsonb) into v_dups
    from public.crm2_property_duplicates(v_id) d;

  return jsonb_build_object('property_id', v_id, 'code', v_code, 'replayed', false,
                            'owner', v_owner, 'duplicates', v_dups);
end $$;
revoke all on function public.crm2_create_property_quick(jsonb, jsonb, jsonb) from public, anon;
grant execute on function public.crm2_create_property_quick(jsonb, jsonb, jsonb) to authenticated, service_role;

-- ── 5. Картын «Эзэн» доод цонх: эзнийг нэг алхмаар холбох/үүсгэх ──────────────
-- p_owner: {"contact_id"} | {"phone", "full_name", "source", "source_note", "allow_duplicate"} | {"clear": true}.
-- ШИНЭ: хадгалсан утсыг ХЭЗЭЭ Ч санамсаргүй устгахгүй:
--   * утасгүй эцсийн бус төлөв (жишээ нь сонгосон харилцагч харагдахгүй болсон → no_access) → хадгалсан
--     утас, нэр, эх сурвалж хэвээр, зөвхөн төлөв шинэчлэгдэнэ;
--   * шинэ утас → шинэ бичлэг (ижил дугаар бол хоосон нэр/эх сурвалжийг хуучнаас нөхнө);
--   * хоосон / null оролт ('none') → юу ч өөрчлөхгүй; цэвэрлэх нь зөвхөн {"clear": true}.
create or replace function public.crm2_set_property_owner(p_property uuid, p_owner jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old jsonb;
  v_owner jsonb;
  v_id uuid;
  v_status text;
  v_pending jsonb;
  v_phone text;
  v_same boolean;
begin
  if not public.crm2_can_edit_property(p_property) or not public.crm2_can_view_property_private(p_property) then
    raise exception 'CRM: энэ хөрөнгийн эзнийг засах эрхгүй';
  end if;
  if p_owner is not null and jsonb_typeof(p_owner) not in ('object', 'null') then
    raise exception 'CRM: оролт буруу';
  end if;
  select pp.owner_pending into v_old from public.crm2_property_private pp
   where pp.property_id = p_property for update;
  if not found then
    raise exception 'CRM: хөрөнгө олдсонгүй';
  end if;

  if coalesce(p_owner->>'clear', '') = 'true' then                                    -- ШИНЭ
    if v_old is not null then
      update public.crm2_property_private set owner_pending = null where property_id = p_property;
    end if;
    return jsonb_build_object('status', 'none', 'cleared', v_old is not null);
  end if;

  v_owner := public.crm2_resolve_owner(p_owner);
  v_id := nullif(v_owner->>'contact_id', '')::uuid;
  v_status := v_owner->>'status';
  perform set_config('crm2.owner_pending', '1', true);                                -- ШИНЭ: зөвхөн owner_pending guard
  if v_status in ('needs_choice', 'foreign', 'no_access', 'invalid_phone') then
    v_phone := left(nullif(btrim(coalesce(p_owner->>'phone', '')), ''), 40);
    if v_phone is null then                                                           -- ШИНЭ: хадгалсныг хэвээр
      v_pending := coalesce(v_old, jsonb_build_object('phone', null, 'name', null, 'source', null, 'source_note', null))
                   || jsonb_build_object('status', v_status, 'at', now());
    else
      v_same := v_old is not null
                and public.crm2_normalize_phone(v_old->>'phone') = public.crm2_normalize_phone(v_phone);
      v_pending := jsonb_build_object(
        'phone', v_phone,
        'name', coalesce(left(nullif(btrim(coalesce(p_owner->>'full_name', '')), ''), 160),
                         case when v_same then v_old->>'name' end),
        'source', coalesce(left(nullif(btrim(coalesce(p_owner->>'source', '')), ''), 40),
                           case when v_same then v_old->>'source' end),
        'source_note', coalesce(left(nullif(btrim(coalesce(p_owner->>'source_note', '')), ''), 200),
                                case when v_same then v_old->>'source_note' end),
        'status', v_status,
        'at', now());
    end if;
    update public.crm2_property_private set owner_pending = v_pending where property_id = p_property;
    v_owner := v_owner || jsonb_build_object('pending_saved', true);
  elsif v_id is not null then                                                         -- эцсийн: linked / created
    update public.crm2_property_private
       set owner_contact_id = v_id,
           owner_pending = null
     where property_id = p_property;
  else                                                                                -- ШИНЭ: 'none' → өөрчлөхгүй
    v_owner := v_owner || jsonb_build_object('pending_saved', v_old is not null);
  end if;
  perform set_config('crm2.owner_pending', '', true);
  return v_owner;
end $$;
revoke all on function public.crm2_set_property_owner(uuid, jsonb) from public, anon;
grant execute on function public.crm2_set_property_owner(uuid, jsonb) to authenticated, service_role;

-- ── 6. «Тусдаа хөрөнгө» / «Хандах эрх хүсэх» → ахлагчийн дараалал ───────────
-- ШИНЭ: илэрцийг зөвхөн crm2_property_duplicates-ийн өгсөн тэмдэгтээр (token) заана; шалтгааныг серверийн
--   мөрөөс авна. Харах эрхгүй бол түүхэнд илэрцийн кодыг бичихгүй.
-- ШИНЭ: нэг хос (хөрөнгө, илэрц) нэг л мөр. Нээлттэй мөрийг дахин тэмдэглэвэл зөвхөн төрөл/тайлбар шинэчлэгдэнэ
--   (дахин мэдэгдэхгүй); ахлагч шийдсэн мөрийг агент дахин нээхгүй.
create or replace function public.crm2_flag_duplicate(
  p_property uuid, p_token uuid, p_kind text default 'distinct', p_note text default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_p public.crm2_properties;
  v_m public.crm2_properties;
  v_cand public.crm2_duplicate_candidates;
  v_f public.crm2_duplicate_flags;
  v_id uuid;
  v_note text := left(nullif(btrim(coalesce(p_note, '')), ''), 1000);
  v_match text;
begin
  if not public.crm2_can_edit_property(p_property) then
    raise exception 'CRM: энэ хөрөнгөд эрхгүй';
  end if;
  if p_kind is null or p_kind not in ('distinct', 'access') then
    raise exception 'CRM: төрөл буруу';
  end if;
  if p_kind = 'distinct' and v_note is null then
    raise exception 'CRM: тусдаа хөрөнгө гэх шалтгааныг бичнэ үү';
  end if;
  select * into v_p from public.crm2_properties where id = p_property;
  select * into v_cand from public.crm2_duplicate_candidates c
   where c.token = p_token and c.property_id = p_property;
  if not found then
    raise exception 'CRM: давхардлын илэрц олдсонгүй — дахин шалгана уу';
  end if;
  select * into v_m from public.crm2_properties where id = v_cand.match_property_id and office_id = v_p.office_id;
  if not found then
    raise exception 'CRM: хөрөнгө олдсонгүй';
  end if;
  v_match := case when public.crm2_can_view_property(v_m.id) then v_m.code end;
  insert into public.crm2_duplicate_flags (office_id, property_id, match_property_id, reasons, kind, agent_note, flagged_by)
  values (v_p.office_id, p_property, v_m.id,
          array(select r from unnest(coalesce(v_cand.reasons, '{}'::text[])) r
                 where r in ('project_floor_area', 'owner_phone', 'listing')),
          p_kind, v_note, auth.uid())
  on conflict (property_id, match_property_id) do nothing                             -- ШИНЭ
  returning id into v_id;

  if v_id is null then                                                                -- ШИНЭ: аль хэдийн тэмдэглэсэн
    select * into v_f from public.crm2_duplicate_flags f
     where f.property_id = p_property and f.match_property_id = v_m.id
     for update;
    if v_f.status <> 'open' then
      raise exception 'CRM: энэ давхардлыг ахлагч аль хэдийн шийдвэрлэсэн';
    end if;
    if v_f.kind is distinct from p_kind or v_f.agent_note is distinct from coalesce(v_note, v_f.agent_note) then
      update public.crm2_duplicate_flags
         set kind = p_kind, agent_note = coalesce(v_note, agent_note)
       where id = v_f.id;
      perform public.crm2_log(v_p.office_id, 'property', p_property, 'duplicate_flag_update', null, null,
        jsonb_build_object('match', v_match, 'kind', p_kind), p_property, null, null, v_note);
    end if;
    return v_f.id;
  end if;

  perform public.crm2_log(v_p.office_id, 'property', p_property, 'duplicate_flag', null, null,
    jsonb_build_object('match', v_match, 'kind', p_kind),
    p_property, null, null, v_note);
  -- Ахлагч/батлагчид хоёр кодыг харна (шийдвэр гаргахад хэрэгтэй). Нэг хос → нэг л мэдэгдэл.
  perform public.crm2_notify(
    public.crm2_approver_ids(v_p.office_id, array[v_p.listing_agent_id, v_m.listing_agent_id]),
    'crm2_duplicate', 'Давхардсан байж болзошгүй хөрөнгө',
    v_p.code || ' ↔ ' || v_m.code || case when p_kind = 'access' then ' (хандах эрх хүссэн)' else '' end,
    '/agent/crm/staff/' || p_property::text);
  return v_id;
end $$;
revoke all on function public.crm2_flag_duplicate(uuid, uuid, text, text) from public, anon;
grant execute on function public.crm2_flag_duplicate(uuid, uuid, text, text) to authenticated, service_role;

-- ШИНЭ: тэмдэглэсэн агент хүснэгтээс зөвхөн харах эрхтэй илэрцийн мөрийг шууд уншина (далд хөрөнгийн id
--   PostgREST-ээр гарахгүй). Менежер, тэмдэглэсэн агентын ахлагч бүх мөрийг харна (шийдвэр гаргана).
drop policy if exists crm2_duplicate_flags_select on public.crm2_duplicate_flags;              -- ШИНЭ
create policy crm2_duplicate_flags_select on public.crm2_duplicate_flags                       -- ШИНЭ
  for select to authenticated
  using (office_id = (select public.crm_office_id())
         and (select public.crm2_is_member())
         and ((select public.crm_is_manager())
              or public.crm2_is_lead_of(flagged_by)
              or (flagged_by = (select auth.uid()) and public.crm2_can_view_property(match_property_id))));

-- ШИНЭ: хөрөнгийн картад тэмдэглэлийн төлөв (засах эрхтэнд). Харах эрхгүй илэрцийн id/код null,
--   шалтгаан нь тэмдэглэх үед агентад харуулсан шалтгаан.
create or replace function public.crm2_property_duplicate_flags(p_property uuid)   -- ШИНЭ
returns table (id uuid, kind text, status text, reasons text[], agent_note text, flagged_at timestamptz,
               decided_at timestamptz, decision_note text, match_property_id uuid, match_code text, can_open boolean)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
begin
  if p_property is null or not public.crm2_can_edit_property(p_property) then
    raise exception 'CRM: энэ хөрөнгөд эрхгүй';
  end if;
  return query
    select f.id, f.kind, f.status, f.reasons, f.agent_note, f.flagged_at, f.decided_at, f.decision_note,
           case when v.open then f.match_property_id end,
           case when v.open then m.code end,
           v.open
      from public.crm2_duplicate_flags f
      join public.crm2_properties m on m.id = f.match_property_id
      cross join lateral (select public.crm2_can_view_property(f.match_property_id) as open) v
     where f.property_id = p_property
     order by f.flagged_at desc;
end $$;
revoke all on function public.crm2_property_duplicate_flags(uuid) from public, anon;
grant execute on function public.crm2_property_duplicate_flags(uuid) to authenticated, service_role;

-- ШИНЭ: шийдвэрийн түүх (хөрөнгийн 'property' түүхийг тухайн хөрөнгийг харах хүн бүр уншдаг) болон
--   тэмдэглэсэн агентын мэдэгдэлд илэрцийн кодыг БИЧИХГҮЙ — зөвхөн тэмдэглэлийн id, шийдвэр.
create or replace function public.crm2_resolve_duplicate(p_flag uuid, p_status text, p_note text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_f public.crm2_duplicate_flags;
  v_p public.crm2_properties;
  v_m public.crm2_properties;
  v_note text := left(nullif(btrim(coalesce(p_note, '')), ''), 1000);
begin
  if p_status is null or p_status not in ('distinct', 'duplicate', 'dismissed') then
    raise exception 'CRM: шийдвэр буруу';
  end if;
  select * into v_f from public.crm2_duplicate_flags where id = p_flag and office_id = public.crm_office_id() for update;
  if not found or not public.crm2_is_member() then
    raise exception 'CRM: бичлэг олдсонгүй';
  end if;
  select * into v_p from public.crm2_properties where id = v_f.property_id;
  select * into v_m from public.crm2_properties where id = v_f.match_property_id;
  if not (public.crm_is_manager()
          or public.crm2_is_lead_of_any(array[v_p.listing_agent_id, v_m.listing_agent_id, v_f.flagged_by])) then
    raise exception 'CRM: давхардлыг багийн ахлагч эсвэл менежер шийднэ';
  end if;
  update public.crm2_duplicate_flags
     set status = p_status, decided_by = auth.uid(), decided_at = now(),
         decision_note = v_note
   where id = p_flag;
  perform public.crm2_log(v_p.office_id, 'property', v_p.id, 'duplicate_resolve', null, null,
    jsonb_build_object('flag', p_flag, 'status', p_status), v_p.id, null, null, v_note);           -- ШИНЭ: кодгүй
  perform public.crm2_notify(array[v_f.flagged_by], 'crm2_duplicate_resolved', 'Давхардлын шийдвэр',
    v_p.code || ': ' || case p_status when 'distinct' then 'тусдаа хөрөнгө'
                                      when 'duplicate' then 'давхардсан'
                                      else 'хаасан' end,                                         -- ШИНЭ: кодгүй
    '/agent/crm/staff/' || v_p.id::text);
end $$;
revoke all on function public.crm2_resolve_duplicate(uuid, text, text) from public, anon;
grant execute on function public.crm2_resolve_duplicate(uuid, text, text) to authenticated, service_role;

-- ── 7. Автоматаар бөглөгдсөн утгыг баталгаажуулах («Зөв») ───────────────────  -- ШИНЭ
-- unconfirmed-аас p_keys-ийг хасна. Түүхийг crm2_properties_track нэг мөрөөр бичнэ ('update', field
-- 'unconfirmed', хуучин → шинэ жагсаалт); энэ үйлдлээр бол reason = «Баталгаажуулсан». (RPC-ээс гадуур шууд
-- багасгах нь мөн адил track мөр үүсгэнэ, reason-гүй.) Буцаах: үлдсэн unconfirmed.
create or replace function public.crm2_confirm_property_fields(p_property uuid, p_keys text[])   -- ШИНЭ
returns text[]
language plpgsql
security definer
set search_path = public
as $$
declare
  v_p public.crm2_properties;
  v_left text[];
  v_reason text;
begin
  if not public.crm2_can_edit_property(p_property) then
    raise exception 'CRM: энэ хөрөнгийг засах эрхгүй';
  end if;
  if p_keys is null or cardinality(p_keys) = 0 or cardinality(p_keys) > 40 then
    raise exception 'CRM: баталгаажуулах талбараа сонгоно уу';
  end if;
  select * into v_p from public.crm2_properties where id = p_property for update;
  v_left := array(select u from unnest(v_p.unconfirmed) u where not (u = any (p_keys)) order by 1);
  if cardinality(v_left) = cardinality(v_p.unconfirmed) then
    return v_p.unconfirmed;
  end if;
  v_reason := coalesce(current_setting('crm2.reason', true), '');
  perform set_config('crm2.reason', 'Баталгаажуулсан', true);
  update public.crm2_properties set unconfirmed = v_left where id = p_property;
  perform set_config('crm2.reason', v_reason, true);
  return v_left;
end $$;
revoke all on function public.crm2_confirm_property_fields(uuid, text[]) from public, anon;
grant execute on function public.crm2_confirm_property_fields(uuid, text[]) to authenticated, service_role;

notify pgrst, 'reload schema';
