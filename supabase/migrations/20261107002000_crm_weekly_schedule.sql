-- ════════════════════════════════════════════════════════════
-- U7 crm-weekly-cycle — хуваарь ба автоматжуулалт (PMC-CRM-PRO-001 v2.1
-- §6.22, §6.24, §6.30; Ш8).
--   • pg_cron 'crm-weekly-hourly' → /api/cron/crm-weekly: картын сануулга
--     (Д-31), хурлын сануулга (Д-32), Баасан гарагийн урьдчилсан гүйцэтгэл +
--     дүн шинжилгээний сануулга (Д-33), Ням 24:00-ийн эцсийн агшин зураг,
--     оноо, дадлагажуулалтын автомат даалгавар. Нууц Vault-д (U2-ийн
--     crm_cron_call); нууцгүй бол чимээгүй алгасна.
--   • pg_cron 'crm-agent-daily-stats' (23:50 УБ) → өдрийн агшин зураг (HTTP-гүй).
--   • crm_automation_rules: D-31/D-32/D-33 мөрүүд (идэвхжүүлэх/туршилтын горимыг
--     тохиргооны хуудсаас удирдана).
-- Хамаарал: 20261107001900, 20261107000600.
-- ════════════════════════════════════════════════════════════

insert into public.crm_automation_rules (office_id, code, name, trigger_kind, condition, actions, is_active, dry_run)
select o.office_id, r.code, r.name, 'cron:hourly', '{"setting": "weekly_cycle"}'::jsonb,
       '[{"kind": "notify"}]'::jsonb, true, false
from (select distinct office_id from public.crm_settings) o
cross join (values
  ('D-31', 'Долоо хоногийн төлөвлөгөөний картын сануулга'),
  ('D-32', 'Долоо хоногийн борлуулалтын хурлын сануулга'),
  ('D-33', 'Баасан гарагийн дүн шинжилгээний сануулга')
) as r(code, name)
on conflict (office_id, code) do nothing;

do $$
declare j record;
begin
  for j in select jobid from cron.job where jobname in ('crm-weekly-hourly', 'crm-agent-daily-stats') loop
    perform cron.unschedule(j.jobid);
  end loop;
  perform cron.schedule('crm-weekly-hourly', '7 * * * *',
    $cmd$select public.crm_cron_call('/api/cron/crm-weekly')$cmd$);
  perform cron.schedule('crm-agent-daily-stats', '50 15 * * *',
    $cmd$select public.crm_take_agent_daily_stats()$cmd$);
end $$;
