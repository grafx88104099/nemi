-- ============================================================
-- CRM v2 · Өөр агентын харилцагчийн дуудлагыг шилжүүлэх хүсэлтэд хадгалах
-- (crm2-design.md §5-16, эзний сонголт (i)).
--
-- contact.foreign_deal = 'deny' хэвээр. Агент Y өөр агентын харилцагчийн дуудлагыг
-- авбал дуудлага алдагдахгүй: crm2_request_transfer_with_call
--   A) энэ хөрөнгө дээр нээлттэй хэлцэлгүй, Y харилцагчийг харах эрхгүй → contact_transfer
--      хүсэлт (to_agent = Y, with_deals = false);
--   B) энэ хөрөнгө×харилцагчийн нээлттэй хэлцэл байгаа, Y түүнийг засах эрхгүй (харилцагчийг
--      харах эсэхээс үл хамааран) → тэр хэлцлийн deal_transfer (батлагч яг аль хэлцэл
--      шилжихийг харна; contact_transfer батлахад хэлцэл далд шилжихгүй);
--   C) Y шууд бүртгэж чадна → алдаа, hint = 'crm2_log_call' (UI crm2_log_call дуудна).
-- Дуудлага payload.calls[]-д хадгалагдана. Батлагдахад (crm2_decide_request, эсвэл
-- шууд шилжүүлэлт) дуудлага бүрийг ХҮСЭГЧИЙН нэрээр (agent_id = created_by = хүсэгч),
-- АНХНЫ цагаар нь бүртгэнэ; бүртгэж чадаагүйг алгасаж, шалтгааныг хадгална.
-- Татгалзвал/цуцлагдвал бүртгэхгүй; татгалзахад харилцагчийн одоогийн хариуцагчид мэдэгдэнэ.
--
-- Өөрчлөгдсөн функц (гарын үсэг ижил, CREATE OR REPLACE — эрх хэвээр):
--   crm2_deals_guard, crm2_activities_guard, crm2_tasks_guard — INSERT-ийн created_by:
--     RPC туг + 'crm2.act_as' тавигдсан үед л хүсэгч; бусад үед өмнөх шигээ auth.uid().
--   crm2_decide_request — батлахад хадгалсан дуудлагыг бүртгэнэ; татгалзахад хариуцагчид
--     мэдэгдэнэ; шилжүүлэх хүсэлтийн мөрийг түгжихээс өмнө харилцагчийн (+ хосын) түгжээ авна.
--   crm2_transfer_contact, crm2_transfer_deal — эхэнд харилцагчийн (+ хосын) түгжээ; шууд шилжүүлэхэд
--     хүлээгдэж буй хүсэлт дуудлагагүй бол өмнөх шигээ цуцлагдана (crm2_supersede_transfer_requests).
-- Түгжээний дараалал (бүгд мөрийн түгжээнээс ӨМНӨ): харилцагчийн түгжээ
--   pg_advisory_xact_lock('crm2_contact_lock:<contact>') → хадгалсан дуудлагын хос бүрийн
--   crm2_open_deal-ийн 'crm2_deal:<property>:<contact>' түгжээ (crm2_lock_request_call_pairs) →
--   мөрүүд. Нэг харилцагчийн шилжүүлэлт (хүсэлт шийдэх, шууд шилжүүлэх) ба дуудлагатай хүсэлтийг
--   дараалуулна; зэрэг crm2_log_call-тэй ч мөчлөг үүсэхгүй (decide ↔ шууд шилжүүлэлтийн хуучин
--   мөчлөгийг ч арилгана).
-- Шинэ дотоод (service_role): crm2_act_as, crm2_lead_of_any_for, crm2_property_visible_for,
--   crm2_record_request_calls, crm2_lock_request_call_pairs, crm2_notify_skipped_calls,
--   crm2_notify_unrecorded_calls, crm2_supersede_transfer_requests.
-- Шинэ UI RPC (authenticated): crm2_request_transfer_with_call.
-- Хүснэгт, enum, policy, тохиргооны түлхүүр өөрчлөгдөхгүй.
--
-- Буцаах: 20261113000100_crm2_foundation.sql-ийн crm2_deals_guard, crm2_activities_guard,
-- crm2_tasks_guard, crm2_decide_request, crm2_transfer_contact, crm2_transfer_deal-ийн
-- биеийг (create → create or replace) дахин ажиллуулж, шинэ 9 функцийг drop хийнэ.
-- ============================================================

-- ── 1. Хүсэгчийн нэрээр бүртгэх туг ─────────────────────────────────────────

-- Хүсэлтээр хадгалсан дуудлагыг батлахад мөрийн created_by = хүсэгч (батлагч биш).
-- Утгатай байх нөхцөл: нэвтэрсэн хэрэглэгч + RPC туг ('crm2.rpc' = '1') + дотоод
-- crm2_record_request_calls 'crm2.act_as'-ийг түр тавьсан. Бусад үед null → guard хуучнаараа.
-- set_config-ийг PostgREST-ээр дуудах боломжгүй тул хэрэглэгч энэ тугийг тавьж чадахгүй.
create function public.crm2_act_as()
returns uuid language sql stable as $$
  select case when auth.uid() is not null and coalesce(current_setting('crm2.rpc', true), '') = '1'
              then public.crm2_uuid(nullif(current_setting('crm2.act_as', true), '')) end;
$$;

-- crm2_is_lead_of_any-ийн өөр хүнд (p_lead) шалгах хувилбар — зөвхөн дотоод.
create function public.crm2_lead_of_any_for(p_lead uuid, p_profiles uuid[], p_office uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.crm_staff me
                  where me.profile_id = p_lead and me.office_id = p_office and me.is_active
                    and me.roles && array['team_lead']::public.crm_role[])
     and exists (select 1 from public.crm_staff s
                   join public.crm_teams t on t.id = s.team_id and t.office_id = s.office_id
                  where s.profile_id = any (p_profiles)
                    and s.office_id = p_office
                    and t.lead_profile_id = p_lead);
$$;

-- crm2_property_visible-ийн дүрмийг өөр хүнд (p_profile) шалгана — зөвхөн дотоод:
-- хадгалсан дуудлагыг батлагдах үед бүртгэхийн өмнө хүсэгч хөрөнгийг ОДОО ч харах эрхтэй
-- эсэх (хүсэгч өөрөө crm2_log_call дуудсантай ижил шалгалт; батлагч хөрөнгийн эрх олгохгүй).
-- auth.uid()-ийн оронд p_profile; дүр/баг нь түүний энэ оффис дахь идэвхтэй crm_staff мөрөөс.
-- crm2_property_visible өөрчлөгдвөл үүнийг хамт өөрчилнө.
create function public.crm2_property_visible_for(p_profile uuid, p_property uuid)
returns boolean language plpgsql stable security definer set search_path = public as $$
declare
  v_x public.crm2_properties;
  v_roles public.crm_role[];
  v_team uuid;
  v_panel boolean;
  v_agents uuid[];
begin
  select * into v_x from public.crm2_properties where id = p_property;
  if not found or p_profile is null then
    return false;
  end if;
  select s.roles, s.team_id, s.panel_admin into v_roles, v_team, v_panel
    from public.crm_staff s
   where s.profile_id = p_profile and s.office_id = v_x.office_id and s.is_active
   limit 1;
  if not found then
    return false;
  end if;
  v_agents := array[v_x.listing_agent_id, v_x.contract_agent_id, v_x.photo_agent_id];
  return coalesce(p_profile = any (array_remove(v_agents, null)), false)
      or (v_x.status = 'draft' and v_x.created_by = p_profile)
      -- crm2_sees_all_properties: менежер, батлах дүрэмтэн, оффисын админ.
      or v_roles && array['sales_director', 'ops_qc', 'ceo']::public.crm_role[]
      or v_roles && public.crm2_setting_roles('roles.approve', v_x.office_id)
      or (coalesce(v_panel, true) and exists (
            select 1 from public.profiles p
             where p.id = p_profile and p.role = 'office_admin'::public.user_role))
      or (v_x.status <> 'draft' and case public.crm2_setting_text('property.visibility', v_x.office_id)
            when 'office' then true
            when 'team' then v_team is not null and exists (
                   select 1 from public.crm_staff s
                    where s.profile_id = any (v_agents) and s.office_id = v_x.office_id and s.team_id = v_team)
            else false
          end)
      or public.crm2_lead_of_any_for(p_profile, v_agents, v_x.office_id)
      or (v_x.status = 'draft' and public.crm2_lead_of_any_for(p_profile, array[v_x.created_by], v_x.office_id))
      or exists (
           select 1 from public.crm2_brokerage_contracts b
            where b.property_id = v_x.id
              and b.status in ('draft', 'pending', 'active')
              and (b.responsible_agent_id = p_profile
                   or public.crm2_lead_of_any_for(p_profile, array[b.responsible_agent_id], v_x.office_id)))
      or exists (
           select 1 from public.crm2_deals d
            where d.property_id = v_x.id
              and (d.agent_id = p_profile
                   or public.crm2_lead_of_any_for(p_profile, array[d.agent_id], v_x.office_id)))
      or exists (
           select 1 from public.crm2_activities a
            where a.property_id = v_x.id and a.agent_id = p_profile);
end $$;

-- ── 2. Guard: INSERT-ийн created_by (бусад шалгалт өөрчлөгдөхгүй) ───────────

-- 20261113000100-тэй ижил; ялгаа нь зөвхөн INSERT-ийн created_by (crm2_act_as).
create or replace function public.crm2_deals_guard()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_sys boolean := public.crm2_in_rpc();
begin
  if tg_op = 'INSERT' then
    if not v_sys then
      raise exception 'CRM: хэлцлийг «хэлцэл нээх» үйлдлээр үүсгэнэ';
    end if;
    select x.office_id into new.office_id from public.crm2_properties x where x.id = new.property_id;
    if new.office_id is null then
      raise exception 'CRM: хөрөнгө олдсонгүй';
    end if;
    if auth.uid() is not null then new.created_by := coalesce(public.crm2_act_as(), auth.uid()); end if;
    new.code := public.crm2_next_code(new.office_id, 'deal');
    new.stage_changed_at := now();
    new.created_at := now();
    perform public.crm2_assert_staff(new.agent_id, new.office_id, 'Хариуцсан агент');
  else
    if new.office_id <> old.office_id or new.code <> old.code
       or new.property_id <> old.property_id or new.contact_id <> old.contact_id
       or new.previous_deal_id is distinct from old.previous_deal_id
       or new.created_by <> old.created_by or new.created_at <> old.created_at then
      raise exception 'CRM: хэлцлийн хөрөнгө, харилцагч, кодыг өөрчлөхгүй';
    end if;
    if old.stage in ('closed', 'cancelled') and new.stage <> old.stage then
      raise exception 'CRM: хаагдсан/цуцлагдсан хэлцлийг дахин нээхгүй — шинэ хэлцэл үүсгэнэ үү';
    end if;
    if not v_sys and (
         new.stage <> old.stage or new.agent_id <> old.agent_id
         or new.cancel_reason_code is distinct from old.cancel_reason_code
         or new.cancel_reason is distinct from old.cancel_reason
         or new.cancelled_at is distinct from old.cancelled_at or new.cancelled_by is distinct from old.cancelled_by
         or new.closed_at is distinct from old.closed_at or new.closed_by is distinct from old.closed_by
         or new.confirmed_at is distinct from old.confirmed_at
         or new.requirement_version is distinct from old.requirement_version
         or new.origin_deal_id is distinct from old.origin_deal_id
         or new.last_activity_at is distinct from old.last_activity_at
         or new.stage_changed_at <> old.stage_changed_at) then
      raise exception 'CRM: хэлцлийн шат, хариуцагчийг тусгай үйлдлээр өөрчилнө';
    end if;
    if new.stage <> old.stage then
      new.stage_changed_at := now();
    end if;
    if new.agent_id <> old.agent_id then
      perform public.crm2_assert_staff(new.agent_id, new.office_id, 'Хариуцсан агент');
    end if;
  end if;
  if new.stage = 'confirmed' and new.confirmed_at is null then
    new.confirmed_at := now();
  end if;
  if new.requirement_id is not null
     and (tg_op = 'INSERT' or new.requirement_id is distinct from old.requirement_id)
     and not exists (select 1 from public.crm2_requirements r
                      where r.id = new.requirement_id and r.contact_id = new.contact_id) then
    raise exception 'CRM: сонгосон шаардлага энэ харилцагчийнх биш';
  end if;
  -- Цуцлагдсан хэлцлээс үүссэн санал: ижил харилцагч, өөр хөрөнгө.
  if new.origin_deal_id is not null
     and (tg_op = 'INSERT' or new.origin_deal_id is distinct from old.origin_deal_id)
     and not exists (select 1 from public.crm2_deals o
                      where o.id = new.origin_deal_id and o.contact_id = new.contact_id
                        and o.property_id <> new.property_id) then
    raise exception 'CRM: эх хэлцэл энэ харилцагчийн өөр хөрөнгийн хэлцэл байх ёстой';
  end if;
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end $$;

-- 20261113000100-тэй ижил; ялгаа нь зөвхөн INSERT-ийн created_by (crm2_act_as).
create or replace function public.crm2_activities_guard()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_me uuid := auth.uid();
  v_sys boolean := public.crm2_in_rpc();
  v_d record;
  v_free text[] := array['finalized_at', 'updated_at', 'updated_by'];
  v_priv boolean;
begin
  select d.office_id, d.property_id, d.contact_id, d.stage, d.agent_id into v_d
    from public.crm2_deals d where d.id = new.deal_id;
  if not found then
    raise exception 'CRM: хэлцэл олдсонгүй';
  end if;

  if tg_op = 'INSERT' then
    if v_d.stage in ('closed', 'cancelled') then
      raise exception 'CRM: хэлцэл хаагдсан — шинэ хэлцэл нээж бүртгэнэ үү';
    end if;
    new.office_id := v_d.office_id;
    if new.property_id is null then
      new.property_id := v_d.property_id;
    elsif new.property_id <> v_d.property_id then
      raise exception 'CRM: дуудлага/үзүүлэлтийн хөрөнгө хэлцлийн хөрөнгөтэй таарахгүй байна';
    end if;
    if new.contact_id is null then
      new.contact_id := v_d.contact_id;
    elsif new.contact_id <> v_d.contact_id then
      raise exception 'CRM: дуудлага/үзүүлэлтийн харилцагч хэлцлийн харилцагчтай таарахгүй байна';
    end if;
    if v_me is not null then new.created_by := coalesce(public.crm2_act_as(), v_me); end if;
    if new.created_by is null then
      raise exception 'CRM: бүртгэсэн хүн тодорхойгүй';
    end if;
    new.agent_id := coalesce(new.agent_id, new.created_by);
    perform public.crm2_assert_staff(new.agent_id, new.office_id, 'Гүйцэтгэсэн агент');
    new.created_at := now();
    new.finalized_at := null;
    new.voided_at := null;
    new.voided_by := null;
    new.void_reason := null;
  else
    if new.deal_id <> old.deal_id or new.property_id <> old.property_id or new.contact_id <> old.contact_id
       or new.kind <> old.kind or new.office_id <> old.office_id
       or new.created_by <> old.created_by or new.created_at <> old.created_at then
      raise exception 'CRM: дуудлага/үзүүлэлтийн хэлцэл, хөрөнгө, харилцагч, төрлийг өөрчлөхгүй';
    end if;
    -- Хаагдсан/цуцлагдсан хэлцлийн мөрийн цаг, төлөв, агентыг сэргээж/өөрчилж болохгүй
    -- (тайлбар засах, хүчингүй болгох боломжтой).
    if not v_sys and v_d.stage in ('closed', 'cancelled')
       and (new.showing_status is distinct from old.showing_status
            or new.scheduled_at is distinct from old.scheduled_at
            or new.occurred_at is distinct from old.occurred_at
            or new.agent_id is distinct from old.agent_id) then
      raise exception 'CRM: хаагдсан/цуцлагдсан хэлцлийн дуудлага, үзүүлэлтийг өөрчлөхгүй';
    end if;
    -- Эцсийн үр дүн (үзүүлсэн/ирээгүй/цуцалсан): дахин «товлосон» болгохгүй; өөр үр дүн
    -- рүү засахыг зөвхөн ахлагч/менежер.
    if not v_sys and old.kind = 'showing' and old.showing_status <> 'scheduled'
       and new.showing_status is distinct from old.showing_status then
      if new.showing_status = 'scheduled' then
        raise exception 'CRM: эцсийн үр дүнтэй үзүүлэлтийг дахин «товлосон» болгохгүй — шинэ үзүүлэлт товлоно уу';
      end if;
      if not (public.crm_is_manager()
              or public.crm2_is_lead_of_any(array[old.agent_id, old.created_by, v_d.agent_id])) then
        raise exception 'CRM: үзүүлэлтийн эцсийн үр дүнг багийн ахлагч эсвэл менежер засна';
      end if;
    end if;
    if new.agent_id <> old.agent_id then
      perform public.crm2_assert_staff(new.agent_id, new.office_id, 'Гүйцэтгэсэн агент');
    end if;
    new.finalized_at := old.finalized_at;
    if new.voided_at is distinct from old.voided_at then
      if new.voided_at is null then
        if not (v_sys or public.crm_is_manager()) then
          raise exception 'CRM: хүчингүй болгосон бичлэгийг зөвхөн менежер сэргээнэ';
        end if;
        new.voided_by := null;
        new.void_reason := null;
      else
        if coalesce(btrim(new.void_reason), '') = '' then
          raise exception 'CRM: хүчингүй болгох шалтгааныг бичнэ үү';
        end if;
        new.voided_at := now();
        new.voided_by := v_me;
      end if;
    else
      new.voided_by := old.voided_by;
    end if;
  end if;

  if new.source_activity_id is not null
     and (tg_op = 'INSERT' or new.source_activity_id is distinct from old.source_activity_id)
     and not exists (select 1 from public.crm2_activities s
                      where s.id = new.source_activity_id and s.deal_id = new.deal_id) then
    raise exception 'CRM: холбох дуудлага өөр хэлцлийнх байна';
  end if;

  if new.kind = 'call' then
    if new.showing_status is not null or new.scheduled_at is not null then
      raise exception 'CRM: дуудлагад үзүүлэх тов, төлөв байхгүй — үзүүлэлтийг тусад нь бүртгэнэ';
    end if;
    new.occurred_at := coalesce(new.occurred_at, now());
    if new.occurred_at > now() + interval '15 minutes' then
      raise exception 'CRM: дуудлагын цаг ирээдүйд байж болохгүй';
    end if;
    if tg_op = 'INSERT' then
      new.finalized_at := now();
    end if;
  else
    if new.scheduled_at is null then
      raise exception 'CRM: үзүүлэх огноо, цагийг сонгоно уу';
    end if;
    new.showing_status := coalesce(new.showing_status, 'scheduled');
    if tg_op = 'INSERT' and new.showing_status not in ('scheduled', 'shown') then
      raise exception 'CRM: шинэ үзүүлэлт «товлосон» эсвэл «үзүүлсэн» төлөвтэй бүртгэгдэнэ';
    end if;
    if new.showing_status = 'shown' then
      -- Товлосон цагийг автоматаар бодит цаг гэж тооцохгүй: агент өөрөө оруулна.
      if new.occurred_at is null then
        raise exception 'CRM: бодитоор үзүүлсэн огноо, цагийг оруулна уу';
      end if;
      if new.occurred_at > now() + interval '15 minutes' then
        raise exception 'CRM: ирээдүйн цагт «үзүүлсэн» гэж бүртгэх боломжгүй';
      end if;
      if public.crm2_setting_bool('showing.require_feedback', new.office_id)
         and coalesce(btrim(new.feedback), '') = '' then
        raise exception 'CRM: үзүүлсний дараах харилцагчийн санал хүсэлтийг бичнэ үү';
      end if;
    else
      new.occurred_at := null;
    end if;
    if new.showing_status = 'scheduled' then
      new.finalized_at := null;
    elsif tg_op = 'INSERT' or old.showing_status = 'scheduled' then
      new.finalized_at := now();
    end if;
  end if;

  -- Агентын засах хугацааны хязгаар (дараагийн алхам нь crm2_tasks-д тусдаа).
  if tg_op = 'UPDATE' and not v_sys then
    v_priv := public.crm_is_manager()
              or public.crm2_is_lead_of_any(array[old.agent_id, old.created_by, v_d.agent_id]);
    if not v_priv then
      if old.voided_at is not null then
        raise exception 'CRM: хүчингүй болгосон бичлэгийг засахгүй';
      end if;
      if old.finalized_at is not null
         and (to_jsonb(new) - v_free) is distinct from (to_jsonb(old) - v_free)
         and now() - old.finalized_at
             > make_interval(hours => public.crm2_setting_int('activity.edit_window_hours', old.office_id)) then
        raise exception 'CRM: засах хугацаа дууссан — багийн ахлагчаар засуулна уу';
      end if;
    end if;
  end if;

  new.updated_at := now();
  new.updated_by := v_me;
  return new;
end $$;

-- 20261113000100-тэй ижил; ялгаа нь зөвхөн INSERT-ийн created_by (crm2_act_as).
create or replace function public.crm2_tasks_guard()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_sys boolean := public.crm2_in_rpc();
  v_me uuid := auth.uid();
  v_office uuid;
  v_d record;
  v_b record;
  v_r record;
begin
  if tg_op = 'INSERT' then
    if new.deal_id is not null then
      select d.office_id, d.property_id, d.contact_id, d.stage into v_d
        from public.crm2_deals d where d.id = new.deal_id;
      if not found then
        raise exception 'CRM: хэлцэл олдсонгүй';
      end if;
      if not v_sys and v_d.stage in ('closed', 'cancelled') then
        raise exception 'CRM: хаагдсан/цуцлагдсан хэлцэлд шинэ ажил нэмэхгүй';
      end if;
      if new.property_id is not null and new.property_id <> v_d.property_id then
        raise exception 'CRM: ажлын хөрөнгө хэлцлийн хөрөнгөтэй таарахгүй байна';
      end if;
      if new.contact_id is not null and new.contact_id <> v_d.contact_id then
        raise exception 'CRM: ажлын харилцагч хэлцлийн харилцагчтай таарахгүй байна';
      end if;
      new.property_id := v_d.property_id;
      new.contact_id := v_d.contact_id;
      v_office := v_d.office_id;
    end if;
    if new.brokerage_id is not null then
      select b.office_id, b.property_id into v_b
        from public.crm2_brokerage_contracts b where b.id = new.brokerage_id;
      if not found then
        raise exception 'CRM: гэрээ олдсонгүй';
      end if;
      if new.property_id is not null and new.property_id <> v_b.property_id then
        raise exception 'CRM: ажлын хөрөнгө гэрээний хөрөнгөтэй таарахгүй байна';
      end if;
      new.property_id := v_b.property_id;
      v_office := coalesce(v_office, v_b.office_id);
    end if;
    if new.requirement_id is not null then
      select r.office_id, r.contact_id into v_r
        from public.crm2_requirements r where r.id = new.requirement_id;
      if not found then
        raise exception 'CRM: шаардлага олдсонгүй';
      end if;
      if new.contact_id is not null and new.contact_id <> v_r.contact_id then
        raise exception 'CRM: сонгосон шаардлага энэ харилцагчийнх биш';
      end if;
      new.contact_id := v_r.contact_id;
      v_office := coalesce(v_office, v_r.office_id);
    end if;
    v_office := coalesce(v_office,
      (select x.office_id from public.crm2_properties x where x.id = new.property_id),
      (select c.office_id from public.crm2_contacts c where c.id = new.contact_id));
    if v_office is null then
      raise exception 'CRM: ажлыг хөрөнгө, хэлцэл, харилцагч эсвэл гэрээтэй холбоно уу';
    end if;
    new.office_id := v_office;
    if v_me is not null then new.created_by := coalesce(public.crm2_act_as(), v_me); end if;
    if new.created_by is null then
      raise exception 'CRM: бүртгэсэн хүн тодорхойгүй';
    end if;
    new.assignee_id := coalesce(new.assignee_id, new.created_by);
    perform public.crm2_assert_work_staff(new.assignee_id, new.office_id);
    if not v_sys then
      new.status := 'open';
    end if;
    new.done_at := case when new.status = 'done' then now() end;
    new.done_by := case when new.status = 'done' then v_me end;
    new.created_at := now();
  else
    if new.office_id <> old.office_id
       or new.deal_id is distinct from old.deal_id or new.property_id is distinct from old.property_id
       or new.contact_id is distinct from old.contact_id or new.requirement_id is distinct from old.requirement_id
       or new.brokerage_id is distinct from old.brokerage_id
       or new.source_activity_id is distinct from old.source_activity_id
       or new.created_by <> old.created_by or new.created_at <> old.created_at then
      raise exception 'CRM: ажлын холбоос, бүртгэсэн хүнийг өөрчлөхгүй';
    end if;
    if new.assignee_id <> old.assignee_id then
      -- Хариуцагч солих: менежер эсвэл хуучин ба шинэ хариуцагчийн аль алиных нь ахлагч
      -- (хэлцэл/харилцагч шилжүүлэх RPC-ээр автоматаар).
      if not v_sys and not (public.crm_is_manager()
                            or (public.crm2_is_lead_of(old.assignee_id) and public.crm2_is_lead_of(new.assignee_id))) then
        raise exception 'CRM: ажлын хариуцагчийг багийн ахлагч эсвэл менежер солино';
      end if;
      perform public.crm2_assert_work_staff(new.assignee_id, new.office_id);
    end if;
    if new.status <> old.status then
      new.done_at := case when new.status = 'done' then now() end;
      new.done_by := case when new.status = 'done' then v_me end;
    else
      new.done_at := old.done_at;
      new.done_by := old.done_by;
    end if;
  end if;
  if new.source_activity_id is not null
     and (tg_op = 'INSERT' or new.source_activity_id is distinct from old.source_activity_id)
     and not exists (select 1 from public.crm2_activities a
                      where a.id = new.source_activity_id and a.deal_id is not distinct from new.deal_id) then
    raise exception 'CRM: холбох дуудлага өөр хэлцлийнх байна';
  end if;
  new.updated_at := now();
  new.updated_by := v_me;
  return new;
end $$;

-- ── 3. Хадгалсан дуудлагыг бүртгэх (дотоод) ─────────────────────────────────

-- Шилжүүлэх хүсэлтийн payload.calls[]-ийг ХҮСЭГЧИЙН нэрээр, анхны цагаар нь бүртгэнэ.
-- Дуудагч шилжүүлэлтийг өмнө нь хэрэгжүүлж, RPC туг тавьсан байна (crm2_decide_request,
-- crm2_supersede_transfer_requests). Дуудлага бүр тусдаа (subtransaction): бүртгэж
-- чадаагүйг алгасаж calls[i].recorded = {skipped, at}; амжилттай бол
-- {activity_id, deal_id, task_id, deal_created, at}. Аль хэдийн recorded-тэйг алгасна.
-- Хүсэгч дуудлага бүрийн хөрөнгийг ОДОО ч харах эрхтэй байх ёстой (crm2_property_visible_for;
-- crm2_log_call-ийн шалгалттай ижил), эс бөгөөс алгасна.
-- (хөрөнгө, харилцагч)-ийн нээлттэй хэлцэл:
--   * хүсэгчийнх (deal_transfer-ийн хэлцэл шилжсэний дараа, эсвэл хүсэгчийнх болсон) → түүн дээр;
--   * өөр агентынх → алгасна: батлагч энэ хүсэлтээр зөвхөн хүсэлтэд заасан объектыг шилжүүлнэ,
--     өөр хэлцлийг далд шилжүүлэхгүй (contact_transfer with_deals = false хэвээр утгатай);
--   * байхгүй → deal.open_property_statuses-д байвал хүсэгч дээр шинээр нээнэ (previous_deal_id,
--     шаардлага — crm2_open_deal-тэй ижил), эс бөгөөс алгасна.
-- Дараагийн алхмын ажил хүсэгч дээр. Түүх trigger-ээр (actor = гүйцэтгэсэн батлагч).
-- Түр зуурын алдаа (deadlock, serialization, lock) алгасахгүй — бүх шийдвэр буцаж, дахин оролдоно.
-- Буцаах: шинэчилсэн payload.
create function public.crm2_record_request_calls(p_request uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_r public.crm2_requests;
  v_calls jsonb;
  v_call jsonb;
  v_i int;
  v_rec jsonb;
  v_req uuid;
  v_contact uuid;
  v_prev_act text := coalesce(current_setting('crm2.act_as', true), '');
  v_prev_reason text := coalesce(current_setting('crm2.reason', true), '');
  v_prop uuid;
  v_pstatus public.crm2_property_status;
  v_deal uuid;
  v_dagent uuid;
  v_dreq uuid;
  v_reqmt uuid;
  v_prevdeal uuid;
  v_created boolean;
  v_act uuid;
  v_task uuid;
begin
  if not public.crm2_in_rpc() then
    raise exception 'CRM: дотоод үйлдэл — шууд дуудахгүй';
  end if;
  select * into v_r from public.crm2_requests where id = p_request for update;
  if not found then
    raise exception 'CRM: хүсэлт олдсонгүй';
  end if;
  v_calls := v_r.payload->'calls';
  if v_r.kind not in ('contact_transfer', 'deal_transfer') or jsonb_typeof(v_calls) is distinct from 'array' then
    return v_r.payload;
  end if;
  v_req := v_r.requested_by;
  if v_r.kind = 'contact_transfer' then
    v_contact := v_r.target_id;
  else
    select d.contact_id into v_contact from public.crm2_deals d where d.id = v_r.target_id;
  end if;

  perform set_config('crm2.act_as', v_req::text, true);
  perform set_config('crm2.reason', 'Хүсэлтэд хадгалсан дуудлага (шилжүүлэлт батлагдсан)', true);

  -- Бодит цагийн дарааллаар (хэлцлийн автомат шат, ажлын дараалал зөв байна).
  for v_i, v_call in
    select (t.o - 1)::int, t.e
      from jsonb_array_elements(v_calls) with ordinality as t(e, o)
     order by (t.e->>'occurred_at')::timestamptz, t.o
  loop
    continue when jsonb_typeof(v_call) is distinct from 'object' or v_call ? 'recorded';
    v_deal := null;
    v_dagent := null;
    v_dreq := null;
    v_prevdeal := null;
    v_act := null;
    v_task := null;
    v_created := false;
    begin
      -- Хүсэгч ажлын дүртэй идэвхтэй ажилтан хэвээр (шилжүүлэлт өөрөө ч үүнийг шаардана).
      if not exists (select 1 from public.crm_staff s
                      where s.profile_id = v_req and s.office_id = v_r.office_id and s.is_active
                        and (s.roles && public.crm2_setting_roles('roles.work', v_r.office_id)
                             or s.roles && array['sales_director', 'ops_qc', 'ceo']::public.crm_role[])) then
        raise exception 'CRM: хүсэгч CRM-д идэвхтэй агент биш болсон';
      end if;
      v_prop := public.crm2_uuid(v_call->>'property_id');
      select x.status into v_pstatus from public.crm2_properties x
       where x.id = v_prop and x.office_id = v_r.office_id;
      if not found then
        raise exception 'CRM: хөрөнгө олдсонгүй';
      end if;
      -- Батлагч хөрөнгийн эрх олгохгүй: хүсэгч өөрөө одоо бүртгэх байсан шиг (хүсэгч өөрөө
      -- гүйцэтгэж буй бол яг crm2_can_view_property).
      if not (case when v_req = auth.uid() then public.crm2_can_view_property(v_prop)
                   else public.crm2_property_visible_for(v_req, v_prop) end) then
        raise exception 'CRM: хүсэгч энэ хөрөнгийг харах эрхгүй болсон';
      end if;
      -- crm2_open_deal-тэй ижил түгжээ: хос бүрд нэг нээлттэй хэлцэл.
      perform pg_advisory_xact_lock(hashtextextended('crm2_deal:' || v_prop::text || ':' || v_contact::text, 0));
      v_reqmt := public.crm2_uuid(v_call->>'requirement_id');
      if v_reqmt is not null and not exists (
           select 1 from public.crm2_requirements r where r.id = v_reqmt and r.contact_id = v_contact) then
        v_reqmt := null;
      end if;
      select d.id, d.agent_id, d.requirement_id into v_deal, v_dagent, v_dreq
        from public.crm2_deals d
       where d.property_id = v_prop and d.contact_id = v_contact and d.is_open
       for update;
      if found then
        if v_dagent is distinct from v_req then
          -- Хүсэлтэд заагаагүй хэлцлийг (жишээ нь хүсэлт гаргасны дараа нээгдсэн) далд шилжүүлэхгүй.
          raise exception 'CRM: энэ хөрөнгө дээрх хэлцлийг % хариуцдаг — хэлцэл шилжүүлэх хүсэлт тусад нь гаргана уу',
            public.crm2_profile_name(v_dagent);
        end if;
        if v_reqmt is not null and v_dreq is null then
          update public.crm2_deals set requirement_id = v_reqmt where id = v_deal;
        end if;
      else
        if not exists (select 1 from jsonb_array_elements_text(
                                       public.crm2_setting('deal.open_property_statuses', v_r.office_id)) s
                        where s = v_pstatus::text) then
          raise exception 'CRM: «%» төлөвтэй хөрөнгө дээр шинэ хэлцэл нээхгүй', public.crm2_status_label(v_pstatus::text);
        end if;
        select d.id into v_prevdeal from public.crm2_deals d
         where d.property_id = v_prop and d.contact_id = v_contact
         order by d.created_at desc limit 1;
        insert into public.crm2_deals (office_id, property_id, contact_id, requirement_id, agent_id, created_by,
                                       previous_deal_id)
        values (v_r.office_id, v_prop, v_contact, v_reqmt, v_req, v_req, v_prevdeal)
        returning id into v_deal;
        v_created := true;
      end if;
      insert into public.crm2_activities (deal_id, kind, agent_id, occurred_at, note, result, created_by)
      values (v_deal, 'call', v_req, (v_call->>'occurred_at')::timestamptz,
              nullif(btrim(coalesce(v_call->>'note', '')), ''),
              nullif(btrim(coalesce(v_call->>'result', '')), ''), v_req)
      returning id into v_act;
      if nullif(v_call->>'next_action', '') is not null then
        insert into public.crm2_tasks (deal_id, kind, assignee_id, due_at, note, source_activity_id, created_by)
        values (v_deal, (v_call->>'next_action')::public.crm2_task_kind, v_req,
                (nullif(v_call->>'next_action_due', ''))::timestamptz,
                nullif(btrim(coalesce(v_call->>'next_action_note', '')), ''), v_act, v_req)
        returning id into v_task;
      end if;
      v_rec := jsonb_build_object('activity_id', v_act, 'deal_id', v_deal, 'task_id', v_task,
                                  'deal_created', v_created, 'at', now());
    exception
      when deadlock_detected or serialization_failure or lock_not_available then
        raise;
      when others then
        v_rec := jsonb_build_object('skipped', regexp_replace(sqlerrm, '^CRM:\s*', ''), 'at', now());
    end;
    v_calls := jsonb_set(v_calls, array[v_i::text, 'recorded'], v_rec);
  end loop;

  perform set_config('crm2.act_as', v_prev_act, true);
  perform set_config('crm2.reason', v_prev_reason, true);
  return jsonb_set(v_r.payload, '{calls}', v_calls);
end $$;

-- Хүлээгдэж буй шилжүүлэх хүсэлтийн хадгалсан дуудлагын (хөрөнгө, харилцагч) хос бүрийн
-- crm2_open_deal-ийн түгжээг ('crm2_deal:<property>:<contact>') харилцагч/хэлцлийн мөрийг
-- түгжихээс ӨМНӨ урьдчилан авна; бүртгэгч дараа нь дахин авна (нэг сессэд давхар авахад саадгүй).
-- Эс бөгөөс шилжүүлэлт мөрийг түгжсэн байхад зэрэг crm2_log_call (хосын түгжээ → FK-ийн мөрийн
-- түгжээ) deadlock үүсгэнэ. Дуудагч харилцагчийн түгжээг аль хэдийн авсан (payload тогтвортой —
-- дуудлага нэмэх нь ч тэр түгжээгээр), тиймээс олон хосын дараалал хамаагүй.
create function public.crm2_lock_request_call_pairs(
  p_kind public.crm2_request_kind, p_target uuid, p_contact uuid
) returns void language plpgsql security definer set search_path = public as $$
declare
  v_prop uuid;
begin
  if p_contact is null then
    return;
  end if;
  for v_prop in
    select distinct public.crm2_uuid(e->>'property_id')
      from public.crm2_requests r
     cross join lateral jsonb_array_elements(
             case when jsonb_typeof(r.payload->'calls') = 'array' then r.payload->'calls' else '[]'::jsonb end) e
     where r.kind = p_kind and r.target_id = p_target and r.status = 'pending'
  loop
    continue when v_prop is null;
    perform pg_advisory_xact_lock(hashtextextended('crm2_deal:' || v_prop::text || ':' || p_contact::text, 0));
  end loop;
end $$;

-- Батлагдсан хүсэлтийн зарим дуудлага бүртгэгдээгүй бол хүсэгчид мэдэгдэнэ.
create function public.crm2_notify_skipped_calls(p_request uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_r public.crm2_requests;
  v_total int;
  v_skipped int;
  v_first text;
begin
  select * into v_r from public.crm2_requests where id = p_request;
  if not found or jsonb_typeof(v_r.payload->'calls') is distinct from 'array' then
    return;
  end if;
  select count(*)::int,
         (count(*) filter (where e->'recorded' ? 'skipped'))::int,
         (array_agg(e->'recorded'->>'skipped') filter (where e->'recorded' ? 'skipped'))[1]
    into v_total, v_skipped, v_first
    from jsonb_array_elements(v_r.payload->'calls') e;
  if v_skipped > 0 then
    perform public.crm2_notify(array[v_r.requested_by], 'crm2_request_call_skipped',
      'Хадгалсан дуудлага бүртгэгдсэнгүй',
      v_total || ' дуудлагаас ' || v_skipped || ' нь бүртгэгдсэнгүй: ' || coalesce(v_first, ''),
      case when v_r.property_id is not null then '/agent/crm/staff/' || v_r.property_id::text
           when v_r.kind = 'contact_transfer' then '/agent/crm/contacts/' || v_r.target_id::text end);
  end if;
end $$;

-- Хадгалсан дуудлага бүртгэгдээгүй (татгалзсан, эсвэл өөр агентад шууд шилжсэн) үед
-- харилцагчийн ОДООГИЙН хариуцагчид (contact_transfer → харилцагчийн хариуцагч,
-- deal_transfer → хэлцлийн хариуцагч) «үйлчлүүлэгч тань өөр агенттай холбогдсон» гэж
-- мэдэгдэнэ — тэр холбогдоно. Дуудлагын тэмдэглэлийг (300 тэмдэгт) зөвхөн тэр хүн
-- харилцагчийг харах эрхтэй бол (crm2_contact_visible-ийн өөр хүнд шалгаж болох хэсэг:
-- хариуцагч / энэ харилцагчтай хэлцэл эсвэл дуудлагатай), хөрөнгийн кодыг тэр
-- хөрөнгийг харах эрхтэй бол л (crm2_property_visible_for) оруулна.
create function public.crm2_notify_unrecorded_calls(p_request uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_r public.crm2_requests;
  v_n int;
  v_contact uuid;
  v_ccode text;
  v_cresp uuid;
  v_x uuid;
  v_last jsonb;
  v_at timestamptz;
  v_p public.crm2_properties;
  v_see_contact boolean;
  v_see_prop boolean;
begin
  select * into v_r from public.crm2_requests where id = p_request;
  if not found or v_r.kind not in ('contact_transfer', 'deal_transfer')
     or jsonb_typeof(v_r.payload->'calls') is distinct from 'array' then
    return;
  end if;
  v_n := jsonb_array_length(v_r.payload->'calls');
  if v_n = 0 then
    return;
  end if;
  if v_r.kind = 'contact_transfer' then
    select c.id, c.code, c.responsible_agent_id into v_contact, v_ccode, v_cresp
      from public.crm2_contacts c where c.id = v_r.target_id;
    v_x := v_cresp;
  else
    select c.id, c.code, c.responsible_agent_id, d.agent_id into v_contact, v_ccode, v_cresp, v_x
      from public.crm2_deals d
      join public.crm2_contacts c on c.id = d.contact_id
     where d.id = v_r.target_id;
  end if;
  if v_x is null or v_x = v_r.requested_by
     or not exists (select 1 from public.crm_staff s
                     where s.profile_id = v_x and s.office_id = v_r.office_id and s.is_active) then
    return;
  end if;
  select e into v_last from jsonb_array_elements(v_r.payload->'calls') e
   order by (e->>'occurred_at')::timestamptz desc nulls last
   limit 1;
  v_at := (v_last->>'occurred_at')::timestamptz;
  select * into v_p from public.crm2_properties x where x.id = public.crm2_uuid(v_last->>'property_id');
  v_see_contact := v_cresp = v_x
    or exists (select 1 from public.crm2_deals d where d.contact_id = v_contact and d.agent_id = v_x)
    or exists (select 1 from public.crm2_activities a where a.contact_id = v_contact and a.agent_id = v_x);
  v_see_prop := v_p.id is not null and public.crm2_property_visible_for(v_x, v_p.id);
  perform public.crm2_notify(array[v_x], 'crm2_request_call_unrecorded',
    'Таны харилцагч өөр агенттай холбогдсон',
    coalesce(v_ccode, '') || ': ' || public.crm2_profile_name(v_r.requested_by)
      || ' — ' || v_n || ' дуудлага, сүүлийнх '
      || coalesce(to_char(v_at at time zone 'Asia/Ulaanbaatar', 'YYYY-MM-DD HH24:MI'), '')
      || case when v_see_prop then ' · ' || v_p.code else '' end
      || case when coalesce(v_see_contact, false) and coalesce(btrim(v_last->>'note'), '') <> ''
              then ' — ' || left(btrim(v_last->>'note'), 300) else '' end,
    case when coalesce(v_see_contact, false) then
      case when v_r.kind = 'deal_transfer' and v_r.property_id is not null
           then '/agent/crm/staff/' || v_r.property_id::text
           else '/agent/crm/contacts/' || v_contact::text end
    end);
end $$;

-- Шууд шилжүүлэх (crm2_transfer_contact/deal) үед тухайн объектын хүлээгдэж буй хүсэлт:
--   * хадгалсан дуудлагагүй → өмнөх шигээ цуцлагдана ('Шууд шилжүүлсэн', мэдэгдэлгүй);
--   * дуудлагатай, хүсэгч = to_agent = шинэ хариуцагч → батлагдсанд тооцож дуудлагыг бүртгэнэ;
--   * дуудлагатай, бусад → цуцлагдана; хүсэгчид «дуудлага бүртгэгдсэнгүй», шинэ хариуцагчид
--     «үйлчлүүлэгч тань өөр агенттай холбогдсон» гэж мэдэгдэнэ.
-- Дуудагч шилжүүлэлтийг хэрэгжүүлж, RPC туг тавьсан байна.
create function public.crm2_supersede_transfer_requests(
  p_kind public.crm2_request_kind, p_target uuid, p_to uuid
) returns void language plpgsql security definer set search_path = public as $$
declare
  v_q public.crm2_requests;
  v_payload jsonb;
  v_link text;
begin
  if not public.crm2_in_rpc() then
    raise exception 'CRM: дотоод үйлдэл — шууд дуудахгүй';
  end if;
  for v_q in
    select * from public.crm2_requests
     where kind = p_kind and target_id = p_target and status = 'pending'
     for update
  loop
    if coalesce(jsonb_array_length(case when jsonb_typeof(v_q.payload->'calls') = 'array'
                                        then v_q.payload->'calls' end), 0) = 0 then
      update public.crm2_requests
         set status = 'cancelled', decided_by = auth.uid(), decided_at = now(), decision_note = 'Шууд шилжүүлсэн'
       where id = v_q.id;
      continue;
    end if;
    v_link := case when v_q.property_id is not null then '/agent/crm/staff/' || v_q.property_id::text
                   when v_q.kind = 'contact_transfer' then '/agent/crm/contacts/' || v_q.target_id::text end;
    if v_q.requested_by = p_to and public.crm2_uuid(v_q.payload->>'to_agent') = p_to then
      v_payload := public.crm2_record_request_calls(v_q.id);
      update public.crm2_requests
         set status = 'approved', decided_by = auth.uid(), decided_at = now(),
             decision_note = 'Шууд шилжүүлсэн', payload = v_payload
       where id = v_q.id;
      perform public.crm2_notify_skipped_calls(v_q.id);
    else
      update public.crm2_requests
         set status = 'cancelled', decided_by = auth.uid(), decided_at = now(), decision_note = 'Шууд шилжүүлсэн'
       where id = v_q.id;
      perform public.crm2_notify(array[v_q.requested_by], 'crm2_request_decided', 'Хүсэлт цуцлагдлаа',
        'Өөр агентад шууд шилжүүлсэн — хүсэлтэд хадгалсан дуудлага бүртгэгдсэнгүй', v_link);
      perform public.crm2_notify_unrecorded_calls(v_q.id);
    end if;
  end loop;
end $$;

-- ── 4. Хүсэлт шийдвэрлэх: хадгалсан дуудлага ────────────────────────────────

-- Өмнөх бүх үйлдэл хэвээр. Нэмэлт (зөвхөн payload.calls-тай шилжүүлэх хүсэлтэд):
--   батлах → шилжүүлсний дараа crm2_record_request_calls (payload-д recorded), алгассан
--            дуудлагатай бол хүсэгчид мэдэгдэнэ;
--   татгалзах → дуудлага бүртгэхгүй, харилцагчийн одоогийн хариуцагчид мэдэгдэнэ.
-- Шилжүүлэх хүсэлтэд: мөрийг түгжихээс өмнө харилцагчийн түгжээ ('crm2_contact_lock:<contact>'),
-- дараа нь хадгалсан дуудлагын хосын түгжээ (crm2_lock_request_call_pairs) —
-- crm2_request_transfer_with_call, crm2_transfer_contact/deal-тэй ижил дараалал.
create or replace function public.crm2_decide_request(p_request uuid, p_approve boolean, p_note text default null)
returns text language plpgsql security definer set search_path = public as $$
declare
  v_r public.crm2_requests;
  v_flag text;
  v_status public.crm2_request_status;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  v_link text;
  v_payload jsonb;
  v_calls boolean;
  v_lock_kind public.crm2_request_kind;
  v_lock_target uuid;
  v_lock_contact uuid;
begin
  select r.kind, r.target_id,
         case r.kind
           when 'contact_transfer' then r.target_id
           when 'deal_transfer' then (select d.contact_id from public.crm2_deals d where d.id = r.target_id)
         end
    into v_lock_kind, v_lock_target, v_lock_contact
    from public.crm2_requests r
   where r.id = p_request and r.office_id = public.crm_office_id();
  if v_lock_contact is not null then
    perform pg_advisory_xact_lock(hashtextextended('crm2_contact_lock:' || v_lock_contact::text, 0));
    perform public.crm2_lock_request_call_pairs(v_lock_kind, v_lock_target, v_lock_contact);
  end if;
  select * into v_r from public.crm2_requests
   where id = p_request and office_id = public.crm_office_id() for update;
  if not found then
    raise exception 'CRM: хүсэлт олдсонгүй';
  end if;
  if v_r.status <> 'pending' then
    raise exception 'CRM: хүсэлт аль хэдийн шийдвэрлэгдсэн';
  end if;
  if not public.crm2_can_decide_request(v_r.id) then
    raise exception 'CRM: энэ хүсэлтийг шийдвэрлэх эрхгүй';
  end if;
  if not coalesce(p_approve, false) and v_note is null then
    raise exception 'CRM: татгалзсан шалтгааныг бичнэ үү';
  end if;
  -- Хүсэлтэд хадгалсан дуудлага (crm2_request_transfer_with_call).
  v_calls := v_r.kind in ('deal_transfer', 'contact_transfer')
             and coalesce(jsonb_array_length(case when jsonb_typeof(v_r.payload->'calls') = 'array'
                                                  then v_r.payload->'calls' end), 0) > 0;
  v_payload := v_r.payload;
  v_flag := public.crm2_rpc_begin(coalesce(v_r.reason, v_note));
  if coalesce(p_approve, false) then
    if v_r.kind = 'property_status' then
      perform public.crm2_apply_property_status(v_r.target_id, (v_r.payload->>'to')::public.crm2_property_status, v_r.reason);
    elsif v_r.kind = 'deal_transfer' then
      perform public.crm2_apply_deal_transfer(v_r.target_id, public.crm2_uuid(v_r.payload->>'to_agent'));
    elsif v_r.kind = 'contact_transfer' then
      perform public.crm2_apply_contact_transfer(v_r.target_id, public.crm2_uuid(v_r.payload->>'to_agent'),
                                                 coalesce((v_r.payload->>'with_deals')::boolean, false));
    end if;
    -- Шилжүүлсний дараа: дуудлага бүрийг хүсэгчийн нэрээр, анхны цагаар нь.
    if v_calls then
      v_payload := public.crm2_record_request_calls(v_r.id);
    end if;
    v_status := 'approved';
  else
    v_status := 'rejected';
  end if;
  update public.crm2_requests
     set status = v_status, decided_by = auth.uid(), decided_at = now(), decision_note = v_note,
         payload = v_payload
   where id = v_r.id;
  perform public.crm2_rpc_end(v_flag);
  v_link := case
    when v_r.property_id is not null then '/agent/crm/staff/' || v_r.property_id::text
    when v_r.kind = 'contact_transfer' then '/agent/crm/contacts/' || v_r.target_id::text
  end;
  perform public.crm2_notify(array[v_r.requested_by], 'crm2_request_decided',
    case when v_status = 'approved' then 'Хүсэлт батлагдлаа' else 'Хүсэлт татгалзагдлаа' end,
    coalesce(v_note, ''), v_link);
  if v_calls then
    if v_status = 'approved' then
      perform public.crm2_notify_skipped_calls(v_r.id);
    else
      -- Дуудлага бүртгэгдэхгүй: харилцагчийн одоогийн хариуцагч мэдэж, өөрөө холбогдоно.
      perform public.crm2_notify_unrecorded_calls(v_r.id);
    end if;
  end if;
  return v_status::text;
end $$;

-- ── 5. Шууд шилжүүлэлт: хүлээгдэж буй дуудлагатай хүсэлт ───────────────────

-- 20261113000100-тэй ижил; ялгаа: эхэнд харилцагчийн ба хадгалсан дуудлагын хосын түгжээ
-- (мөрийн түгжээнээс өмнө), шууд замд хүлээгдэж буй хүсэлтийг crm2_supersede_transfer_requests
-- шийднэ (дуудлагагүй хүсэлт өмнөх шигээ цуцлагдана).
create or replace function public.crm2_transfer_contact(
  p_contact uuid, p_to_agent uuid, p_reason text, p_with_deals boolean default false
) returns text language plpgsql security definer set search_path = public as $$
declare
  v_c public.crm2_contacts;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_flag text;
begin
  if not public.crm2_is_member() then
    raise exception 'CRM: эрх алга';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('crm2_contact_lock:' || p_contact::text, 0));
  perform public.crm2_lock_request_call_pairs('contact_transfer', p_contact, p_contact);
  select * into v_c from public.crm2_contacts
   where id = p_contact and office_id = public.crm_office_id() for update;
  if not found then
    raise exception 'CRM: харилцагч олдсонгүй';
  end if;
  if p_to_agent is null or p_to_agent = v_c.responsible_agent_id then
    raise exception 'CRM: шинэ хариуцагчийг сонгоно уу';
  end if;
  if v_reason is null then
    raise exception 'CRM: шилжүүлэх шалтгааныг бичнэ үү';
  end if;
  perform public.crm2_assert_work_staff(p_to_agent, v_c.office_id);

  if public.crm2_transfer_approver(v_c.responsible_agent_id, p_to_agent) and public.crm2_self_ok(array[p_to_agent]) then
    v_flag := public.crm2_rpc_begin(v_reason);
    perform public.crm2_apply_contact_transfer(v_c.id, p_to_agent, coalesce(p_with_deals, false));
    perform public.crm2_supersede_transfer_requests('contact_transfer', v_c.id, p_to_agent);
    perform public.crm2_rpc_end(v_flag);
    perform public.crm2_notify(array[v_c.responsible_agent_id, p_to_agent], 'crm2_contact_transferred',
      'Харилцагч шилжлээ', v_c.code || ': ' || v_reason, '/agent/crm/contacts/' || v_c.id::text);
    return 'applied';
  end if;

  if not (public.crm2_contact_editable(v_c.responsible_agent_id)
          or (p_to_agent = auth.uid() and public.crm2_can_work())) then
    raise exception 'CRM: энэ харилцагчийг шилжүүлэх хүсэлт гаргах эрхгүй';
  end if;
  if exists (select 1 from public.crm2_requests r
              where r.kind = 'contact_transfer' and r.target_id = v_c.id and r.status = 'pending') then
    raise exception 'CRM: энэ харилцагчид шийдвэрлэгдээгүй хүсэлт байна';
  end if;
  insert into public.crm2_requests (office_id, kind, target_id, payload, reason, requested_by)
  values (v_c.office_id, 'contact_transfer', v_c.id,
          jsonb_build_object('from_agent', v_c.responsible_agent_id, 'to_agent', p_to_agent,
                             'with_deals', coalesce(p_with_deals, false)),
          v_reason, auth.uid());
  perform public.crm2_notify(public.crm2_approver_ids(v_c.office_id, array[v_c.responsible_agent_id, p_to_agent]),
    'crm2_request', 'Харилцагч шилжүүлэх хүсэлт', v_c.code || ': ' || v_reason,
    '/agent/crm/contacts/' || v_c.id::text);
  return 'pending';
end $$;

-- 20261113000100-тэй ижил; ялгаа: эхэнд хэлцлийн харилцагчийн ба хадгалсан дуудлагын хосын түгжээ
-- (мөрийн түгжээнээс өмнө; contact_id өөрчлөгддөггүй), шууд замд хүлээгдэж буй хүсэлтийг
-- crm2_supersede_transfer_requests шийднэ (дуудлагагүй хүсэлт өмнөх шигээ цуцлагдана).
create or replace function public.crm2_transfer_deal(p_deal uuid, p_to_agent uuid, p_reason text)
returns text language plpgsql security definer set search_path = public as $$
declare
  v_d public.crm2_deals;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_flag text;
  v_lock_contact uuid;
begin
  if not public.crm2_is_member() then
    raise exception 'CRM: эрх алга';
  end if;
  select d.contact_id into v_lock_contact from public.crm2_deals d where d.id = p_deal;
  perform pg_advisory_xact_lock(hashtextextended('crm2_contact_lock:' || v_lock_contact::text, 0));
  perform public.crm2_lock_request_call_pairs('deal_transfer', p_deal, v_lock_contact);
  select * into v_d from public.crm2_deals where id = p_deal and office_id = public.crm_office_id() for update;
  if not found then
    raise exception 'CRM: хэлцэл олдсонгүй';
  end if;
  if v_d.stage in ('closed', 'cancelled') then
    raise exception 'CRM: хаагдсан хэлцлийг шилжүүлэхгүй';
  end if;
  if p_to_agent is null or p_to_agent = v_d.agent_id then
    raise exception 'CRM: шинэ хариуцагчийг сонгоно уу';
  end if;
  if v_reason is null then
    raise exception 'CRM: шилжүүлэх шалтгааныг бичнэ үү';
  end if;
  perform public.crm2_assert_work_staff(p_to_agent, v_d.office_id);

  if public.crm2_transfer_approver(v_d.agent_id, p_to_agent) and public.crm2_self_ok(array[p_to_agent]) then
    v_flag := public.crm2_rpc_begin(v_reason);
    perform public.crm2_apply_deal_transfer(v_d.id, p_to_agent);
    perform public.crm2_supersede_transfer_requests('deal_transfer', v_d.id, p_to_agent);
    perform public.crm2_rpc_end(v_flag);
    perform public.crm2_notify(array[v_d.agent_id, p_to_agent], 'crm2_deal_transferred',
      'Хэлцэл шилжлээ', v_d.code || ': ' || v_reason, '/agent/crm/staff/' || v_d.property_id::text);
    return 'applied';
  end if;

  -- Хүсэлт: хэлцлийн засварлагч, эсвэл хэлцлийг өөртөө авахыг хүссэн агент.
  if not (public.crm2_deal_editable(v_d.agent_id) or (p_to_agent = auth.uid() and public.crm2_can_work())) then
    raise exception 'CRM: энэ хэлцлийг шилжүүлэх хүсэлт гаргах эрхгүй';
  end if;
  if exists (select 1 from public.crm2_requests r
              where r.kind = 'deal_transfer' and r.target_id = v_d.id and r.status = 'pending') then
    raise exception 'CRM: энэ хэлцэлд шийдвэрлэгдээгүй хүсэлт байна';
  end if;
  insert into public.crm2_requests (office_id, kind, target_id, property_id, payload, reason, requested_by)
  values (v_d.office_id, 'deal_transfer', v_d.id, v_d.property_id,
          jsonb_build_object('from_agent', v_d.agent_id, 'to_agent', p_to_agent), v_reason, auth.uid());
  perform public.crm2_notify(public.crm2_approver_ids(v_d.office_id, array[v_d.agent_id, p_to_agent]),
    'crm2_request', 'Хэлцэл шилжүүлэх хүсэлт', v_d.code || ': ' || v_reason,
    '/agent/crm/staff/' || v_d.property_id::text);
  return 'pending';
end $$;

-- ── 6. UI RPC: дуудлагыг шилжүүлэх хүсэлтэд хадгалах ───────────────────────

-- Өөр агентын харилцагчийн дуудлагыг шилжүүлэх хүсэлтэд хадгална (ажлын эрхтэй, хөрөнгийг
-- харах эрхтэй агент). Хүсэлт to_agent = дуудсан агент (Y).
--   C) шууд бүртгэж чадна (crm2_log_call амжилттай болох нөхцөл) → алдаа, hint 'crm2_log_call'
--      (эхлээд шалгана: хуучин цаг, шаардлагын шалгалт C-д хамаарахгүй);
--   B) энэ хөрөнгө×харилцагчийн нээлттэй хэлцэл байгаа, Y засах эрхгүй → тэр хэлцлийн
--      deal_transfer (харилцагчийг харах эсэхээс үл хамааран; батлагч яг энэ хэлцлийг харна);
--   A) нээлттэй хэлцэлгүй, харилцагчийг харах эрхгүй → contact_transfer (with_deals = false);
--      хөрөнгө deal.open_property_statuses-д байх ёстой.
-- Ижил төрөл+объектын хүлээгдэж буй хүсэлт: Y-ийн өөрийнх (to_agent = Y) бол дуудлагыг
-- нэмнэ (ижил хөрөнгө+цаг+тэмдэглэл бол давхардуулахгүй, ≤ 20); бусдынх бол алдаа, hint
-- 'crm2_pending_conflict'. Шинэ хүсэлтэд батлагчид (crm2_approver_ids) ба одоогийн
-- хариуцагчид мэдэгдэнэ (одоогийн шилжүүлэх хүсэлтийн мэдэгдэлтэй ижил агуулга: код + шалтгаан).
-- Y өөрөө энэ шилжүүлэлтийн батлагч бол (crm2_transfer_approver + crm2_self_ok) шууд
-- хэрэгжүүлж, дуудлагыг тэр дор нь бүртгэнэ.
-- Түгжээ: харилцагчийн түгжээ (decide, шууд шилжүүлэлттэй ижил) → хүлээгдэж буй хүсэлтийн мөр;
-- дараа нь хариуцагч, нээлттэй хэлцэл, эрхийг дахин шалгаж өөрчлөгдсөн бол hint 'crm2_retry'.
-- Буцаах: {request_id, kind, status: 'pending', calls, appended, duplicate}
--      эсвэл {request_id, kind, status: 'applied', calls, skipped, deal_id, activity_id, task_id, deal_created}.
create function public.crm2_request_transfer_with_call(
  p_property uuid,
  p_contact uuid,
  p_occurred_at timestamptz default null,
  p_note text default null,
  p_result text default null,
  p_next_action public.crm2_task_kind default null,
  p_next_action_due timestamptz default null,
  p_next_action_note text default null,
  p_requirement uuid default null,
  p_reason text default null
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_me uuid := auth.uid();
  v_office uuid := public.crm_office_id();
  v_at timestamptz := coalesce(p_occurred_at, now());
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  v_result text := nullif(btrim(coalesce(p_result, '')), '');
  v_next_note text := nullif(btrim(coalesce(p_next_action_note, '')), '');
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_pstatus public.crm2_property_status;
  v_c public.crm2_contacts;
  v_deal_id uuid;
  v_deal_code text;
  v_deal_agent uuid;
  v_has_deal boolean;
  v_viewable boolean;
  v_editable boolean;
  v_kind public.crm2_request_kind;
  v_target uuid;
  v_from uuid;
  v_code text;
  v_link text;
  v_q public.crm2_requests;
  v_found boolean;
  v_call jsonb;
  v_calls jsonb;
  v_id uuid;
  v_new boolean := false;
  v_dup boolean := false;
  v_first_call boolean := false;
  v_approvers uuid[] := '{}';
  v_rec jsonb;
  v_skipped int;
begin
  if v_me is null or not public.crm2_can_work() then
    raise exception 'CRM: дуудлага бүртгэх эрхгүй';
  end if;
  select x.status into v_pstatus from public.crm2_properties x
   where x.id = p_property and x.office_id = v_office;
  if not found or not public.crm2_can_view_property(p_property) then
    raise exception 'CRM: хөрөнгө олдсонгүй';
  end if;
  select * into v_c from public.crm2_contacts where id = p_contact and office_id = v_office;
  if not found then
    raise exception 'CRM: харилцагч олдсонгүй';
  end if;
  -- crm2_activities ба crm2_tasks-ийн шалгалттай ижил (crm2_log_call ч мөн адил татгалзана).
  if v_at > now() + interval '15 minutes' then
    raise exception 'CRM: дуудлагын цаг ирээдүйд байж болохгүй';
  end if;
  if char_length(v_note) > 4000 then
    raise exception 'CRM: дуудлагын тэмдэглэл 4000 тэмдэгтээс хэтрэхгүй';
  end if;
  if char_length(v_result) > 2000 then
    raise exception 'CRM: дуудлагын үр дүн 2000 тэмдэгтээс хэтрэхгүй';
  end if;
  if p_next_action is not null and char_length(v_next_note) > 1000 then
    raise exception 'CRM: дараагийн алхмын тэмдэглэл 1000 тэмдэгтээс хэтрэхгүй';
  end if;
  if char_length(v_reason) > 2000 then
    raise exception 'CRM: шалтгаан 2000 тэмдэгтээс хэтрэхгүй';
  end if;

  -- Нэг харилцагчийн шилжүүлэлт, хүсэлтийг дараалуулна (давхар дарах, хоёр агент зэрэг,
  -- зэрэг шийдвэрлэх/шууд шилжүүлэх). crm2_decide_request, crm2_transfer_contact/deal ч
  -- мөрийн түгжээнээс өмнө энэ түгжээг авдаг.
  perform pg_advisory_xact_lock(hashtextextended('crm2_contact_lock:' || p_contact::text, 0));

  -- Түгжээний дараах шинэ төлөв (хариуцагч, нээлттэй хэлцэл, эрх).
  select * into v_c from public.crm2_contacts where id = p_contact;
  select d.id, d.code, d.agent_id into v_deal_id, v_deal_code, v_deal_agent
    from public.crm2_deals d
   where d.property_id = p_property and d.contact_id = p_contact and d.is_open;
  v_has_deal := found;
  v_viewable := public.crm2_can_view_contact(p_contact);
  v_editable := v_has_deal and public.crm2_can_edit_deal(v_deal_id);
  -- C) crm2_log_call амжилттай болох нөхцөл (crm2_open_deal-тэй ижил).
  if v_editable
     or (not v_has_deal and (v_viewable
                             or coalesce(public.crm2_setting_text('contact.foreign_deal'), 'deny') = 'allow')) then
    raise exception 'CRM: энэ дуудлагыг шууд бүртгэх боломжтой — «Дуудлага бүртгэх»-ээр хадгална уу'
      using hint = 'crm2_log_call';
  end if;
  -- Зөвхөн хүсэлтэд хадгалах дуудлагад (A, B).
  if v_at < now() - interval '7 days' then
    raise exception 'CRM: 7 хоногоос өмнөх дуудлагыг хүсэлтэд хадгалахгүй';
  end if;
  -- Шаардлагыг зөвхөн харилцагчийг харах эрхтэй бол (эрхгүй бол id-г ч мэдэхгүй).
  if p_requirement is not null and not (
       v_viewable
       and exists (select 1 from public.crm2_requirements r
                    where r.id = p_requirement and r.contact_id = p_contact)) then
    raise exception 'CRM: сонгосон шаардлага энэ харилцагчийнх биш';
  end if;
  if v_has_deal then
    -- B) Нээлттэй хэлцэл байгаа: зөвхөн тэр хэлцлийг шилжүүлэх хүсэлт (харилцагч хуучин
    -- хариуцагчдаа үлдэнэ; хэлцлийн агент болсноор Y харилцагчийг харна).
    v_kind := 'deal_transfer';
    v_target := v_deal_id;
    v_from := v_deal_agent;
    v_code := v_deal_code;
    v_link := '/agent/crm/staff/' || p_property::text;
  else
    -- A) Хэлцэлгүй, харилцагчийг харах эрхгүй: харилцагч шилжүүлэх (хэлцэлгүйгээр).
    v_kind := 'contact_transfer';
    v_target := v_c.id;
    v_from := v_c.responsible_agent_id;
    v_code := v_c.code;
    v_link := '/agent/crm/contacts/' || v_c.id::text;
    if not exists (select 1 from jsonb_array_elements_text(public.crm2_setting('deal.open_property_statuses')) s
                    where s = v_pstatus::text) then
      raise exception 'CRM: «%» төлөвтэй хөрөнгө дээр шинэ хэлцэл нээхгүй', public.crm2_status_label(v_pstatus::text);
    end if;
  end if;
  perform public.crm2_assert_work_staff(v_me, v_office);

  select * into v_q from public.crm2_requests r
   where r.kind = v_kind and r.target_id = v_target and r.status = 'pending'
   for update;
  v_found := found;
  if v_found and (v_q.requested_by is distinct from v_me
                  or public.crm2_uuid(v_q.payload->>'to_agent') is distinct from v_me) then
    raise exception 'CRM: % шилжүүлэх өөр хүсэлт шийдвэрлэгдээгүй байна — багийн ахлагчдаа хандана уу',
      case when v_kind = 'deal_transfer' then 'Энэ хэлцлийг' else 'Энэ харилцагчийг' end
      using hint = 'crm2_pending_conflict';
  end if;
  -- Мөр хүлээх хооронд (хүсэлт цуцлагдсан, хэлцэл нээгдсэн/хаагдсан г.м.) нөхцөл өөрчлөгдсөн бол
  -- хуучин хариуцагч/хэлцлээр хүсэлт үүсгэхгүй.
  if (select c.responsible_agent_id from public.crm2_contacts c where c.id = p_contact)
       is distinct from v_c.responsible_agent_id
     or (select d.id from public.crm2_deals d
          where d.property_id = p_property and d.contact_id = p_contact and d.is_open)
       is distinct from v_deal_id
     or (v_has_deal and (select d.agent_id from public.crm2_deals d where d.id = v_deal_id)
                          is distinct from v_deal_agent)
     or public.crm2_can_view_contact(p_contact) is distinct from v_viewable
     or (v_has_deal and public.crm2_can_edit_deal(v_deal_id)) then
    raise exception 'CRM: нөхцөл өөрчлөгдлөө — дахин оролдоно уу' using hint = 'crm2_retry';
  end if;

  v_call := jsonb_build_object(
    'property_id', p_property,
    'occurred_at', v_at,
    'note', v_note,
    'result', v_result,
    'next_action', p_next_action,
    'next_action_due', case when p_next_action is not null then p_next_action_due end,
    'next_action_note', case when p_next_action is not null then v_next_note end,
    'requirement_id', p_requirement,
    'logged_by', v_me,
    'logged_at', now());

  if v_found then
    v_id := v_q.id;
    v_reason := coalesce(v_q.reason, v_reason, 'Харилцагч дуудлагаар холбогдсон');
    v_calls := case when jsonb_typeof(v_q.payload->'calls') = 'array' then v_q.payload->'calls' else '[]'::jsonb end;
    v_dup := exists (select 1 from jsonb_array_elements(v_calls) e
                      where e->>'property_id' = p_property::text
                        and (e->>'occurred_at')::timestamptz = v_at
                        and (e->>'note') is not distinct from v_note);
    if not v_dup then
      if jsonb_array_length(v_calls) >= 20 then
        raise exception 'CRM: нэг хүсэлтэд 20-оос олон дуудлага хадгалахгүй — багийн ахлагчдаа хандана уу';
      end if;
      v_first_call := jsonb_array_length(v_calls) = 0;
      v_calls := v_calls || jsonb_build_array(v_call);
      update public.crm2_requests set payload = jsonb_set(payload, '{calls}', v_calls) where id = v_id;
    end if;
  else
    v_reason := coalesce(v_reason, 'Харилцагч дуудлагаар холбогдсон');
    v_calls := jsonb_build_array(v_call);
    insert into public.crm2_requests (office_id, kind, target_id, property_id, payload, reason, requested_by)
    values (v_office, v_kind, v_target,
            case when v_kind = 'deal_transfer' then p_property end,
            jsonb_build_object('from_agent', v_from, 'to_agent', v_me, 'calls', v_calls)
              || case when v_kind = 'contact_transfer' then jsonb_build_object('with_deals', false)
                      else '{}'::jsonb end,
            v_reason, v_me)
    returning id into v_id;
    v_new := true;
    v_first_call := true;
  end if;

  -- Y өөрөө батлагч: шууд хэрэгжүүлж, хадгалсан бүх дуудлагыг бүртгэнэ.
  if public.crm2_transfer_approver(v_from, v_me) and public.crm2_self_ok(array[v_me]) then
    perform public.crm2_decide_request(v_id, true, 'Шууд шилжүүлсэн');
    select e->'recorded' into v_rec
      from public.crm2_requests r, jsonb_array_elements(r.payload->'calls') e
     where r.id = v_id
       and e->>'property_id' = p_property::text
       and (e->>'occurred_at')::timestamptz = v_at
       and (e->>'note') is not distinct from v_note
     limit 1;
    if v_rec is null or v_rec ? 'skipped' then
      raise exception 'CRM: дуудлагыг бүртгэж чадсангүй: %', coalesce(v_rec->>'skipped', 'тодорхойгүй алдаа');
    end if;
    select count(*)::int into v_skipped
      from public.crm2_requests r, jsonb_array_elements(r.payload->'calls') e
     where r.id = v_id and e->'recorded' ? 'skipped';
    perform public.crm2_notify(array[v_from, v_me],
      case when v_kind = 'deal_transfer' then 'crm2_deal_transferred' else 'crm2_contact_transferred' end,
      case when v_kind = 'deal_transfer' then 'Хэлцэл шилжлээ' else 'Харилцагч шилжлээ' end,
      v_code || ': ' || v_reason, v_link);
    return jsonb_build_object('request_id', v_id, 'kind', v_kind, 'status', 'applied',
                              'calls', jsonb_array_length(v_calls), 'skipped', v_skipped,
                              'deal_id', v_rec->'deal_id', 'activity_id', v_rec->'activity_id',
                              'task_id', v_rec->'task_id', 'deal_created', v_rec->'deal_created');
  end if;

  if v_new or v_first_call then
    v_approvers := public.crm2_approver_ids(v_office, array[v_from, v_me]);
  end if;
  if v_new then
    perform public.crm2_notify(v_approvers, 'crm2_request',
      case when v_kind = 'deal_transfer' then 'Хэлцэл шилжүүлэх хүсэлт' else 'Харилцагч шилжүүлэх хүсэлт' end,
      v_code || ': ' || v_reason, v_link);
  end if;
  if v_first_call and not (v_from = any (v_approvers)) then
    perform public.crm2_notify(array[v_from], 'crm2_request_call',
      case when v_kind = 'deal_transfer' then 'Таны хэлцлийг шилжүүлэх хүсэлт гарлаа'
           else 'Таны харилцагчийг шилжүүлэх хүсэлт гарлаа' end,
      v_code || ': ' || v_reason, v_link);
  end if;
  return jsonb_build_object('request_id', v_id, 'kind', v_kind, 'status', 'pending',
                            'calls', jsonb_array_length(v_calls), 'appended', not v_new, 'duplicate', v_dup);
end $$;

-- ── 7. Эрх (foundation-ий загвараар) ────────────────────────────────────────

-- Шинэ функц: anon/public-аас хураана, service_role-д нээнэ; зөвхөн UI RPC authenticated-д.
-- Өөрчлөгдсөн функц: CREATE OR REPLACE эрхийг хадгална; anon/public-аас дахин хураана.
do $$
declare
  f record;
  v_new text[] := array[
    'crm2_act_as', 'crm2_lead_of_any_for', 'crm2_property_visible_for',
    'crm2_record_request_calls', 'crm2_lock_request_call_pairs',
    'crm2_notify_skipped_calls', 'crm2_notify_unrecorded_calls',
    'crm2_supersede_transfer_requests', 'crm2_request_transfer_with_call'
  ];
  v_changed text[] := array[
    'crm2_deals_guard', 'crm2_activities_guard', 'crm2_tasks_guard',
    'crm2_decide_request', 'crm2_transfer_contact', 'crm2_transfer_deal'
  ];
begin
  for f in
    select p.oid::regprocedure as sig, p.proname
      from pg_proc p
     where p.pronamespace = 'public'::regnamespace
       and p.proname = any (v_new || v_changed)
  loop
    execute format('revoke all on function %s from public, anon', f.sig);
    if f.proname = any (v_new) then
      execute format('grant execute on function %s to service_role', f.sig);
      if f.proname = 'crm2_request_transfer_with_call' then
        execute format('grant execute on function %s to authenticated', f.sig);
      else
        execute format('revoke all on function %s from authenticated', f.sig);
      end if;
    end if;
  end loop;
end $$;
