-- Оффисын админ агентыг «Хасах» — идэвхгүй болгохоос цааш, бүрмөсөн гаргах.
--
-- Дүрэм:
--   * Нээлттэй Staff хэлцэл, Staff хөрөнгийн үүрэг (crm_offboarding_blockers),
--     чөлөөтэй ажилтны орлогч, Concierge холбоос, өөрийгөө/админыг хасах —
--     эхлээд шийдвэрлэнэ (хориг).
--   * CRM түүхгүй хүн → crm_staff мөр, agent мөр, нэвтрэлт (auth.users →
--     profiles cascade) бүрэн устна.
--   * CRM түүхтэй хүн → түүх хэвээр: crm_staff идэвхгүй + crm_staff_removals, профайл
--     «(хасагдсан) Нэр» нэртэй булш болж үлдэнэ (role=buyer, оффисгүй), agent
--     мөр устна, нэвтрэлт хаагдаж и-мэйл/утас/Google холбоос чөлөөлөгдөнө
--     (хүн дахин бүртгүүлж болно).
--   * Зар: «transfer» — оффисын идэвхтэй өөр агентад (лид, төсөл, үзлэгийн
--     хамт); «delete» — устгана. CRM-ийн хөрөнгөтэй холбоотой зарыг устгахгүй.
-- Бүгд нэг транзакцид (SECURITY DEFINER RPC) — хагас хасалт үүсэхгүй.

set local lock_timeout = '5s';

-- 1) Хасагдсан ажилтны бүртгэл (идэвхгүйгээс ялгаатай — сэргээхгүй).
--    crm_staff-д багана нэмэхгүй: ALTER TABLE нь CRM-ийн бүх уншилтыг
--    түгжинэ; тусдаа хүснэгт нь зөвхөн бичилтийг богино хугацаанд хүлээлгэнэ.
create table if not exists public.crm_staff_removals (
  staff_id   uuid primary key references public.crm_staff (id) on delete cascade,
  office_id  uuid not null,
  profile_id uuid not null,
  name       text,
  removed_by uuid,
  removed_at timestamptz not null default now()
);

comment on table public.crm_staff_removals is
  'Оффисын админ CRM түүхтэй агентыг «Хасах» үед (office_remove_agent). Түүх хадгалагдсан, нэвтрэлт устсан — crm_staff мөрийг дахин идэвхжүүлэхгүй, шинээр нэмнэ.';

alter table public.crm_staff_removals enable row level security;
revoke all on table public.crm_staff_removals from public, anon, authenticated;
grant select on table public.crm_staff_removals to authenticated;
grant select, insert, update, delete on table public.crm_staff_removals to service_role;

drop policy if exists crm_staff_removals_read on public.crm_staff_removals;
create policy crm_staff_removals_read
  on public.crm_staff_removals
  for select
  to authenticated
  using (
    public.is_admin()
    or (office_id = public.crm_office_id()
        and (public.crm2_is_member() or public.jwt_role() = 'office_admin'))
  );

create or replace function public.crm_staff_removed_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.is_active and exists (select 1 from public.crm_staff_removals r where r.staff_id = new.id) then
    raise exception 'CRM: хасагдсан ажилтныг сэргээхгүй — шинээр агентаар нэмнэ үү';
  end if;
  return new;
end $$;

revoke all on function public.crm_staff_removed_guard() from public, anon, authenticated;

-- CREATE OR REPLACE (DROP TRIGGER нь ACCESS EXCLUSIVE түгжээ авдаг).
create or replace trigger crm_staff_removed_guard
  before update on public.crm_staff
  for each row execute function public.crm_staff_removed_guard();

-- 2) Хүнийг заасан бүх мөрийн тоо (CRM «түүх» эсэхийг шийднэ).
--    CRM төрлийн хүснэгтийн бүх uuid / uuid[] / jsonb баганыг шалгана —
--    FK-гүй created_by/updated_by гэх мэт багана ч орно; бусад хүснэгтэд
--    profiles руу заасан FK. Хувийн/түр мөр (мэдэгдэл, дуртай, хайлт,
--    push, харагдац...) тоологдохгүй — данстай хамт устна.
create or replace function public.office_person_refs(p_profile uuid, p_staff uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  r record;
  n bigint;
  v jsonb := '{}'::jsonb;
  v_crm_re constant text := '^(crm_|crm2_|task_|tasks$|staff_chat|concierge_)';
  -- crm2_digest_log / crm2_nudge_log — илгээсэн сануулгын бүртгэл (мэдэгдэл шиг).
  v_personal constant text[] := array[
    'crm_notification_prefs', 'crm_push_subscriptions', 'crm_saved_views',
    'crm_today_snoozes', 'staff_chat_members', 'crm2_digest_log', 'crm2_nudge_log'];
  v_personal_fk constant text[] := array[
    'agents.profile_id', 'favorites.user_id', 'recently_viewed.user_id',
    'notifications.user_id', 'saved_searches.user_id', 'conversations.buyer_id',
    'messages.sender_id', 'reviews.author_id', 'viewings.buyer_id',
    'owner_requests.user_id', 'office_invites.used_by', 'listing_share_posts.posted_by',
    'listings.owner_id', 'office_requests.requester_id'];
begin
  if p_profile is null then
    return v;
  end if;

  for r in
    select c.oid::regclass as tbl, c.relname::text as name,
           string_agg(
             case
               when t.typname = 'uuid' then format('%I in ($1, $2)', a.attname)
               when t.typname = '_uuid' then format('%I && array[$1, $2]', a.attname)
               else format('(strpos(%1$I::text, $1::text) > 0 or strpos(%1$I::text, $2::text) > 0)', a.attname)
             end, ' or ' order by a.attnum) as cond
      from pg_class c
      join pg_namespace ns on ns.oid = c.relnamespace and ns.nspname = 'public'
      join pg_attribute a on a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped
      join pg_type t on t.oid = a.atttypid
     where c.relkind = 'r'
       and not c.relispartition
       and c.relname ~ v_crm_re
       and c.relname <> all (v_personal)
       and t.typname in ('uuid', '_uuid', 'jsonb', 'json')
       -- Аудитын бүртгэлд зөвхөн «хэн хийсэн» нь түүх; ажилтны мөрийн өөрийн
       -- үүсгэлт/өөрчлөлтийн бичлэг (entity_id, утгууд) тоологдохгүй.
       and not (c.relname = 'crm_audit_log' and a.attname <> 'actor_id')
       and c.relname <> 'crm_staff_removals'
       -- Хүний өөрийн crm_staff мөр (бусдын leave_substitute_id тоологдоно).
       and not (c.relname = 'crm_staff' and a.attname in ('id', 'profile_id'))
       -- Тооцоолсон агшин зураг (хуучин CRM-ийн cron) — ажлын түүх биш,
       -- бүрэн устгалд хамт устна.
       and c.relname <> 'crm_agent_daily_stats'
       -- Багийн ахлагч/санал болгосон ахлагч — идэвхгүй болгоход
       -- crm_staff_team_sync цэвэрлэнэ (тохиргоо, түүх биш).
       and not (c.relname = 'crm_teams' and a.attname in ('lead_profile_id', 'pending_lead_profile_id'))
     group by c.oid, c.relname
  loop
    execute format('select count(*) from %s where %s', r.tbl, r.cond)
      into n using p_profile, coalesce(p_staff, p_profile);
    if n > 0 then
      v := v || jsonb_build_object(r.name, n);
    end if;
  end loop;

  for r in
    select k.conrelid::regclass as tbl, cl.relname::text as name, a.attname::text as col
      from pg_constraint k
      join pg_class cl on cl.oid = k.conrelid
      join pg_namespace ns on ns.oid = cl.relnamespace and ns.nspname = 'public'
      join pg_attribute a on a.attrelid = k.conrelid and a.attnum = k.conkey[1]
     where k.contype = 'f'
       and k.confrelid = 'public.profiles'::regclass
       and cardinality(k.conkey) = 1
       and cl.relname !~ v_crm_re
       and (cl.relname || '.' || a.attname) <> all (v_personal_fk)
  loop
    execute format('select count(*) from %s where %I = $1', r.tbl, r.col) into n using p_profile;
    if n > 0 then
      v := v || jsonb_build_object(r.name || '.' || r.col, n);
    end if;
  end loop;

  return v;
end $$;

revoke all on function public.office_person_refs(uuid, uuid) from public, anon, authenticated;
grant execute on function public.office_person_refs(uuid, uuid) to service_role;

-- 3) Хасахын өмнөх шалгалт — баталгаажуулах цонхонд харуулна.
create or replace function public.office_agent_removal_check(p_agent uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
  a public.agents%rowtype;
  p public.profiles%rowtype;
  s public.crm_staff%rowtype;
  b jsonb;
  v_blockers jsonb := '[]'::jsonb;
  v_items jsonb;
  v_refs jsonb := '{}'::jsonb;
  v_listings jsonb;
  v_deals int;
  v_roles int;
  v_legacy int;
  v_had_listings boolean := false;
  v_work boolean := false;
  n int;
begin
  if v_me is null then
    raise exception 'Нэвтэрнэ үү.' using errcode = '42501';
  end if;
  select * into a from public.agents where id = p_agent;
  if not found then
    raise exception 'Агент олдсонгүй.' using errcode = 'P0002';
  end if;
  if not (public.is_admin()
          or (public.jwt_role() = 'office_admin'
              and public.my_office_id() is not null
              and public.my_office_id() = a.office_id)) then
    raise exception 'Танд энэ агентыг хасах эрх алга.' using errcode = '42501';
  end if;

  if a.profile_id is not null then
    select * into p from public.profiles where id = a.profile_id;
    select * into s from public.crm_staff where profile_id = a.profile_id and office_id = a.office_id;
  end if;

  if a.profile_id = v_me then
    v_blockers := v_blockers || jsonb_build_object('code', 'self',
      'message', 'Та өөрийгөө хасаж болохгүй.');
  end if;
  if p.role in ('admin', 'office_admin') then
    v_blockers := v_blockers || jsonb_build_object('code', 'admin',
      'message', 'Админ эсвэл оффисын админ бүртгэлийг хасахгүй.');
  end if;
  if s.id is not null
     and not exists (select 1 from public.crm_staff_removals r where r.staff_id = s.id)
     and (s.panel_admin or s.roles && array['sysadmin', 'ceo']::public.crm_role[]) then
    v_blockers := v_blockers || jsonb_build_object('code', 'crm_admin',
      'message', 'CRM-д удирдлагын эрхтэй (sysadmin, CEO эсвэл панелийн админ) — эхлээд CRM → Тохиргоо → Ажилтан хэсгээс эрхийг нь хасна уу.');
  end if;
  if a.profile_id is not null
     and (exists (select 1 from public.agents x where x.profile_id = a.profile_id and x.id <> a.id)
          or exists (select 1 from public.crm_staff x
                      where x.profile_id = a.profile_id and x.office_id is distinct from a.office_id)) then
    v_blockers := v_blockers || jsonb_build_object('code', 'other_office',
      'message', 'Энэ хүн өөр оффист (эсвэл өөр агентын картаар) бас бүртгэлтэй — системийн админд хандана уу.');
  end if;

  -- CRM хүлээлцэх: идэвхгүй болгохтой ИЖИЛ дүрэм (crm_offboarding_blockers).
  if a.profile_id is not null then
    perform set_config('crm.guard_internal', '1', true);
    b := public.crm_offboarding_blockers(a.profile_id);
    perform set_config('crm.guard_internal', '', true);
    v_deals := coalesce((b ->> 'opportunities')::int, 0);
    v_roles := coalesce((b ->> 'property_roles')::int, 0);
    v_legacy := coalesce((b ->> 'leads')::int, 0);

    if v_deals > 0 then
      select coalesce(jsonb_agg(jsonb_build_object(
               'deal_id', d.id, 'deal_code', d.code,
               'property_id', d.property_id, 'property_code', pr.code) order by d.created_at), '[]'::jsonb)
        into v_items
        from (select x.* from public.crm2_deals x
               where x.agent_id = a.profile_id and x.is_open
                 and x.office_id = coalesce((b ->> 'office_id')::uuid, a.office_id)
               order by x.created_at limit 20) d
        left join public.crm2_properties pr on pr.id = d.property_id;
      v_blockers := v_blockers || jsonb_build_object('code', 'deals', 'count', v_deals,
        'message', format('Нээлттэй Staff хэлцэл %s — өөр агентад шилжүүлнэ үү.', v_deals),
        'items', v_items);
    end if;
    if v_roles > 0 then
      select coalesce(jsonb_agg(jsonb_build_object(
               'property_id', x.id, 'property_code', x.code,
               'roles', array_remove(array[
                  case when x.listing_agent_id = a.profile_id then 'listing' end,
                  case when x.contract_agent_id = a.profile_id then 'contract' end,
                  case when x.photo_agent_id = a.profile_id then 'photo' end], null)) order by x.code), '[]'::jsonb)
        into v_items
        from (select pr.* from public.crm2_properties pr
               where pr.office_id = coalesce((b ->> 'office_id')::uuid, a.office_id)
                 and pr.status in ('draft', 'active', 'suspended')
                 and a.profile_id in (pr.listing_agent_id, pr.contract_agent_id, pr.photo_agent_id)
               order by pr.code limit 20) x;
      v_blockers := v_blockers || jsonb_build_object('code', 'property_roles', 'count', v_roles,
        'message', format('Staff хөрөнгийн үүрэг %s (листлэгч, гэрээ, зураг) — өөр агентаар солино уу.', v_roles),
        'items', v_items);
    end if;
    if v_legacy > 0 then
      v_blockers := v_blockers || jsonb_build_object('code', 'legacy', 'count', v_legacy,
        'message', format('Хуучин CRM-ийн нээлттэй бичлэг %s — CRM-ийн удирдлагад хандана уу.', v_legacy));
    end if;
    if coalesce((b ->> 'is_active')::boolean, false)
       and coalesce((b ->> 'had_ownership')::boolean, false)
       and not coalesce((b ->> 'approved_act')::boolean, false) then
      v_blockers := v_blockers || jsonb_build_object('code', 'act',
        'message', 'Батлагдсан хүлээлцэх акт шаардлагатай — CRM-ийн удирдлагад хандана уу.');
    end if;

    -- Чөлөөтэй (эсвэл чөлөө авах) ажилтны орлогч
    select coalesce(jsonb_agg(jsonb_build_object('staff_id', x.id,
             'name', coalesce(xp.full_name, 'Ажилтан'), 'to', x.on_leave_to)), '[]'::jsonb), count(*)
      into v_items, n
      from public.crm_staff x
      left join public.profiles xp on xp.id = x.profile_id
     where x.leave_substitute_id = a.profile_id
       and x.is_active
       and x.on_leave_from is not null
       and (x.on_leave_to is null or x.on_leave_to >= public.crm_ub_today());
    if n > 0 then
      v_blockers := v_blockers || jsonb_build_object('code', 'substitute', 'count', n,
        'message', 'Чөлөөтэй ажилтны орлогчоор томилогдсон — CRM → Тохиргоо → Ажилтан хэсгээс орлогчийг солино уу.',
        'items', v_items);
    end if;
  end if;

  -- Concierge үйлчилгээ (ON DELETE RESTRICT, удирддаг зарыг өөрчлөхгүй)
  select (select count(*) from public.concierge_cases c where c.agent_id = a.id)
       + (select count(*) from public.concierge_handoffs h where h.agent_id = a.id)
       + (select count(*) from public.concierge_offices o where o.default_agent_id = a.id)
       + (select count(*) from public.concierge_cases c
            join public.listings l on l.id = c.listing_id
           where l.agent_id = a.id and c.agent_id is distinct from a.id)
    into n;
  if n > 0 then
    v_blockers := v_blockers || jsonb_build_object('code', 'concierge', 'count', n,
      'message', 'Concierge үйлчилгээнд холбоотой — системийн админд хандана уу.');
  end if;

  select jsonb_build_object(
           'total', count(*),
           'active', count(*) filter (where l.status = 'active'),
           'linked', count(*) filter (where exists (select 1 from public.crm2_properties cp where cp.listing_id = l.id)))
    into v_listings
    from public.listings l
   where l.agent_id = a.id;

  if a.profile_id is not null then
    v_refs := public.office_person_refs(a.profile_id, s.id);
  end if;

  -- Эзний дүрэм (2026-11-24): ЯМАР Ч зар оруулж байгаагүй хүнийг түүхтэй нь
  -- бүрэн устгана; зар оруулж байсан (нийтийн зар эсвэл Staff хөрөнгө) эсвэл
  -- одоогийн CRM-д оффисын бүртгэл (харилцагч, хэлцэл, гэрээ, ажил...)
  -- хариуцсан/үүсгэсэн хүний CRM түүхийг хадгалж архивлана.
  v_had_listings := ((v_listings ->> 'total')::int > 0)
    or (a.profile_id is not null and exists (
          select 1 from public.crm2_properties cp
           where a.profile_id in (cp.listing_agent_id, cp.contract_agent_id, cp.photo_agent_id, cp.created_by)));
  v_work := exists (select 1 from jsonb_object_keys(v_refs) k where k like 'crm2\_%' and k <> 'crm2_history');

  return jsonb_build_object(
    'agent', jsonb_build_object(
      'id', a.id, 'name', a.display_name, 'status', a.status,
      'office_id', a.office_id, 'has_login', a.profile_id is not null),
    'staff', case when s.id is null then null
                  else jsonb_build_object('id', s.id, 'is_active', s.is_active, 'offboarding', s.offboarding) end,
    'blockers', v_blockers,
    'had_listings', v_had_listings,
    'has_crm_work', v_work,
    -- delete: бүрэн устгал (түүхтэй нь); archive: CRM түүх хадгалагдана
    'mode', case when a.profile_id is not null and (v_had_listings or v_work) then 'archive' else 'delete' end,
    'has_history', v_refs <> '{}'::jsonb,
    'history', v_refs,
    'listings', v_listings,
    'leads', (select count(*) from public.leads x where x.agent_id = a.id),
    'conversations', (select count(*) from public.conversations x where x.agent_id = a.id),
    'projects', (select count(*) from public.projects x where x.agent_id = a.id),
    'viewings', (select count(*) from public.viewings x where x.agent_id = a.id)
  );
end $$;

revoke all on function public.office_agent_removal_check(uuid) from public, anon;
grant execute on function public.office_agent_removal_check(uuid) to authenticated;

-- 4) Хасах — шалгалтыг дахин хийж, нэг транзакцид гүйцэтгэнэ.
--    p_listings: 'transfer' (p_target — оффисын идэвхтэй өөр агент) | 'delete'.
--    Зар, лид, төсөл, үзлэг огт байхгүй бол null байж болно.
create or replace function public.office_remove_agent(
  p_agent uuid,
  p_listings text,
  p_target uuid,
  p_confirm text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
  c jsonb;
  a public.agents%rowtype;
  p public.profiles%rowtype;
  s public.crm_staff%rowtype;
  t public.agents%rowtype;
  v_need_choice boolean;
  v_how text;
  v_moved int := 0;
  v_deleted int := 0;
  v_mode text;
  v_name text;
  v_fallback text;
  r record;
begin
  -- Зэрэг хоёр хасалт / өөрчлөлтөөс сэргийлж agent мөрийг түгжинэ.
  perform 1 from public.agents where id = p_agent for update;

  c := public.office_agent_removal_check(p_agent); -- эрх + хориг
  if jsonb_array_length(c -> 'blockers') > 0 then
    raise exception '%', c -> 'blockers' -> 0 ->> 'message' using errcode = 'P0001';
  end if;

  select * into a from public.agents where id = p_agent;
  if lower(normalize(regexp_replace(btrim(coalesce(p_confirm, '')), '\s+', ' ', 'g'), NFC))
     is distinct from lower(normalize(regexp_replace(btrim(coalesce(a.display_name, '')), '\s+', ' ', 'g'), NFC))
     or btrim(coalesce(a.display_name, '')) = '' then
    raise exception 'Баталгаажуулах нэр таарсангүй.' using errcode = '22023';
  end if;

  v_need_choice := (c -> 'listings' ->> 'total')::int + (c ->> 'leads')::int
                 + (c ->> 'projects')::int + (c ->> 'viewings')::int > 0;
  -- Шилжүүлэх/устгах зүйлгүй бол сонголтыг үл хэрэгсэнэ.
  v_how := case when v_need_choice then p_listings end;
  if v_need_choice and coalesce(v_how, '') not in ('transfer', 'delete') then
    raise exception 'Зарыг шилжүүлэх эсвэл устгахыг сонгоно уу.' using errcode = '22023';
  end if;
  if v_how = 'transfer' then
    select * into t from public.agents
     where id = p_target and office_id = a.office_id and status = 'active' and id <> a.id;
    if not found then
      raise exception 'Хүлээн авах агент буруу — оффисын идэвхтэй өөр агентыг сонгоно уу.' using errcode = '22023';
    end if;
  elsif v_how = 'delete' and (c -> 'listings' ->> 'linked')::int > 0 then
    raise exception 'CRM-ийн Staff хөрөнгөтэй холбоотой % зар байна — устгахгүй, шилжүүлэх сонголтыг хийнэ үү.',
      (c -> 'listings' ->> 'linked')::int using errcode = '22023';
  end if;

  -- Зар (Staff-тай холбоотой зарын түгжээг энэ RPC-д л нээнэ)
  perform set_config('crm2.listing_rpc', '1', true);
  if v_how = 'transfer' then
    -- Staff-тай холбоотой зар хөрөнгийн одоогийн листлэгч агентыг дагана
    -- (crm2_sync_listing-тэй ижил), бусад нь сонгосон агентад.
    update public.listings l
       set agent_id = coalesce((
             select ag.id
               from public.crm2_properties cp
               join public.agents ag on ag.profile_id = cp.listing_agent_id
              where cp.listing_id = l.id and ag.office_id = a.office_id
                and ag.status = 'active' and ag.id <> a.id
              limit 1), t.id)
     where l.agent_id = a.id;
    get diagnostics v_moved = row_count;
    update public.leads set agent_id = t.id where agent_id = a.id;
    update public.lead_activities set agent_id = t.id where agent_id = a.id;
    update public.projects set agent_id = t.id where agent_id = a.id;
    update public.viewings set agent_id = t.id where agent_id = a.id;
  elsif v_how = 'delete' then
    delete from public.listings where agent_id = a.id; -- зураг, дуртай, үзлэг cascade
    get diagnostics v_deleted = row_count;
  end if;
  perform set_config('crm2.listing_rpc', '', true);

  -- Agent мөр (чат, сэтгэгдэл, захиалга cascade; «delete» үед лид, төсөл ч)
  delete from public.agents where id = a.id;

  if a.profile_id is null then
    v_mode := 'deleted';
  else
    select * into p from public.profiles where id = a.profile_id;
    select * into s from public.crm_staff where profile_id = a.profile_id and office_id = a.office_id;
    perform set_config('nemi.bypass_guards', 'on', true);

    -- Илгээсэн сануулгын бүртгэл (FK-гүй, хүснэгт хараахан байхгүй байж болно)
    if to_regclass('public.crm2_digest_log') is not null then
      execute 'delete from public.crm2_digest_log where profile_id = $1' using a.profile_id;
    end if;
    if to_regclass('public.crm2_nudge_log') is not null then
      execute 'delete from public.crm2_nudge_log where profile_id = $1' using a.profile_id;
    end if;

    if c ->> 'mode' = 'delete' then
      -- Зар оруулж байгаагүй, CRM-д оффисын бүртгэл хариуцаагүй → түүхтэй нь
      -- бүрэн устгана. Дотоод блок (savepoint): хуучин CRM-ийн хамгаалалт эсвэл
      -- FK татгалзвал бүгд буцаж, доорх архивлах замаар явна (хагас устгалгүй).
      begin
        if s.id is not null then
          -- Эхлээд идэвхгүй болгоно: хүлээлцэх trigger дахин шалгаж, багийн
          -- ахлагч/чатын гишүүнчлэлийг crm_staff_team_sync цэвэрлэнэ.
          update public.crm_staff set is_active = false, offboarding = false
           where id = s.id and (is_active or offboarding);
          delete from public.crm_agent_daily_stats where agent_id = a.profile_id;
          insert into public.crm_audit_log (office_id, actor_id, entity, entity_id, action, old_value, reason)
          values (s.office_id, v_me, 'crm_staff', s.id, 'delete',
                  to_jsonb(s) || jsonb_build_object('name', a.display_name),
                  'Оффисын админ агентыг хассан — зар оруулж байгаагүй тул түүхтэй нь бүрэн устгав');
          delete from public.crm_staff where id = s.id;
        end if;
        -- Хүний үйлдлийн түүх (одоогийн CRM). Аудитын бүртгэл (crm_audit_log) хэвээр.
        delete from public.crm2_history where actor_id = a.profile_id;
        -- Үлдсэн NO ACTION/RESTRICT холбоос (ихэнхдээ хуучин CRM): заавал биш
        -- баганыг хоослоно, заавал баганатай мөр нь тухайн хүнийх тул устгана.
        -- CASCADE / SET NULL холбоосыг auth.users → profiles устгал өөрөө шийднэ.
        -- Хуучин CRM-ийн эзэмшигч солих хамгаалалт шилжүүлэлтийн горим, шалтгаан
        -- шаарддаг; trigger-ийн шинээр үүсгэсэн мөрийг (эзэмшлийн түүх) барихын
        -- тулд хоёр удаа гүйлгэнэ.
        perform set_config('crm.reassign', '1', true);
        perform set_config('crm.reason', 'offboarding', true);
        -- Хүний даалгавар (tasks) профайлын хамт cascade устна — түүн рүү заасан
        -- NO ACTION холбоосыг (хуучин CRM-ийн дараагийн алхам г.м.) эхлээд хоослоно.
        for r in
          select k.conrelid::regclass as tbl, att.attname::text as col
            from pg_constraint k
            join pg_attribute att on att.attrelid = k.conrelid and att.attnum = k.conkey[1]
           where k.contype = 'f'
             and k.confrelid = 'public.tasks'::regclass
             and cardinality(k.conkey) = 1
             and k.confdeltype in ('a', 'r')
             and not att.attnotnull
        loop
          execute format(
            'update %s set %I = null where %I in (select t2.id from public.tasks t2 where $1 in (t2.responsible_id, t2.created_by))',
            r.tbl, r.col, r.col) using a.profile_id;
        end loop;
        for i in 1..2 loop
          for r in
            select k.conrelid::regclass as tbl, att.attname::text as col, att.attnotnull as required
              from pg_constraint k
              join pg_class cl on cl.oid = k.conrelid
              join pg_namespace ns on ns.oid = cl.relnamespace and ns.nspname = 'public'
              join pg_attribute att on att.attrelid = k.conrelid and att.attnum = k.conkey[1]
             where k.contype = 'f'
               and k.confrelid = 'public.profiles'::regclass
               and cardinality(k.conkey) = 1
               and k.confdeltype in ('a', 'r')
               and not (cl.relname = 'crm_staff' and att.attname = 'profile_id')
          loop
            if r.required then
              execute format('delete from %s where %I = $1', r.tbl, r.col) using a.profile_id;
            else
              execute format('update %s set %I = null where %I = $1', r.tbl, r.col, r.col) using a.profile_id;
            end if;
          end loop;
        end loop;
        perform set_config('crm.reassign', '', true);
        perform set_config('crm.reason', '', true);
        delete from auth.users where id = a.profile_id; -- profiles болон хувийн мөрүүд cascade
        v_mode := 'deleted';
      exception
        when foreign_key_violation or restrict_violation or not_null_violation
             or check_violation or raise_exception then
          v_fallback := sqlerrm;
          v_mode := null;
      end;
    end if;

    if v_mode is null then
      -- Зар оруулж байсан / CRM-д ажилласан → түүх хэвээр, хүн «(хасагдсан)»
      -- булш болж үлдэнэ; нэвтрэлт хаагдаж, оффисын хандалт хасагдана.
      v_mode := 'archived';
      v_name := coalesce(nullif(btrim(a.display_name), ''), nullif(btrim(p.full_name), ''), 'Ажилтан');
      if v_name not like '(хасагдсан)%' then
        v_name := '(хасагдсан) ' || v_name;
      end if;
      if s.id is not null then
        update public.crm_staff
           set is_active = false, offboarding = false,
               on_leave_from = null, on_leave_to = null, leave_substitute_id = null, leave_note = null
         where id = s.id; -- crm_staff_audit trigger бүртгэнэ; баг/чат цэвэрлэгдэнэ
        insert into public.crm_staff_removals (staff_id, office_id, profile_id, name, removed_by)
        values (s.id, s.office_id, s.profile_id, v_name, v_me)
        on conflict (staff_id) do nothing;
      end if;
      update public.profiles
         set full_name = v_name, role = 'buyer', office_id = null,
             email = null, phone = null, phone_verified_at = null, avatar_url = null
       where id = a.profile_id;

      -- Хувийн мөр (CRM түүх биш)
      delete from public.notifications where user_id = a.profile_id;
      delete from public.favorites where user_id = a.profile_id;
      delete from public.saved_searches where user_id = a.profile_id;
      delete from public.recently_viewed where user_id = a.profile_id;
      delete from public.crm_push_subscriptions where profile_id = a.profile_id;
      delete from public.crm_notification_prefs where profile_id = a.profile_id;
      delete from public.crm_saved_views where profile_id = a.profile_id;
      delete from public.crm_today_snoozes where profile_id = a.profile_id;
      delete from public.staff_chat_members where profile_id = a.profile_id;

      -- Нэвтрэлт: GoTrue-ийн soft delete-тэй ижил — нэвтрэх боломжгүй,
      -- и-мэйл/утас/Google холбоос чөлөөлөгдөнө (дахин бүртгүүлж болно).
      update auth.users
         set email = null, phone = null, phone_confirmed_at = null,
             email_change = '', phone_change = '', encrypted_password = '',
             confirmation_token = '', recovery_token = '', email_change_token_new = '',
             email_change_token_current = '', phone_change_token = '', reauthentication_token = '',
             raw_user_meta_data = jsonb_build_object('full_name', v_name),
             banned_until = now() + interval '100 years',
             deleted_at = now(), updated_at = now()
       where id = a.profile_id;
      delete from auth.identities where user_id = a.profile_id;
      delete from auth.sessions where user_id = a.profile_id; -- refresh_tokens cascade
      delete from auth.refresh_tokens where user_id = a.profile_id::text;
      delete from auth.one_time_tokens where user_id = a.profile_id;
      delete from auth.mfa_factors where user_id = a.profile_id;
    end if;

    perform set_config('nemi.bypass_guards', '', true);
  end if;

  return jsonb_build_object(
    'ok', true,
    'mode', v_mode,
    'name', a.display_name,
    'listings_moved', v_moved,
    'listings_deleted', v_deleted,
    -- Бүрэн устгал боломжгүй болж архивласан шалтгаан (null = төлөвлөсөн ёсоор)
    'fallback_reason', v_fallback,
    'target_name', t.display_name
  );
end $$;

revoke all on function public.office_remove_agent(uuid, text, uuid, text) from public, anon;
grant execute on function public.office_remove_agent(uuid, text, uuid, text) to authenticated;

-- 5) Профайлын харагдац: хасагдсан хүний «(хасагдсан) Нэр» булш нь оффисгүй
--    тул profiles_select-д орохгүй — CRM-ийн түүх, хөрөнгийн карт (profiles
--    embed) нэрийг харуулахын тулд тухайн оффисын хүмүүст л харагдуулна.
--    (Оффисын жагсаалт, сонгогчид office_id-ээр шүүдэг тул тэнд гарахгүй.)
create or replace function public.crm_removed_staff_visible(p_profile uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.crm_staff_removals r
     where r.profile_id = p_profile
       and r.office_id = public.my_task_office_id()
  );
$$;

revoke all on function public.crm_removed_staff_visible(uuid) from public, anon;
grant execute on function public.crm_removed_staff_visible(uuid) to authenticated;

drop policy if exists profiles_select_removed_staff on public.profiles;
create policy profiles_select_removed_staff
  on public.profiles
  for select
  to authenticated
  using (public.crm_removed_staff_visible(id));

notify pgrst, 'reload schema';
