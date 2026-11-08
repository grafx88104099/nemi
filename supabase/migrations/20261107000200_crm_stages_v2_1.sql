-- ============================================================
-- PMC CRM — PRO-001 v2.1 нийцүүлэлт (U1 crm-foundation), 2/4.
-- Урсгалын шат, шилжилт, шилжих шалгуур (§6.13, §6.14; тайлангийн 5.2),
-- журмын нэр томьёо DB-ийн алдааны текстэд (§5, §6.1).
--
--  1. PL-1…PL-5-ын шатыг v2.1-ээр upsert (код хадгалагдана → stage_id,
--     crm_stage_history, демо мөр хэвээр). PL-6 өөрчлөгдөхгүй.
--  2. PL-1…PL-5-ын crm_stage_transitions-ийг бүрэн устгаж дахин үүсгэнэ
--     (хуучин new→qualified зам үлдэхгүй). PL-1/2/5-ын «амжилттай
--     хаагдсан» руу гар шилжилт байхгүй — зөвхөн хэлцлийн trigger
--     (crm.pipeline_transfer GUC, U3). PL-3/4 (Ш1) Гэрээ → амжилттай хэвээр.
--  3. Шинэ шалгуурын шаардлагууд: checker-ийг U3 хэрэгжүүлэх хүртэл
--     is_active=false (танигдаагүй checker автоматаар «дутуу» болдог тул
--     идэвхтэй оруулбал шилжилт бүхэлдээ гацна).
--  4. Демо боломжийг шинэ шат руу зөөх (сөрөг санал → Хэлэлцээр г.м.),
--     түүхэд 'procedure_v2_1' шалтгаантай.
--  5. DB-ийн алдаа/шалгуурын шошгыг журмын нэрээр (дүр, «дараагийн
--     үйлдэл»), дэлгэцэнд шууд гардаг алдаанаас дотоод кодыг авна.
-- Бүх оффист (crm_pipelines-тэй) үйлчилнэ. Дахин тавихад аюулгүй.
-- ============================================================

-- ── 1. Шатны тодорхойлолт ──

create temp table _crm_v21_stages (
  pl text not null,
  code text not null,
  name text not null,
  sort int not null,
  prob numeric(5,2) not null,
  gate public.crm_gate_code,
  terminal public.crm_opp_state,
  closing boolean not null
) on commit drop;

-- Худалдан авагчийн урсгал (§6.13) — PL-1 ба PL-5 хуваалцана.
insert into _crm_v21_stages (pl, code, name, sort, prob, gate, terminal, closing)
select pl, s.* from (values ('PL-1'), ('PL-5')) as p(pl),
(values
  ('new',             'Шинэ',                 0,   5, 'g0'::public.crm_gate_code,        null::public.crm_opp_state, false),
  ('contacted',       'Холбогдсон',           1,  10, 'g_contact',                      null, false),
  ('qualified',       'Шалгуур хангасан',     2,  15, 'g1',                             null, false),
  ('matched',         'Тохируулсан',          3,  25, 'g_match',                        null, false),
  ('showing',         'Үзлэг',                4,  40, 'g_showing',                      null, false),
  ('interested',      'Сонирхсон',            5,  50, 'g_interest',                     null, false),
  ('offer',           'Үнийн санал',          6,  60, 'g2',                             null, false),
  ('negotiation',     'Хэлэлцээр',            7,  70, 'g_counter',                      null, false),
  ('contract',        'Гэрээ',                8,  80, 'g4',                             null, true),
  ('payment_closing', 'Төлбөр / хаалт',       9,  90, null,                             null, true),
  ('closed_won',      'Амжилттай хаагдсан',  10, 100, 'g5',                             'won', true),
  ('closed_lost',     'Амжилтгүй хаагдсан',  11,   0, null,                             'lost', false)
) as s(code, name, sort, prob, gate, terminal, closing);

-- Худалдагч, листингийн урсгал (§6.14) — PL-2.
insert into _crm_v21_stages (pl, code, name, sort, prob, gate, terminal, closing) values
  ('PL-2', 'new',            'Өмчлөгчийн сэжим',       0,   5, 'g0',               null,   false),
  ('PL-2', 'contacted',      'Холбогдсон',             1,  10, 'g_contact',        null,   false),
  ('PL-2', 'meeting',        'Уулзалт',                2,  15, 'g_meeting',        null,   false),
  ('PL-2', 'consult',        'Үнэлгээ, үнэ тогтоолт',  3,  20, 'g_valuation',      null,   false),
  ('PL-2', 'agreement',      'Листингийн гэрээ',       4,  50, 'g3',               null,   false),
  ('PL-2', 'active_listing', 'Идэвхтэй листинг',       5,  60, 'g_listing_live',   null,   false),
  ('PL-2', 'showings',       'Үзлэгүүд',               6,  65, 'g_buyer_activity', null,   false),
  ('PL-2', 'offer',          'Үнийн санал',            7,  70, 'g2',               null,   false),
  ('PL-2', 'negotiation',    'Хэлэлцээр',              8,  75, 'g_counter',        null,   false),
  ('PL-2', 'contract',       'Гэрээ',                  9,  85, 'g4',               null,   true),
  ('PL-2', 'closing',        'Хаалт',                 10,  95, null,               null,   true),
  ('PL-2', 'closed_won',     'Хаагдсан (амжилттай)',  11, 100, 'g5',               'won',  true),
  ('PL-2', 'closed_lost',    'Хаагдсан (амжилтгүй)',  12,   0, null,               'lost', false);

-- Түрээсийн урсгал (Ш1: Холбогдсон, Хэлэлцээр нэмэгдэнэ; бусад хэвээр) — PL-3, PL-4.
insert into _crm_v21_stages (pl, code, name, sort, prob, gate, terminal, closing)
select pl, s.* from (values ('PL-3'), ('PL-4')) as p(pl),
(values
  ('new',         'Шинэ',                0,   5, 'g0'::public.crm_gate_code, null::public.crm_opp_state, false),
  ('contacted',   'Холбогдсон',          1,  10, 'g_contact',               null, false),
  ('qualified',   'Шалгуур хангасан',    2,  20, 'g1',                      null, false),
  ('showing',     'Үзлэг',               3,  40, null,                      null, false),
  ('offer',       'Үнийн санал',         4,  60, 'g2',                      null, false),
  ('negotiation', 'Хэлэлцээр',           5,  70, 'g_counter',               null, false),
  ('contract',    'Гэрээ',               6,  85, 'g4',                      null, true),
  ('closed_won',  'Амжилттай хаагдсан',  7, 100, 'g5',                      'won', true),
  ('closed_lost', 'Амжилтгүй хаагдсан',  8,   0, null,                      'lost', false)
) as s(code, name, sort, prob, gate, terminal, closing);

insert into public.crm_stages
  (office_id, pipeline_id, code, name, sort_order, probability, gate_code, is_terminal, terminal_state, is_closing_direction)
select p.office_id, p.id, s.code, s.name, s.sort, s.prob, s.gate, s.terminal is not null, s.terminal, s.closing
from public.crm_pipelines p
join _crm_v21_stages s on s.pl = p.code
on conflict (pipeline_id, code) do update set
  name = excluded.name,
  sort_order = excluded.sort_order,
  probability = excluded.probability,
  gate_code = excluded.gate_code,
  is_terminal = excluded.is_terminal,
  terminal_state = excluded.terminal_state,
  is_closing_direction = excluded.is_closing_direction;

-- ── 2. Шилжилтүүдийг бүрэн дахин үүсгэх ──

delete from public.crm_stage_transitions t
using public.crm_pipelines p
where p.id = t.pipeline_id and p.code in ('PL-1', 'PL-2', 'PL-3', 'PL-4', 'PL-5');

with seq as (
  select st.office_id, st.pipeline_id, p.code as pl, st.id, st.code,
         row_number() over (partition by st.pipeline_id order by st.sort_order) as rn
  from public.crm_stages st
  join public.crm_pipelines p on p.id = st.pipeline_id
  join _crm_v21_stages d on d.pl = p.code and d.code = st.code
  where p.code in ('PL-1', 'PL-2', 'PL-3', 'PL-4', 'PL-5') and not st.is_terminal
),
term as (
  select st.pipeline_id, st.id, st.terminal_state
  from public.crm_stages st
  join public.crm_pipelines p on p.id = st.pipeline_id
  join _crm_v21_stages d on d.pl = p.code and d.code = st.code
  where p.code in ('PL-1', 'PL-2', 'PL-3', 'PL-4', 'PL-5') and st.is_terminal
),
last_seq as (
  select distinct on (pipeline_id) * from seq order by pipeline_id, rn desc
),
tr_rows as (
  -- Урагш дараалсан (агент+)
  select a.office_id, a.pipeline_id, a.id as from_id, b.id as to_id, 'forward' as kind,
         '{agent,team_lead,sales_director,ops_qc,property_manager}'::public.crm_role[] as roles, false as reason
  from seq a join seq b on b.pipeline_id = a.pipeline_id and b.rn = a.rn + 1
  union all
  -- Буцаалт шалтгаантай (ахлагч+)
  select a.office_id, a.pipeline_id, b.id, a.id, 'backward',
         '{team_lead,sales_director,ops_qc}'::public.crm_role[], true
  from seq a join seq b on b.pipeline_id = a.pipeline_id and b.rn = a.rn + 1
  union all
  -- Алгасалт (2 шат) — зөвхөн Борлуулалт хариуцсан захирал, шалтгаантай
  select a.office_id, a.pipeline_id, a.id, c.id, 'skip',
         '{sales_director}'::public.crm_role[], true
  from seq a join seq c on c.pipeline_id = a.pipeline_id and c.rn = a.rn + 2
  union all
  -- Дурын идэвхтэй шатнаас амжилтгүй хаагдсан (шалтгаан заавал, §6.18)
  select a.office_id, a.pipeline_id, a.id, t.id, 'forward',
         '{agent,team_lead,sales_director,ops_qc,property_manager}'::public.crm_role[], true
  from seq a join term t on t.pipeline_id = a.pipeline_id and t.terminal_state = 'lost'
  union all
  -- Түрээс (PL-3/4): сүүлийн идэвхтэй шат → амжилттай (Ш1, хэвээр)
  select l.office_id, l.pipeline_id, l.id, t.id, 'forward',
         '{agent,team_lead,sales_director,ops_qc,property_manager}'::public.crm_role[], false
  from last_seq l join term t on t.pipeline_id = l.pipeline_id and t.terminal_state = 'won'
  where l.pl in ('PL-3', 'PL-4')
)
insert into public.crm_stage_transitions
  (office_id, pipeline_id, from_stage_id, to_stage_id, kind, allowed_roles, requires_reason)
select office_id, pipeline_id, from_id, to_id, kind, roles, reason from tr_rows
on conflict (from_stage_id, to_stage_id) do update set
  kind = excluded.kind, allowed_roles = excluded.allowed_roles, requires_reason = excluded.requires_reason;

-- ── 3. Шинэ шалгуурын шаардлагууд ──
-- checker_kind-ийн DB хэрэгжүүлэлт U3-д (crm_check_gate_rec). Хүртэл нь
-- идэвхгүй; scripts/seed-crm.mjs нь checker бэлэн болсон эсэхийг
-- crm_check_gate_rec-ийн эх текстээс таньж идэвхжүүлнэ.

create temp table _crm_v21_reqs (
  gate public.crm_gate_code not null,
  pl text,               -- null = бүх урсгал
  checker text not null,
  active boolean not null
) on commit drop;

insert into _crm_v21_reqs (gate, pl, checker, active) values
  ('g_contact',        null,   'meaningful_contact',  false),
  ('g_contact',        null,   'next_step_set',       true),
  ('g_match',          null,   'match_suggested',     false),
  ('g_showing',        null,   'showing_logged',      false),
  ('g_interest',       null,   'interest_confirmed',  false),
  ('g_counter',        null,   'counter_recorded',    false),
  ('g_meeting',        null,   'meeting_scheduled',   false),
  ('g_valuation',      null,   'price_analysis',      false),
  ('g_listing_live',   null,   'property_active',     false),
  ('g_buyer_activity', null,   'showing_on_property', false),
  ('g4',               'PL-1', 'offer_accepted',      false),
  ('g4',               'PL-2', 'offer_accepted',      false),
  ('g4',               'PL-5', 'offer_accepted',      false);

insert into public.crm_gate_requirements (office_id, gate_code, pipeline_id, checker_kind, params, is_active)
select o.office_id, r.gate, p.id, r.checker, '{}'::jsonb, r.active
from (select distinct office_id from public.crm_pipelines) o
cross join _crm_v21_reqs r
left join public.crm_pipelines p on p.office_id = o.office_id and p.code = r.pl
where (r.pl is null or p.id is not null)
  and not exists (
    select 1 from public.crm_gate_requirements g
    where g.office_id = o.office_id
      and g.gate_code = r.gate
      and g.checker_kind = r.checker
      and g.pipeline_id is not distinct from p.id
  );

-- ── 4. Демо боломжийг шинэ шат руу зөөх (stage guard-ыг GUC-ээр тойрно) ──

select set_config('crm.pipeline_transfer', '1', true);
select set_config('crm.reason', 'procedure_v2_1', true);

-- PL-1/5: сөрөг саналтай «Үнийн санал» → «Хэлэлцээр»
update public.crm_opportunities o
set stage_id = ns.id
from public.crm_stages cs, public.crm_pipelines p, public.crm_stages ns
where cs.id = o.stage_id and p.id = o.pipeline_id
  and ns.pipeline_id = o.pipeline_id and ns.code = 'negotiation'
  and p.code in ('PL-1', 'PL-5') and cs.code = 'offer' and o.state = 'open'
  and exists (select 1 from public.crm_offers f where f.opportunity_id = o.id and f.direction = 'counter');

-- PL-1/5: хэлцэл нь төлбөрийн төлөвтэй «Гэрээ» → «Төлбөр / хаалт»
update public.crm_opportunities o
set stage_id = ns.id
from public.crm_stages cs, public.crm_pipelines p, public.crm_stages ns
where cs.id = o.stage_id and p.id = o.pipeline_id
  and ns.pipeline_id = o.pipeline_id and ns.code = 'payment_closing'
  and p.code in ('PL-1', 'PL-5') and cs.code = 'contract' and o.state = 'open'
  and exists (select 1 from public.crm_transactions t where t.opportunity_id = o.id and t.status = 'payment');

-- PL-2: үл хөдлөх дээр нь санал ирсэн «Идэвхтэй листинг» → «Үнийн санал»
update public.crm_opportunities o
set stage_id = ns.id
from public.crm_stages cs, public.crm_pipelines p, public.crm_stages ns
where cs.id = o.stage_id and p.id = o.pipeline_id
  and ns.pipeline_id = o.pipeline_id and ns.code = 'offer'
  and p.code = 'PL-2' and cs.code = 'active_listing' and o.state = 'open' and o.property_id is not null
  and exists (
    select 1 from public.crm_offers f
    join public.crm_opportunities bo on bo.id = f.opportunity_id
    where bo.property_id = o.property_id and bo.id <> o.id
  );

-- PL-2: үзлэг хийгдсэн «Идэвхтэй листинг» → «Үзлэгүүд»
update public.crm_opportunities o
set stage_id = ns.id
from public.crm_stages cs, public.crm_pipelines p, public.crm_stages ns
where cs.id = o.stage_id and p.id = o.pipeline_id
  and ns.pipeline_id = o.pipeline_id and ns.code = 'showings'
  and p.code = 'PL-2' and cs.code = 'active_listing' and o.state = 'open' and o.property_id is not null
  and exists (
    select 1 from public.crm_activities a
    where a.property_id = o.property_id and a.channel = 'showing'
  );

select set_config('crm.pipeline_transfer', '', true);
select set_config('crm.reason', '', true);

-- Хамгаалалт: идэвхтэй боломж бүр өөрийн урсгалын v2.1 шаттай байх.
do $$
declare n int;
begin
  select count(*) into n
  from public.crm_opportunities o
  join public.crm_stages s on s.id = o.stage_id
  join public.crm_pipelines p on p.id = o.pipeline_id
  where p.code in ('PL-1', 'PL-2', 'PL-3', 'PL-4', 'PL-5')
    and (s.pipeline_id <> o.pipeline_id
         or not exists (select 1 from _crm_v21_stages d where d.pl = p.code and d.code = s.code));
  if n > 0 then
    raise exception 'v2.1: % боломж хүчингүй шаттай үлдлээ', n;
  end if;
end $$;

-- ── 5. DB-ийн текстийг журмын нэр томьёонд ──
-- Функцийн одоогийн тодорхойлолтыг уншиж, зөвхөн тэмдэгт мөрийг солиод
-- дахин үүсгэнэ (логик өөрчлөгдөхгүй). Хүлээгдсэн мөр олдохгүй бол алдаа.

do $$
declare
  r record;
  src text;
  orig text;
begin
  for r in
    select p.oid, p.proname
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in ('crm_merge_contacts', 'crm_reassign_property_role', 'crm_txn_status_guard',
                        'crm_lease_status_guard', 'crm_commission_status_guard',
                        'crm_activity_insert_guard', 'crm_check_gate_rec')
  loop
    src := pg_get_functiondef(r.oid);
    orig := src;

    -- §5 дүрийн нэр
    src := replace(src, 'Борлуулалтын захирал/ЧМТ', 'Борлуулалт хариуцсан захирал / Үйл ажиллагаа-ЧМТ');
    src := replace(src, 'Борлуулалтын захирал / ҮА-ЧМТ', 'Борлуулалт хариуцсан захирал / Үйл ажиллагаа-ЧМТ');
    src := replace(src, 'Борлуулалтын захирал', 'Борлуулалт хариуцсан захирал');
    src := replace(src, 'Ерөнхий захирал', 'CEO');
    src := replace(src, 'Үйл ажиллагаа/ЧМТ', 'Үйл ажиллагаа-ЧМТ');

    -- Эдгээр функцийн алдаа дэлгэцэнд шууд гардаг — дотоод кодыг авна.
    if r.proname in ('crm_txn_status_guard', 'crm_lease_status_guard',
                     'crm_commission_status_guard', 'crm_reassign_property_role') then
      src := regexp_replace(src, ' \((F-|Д-|§)[^)'']*\)', '', 'g');
    end if;

    -- §6.1 «Дараагийн үйлдэл» (F-302 кодыг апп-ын алдаа буулгагч ашигладаг тул үлдээнэ)
    if r.proname = 'crm_activity_insert_guard' then
      if position('дараагийн алхам + огноо заавал' in src) = 0 then
        raise exception 'v2.1: crm_activity_insert_guard-ийн текст олдсонгүй';
      end if;
      src := replace(src, 'дараагийн алхам + огноо заавал', 'дараагийн үйлдэл, огноо заавал');
    end if;

    if r.proname = 'crm_check_gate_rec' then
      if position('''Дараагийн алхам огноотой''' in src) = 0
         or position('''Баримтын бүрдэл 100%''' in src) = 0
         or position('when ''post_sale_tasks''       then ''Хэлцлийн дараах даалгавар үүссэн''' in src) = 0 then
        raise exception 'v2.1: crm_check_gate_rec-ийн шошго олдсонгүй';
      end if;
      src := replace(src, '''Дараагийн алхам огноотой''', '''Дараагийн үйлдэл, огноо бүртгэгдсэн''');
      src := replace(src, '''Баримтын бүрдэл 100%''',
                     '''Баримт бичгийн бүрдэл '' || coalesce(req.params ->> ''min_pct'', ''100'') || ''%''');
      src := replace(src, '''Санал бүртгэгдсэн''', '''Үнийн санал бүртгэгдсэн''');
      src := replace(src, '''Идэвхтэй листингийн гэрээ''', '''Хүчинтэй листингийн гэрээ''');
      src := replace(src, '''Хэрэгцээний профайл бүрэн''', '''Хэрэгцээний профайл бүрэн бөглөгдсөн''');
      src := replace(src,
        'when ''post_sale_tasks''       then ''Хэлцлийн дараах даалгавар үүссэн''',
        'when ''post_sale_tasks''       then ''Борлуулалтын дараах даалгавар үүссэн''' || chr(10) ||
        '        when ''meaningful_contact''    then ''Утга бүхий холболт бүртгэгдсэн''' || chr(10) ||
        '        when ''match_suggested''       then ''Үл хөдлөх санал болгосон''' || chr(10) ||
        '        when ''showing_logged''        then ''Үзлэг хийгдэж бүртгэгдсэн''' || chr(10) ||
        '        when ''interest_confirmed''    then ''Харилцагч сонирхлоо баталгаажуулсан''' || chr(10) ||
        '        when ''counter_recorded''      then ''Сөрөг санал бүртгэгдсэн''' || chr(10) ||
        '        when ''offer_accepted''        then ''Харилцагч нөхцөлийг хүлээн зөвшөөрсөн''' || chr(10) ||
        '        when ''meeting_scheduled''     then ''Уулзалт товлогдсон''' || chr(10) ||
        '        when ''price_analysis''        then ''Үнийн дүн шинжилгээ бүртгэгдсэн''' || chr(10) ||
        '        when ''property_active''       then ''Листинг идэвхтэй төлөвтэй''' || chr(10) ||
        '        when ''showing_on_property''   then ''Шалгуур хангасан худалдан авагчийн үзлэг бүртгэгдсэн''');
    end if;

    if src is distinct from orig then
      execute src;
    end if;
  end loop;
end $$;
