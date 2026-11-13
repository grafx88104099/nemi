-- ============================================================
-- CRM v2 · Үзүүлэлт/дуудлагын гүйцэтгэгч (crm2_activities.agent_id)
--
-- Гүйцэтгэгч болсон хүн харилцагч, хэлцэл, үзүүлэх зааврыг харах эрх авдаг тул энгийн агент
-- шууд REST insert/update-ээр хамт олноо гүйцэтгэгч болгож эрх олгох ёсгүй. crm2_log_call,
-- crm2_open_deal, crm2_tasks-ийн хариуцагчийн дүрэмтэй ижил: өөрөө, эсвэл менежер, эсвэл тэр
-- агентын багийн ахлагч. RPC (crm2_in_rpc) өөрөө шалгасан тул алгасна.
-- Trigger-ийн нэр crm2_activities_guard-аас хойш эрэмбэлэгдэх тул guard created_by/agent_id-г
-- бөглөсний дараа ажиллана.
-- Буцаах: drop trigger crm2_activities_performer on public.crm2_activities;
--         drop function public.crm2_activities_performer_guard();
-- ============================================================

create function public.crm2_activities_performer_guard()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if public.crm2_in_rpc() then
    return new;
  end if;
  if (tg_op = 'INSERT' and new.agent_id is distinct from new.created_by)
     or (tg_op = 'UPDATE' and new.agent_id is distinct from old.agent_id
         and new.agent_id is distinct from auth.uid()) then
    if not (public.crm_is_manager() or public.crm2_is_lead_of(new.agent_id)) then
      raise exception 'CRM: өөр агентыг гүйцэтгэгчээр сонгох нь багийн ахлагч эсвэл менежерийн эрх';
    end if;
  end if;
  return new;
end $$;

revoke all on function public.crm2_activities_performer_guard() from public, anon, authenticated;
grant execute on function public.crm2_activities_performer_guard() to service_role;

create trigger crm2_activities_performer
  before insert or update on public.crm2_activities
  for each row execute function public.crm2_activities_performer_guard();
