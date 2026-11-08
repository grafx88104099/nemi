-- ════════════════════════════════════════════════════════════
-- U7 crm-weekly-cycle — долоо хоногийн гүйцэтгэлийн тооцоо
-- (PMC-CRM-PRO-001 v2.1 §6.19 14 үзүүлэлт + §9.1 Орлого, хугацаандаа хувь,
-- бүрэн байдал = 17 код; §6.24 урсгалын хөдөлгөөн).
--   • crm_agent_week_metrics — Даваа–Ням (УБ), зөвхөн борлуулалтын урсгал
--     (kpi_scope), мөрийн хязгааргүй SQL нэгтгэл. Дуудагчийн хүрээ: өөрөө,
--     багийн ахлагч баг, удирдлага оффис; service role бүх оффис.
--   • crm_agent_week_moves — боломж бүрийн долоо хоногийн цэвэр хөдөлгөөн.
--   • crm_weekly_freeze — урьдчилсан (Баасан) / эцсийн (Ням 24:00) агшин
--     зураг; эцсийнх дахин бичигдэхгүй. ЗӨВХӨН service role.
--   • crm_take_agent_daily_stats — өдрийн төгсгөлийн агшин зураг.
-- Хамаарал: 20261107001800.
-- ════════════════════════════════════════════════════════════

create or replace function public.crm_weekly_text_array(p_value jsonb, p_default text[])
returns text[] language sql immutable as $$
  select case when jsonb_typeof(p_value) = 'array'
              then array(select jsonb_array_elements_text(p_value))
              else p_default end;
$$;

-- Дуудагчид харагдах борлуулагч агентууд (агент дүртэй).
create or replace function public.crm_weekly_scope_agents(p_office uuid, p_agent uuid)
returns table (office_id uuid, agent_id uuid, cfg jsonb)
language plpgsql stable security definer set search_path = public as $$
declare v_service boolean := auth.uid() is null; v_office uuid := p_office;
begin
  if not v_service then
    v_office := public.crm_office_id();
    if v_office is null or (p_office is not null and p_office <> v_office) then return; end if;
  end if;
  return query
  select s.office_id, s.profile_id, coalesce(public.crm_setting_at(s.office_id, 'weekly_cycle'), '{}'::jsonb)
  from public.crm_staff s
  where s.is_active and 'agent' = any(s.roles)
    and (v_office is null or s.office_id = v_office)
    and (p_agent is null or s.profile_id = p_agent)
    and (v_service or public.crm_weekly_can_view(s.profile_id));
end $$;

create or replace function public.crm_agent_week_metrics(p_week date, p_office uuid default null, p_agent uuid default null)
returns table (office_id uuid, agent_id uuid, metric_code text, actual numeric)
language plpgsql stable security definer set search_path = public as $$
declare
  v_week date := p_week - (extract(isodow from p_week)::int - 1);
  v_from timestamptz := v_week::timestamp at time zone 'Asia/Ulaanbaatar';
  v_to timestamptz := (v_week + 7)::timestamp at time zone 'Asia/Ulaanbaatar';
  v_today date := public.crm_ub_today();
  v_end date;
  v_live boolean;
begin
  v_end := least(v_week + 6, v_today);
  v_live := v_week + 7 > v_today;
  return query
  with
  agents as (
    select a.office_id, a.agent_id,
           public.crm_weekly_text_array(a.cfg -> 'outbound_channels', array['call', 'chat', 'email']) as oc,
           public.crm_weekly_text_array(a.cfg -> 'conversation_channels', array['call', 'chat', 'meeting']) as cc,
           public.crm_weekly_text_array(a.cfg -> 'owner_pipelines', array['PL-2']) as op
    from public.crm_weekly_scope_agents(p_office, p_agent) a
  ),
  act as (
    select g.office_id, g.agent_id,
      count(*) filter (where a.channel::text = any(g.oc)) as outbound,
      count(*) filter (where a.is_meaningful and a.channel::text = any(g.cc)) as conv,
      count(*) filter (where a.is_meaningful and a.channel = 'meeting'
                         and (ap.code is null or public.crm_kpi_pipeline_in(a.office_id, ap.code))
                         and case when ap.code is not null then ap.code = any(g.op)
                                  else coalesce(a.meeting_party, '') in ('seller', 'landlord') end) as owner_m,
      count(*) filter (where a.is_meaningful and a.channel = 'meeting'
                         and (ap.code is null or public.crm_kpi_pipeline_in(a.office_id, ap.code))
                         and case when ap.code is not null then not (ap.code = any(g.op))
                                  else coalesce(a.meeting_party, '') in ('buyer', 'tenant') end) as buyer_m,
      count(*) filter (where a.is_meaningful and a.channel = 'showing'
                         and (ap.code is null or public.crm_kpi_pipeline_in(a.office_id, ap.code))) as showings
    from agents g
    join public.crm_activities a on a.office_id = g.office_id and a.owner_id = g.agent_id
                                and a.occurred_at >= v_from and a.occurred_at < v_to
    left join public.crm_opportunities ao on ao.id = a.opportunity_id
    left join public.crm_pipelines ap on ap.id = ao.pipeline_id
    group by g.office_id, g.agent_id
  ),
  leads_new as (
    select g.office_id, g.agent_id, count(*) as c
    from agents g
    join public.crm_leads l on l.office_id = g.office_id and l.owner_id = g.agent_id
                           and l.created_at >= v_from and l.created_at < v_to
    group by g.office_id, g.agent_id
  ),
  opp as (
    select g.office_id, g.agent_id, o.id, o.state, o.stage_id, o.expected_fee_mnt
    from agents g
    join public.crm_opportunities o on o.office_id = g.office_id and o.owner_id = g.agent_id
    join public.crm_pipelines p on p.id = o.pipeline_id
    where public.crm_kpi_pipeline_in(o.office_id, p.code)
  ),
  stage_in as (
    select o.office_id, o.agent_id,
      count(distinct o.id) filter (where ts.code = 'qualified') as qualified,
      count(distinct o.id) filter (where ts.code = 'negotiation') as nego_ids
    from opp o
    join public.crm_stage_history h on h.opportunity_id = o.id and h.entered_at >= v_from and h.entered_at < v_to
    join public.crm_stages ts on ts.id = h.to_stage_id
    group by o.office_id, o.agent_id
  ),
  nego as (
    select x.office_id, x.agent_id, count(distinct x.id) as c from (
      select o.office_id, o.agent_id, o.id
      from opp o
      join public.crm_stage_history h on h.opportunity_id = o.id and h.entered_at >= v_from and h.entered_at < v_to
      join public.crm_stages ts on ts.id = h.to_stage_id and ts.code = 'negotiation'
      union
      select o.office_id, o.agent_id, o.id
      from opp o
      join public.crm_offers f on f.opportunity_id = o.id and f.parent_offer_id is not null
                              and coalesce(f.received_at, f.created_at) >= v_from
                              and coalesce(f.received_at, f.created_at) < v_to
    ) x group by x.office_id, x.agent_id
  ),
  offers as (
    select o.office_id, o.agent_id, count(*) as c
    from opp o
    join public.crm_offers f on f.opportunity_id = o.id and f.parent_offer_id is null
                            and coalesce(f.received_at, f.created_at) >= v_from
                            and coalesce(f.received_at, f.created_at) < v_to
    group by o.office_id, o.agent_id
  ),
  closed as (
    select o.office_id, o.agent_id, count(distinct t.id) as c
    from opp o
    join public.crm_transactions t on t.opportunity_id = o.id and t.status = 'closed'
                                  and t.closed_on between v_week and v_week + 6
    group by o.office_id, o.agent_id
  ),
  revenue as (
    select o.office_id, o.agent_id, coalesce(sum(pm.amount_mnt), 0) as amt
    from opp o
    join public.crm_transactions t on t.opportunity_id = o.id
    join public.crm_payments pm on pm.transaction_id = t.id and pm.kind = 'income'
                               and pm.finance_verified_at is not null and pm.correction_of_id is null
                               and pm.paid_on between v_week and v_week + 6
    group by o.office_id, o.agent_id
  ),
  listings as (
    select g.office_id, g.agent_id, count(distinct pr.id) as c
    from agents g
    join public.crm_properties pr on pr.office_id = g.office_id
                                 and pr.activated_at >= v_from and pr.activated_at < v_to
    where exists (select 1 from public.crm_property_roles r
                  where r.property_id = pr.id and r.role = 'sourcing' and r.agent_profile_id = g.agent_id)
       or (pr.created_by = g.agent_id
           and not exists (select 1 from public.crm_property_roles r where r.property_id = pr.id and r.role = 'sourcing'))
    group by g.office_id, g.agent_id
  ),
  steps as (
    select g.office_id, g.agent_id,
      count(*) filter (where
          greatest(n.due_on + 1, v_week) <= v_end
          and (n.resolved_at is null
               or (n.resolved_at at time zone 'Asia/Ulaanbaatar')::date >= greatest(n.due_on + 1, v_week))) as overdue,
      count(*) filter (where n.due_on between v_week and v_week + 6
          and (n.resolution in ('done', 'late') or (n.resolved_at is null and n.due_on < v_today))) as due_total,
      count(*) filter (where n.due_on between v_week and v_week + 6 and n.resolution = 'done') as due_done
    from agents g
    join public.crm_next_step_log n on n.office_id = g.office_id and n.owner_id = g.agent_id
                                   and n.due_on <= v_week + 6
                                   and (n.resolved_at is null or n.due_on >= v_week or n.resolved_at >= v_from)
    group by g.office_id, g.agent_id
  ),
  work as (
    select g.office_id, g.agent_id,
      (select count(*) from public.crm_leads l
        where l.office_id = g.office_id and l.owner_id = g.agent_id and l.status::text in ('new', 'active'))
      + (select count(*) from opp o where o.office_id = g.office_id and o.agent_id = g.agent_id and o.state = 'open') as open_work
    from agents g
  ),
  live as (
    select g.office_id, g.agent_id,
      (select count(*) from public.crm_leads l
        where l.office_id = g.office_id and l.owner_id = g.agent_id
          and l.status::text in ('new', 'active') and l.grade = 'a') as hot,
      (select coalesce(sum(coalesce(o.expected_fee_mnt, 0) * coalesce(s.probability, 0) / 100), 0)
        from opp o join public.crm_stages s on s.id = o.stage_id
        where o.office_id = g.office_id and o.agent_id = g.agent_id
          and o.state = 'open' and not s.is_terminal) as fee,
      (select q.quality_pct from public.crm_v_agent_data_quality q
        where q.office_id = g.office_id and q.agent_id = g.agent_id limit 1) as quality
    from agents g
    where v_live
  ),
  snap as (
    select distinct on (d.office_id, d.agent_id)
           d.office_id, d.agent_id, d.hot_contacts, d.expected_net_fee, d.completeness_pct
    from public.crm_agent_daily_stats d
    join agents g on g.office_id = d.office_id and g.agent_id = d.agent_id
    where not v_live and d.day between v_week and v_week + 6
    order by d.office_id, d.agent_id, d.day desc
  )
  select g.office_id, g.agent_id, v.code, v.val
  from agents g
  left join act on act.office_id = g.office_id and act.agent_id = g.agent_id
  left join leads_new ln on ln.office_id = g.office_id and ln.agent_id = g.agent_id
  left join stage_in si on si.office_id = g.office_id and si.agent_id = g.agent_id
  left join nego ng on ng.office_id = g.office_id and ng.agent_id = g.agent_id
  left join offers ofr on ofr.office_id = g.office_id and ofr.agent_id = g.agent_id
  left join closed cl on cl.office_id = g.office_id and cl.agent_id = g.agent_id
  left join revenue rv on rv.office_id = g.office_id and rv.agent_id = g.agent_id
  left join listings li on li.office_id = g.office_id and li.agent_id = g.agent_id
  left join steps st on st.office_id = g.office_id and st.agent_id = g.agent_id
  left join live lv on lv.office_id = g.office_id and lv.agent_id = g.agent_id
  left join snap sn on sn.office_id = g.office_id and sn.agent_id = g.agent_id
  left join work wk on wk.office_id = g.office_id and wk.agent_id = g.agent_id
  cross join lateral (values
    ('outbound_contacts', coalesce(act.outbound, 0)::numeric),
    ('meaningful_conversations', coalesce(act.conv, 0)::numeric),
    ('new_leads', coalesce(ln.c, 0)::numeric),
    ('qualified_leads', coalesce(si.qualified, 0)::numeric),
    ('owner_meetings', coalesce(act.owner_m, 0)::numeric),
    ('buyer_meetings', coalesce(act.buyer_m, 0)::numeric),
    ('new_listings', coalesce(li.c, 0)::numeric),
    ('showings', coalesce(act.showings, 0)::numeric),
    ('offers', coalesce(ofr.c, 0)::numeric),
    ('negotiations', coalesce(ng.c, 0)::numeric),
    ('closed_deals', coalesce(cl.c, 0)::numeric),
    ('expected_net_fee', case when v_live then round(coalesce(lv.fee, 0), 2) else sn.expected_net_fee end),
    ('overdue_followups', coalesce(st.overdue, 0)::numeric),
    ('hot_contacts', case when v_live then coalesce(lv.hot, 0)::numeric else sn.hot_contacts::numeric end),
    ('revenue', round(coalesce(rv.amt, 0), 2)),
    ('followup_on_time_pct', case when coalesce(st.due_total, 0) > 0
                                  then round(100.0 * st.due_done / st.due_total, 1) end),
    ('crm_completeness_pct', case when v_live then lv.quality::numeric else sn.completeness_pct end),
    -- Дотоод: одоо нээлттэй сэжим + боломжийн тоо (§6.25 «идэвхтэй агент» шүүлт).
    ('open_work', coalesce(wk.open_work, 0)::numeric)
  ) as v(code, val);
end $$;

-- Боломж бүрийн долоо хоногийн хөдөлгөөн: эхний шат → сүүлийн шат. Хөдөлгөөнгүй
-- нээлттэй боломж moves = 0 мөрөөр (§6.24 «хөдөлгөөнгүй»).
create or replace function public.crm_agent_week_moves(p_week date, p_office uuid default null, p_agent uuid default null)
returns table (office_id uuid, agent_id uuid, opportunity_id uuid, from_sort integer, to_sort integer,
               to_terminal text, moves integer)
language plpgsql stable security definer set search_path = public as $$
declare
  v_week date := p_week - (extract(isodow from p_week)::int - 1);
  v_from timestamptz := v_week::timestamp at time zone 'Asia/Ulaanbaatar';
  v_to timestamptz := (v_week + 7)::timestamp at time zone 'Asia/Ulaanbaatar';
begin
  return query
  with
  agents as (select a.office_id, a.agent_id from public.crm_weekly_scope_agents(p_office, p_agent) a),
  opp as (
    select g.office_id, g.agent_id, o.id, o.state, o.stage_id
    from agents g
    join public.crm_opportunities o on o.office_id = g.office_id and o.owner_id = g.agent_id
    join public.crm_pipelines p on p.id = o.pipeline_id
    where public.crm_kpi_pipeline_in(o.office_id, p.code)
  ),
  hist as (
    select o.office_id, o.agent_id, o.id,
      (array_agg(coalesce(fs.sort_order, ts.sort_order) order by h.entered_at, h.id))[1] as from_sort,
      (array_agg(ts.sort_order order by h.entered_at desc, h.id desc))[1] as to_sort,
      (array_agg(ts.terminal_state::text order by h.entered_at desc, h.id desc))[1] as to_terminal,
      count(*) filter (where h.from_stage_id is not null)::int as moves
    from opp o
    join public.crm_stage_history h on h.opportunity_id = o.id and h.entered_at >= v_from and h.entered_at < v_to
    join public.crm_stages ts on ts.id = h.to_stage_id
    left join public.crm_stages fs on fs.id = h.from_stage_id
    group by o.office_id, o.agent_id, o.id
  )
  select h.office_id, h.agent_id, h.id, h.from_sort, h.to_sort, h.to_terminal, h.moves from hist h
  union all
  select o.office_id, o.agent_id, o.id, s.sort_order, s.sort_order, null::text, 0
  from opp o join public.crm_stages s on s.id = o.stage_id
  where o.state = 'open' and not s.is_terminal
    and not exists (select 1 from hist h where h.id = o.id);
end $$;

-- Агшин зураг (зөвхөн систем). Эцсийн агшин зураг дахин бичигдэхгүй.
create or replace function public.crm_weekly_freeze(p_office uuid, p_week date, p_kind text)
returns integer language plpgsql security definer set search_path = public as $$
declare v_week date := p_week - (extract(isodow from p_week)::int - 1); v_n integer;
begin
  if auth.uid() is not null then
    raise exception 'CRM_WEEK: гүйцэтгэлийн агшин зургийг зөвхөн систем үүсгэнэ';
  end if;
  if p_kind not in ('preliminary', 'final') then raise exception 'CRM_WEEK: агшин зургийн төрөл буруу'; end if;
  with m as (
    select x.office_id, x.agent_id, jsonb_object_agg(x.metric_code, x.actual) as metrics
    from public.crm_agent_week_metrics(v_week, p_office, null) x
    group by x.office_id, x.agent_id
  ),
  mv as (
    select y.office_id, y.agent_id, jsonb_build_object(
      'advanced', count(*) filter (where y.to_terminal is null and y.to_sort > y.from_sort),
      'backward', count(*) filter (where y.to_terminal is null and y.to_sort < y.from_sort),
      'won', count(*) filter (where y.to_terminal = 'won'),
      'lost', count(*) filter (where y.to_terminal = 'lost'),
      'none', count(*) filter (where y.to_terminal is null and y.to_sort = y.from_sort)) as moves
    from public.crm_agent_week_moves(v_week, p_office, null) y
    group by y.office_id, y.agent_id
  )
  insert into public.crm_weekly_actuals as w (office_id, agent_id, week_start, kind, metrics, moves)
  select m.office_id, m.agent_id, v_week, p_kind, m.metrics, coalesce(mv.moves, '{}'::jsonb)
  from m left join mv on mv.office_id = m.office_id and mv.agent_id = m.agent_id
  on conflict (office_id, agent_id, week_start, kind) do update
    set metrics = excluded.metrics, moves = excluded.moves, computed_at = now()
    where w.kind = 'preliminary';
  get diagnostics v_n = row_count;
  return v_n;
end $$;

-- Өдрийн төгсгөлийн агшин зураг (pg_cron, 23:50 УБ) — өнгөрсөн долоо хоногийн
-- халуун харилцагч, хүлээгдэж буй хөлс, бүрэн байдлын эх.
create or replace function public.crm_take_agent_daily_stats()
returns integer language plpgsql security definer set search_path = public as $$
declare v_today date := public.crm_ub_today(); v_n integer;
begin
  if auth.uid() is not null then
    raise exception 'CRM_WEEK: өдрийн агшин зургийг зөвхөн систем үүсгэнэ';
  end if;
  insert into public.crm_agent_daily_stats as d
    (office_id, agent_id, day, overdue_followups, hot_contacts, expected_net_fee, completeness_pct)
  select s.office_id, s.profile_id, v_today,
    (select count(*) from public.crm_next_step_log n
      where n.office_id = s.office_id and n.owner_id = s.profile_id
        and n.resolved_at is null and n.due_on < v_today),
    (select count(*) from public.crm_leads l
      where l.office_id = s.office_id and l.owner_id = s.profile_id
        and l.status::text in ('new', 'active') and l.grade = 'a'),
    (select coalesce(sum(coalesce(o.expected_fee_mnt, 0) * coalesce(st.probability, 0) / 100), 0)
      from public.crm_opportunities o
      join public.crm_stages st on st.id = o.stage_id
      join public.crm_pipelines p on p.id = o.pipeline_id
      where o.office_id = s.office_id and o.owner_id = s.profile_id and o.state = 'open'
        and not st.is_terminal and public.crm_kpi_pipeline_in(o.office_id, p.code)),
    (select q.quality_pct from public.crm_v_agent_data_quality q
      where q.office_id = s.office_id and q.agent_id = s.profile_id limit 1)
  from public.crm_staff s
  where s.is_active and 'agent' = any(s.roles)
  on conflict (office_id, agent_id, day) do update
    set overdue_followups = excluded.overdue_followups, hot_contacts = excluded.hot_contacts,
        expected_net_fee = excluded.expected_net_fee, completeness_pct = excluded.completeness_pct,
        computed_at = now();
  get diagnostics v_n = row_count;
  return v_n;
end $$;

revoke execute on function public.crm_weekly_scope_agents(uuid, uuid) from anon, public;
revoke execute on function public.crm_agent_week_metrics(date, uuid, uuid) from anon, public;
revoke execute on function public.crm_agent_week_moves(date, uuid, uuid) from anon, public;
revoke execute on function public.crm_weekly_freeze(uuid, date, text) from anon, public, authenticated;
revoke execute on function public.crm_take_agent_daily_stats() from anon, public, authenticated;
grant execute on function public.crm_weekly_scope_agents(uuid, uuid) to authenticated;
grant execute on function public.crm_agent_week_metrics(date, uuid, uuid) to authenticated;
grant execute on function public.crm_agent_week_moves(date, uuid, uuid) to authenticated;
grant execute on function public.crm_weekly_freeze(uuid, date, text) to service_role;
grant execute on function public.crm_take_agent_daily_stats() to service_role;
