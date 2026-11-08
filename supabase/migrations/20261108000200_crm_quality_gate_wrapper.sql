-- Өгөгдлийн чанарын «Шат нотолгоотойгоо тохирсон» шалгуур (crm_v_quality_checks,
-- security_invoker) crm_check_gate_rec-ийг дуудагчийн эрхээр дууддаг байсан. Тэр
-- функцийн EXECUTE зөвхөн service_role-д тул view бүхэлдээ «permission denied»
-- буцааж, чанарын самбар/аудит/урамшууллын чанарын шалгалт хоосон болдог байв.
--
-- crm_check_gate_rec-ийг authenticated-д шууд нээхгүй (дуудагч зохиосон мөр
-- дамжуулж өөр оффисын баримт тандах боломжтой болно). Оронд нь id-аар ажилладаг
-- definer wrapper: мөрийг өөрөө уншиж, зөвхөн дуудагчийн оффисынх бол тооцно.
create or replace function public.crm_opp_stage_missing(p_opp uuid, p_gate public.crm_gate_code)
returns text[]
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  r public.crm_opportunities;
begin
  select * into r
    from public.crm_opportunities
   where id = p_opp
     and office_id = public.crm_office_id();
  if not found then
    return null;
  end if;
  return public.crm_check_gate_rec(r, p_gate);
end $$;

revoke all on function public.crm_opp_stage_missing(uuid, public.crm_gate_code) from public, anon;
grant execute on function public.crm_opp_stage_missing(uuid, public.crm_gate_code) to authenticated, service_role;

do $$
declare
  v text := pg_get_viewdef('public.crm_v_quality_checks'::regclass, true);
  pat constant text := 'crm_check_gate_rec(oo.*, o.stage_gate)';
begin
  if position(pat in v) = 0 then
    raise exception 'crm_v_quality_checks: хүлээгдсэн хэв загвар олдсонгүй (%)', pat;
  end if;
  v := replace(v, pat, 'crm_opp_stage_missing(o.id, o.stage_gate)');
  execute 'create or replace view public.crm_v_quality_checks as ' || v;
end $$;

-- create or replace нь сонголтыг хадгалах эсэхээс үл хамааран RLS-ийг дуудагчаар үлдээнэ.
alter view public.crm_v_quality_checks set (security_invoker = on);
