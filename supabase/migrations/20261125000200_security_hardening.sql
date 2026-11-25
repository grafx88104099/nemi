-- 20261125000200_security_hardening.sql
-- Аюулгүй байдлын багц (Group A, 2026-11-25). PROD-д ТАВИГДААГҮЙ — эзэн шийднэ.
--
--  1. spatial_ref_sys (PostGIS): anon/authenticated бичих эрхийг REVOKE хийх боломжгүй
--     (хүснэгт supabase_admin-ийнх, postgres-т GRANT OPTION алга — REVOKE нь зөвхөн WARNING
--     өгдөг). TRIGGER эрх бий тул API-ийн үүргүүдийн (anon, authenticated, service_role)
--     INSERT/UPDATE/DELETE/TRUNCATE-г trigger-ээр хориглоно. Уншилт (газрын зураг, ойролцоох
--     хайлт) хөндөгдөхгүй. postgres trigger-ийг DROP хийж чадахгүй (эзэмшигч биш) — буцаах бол
--     public.spatial_ref_sys_readonly()-г `return coalesce(new, old);` болгож солино.
--     Бүрэн засвар: Supabase support-оор `revoke insert, update, delete, truncate on
--     public.spatial_ref_sys from anon, authenticated;` хийлгэнэ.
--  2. reviews: UI алга тул anon/authenticated-ийн БИЧИХ эрх хасагдана (зөвхөн service role/RPC).
--     Guard (хамгаалалтын давхарга): зохиогч/нэр (нууцалсан «Болд Б.»)/«баталгаажсан»-ыг сервер
--     тогтооно, нэг хэрэглэгч нэг агентад нэг, өөртөө/өөрийн оффист бичихгүй, өдөрт 5 хязгаар.
--  3. listings: агент өөрийн зарын «Эрэлттэй»/«Онцлох», AI үнэлгээг тавихгүй; «баталгаажсан»-ыг
--     зөвхөн тухайн оффисын админ (Staff-ийн нийтлэх RPC, service role, админ хамаарахгүй).
--  4. office_agent_audit + office_set_agent_status(): оффисын «Идэвхгүй»/«Батлах»/«Дахин
--     идэвхжүүлэх» нь CRM-ийн эрхийг (crm_staff.is_active) агентын төлөвтэй нэг транзакцид
--     тааруулна; нэвтрэлтийн хэрэгслийн (түр нууц үг, нэвтрэлт үүсгэх/хаах) аудит.
--  5. qpay_record_payment(): QPay webhook-ийн давталтыг (replay) хаана — нэхэмжлэх нэг удаа л
--     сунгалт өгнө.
--  6. owner_requests_notify: оффисын админд цагт нэг мэдэгдэл (тоог шинэчилнэ).
--  7. Хуучин CRM v1 / Concierge: апп, RLS бодлого, invoker функц/харагдацад хэрэглэгддэггүй
--     функц/хүснэгтийн anon/authenticated эрхийг хасна (DROP хийхгүй, өгөгдөл хөндөхгүй).
--     Жагсаалтыг 2026-11-25-нд каталогоос (pg_policies, invoker функц, view, default) болон
--     апп кодоос тооцоолов. crm_listing_agreements-ийг ЗОРИУД оруулаагүй (20261124000800 —
--     эзний шийдвэр хүлээгдэж буй); түүний бодлогын crm_can_edit_property(uuid)-г ч мөн
--     (118 функц, 134 хүснэгт/харагдац). Буцаах: `grant execute on function … to anon,
--     authenticated;` / `grant select, insert, update, delete on … to anon, authenticated;`.
--  8. Storage: 'listings', 'office-assets' — MIME/хэмжээний хязгаар, anon жагсаалт хаагдана;
--     нэвтэрсэн хэрэглэгч зөвхөн өөрийн файлыг жагсаана. Нийтийн bucket-ийн /object/public/… холбоос
--     RLS-гүй (storage-api superuser-ээр уншдаг) тул одоо байгаа зургийн URL хэвээр ажиллана (avatars
--     bucket ижил загвартай). ХААГДААГҮЙ: тамгагүй эх зураг нийтийн URL-аар (wm/<ver>/-г хасаж) нээлттэй
--     — эхийг хаалттай bucket / таамаглахгүй зам руу зөөх нь эзний зөвшөөрөлтэй тусдаа алхам.
--
-- DEPLOY ДАРААЛАЛ: эхлээд энэ салбарын кодыг deploy хийж, ДАРАА нь (нэг цонхонд) энэ миграцыг тавина.
-- Шинэ код миграцгүйгээр зөөлөн ажиллана (office_set_agent_status алга → хуучин update, аудитын
-- хүснэгт алга → аудитгүй); харин хуучин код + энэ миграц бол хуучин OfficeImageUpload (bucket-ийн
-- үндэс рүү) хориглогдоно. Урьдчилсан нөхцөл: Vercel production-д CRON_SECRET тохируулсан байх.
--
-- Түгжээ: storage.objects, reviews-ийн бодлого (ACCESS EXCLUSIVE) хамгийн сүүлд; REVOKE/GRANT
-- хүснэгт түгжихгүй; CREATE TRIGGER нь SHARE ROW EXCLUSIVE (уншилт чөлөөтэй).

set local lock_timeout = '3s';

-- ───────────── 1. spatial_ref_sys ─────────────

-- Эзэмшигч (supabase_admin) ажиллуулбал жинхэнэ REVOKE болно; postgres-т зөвхөн WARNING.
do $$
begin
  if pg_has_role(current_user, 'supabase_admin', 'member') then
    execute 'revoke insert, update, delete, truncate on public.spatial_ref_sys from anon, authenticated';
  end if;
end $$;

create or replace function public.spatial_ref_sys_readonly()
returns trigger
language plpgsql
-- SECURITY INVOKER: current_user нь API-ийн үүрэг (anon/authenticated/service_role) байна.
set search_path = public
as $$
begin
  if current_user in ('anon', 'authenticated', 'service_role') then
    raise exception 'spatial_ref_sys: зөвхөн унших' using errcode = '42501';
  end if;
  return coalesce(new, old);
end $$;

revoke all on function public.spatial_ref_sys_readonly() from public, anon, authenticated;

create or replace trigger spatial_ref_sys_readonly
  before insert or update or delete on public.spatial_ref_sys
  for each row execute function public.spatial_ref_sys_readonly();

create or replace trigger spatial_ref_sys_readonly_truncate
  before truncate on public.spatial_ref_sys
  for each statement execute function public.spatial_ref_sys_readonly();

-- ───────────── 2. reviews ─────────────

revoke insert, update, delete, truncate, references, trigger on public.reviews from anon;
revoke truncate, references, trigger on public.reviews from authenticated;
-- Сэтгэгдэл бичих UI алга (0 мөр, апп зөвхөн уншдаг). Guard (доор) нэг агентад нэг, өдөрт 5 гэж
-- хязгаарлавч үнэгүй бүртгэлээр (magic link/OTP) agents.rating (recalc_agent_aggregates — бүх
-- сэтгэгдлийн дундаж) болон /agents-ийн эрэмбийг удирдах боломж үлддэг тул бичих эрхийг ХАСНА.
-- Сэтгэгдэл нээх үед: бодит харилцаа (үзлэг/хэлцэл) шаардсан SECURITY DEFINER RPC-ээр л.
-- Guard trigger хамгаалалтын давхарга болон үлдэнэ. Буцаах: grant insert, update on public.reviews to authenticated;
revoke insert, update on public.reviews from authenticated;

-- 0 мөртэй (2026-11-25) — индекс шууд үүснэ. author_id null (устгагдсан хэрэглэгч) давхардаж болно.
create unique index if not exists reviews_author_agent_key
  on public.reviews (author_id, agent_id)
  where author_id is not null;

create or replace function public.reviews_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
  v_name text;
  v_parts text[];
  a public.agents%rowtype;
begin
  -- Систем (service role, cron, migration) болон платформын админ — серверийн шийдвэр.
  if public.guards_bypassed() or public.is_service_role() or public.is_admin() then
    return new;
  end if;
  if v_me is null then
    raise exception 'Нэвтэрнэ үү.' using errcode = '42501';
  end if;

  if tg_op = 'INSERT' then
    select * into a from public.agents where id = new.agent_id;
    if a.profile_id = v_me then
      raise exception 'Өөртөө сэтгэгдэл бичих боломжгүй.' using errcode = '42501';
    end if;
    if a.office_id is not null and (
         exists (select 1 from public.profiles p
                  where p.id = v_me and p.office_id = a.office_id
                    and p.role in ('agent', 'office_admin'))
         or exists (select 1 from public.agents x
                     where x.profile_id = v_me and x.office_id = a.office_id)) then
      raise exception 'Нэг оффисын ажилтан бие биедээ сэтгэгдэл бичихгүй.' using errcode = '42501';
    end if;
    if not public.rate_limit_hit('review:' || v_me::text, 86400, 5) then
      raise exception 'Өнөөдөр хэт олон сэтгэгдэл бичлээ. Маргааш дахин оролдоно уу.' using errcode = '54000';
    end if;
    -- reviews_select нь нийтэд (anon) нээлттэй тул бүтэн нэрийг гаргахгүй: «Болд Б.» (эхний үг +
    -- сүүлийн үгийн эхний үсэг). Хэрэглэгчийн өөрийн бичсэн нэрийг ч (зохиомол «баталгаат» нэр) авахгүй.
    select nullif(btrim(p.full_name), '') into v_name from public.profiles p where p.id = v_me;
    if v_name is not null then
      v_parts := regexp_split_to_array(v_name, '\s+');
      v_name := left(v_parts[1], 40)
             || case when cardinality(v_parts) > 1
                     then ' ' || upper(left(v_parts[cardinality(v_parts)], 1)) || '.'
                     else '' end;
    end if;
    new.author_id := v_me;
    new.author_name := coalesce(v_name, 'Хэрэглэгч');
    new.verified := false;
    new.created_at := now();
    return new;
  end if;

  -- UPDATE (reviews_update: зохиогч эсвэл админ) — зохиогч зөвхөн үнэлгээ, текстээ засна.
  new.agent_id := old.agent_id;
  new.author_id := old.author_id;
  new.author_name := old.author_name;
  new.listing_id := old.listing_id;
  new.created_at := old.created_at;
  new.verified := old.verified;
  -- Баталгаажсан сэтгэгдлийг засвал баталгаа унана.
  if (new.rating, new.text, new.sub_ratings, new.area, new.deal_type)
     is distinct from (old.rating, old.text, old.sub_ratings, old.area, old.deal_type) then
    new.verified := false;
  end if;
  return new;
end $$;

revoke all on function public.reviews_guard() from public, anon, authenticated;

create or replace trigger reviews_guard
  before insert or update on public.reviews
  for each row execute function public.reviews_guard();

-- ───────────── 3. listings: эрэлттэй / онцлох / AI / баталгаажсан ─────────────

-- Тухайн агентын оффисын (панелийн) админ эсэх — setVerified-ийн RLS-тэй ижил дүрэм.
create or replace function public.listing_agent_office_admin(p_agent uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.jwt_role() = 'office_admin'::public.user_role
     and public.crm_is_panel_admin()
     and exists (select 1 from public.agents a
                  where a.id = p_agent and a.office_id is not null
                    and a.office_id = public.my_office_id());
$$;

revoke all on function public.listing_agent_office_admin(uuid) from public, anon, authenticated;

create or replace function public.listings_owner_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
  v_content_changed boolean;
  -- Staff-ийн нийтлэх/синк RPC (crm2_publish_property, crm2_sync_listing...) өөрийн дүрэмтэй.
  v_rpc boolean := coalesce(current_setting('crm2.listing_rpc', true), '') = '1';
begin
  -- Системийн (service role) болон админы бичилтэд хамаарахгүй.
  if v_me is null or public.is_admin() or public.guards_bypassed() then
    return new;
  end if;
  if tg_op = 'INSERT' then
    if new.agent_id is not null then
      -- Агентын зар: «Эрэлттэй», «Онцлох» (админ) ба AI үнэлгээг (service role) агент
      -- өөрөө тавихгүй; «баталгаажсан»-ыг зөвхөн тухайн оффисын админ.
      if not v_rpc then
        new.hot := false;
        new.featured := false;
        new.ai_score := null;
        new.ai_note := null;
        if new.verified and not public.listing_agent_office_admin(new.agent_id) then
          new.verified := false;
        end if;
      end if;
      return new;
    end if;
    -- Агент «эзэн» нэрээр оффисоосоо гадуур зар оруулахгүй — агентын самбараар.
    if exists (select 1 from public.agents a where a.profile_id = v_me) then
      raise exception 'Агент зараа агентын самбараас оруулна';
    end if;
    new.owner_id := v_me;
    new.status := case when new.status = 'draft' then 'draft'::public.listing_status
                       else 'review'::public.listing_status end;
    new.verified := false;
    new.featured := false;
    new.hot := false;
    new.ai_score := null;
    new.ai_note := null;
    new.review_note := null;
    return new;
  end if;

  if old.agent_id is not null then
    if not v_rpc then
      new.hot := old.hot;
      new.featured := old.featured;
      new.ai_score := old.ai_score;
      new.ai_note := old.ai_note;
      if new.verified is distinct from old.verified
         and not public.listing_agent_office_admin(old.agent_id) then
        new.verified := old.verified;
      end if;
    end if;
    return new;
  end if;
  if new.owner_id is distinct from old.owner_id or new.agent_id is not null then
    raise exception 'Зарын эзнийг өөрчлөх боломжгүй';
  end if;
  -- Эзэн эдгээрийг өөрчлөхгүй.
  new.verified := old.verified;
  new.featured := old.featured;
  new.hot := old.hot;
  new.ai_score := old.ai_score;
  new.ai_note := old.ai_note;
  new.review_note := old.review_note;

  v_content_changed := (
    to_jsonb(new) - array['status', 'updated_at', 'verified', 'featured', 'hot', 'ai_score', 'ai_note', 'review_note']
  ) is distinct from (
    to_jsonb(old) - array['status', 'updated_at', 'verified', 'featured', 'hot', 'ai_score', 'ai_note', 'review_note']
  );

  -- Эзэн өөрөө нийтэлж чадахгүй: «Идэвхтэй» хүсвэл хяналтад илгээнэ.
  if new.status = 'active' and (old.status <> 'active' or v_content_changed) then
    new.status := 'review';
  end if;
  return new;
end $$;

-- ───────────── 4. Оффисын агентын төлөв ↔ CRM, аудит ─────────────

-- profiles руу FK-гүй, нэр нь office_person_refs-ийн CRM загварт (^crm_|crm2_|…) таарахгүй —
-- «Хасах»-ын түүхийн тоололд орохгүй; агент устсан ч аудит үлдэнэ.
create table if not exists public.office_agent_audit (
  id                uuid primary key default gen_random_uuid(),
  office_id         uuid,
  agent_id          uuid,
  target_profile_id uuid,
  actor_id          uuid,
  action            text not null check (action in (
                      'approve', 'reject', 'deactivate', 'reactivate',
                      'temp_password', 'provision_login', 'login_disabled', 'login_enabled')),
  crm_before        boolean,
  crm_after         boolean,
  ok                boolean not null default true,
  detail            jsonb not null default '{}'::jsonb,
  created_at        timestamptz not null default now()
);

comment on table public.office_agent_audit is
  'Оффисын админы агент удирдах үйлдэл (төлөв, түр нууц үг, нэвтрэлт). Зөвхөн office_set_agent_status() ба service role бичнэ.';

create index if not exists office_agent_audit_agent_idx on public.office_agent_audit (agent_id, created_at desc);
create index if not exists office_agent_audit_office_idx on public.office_agent_audit (office_id, created_at desc);

alter table public.office_agent_audit enable row level security;
revoke all on table public.office_agent_audit from public, anon, authenticated;
grant select on table public.office_agent_audit to authenticated;
grant select, insert, update on table public.office_agent_audit to service_role;

drop policy if exists office_agent_audit_read on public.office_agent_audit;
create policy office_agent_audit_read
  on public.office_agent_audit
  for select
  to authenticated
  using (
    public.is_admin()
    or (office_id = public.my_office_id() and public.jwt_role() = 'office_admin'::public.user_role)
  );

-- Агентыг батлах / татгалзах / идэвхгүй болгох / дахин идэвхжүүлэх — CRM-ийн эрхтэй нэг транзакцид.
--   rejected: crm_staff.is_active=false (crm_staff_deactivate_guard хүлээлцэхийг шалгана,
--             crm_staff_team_sync багийн ахлагч, чатыг цэвэрлэнэ — «Хасах»-тай ижил).
--   active:   «Идэвхгүй»-ээр хаасан мөрийг сэргээнэ (өмнө нь CRM хаалттай байсан бол хаалттай
--             үлдэнэ); мөргүй бол CRM ашигладаг оффист agent үүргээр нэмнэ. Хасагдсан
--             (crm_staff_removals) мөрийг сэргээхгүй. Оффис/системийн админы CRM-ийг хөндөхгүй.
create or replace function public.office_set_agent_status(p_agent uuid, p_status text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
  a public.agents%rowtype;
  s public.crm_staff%rowtype;
  v_role text;
  v_prev public.agent_status;
  v_removed boolean := false;
  v_sync boolean;
  v_before boolean;
  v_after boolean;
  v_was boolean;
  v_crm text := 'none';
  v_action text;
  v_title text;
  v_body text;
begin
  if v_me is null then
    raise exception 'Нэвтэрнэ үү.' using errcode = '42501';
  end if;
  if p_status is null or p_status not in ('active', 'rejected') then
    raise exception 'Төлөв буруу.' using errcode = '22023';
  end if;
  select * into a from public.agents where id = p_agent for update;
  if not found then
    raise exception 'Агент олдсонгүй.' using errcode = 'P0002';
  end if;
  -- can_manage_agent-тай ижил: оффисын админ зөвхөн өөрийн оффист, CRM-ийн панелийн админ байх ёстой.
  if not (public.is_admin()
          or (public.jwt_role() = 'office_admin'::public.user_role
              and public.my_office_id() is not null
              and public.my_office_id() = a.office_id
              and public.crm_is_panel_admin())) then
    raise exception 'Танд энэ агентыг удирдах эрх алга.' using errcode = '42501';
  end if;
  if p_status = 'rejected' and a.profile_id = v_me then
    raise exception 'Та өөрийгөө идэвхгүй болгож болохгүй.' using errcode = '22023';
  end if;

  v_prev := a.status;
  if v_prev::text = p_status then
    return jsonb_build_object('ok', true, 'changed', false, 'status', p_status, 'crm', 'unchanged');
  end if;

  if a.profile_id is not null then
    select p.role::text into v_role from public.profiles p where p.id = a.profile_id;
    if a.office_id is not null then
      select * into s from public.crm_staff where profile_id = a.profile_id and office_id = a.office_id;
      if s.id is not null then
        v_removed := exists (select 1 from public.crm_staff_removals r where r.staff_id = s.id);
      end if;
    end if;
  end if;
  v_sync := a.profile_id is not null and a.office_id is not null
            and coalesce(v_role, '') not in ('office_admin', 'admin') and not v_removed;
  v_before := s.is_active;

  if p_status = 'rejected' then
    if v_sync and s.id is not null and s.is_active
       and (s.panel_admin or s.roles && array['sysadmin', 'ceo']::public.crm_role[]) then
      raise exception 'CRM-д удирдлагын эрхтэй (sysadmin, CEO эсвэл панелийн админ) — эхлээд CRM → Тохиргоо → Ажилтан хэсгээс эрхийг нь хасна уу.'
        using errcode = '22023';
    end if;
    update public.agents set status = 'rejected' where id = a.id;
    if v_sync and s.id is not null and s.is_active then
      update public.crm_staff set is_active = false, offboarding = false where id = s.id;
      v_crm := 'deactivated';
    end if;
    v_action := case when v_prev = 'pending' then 'reject' else 'deactivate' end;
  else
    update public.agents set status = 'active' where id = a.id;
    if v_sync then
      if s.id is not null then
        if not s.is_active then
          select x.crm_before into v_was
            from public.office_agent_audit x
           where x.agent_id = a.id and x.action = 'deactivate' and x.ok
           order by x.created_at desc
           limit 1;
          if not found or coalesce(v_was, true) then
            update public.crm_staff set is_active = true, offboarding = false where id = s.id;
            v_crm := 'restored';
          end if;
        end if;
      elsif exists (select 1 from public.crm_staff x where x.office_id = a.office_id) then
        insert into public.crm_staff (office_id, profile_id, roles, panel_admin)
        values (a.office_id, a.profile_id, array['agent']::public.crm_role[], false)
        on conflict (office_id, profile_id) do nothing;
        if found then
          v_crm := 'added';
        end if;
      end if;
    end if;
    v_action := case when v_prev = 'pending' then 'approve' else 'reactivate' end;
  end if;

  if a.profile_id is not null and a.office_id is not null then
    select x.is_active into v_after from public.crm_staff x
     where x.profile_id = a.profile_id and x.office_id = a.office_id;
  end if;

  insert into public.office_agent_audit
    (office_id, agent_id, target_profile_id, actor_id, action, crm_before, crm_after, detail)
  values
    (a.office_id, a.id, a.profile_id, v_me, v_action, v_before, v_after,
     jsonb_build_object('from', v_prev, 'to', p_status, 'crm', v_crm));

  if a.profile_id is not null then
    v_title := case v_action
      when 'approve' then 'Та баталгаажлаа'
      when 'reactivate' then 'Бүртгэл дахин идэвхжлээ'
      when 'reject' then 'Хүсэлт татгалзагдсан'
      else 'Бүртгэл идэвхгүй боллоо' end;
    v_body := case v_action
      when 'approve' then 'Таны агентын бүртгэл идэвхжлээ.'
      when 'reactivate' then 'Оффисын админ таны агентын бүртгэлийг дахин идэвхжүүллээ.'
      when 'reject' then 'Агентын хүсэлт татгалзагдлаа.'
      else 'Оффисын админ таны агентын бүртгэлийг идэвхгүй болголоо. Нийтийн профайл харагдахгүй.' end
      || case v_crm
           when 'deactivated' then ' CRM-д нэвтрэх эрх хаагдлаа.'
           when 'restored' then ' CRM-д дахин нэвтэрч болно.'
           when 'added' then ' CRM-д нэвтэрч болно.'
           else '' end;
    insert into public.notifications (user_id, type, title, body, link)
    values (a.profile_id, 'agent', v_title, v_body, '/agent');
  end if;

  return jsonb_build_object('ok', true, 'changed', true, 'status', p_status, 'crm', v_crm,
                            'action', v_action, 'name', a.display_name);
end $$;

revoke all on function public.office_set_agent_status(uuid, text) from public, anon;
grant execute on function public.office_set_agent_status(uuid, text) to authenticated;

-- ───────────── 5. QPay: нэхэмжлэх нэг удаа л сунгалт өгнө ─────────────

create or replace function public.qpay_record_payment(
  p_sub uuid,
  p_invoice text,
  p_payment_id text,
  p_amount numeric,
  p_min_amount numeric
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  s public.subscriptions%rowtype;
  v_payment uuid;
  v_base timestamptz;
  v_end timestamptz;
begin
  -- Зэрэг ирсэн callback-уудыг цуваа болгоно.
  select * into s from public.subscriptions where id = p_sub for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  if s.qpay_invoice_id is null or s.qpay_invoice_id is distinct from p_invoice then
    return jsonb_build_object('ok', false, 'error', 'invoice_mismatch');
  end if;
  if p_amount is null or p_min_amount is null or p_amount < p_min_amount then
    return jsonb_build_object('ok', false, 'error', 'underpaid');
  end if;
  -- Энэ нэхэмжлэх (subscription) аль хэдийн бүртгэгдсэн бол дахин сунгахгүй.
  if exists (select 1 from public.payments p where p.subscription_id = s.id and p.status = 'paid') then
    return jsonb_build_object('ok', true, 'duplicate', true);
  end if;
  insert into public.payments (subscription_id, agent_id, amount, currency, qpay_payment_id, status, paid_at)
  values (s.id, s.agent_id, round(p_amount)::bigint, 'MNT', coalesce(nullif(btrim(p_payment_id), ''), p_invoice), 'paid', now())
  on conflict (qpay_payment_id) do nothing
  returning id into v_payment;
  if v_payment is null then
    return jsonb_build_object('ok', true, 'duplicate', true);
  end if;

  -- Идэвхтэй хугацаа дууссаны дараагаас сунгана (дуусаагүй бол дээр нь нэмнэ).
  select greatest(now(), coalesce(max(x.current_period_end), now())) into v_base
    from public.subscriptions x
   where x.agent_id = s.agent_id and x.status = 'active';
  v_end := v_base + interval '1 month';
  update public.subscriptions set status = 'active', current_period_end = v_end where id = s.id;
  update public.agents set premier = true where id = s.agent_id;
  return jsonb_build_object('ok', true, 'duplicate', false, 'period_end', v_end);
end $$;

revoke all on function public.qpay_record_payment(uuid, text, text, numeric, numeric) from public, anon, authenticated;
grant execute on function public.qpay_record_payment(uuid, text, text, numeric, numeric) to service_role;

-- ───────────── 6. Эзний зуучлуулах хүсэлт: цагт нэг мэдэгдэл ─────────────

create or replace function public.owner_requests_notify()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_n int;
  v_body text;
begin
  v_body := left(regexp_replace(coalesce(new.contact_name, ''), '[[:cntrl:]]', '', 'g'), 80) || ' — ' ||
            case new.deal_type when 'rent' then 'түрээслүүлэх' else 'худалдах' end ||
            coalesce(', ' || new.district, '') || coalesce(', ' || new.property_type, '');
  select count(*) into v_n
    from public.owner_requests r
   where r.office_id = new.office_id and r.created_at > now() - interval '1 hour';

  -- Сүүлийн нэг цагт уншаагүй мэдэгдэлтэй админд шинийг нэмэхгүй — тоог шинэчилнэ.
  update public.notifications n
     set title = case when v_n > 1 then v_n || ' шинэ зуучлуулах хүсэлт' else 'Зуучлуулах хүсэлт ирлээ' end,
         body = 'Сүүлийнх: ' || v_body
   where n.type = 'owner_request'
     and n.read_at is null
     and n.created_at > now() - interval '1 hour'
     and n.user_id in (select p.id from public.profiles p
                        where p.office_id = new.office_id and p.role = 'office_admin');

  -- Хүсэлтийг оффисын самбараас (зөвхөн office_admin нэвтэрдэг) шийднэ.
  insert into public.notifications (user_id, type, title, body, link)
  select p.id, 'owner_request', 'Зуучлуулах хүсэлт ирлээ', v_body, '/office/owner-requests'
    from public.profiles p
   where p.office_id = new.office_id and p.role = 'office_admin'
     and not exists (select 1 from public.notifications n
                      where n.user_id = p.id and n.type = 'owner_request' and n.read_at is null
                        and n.created_at > now() - interval '1 hour');
  return null;
end $$;

-- ───────────── 7. Хуучин CRM v1 / Concierge — API-ийн эрх хасах (DROP хийхгүй) ─────────────

do $$
declare
  v_fn text;
  v_rel text;
  v_proc regprocedure;
  v_class regclass;
  n_fn int := 0;
  n_rel int := 0;
begin
  foreach v_fn in array array[
    'public.concierge_acquisition_command(text,jsonb,text)',
    'public.concierge_acquisition_snapshot(uuid,integer,integer,uuid,boolean)',
    'public.concierge_available_offices()',
    'public.concierge_case_staff(uuid)',
    'public.concierge_command(text,jsonb,text)',
    'public.concierge_listing_context(uuid)',
    'public.concierge_office_staff(uuid)',
    'public.concierge_panel_admin_allowed()',
    'public.crm_accept_lead(uuid)',
    'public.crm_add_business_days(uuid,date,integer)',
    'public.crm_add_dispute_evidence(uuid,text,jsonb)',
    'public.crm_agent_week_metrics(date,uuid,uuid)',
    'public.crm_agent_week_moves(date,uuid,uuid)',
    'public.crm_anonymize_blockers(uuid)',
    'public.crm_anonymize_contact(uuid)',
    'public.crm_appeal_lead_dispute(uuid,text)',
    'public.crm_apply_txn_correction(uuid,jsonb,text)',
    'public.crm_approve_forecast_snapshot(uuid,text)',
    'public.crm_can_act_on_offer(uuid)',
    'public.crm_can_edit_lease(uuid)',
    'public.crm_can_edit_opportunity(uuid)',
    -- crm_can_edit_property(uuid)-г ЗОРИУД үлдээв: crm_listing_agreements-ийн INSERT/UPDATE
    -- бодлого үүнийг дууддаг — хасвал 20261124000800-ийг (эзний шийдвэр хүлээгдэж буй) далдуур
    -- хэрэгжүүлсэнтэй адил болно.
    'public.crm_can_edit_txn(uuid)',
    'public.crm_can_view_document(uuid)',
    'public.crm_can_view_lease(uuid)',
    'public.crm_can_view_match(uuid,uuid)',
    'public.crm_can_view_mgmt_agreement(uuid)',
    'public.crm_can_view_opportunity(uuid)',
    'public.crm_can_view_pl6(uuid)',
    'public.crm_can_view_txn(uuid)',
    'public.crm_cancel_pool_claim(uuid)',
    'public.crm_check_gate(uuid,crm_gate_code)',
    'public.crm_clean_evidence(jsonb)',
    'public.crm_commission_dispute_can_add(uuid)',
    'public.crm_commission_dispute_conflict(uuid,uuid)',
    'public.crm_commission_record_payout(uuid,numeric,text)',
    'public.crm_commission_release_hold(uuid,text)',
    'public.crm_commission_set_status(uuid,crm_commission_status,text)',
    'public.crm_commission_txn_party(uuid)',
    'public.crm_complete_data_request(uuid)',
    'public.crm_consume_export_request(uuid,integer)',
    'public.crm_decide_data_request(uuid,boolean,text)',
    'public.crm_decide_export_request(uuid,boolean,text,integer)',
    'public.crm_decide_lead_appeal(uuid,text,text)',
    'public.crm_decide_lead_dispute(uuid,text,text)',
    'public.crm_decide_offer(uuid,text,text,text,uuid)',
    'public.crm_decide_offer_approval(uuid,boolean,text)',
    'public.crm_decide_pool_claim(uuid,boolean,text)',
    'public.crm_escalate_lead_dispute(uuid,text)',
    'public.crm_find_duplicates(text,text,text,uuid)',
    'public.crm_fx_rate(uuid,text,date)',
    'public.crm_get_aml_case(uuid)',
    'public.crm_get_aml_cases(text)',
    'public.crm_get_opp_offers(uuid)',
    'public.crm_invoice_txn_on_hold(crm_invoices)',
    'public.crm_kpi_followup(date,date)',
    'public.crm_kpi_funnel(date,date)',
    'public.crm_kpi_period_metrics(date,date)',
    'public.crm_kpi_pipeline_in(uuid,text,text)',
    'public.crm_kpi_pipeline_stages()',
    'public.crm_kpi_response_time(date,date)',
    'public.crm_kpi_stage_step(text)',
    'public.crm_lead_dispute_conflict(uuid,uuid)',
    'public.crm_lead_dispute_facts(uuid)',
    'public.crm_lead_inactive_evidence(uuid)',
    'public.crm_lead_sla_evidence(uuid)',
    'public.crm_leaderboard(date,date)',
    'public.crm_lease_duration_tier(uuid,date,date)',
    'public.crm_log_doc_view(uuid)',
    'public.crm_lookup_writable(text)',
    'public.crm_maintenance_approval_limit(uuid,uuid)',
    'public.crm_mask_name(text)',
    'public.crm_mask_phone(text)',
    'public.crm_merge_contacts(uuid,uuid,jsonb,text)',
    'public.crm_monthly_completeness(jsonb)',
    'public.crm_move_opportunity_stage(uuid,uuid,text,uuid,text)',
    'public.crm_my_roles()',
    'public.crm_offboarding_blockers_internal_ok()',
    'public.crm_offer_needs_approval(crm_offers)',
    'public.crm_open_lead_dispute(uuid,text,jsonb,text)',
    'public.crm_opp_stage_missing(uuid,crm_gate_code)',
    'public.crm_pool_leads()',
    'public.crm_profile_has_role(uuid,uuid,crm_role[])',
    'public.crm_property_activation_check(uuid)',
    'public.crm_quality_audit_cancel(uuid,text)',
    'public.crm_quality_audit_complete(uuid,text,boolean)',
    'public.crm_quality_audit_review(uuid,text,text)',
    'public.crm_quality_audit_start(date,date,text,uuid,uuid,integer)',
    'public.crm_reassign_lead(uuid,uuid,text,text)',
    'public.crm_reassign_opportunity(uuid,uuid,text,text)',
    'public.crm_reassign_property_role(uuid,crm_property_role,uuid,text)',
    'public.crm_recompute_txn_completeness(uuid)',
    'public.crm_recycle_lead(uuid,text,text,boolean)',
    'public.crm_request_offer_approval(uuid,text)',
    'public.crm_request_pool_claim(uuid,text)',
    'public.crm_review_contract(uuid,text)',
    'public.crm_review_lead_dispute(uuid,text,text)',
    'public.crm_same_office(uuid)',
    'public.crm_set_property_status(uuid,crm_property_status,text)',
    'public.crm_setting_num(uuid,text,text[],numeric)',
    'public.crm_take_forecast_snapshot(uuid,date,text)',
    'public.crm_track_enroll(uuid,uuid,uuid)',
    'public.crm_track_stop(uuid)',
    'public.crm_transfer_opportunity_pipeline(uuid,text,text)',
    'public.crm_txn_closing_checks(uuid)',
    'public.crm_txn_on_hold(uuid)',
    'public.crm_update_property_price(uuid,numeric,numeric,text)',
    'public.crm_weekly_can_approve(uuid)',
    'public.crm_weekly_can_view(uuid)',
    'public.crm_weekly_final_lock_at(uuid,date)',
    'public.crm_weekly_plan_owned(uuid)',
    'public.crm_weekly_plan_visible(uuid)',
    'public.crm_weekly_review_open(uuid)',
    'public.crm_weekly_scope_agents(uuid,uuid)',
    'public.crm_weekly_text_array(jsonb,text[])',
    'public.crm_withdraw_lead_dispute(uuid)',
    'public.crm_write_audit(uuid,text,uuid,text,text,jsonb,jsonb,text)',
    'public.recalc_agent_aggregates(uuid)',
    'public.recalc_office_aggregates(uuid)'
  ] loop
    v_proc := to_regprocedure(v_fn);
    if v_proc is not null then
      execute format('revoke execute on function %s from public, anon, authenticated', v_proc);
      n_fn := n_fn + 1;
    end if;
  end loop;

  foreach v_rel in array array[
    'public.concierge_acquisition_agents',
    'public.concierge_acquisition_events',
    'public.concierge_acquisition_leads',
    'public.concierge_audit',
    'public.concierge_availability',
    'public.concierge_cases',
    'public.concierge_commands',
    'public.concierge_costs',
    'public.concierge_handoffs',
    'public.concierge_jobs',
    'public.concierge_matches',
    'public.concierge_messages',
    'public.concierge_offices',
    'public.concierge_outcomes',
    'public.concierge_prospects',
    'public.concierge_publications',
    'public.concierge_sources',
    'public.concierge_suppressions',
    'public.crm_activities',
    'public.crm_activity_properties',
    'public.crm_agent_daily_stats',
    'public.crm_aml_alerts',
    'public.crm_aml_cases',
    'public.crm_aml_holds',
    'public.crm_arrears_escalations',
    'public.crm_assignment_state',
    'public.crm_audit_log',
    'public.crm_automation_rules',
    'public.crm_budgets',
    'public.crm_calendar_days',
    'public.crm_checklist_templates',
    'public.crm_coi_declarations',
    'public.crm_commission_clawbacks',
    'public.crm_commission_config_versions',
    'public.crm_commission_dispute_evidence',
    'public.crm_commission_disputes',
    'public.crm_commission_records',
    'public.crm_commission_status_history',
    'public.crm_complaints',
    'public.crm_contact_aml',
    'public.crm_contact_emails',
    'public.crm_contact_merges',
    'public.crm_contact_phones',
    'public.crm_contact_tags',
    'public.crm_data_requests',
    'public.crm_deposit_deductions',
    'public.crm_document_links',
    'public.crm_documents',
    'public.crm_duty_shifts',
    'public.crm_export_requests',
    'public.crm_forecast_snapshots',
    'public.crm_gate_requirements',
    'public.crm_handover_acts',
    'public.crm_handover_items',
    'public.crm_inspection_items',
    'public.crm_inspections',
    'public.crm_invoices',
    'public.crm_lead_disputes',
    'public.crm_lease_expense_lines',
    'public.crm_leases',
    'public.crm_lookups',
    'public.crm_maintenance_requests',
    'public.crm_management_agreement_properties',
    'public.crm_management_agreements',
    'public.crm_matches',
    'public.crm_meeting_decisions',
    'public.crm_meter_readings',
    'public.crm_meters',
    'public.crm_mgmt_reviews',
    'public.crm_monthly_records',
    'public.crm_need_profiles',
    'public.crm_next_step_log',
    'public.crm_nps_surveys',
    'public.crm_offers',
    'public.crm_open_house_visits',
    'public.crm_open_houses',
    'public.crm_opportunities',
    'public.crm_owner_profiles',
    'public.crm_owner_statements',
    'public.crm_ownership_history',
    'public.crm_payment_schedule_lines',
    'public.crm_payments',
    'public.crm_pipelines',
    'public.crm_pool_claims',
    'public.crm_price_analyses',
    'public.crm_properties',
    'public.crm_property_price_history',
    'public.crm_property_roles',
    'public.crm_public_link_items',
    'public.crm_public_links',
    'public.crm_referrals',
    'public.crm_rule_runs',
    'public.crm_sales_meetings',
    'public.crm_saved_views',
    'public.crm_sequences',
    'public.crm_showings',
    'public.crm_stage_history',
    'public.crm_stage_transitions',
    'public.crm_stages',
    'public.crm_task_links',
    'public.crm_today_snoozes',
    'public.crm_track_enrollments',
    'public.crm_track_tasks',
    'public.crm_track_templates',
    'public.crm_transaction_agent_roles',
    'public.crm_transaction_approvals',
    'public.crm_transaction_contracts',
    'public.crm_transaction_parties',
    'public.crm_transactions',
    'public.crm_txn_corrections',
    'public.crm_v_agent_data_quality',
    'public.crm_v_agent_today',
    'public.crm_v_arrears_aging',
    'public.crm_v_commission_summary',
    'public.crm_v_cross_branch_deals',
    'public.crm_v_golden_rule_violations',
    'public.crm_v_kpi_monthly',
    'public.crm_v_lead_funnel',
    'public.crm_v_lead_hygiene',
    'public.crm_v_monthly_compliance',
    'public.crm_v_occupancy',
    'public.crm_v_pipeline_forecast',
    'public.crm_v_quality_checks',
    'public.crm_v_quality_summary',
    'public.crm_vacancy_periods',
    'public.crm_vendors',
    'public.crm_weekly_actuals',
    'public.crm_weekly_commitment_log',
    'public.crm_weekly_plan_items',
    'public.crm_weekly_plan_targets',
    'public.crm_weekly_plans',
    'public.crm_weekly_reviews',
    'public.crm_weekly_scores',
    'public.crm_zone_directory'
  ] loop
    v_class := to_regclass(v_rel);
    if v_class is not null then
      execute format('revoke all on table %s from anon, authenticated', v_class);
      n_rel := n_rel + 1;
    end if;
  end loop;
  raise notice 'legacy revoke: % functions, % relations', n_fn, n_rel;
end $$;

-- ───────────── 8. Storage: 'listings', 'office-assets' ─────────────

-- Одоогийн дээд хэмжээ: listings 6.3 MB, office-assets 9.3 MB (2026-11-25). gif — зар оруулах
-- маягт (MultiPhotoUpload) зөвшөөрдөг; avif — office-assets-д 1 файл бий.
update storage.buckets
   set file_size_limit = 10485760,
       allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'image/avif', 'image/gif']
 where id = 'listings';
update storage.buckets
   set file_size_limit = 10485760,
       allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'image/avif']
 where id = 'office-assets';

-- listings: жагсаалт (list API) — зөвхөн ӨӨРИЙН оруулсан файл (publish-photos-ийн буцаалтын remove(),
-- upload-ийн RETURNING), платформын админ. Бусдын файл, тамгагүй эх (wm/ хуулбартай үндсэн файл)
-- нэрээр жагсаагдахгүй; аль ч оффисын ажилтан бүх bucket-ийг жагсаахгүй. Нийтийн URL хэвээр (RLS-гүй).
-- import-listing зургийг нийтийн URL-аар (баталгаажуулсан угтвар) татна — SELECT эрх шаардахгүй.
-- АНХААР: тамгагүй эх файлууд нийтийн URL-аар (wm/<ver>/ угтварыг хасаж) нээлттэй хэвээр —
-- хаалттай bucket руу зөөх нь тусдаа, эзний зөвшөөрөлтэй алхам (lib/watermark.ts).
drop policy if exists listings_public_read on storage.objects;
drop policy if exists listings_auth_read on storage.objects;
create policy listings_auth_read on storage.objects
  for select to authenticated
  using (
    bucket_id = 'listings'
    and (owner = (select auth.uid()) or (select public.is_admin()))
  );

-- listings: оруулах — идэвхтэй агент / оффисын админ / CRM-ийн ажилтан (Staff нийтлэл), эзэн
-- зөвхөн owners/<өөрийн uid>/ хавтсанд. (Хүлээгдэж буй агент, энгийн хэрэглэгч үндсэнд биш.)
drop policy if exists listings_auth_insert on storage.objects;
create policy listings_auth_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'listings'
    and (
      ((storage.foldername(name))[1] = 'owners'
        and (storage.foldername(name))[2] = (select auth.uid())::text)
      or (coalesce((storage.foldername(name))[1], '') <> 'owners'
          and (exists (select 1 from public.agents a
                        where a.profile_id = (select auth.uid()) and a.status = 'active')
               or (select public.jwt_role()) in ('office_admin'::public.user_role, 'admin'::public.user_role)
               or (select public.crm2_is_member())))
    )
  );

-- office-assets: жагсаалт — зөвхөн өөрийн файл (remove()-д хэрэгтэй), админ.
drop policy if exists office_assets_public_read on storage.objects;
drop policy if exists office_assets_auth_read on storage.objects;
create policy office_assets_auth_read on storage.objects
  for select to authenticated
  using (bucket_id = 'office-assets' and (owner = (select auth.uid()) or (select public.is_admin())));

-- office-assets: оруулах — <өөрийн uid>/ хавтсанд; оффисын админ, админ эсвэл ИДЭВХТЭЙ агент
-- (профайл зураг). Хүлээгдэж буй агент (handle_new_user: role='agent' metadata-тай дурын бүртгэл)
-- оффис баталсны дараа л зураг оруулна — үнэгүй бүртгэлээр нийтийн домэйнд файл байршуулахгүй.
drop policy if exists office_assets_auth_insert on storage.objects;
create policy office_assets_auth_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'office-assets'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and ((select public.jwt_role()) in ('office_admin'::public.user_role, 'admin'::public.user_role)
         or exists (select 1 from public.agents a
                     where a.profile_id = (select auth.uid()) and a.status = 'active'))
  );

notify pgrst, 'reload schema';
