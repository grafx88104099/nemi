-- ============================================================
-- PMC CRM — PRO-001 v2.1 нийцүүлэлт (U2 crm-sla-automation), 2/3.
-- Давтамжтай cron (§6.4, §6.28.1-2, §6.10.3) — pg_cron + pg_net.
--
-- Vercel Hobby cron өдөрт 1 удаа тул 15 минутын SLA-г хэмжиж чадахгүй.
-- Supabase pg_cron нь cron route-уудыг 5/10 минут тутам HTTPS-ээр дуудна:
--   crm-sla       */5  — дараалал хуваарилах, SLA зөрчил, 24/48ц, засвар, МУТСТ
--   crm-matching  */10 — тохируулгын дахин тооцооллын дараалал
-- Route-ууд cronAuthError()-оор хамгаалагдсан хэвээр: Authorization
-- толгойд Vault-ийн нууц ('crm_cron_secret') = Vercel-ийн CRON_SECRET.
--
-- Нууц Vault-д байхгүй бол ажил чимээгүй алгасна (HTTP дуудлага хийхгүй).
-- Нууцыг энэ файлд БИЧИХГҮЙ — тохируулах заавар:
--   select vault.create_secret('<CRON_SECRET-ийн утга>', 'crm_cron_secret');
-- Солих: select vault.update_secret(id, '<шинэ утга>')
--        from vault.secrets where name = 'crm_cron_secret';
--
-- Ажлын цаг/амралтын өдрийг route өөрөө crm_settings.sla_policy болон
-- crm_calendar_days-аар шийднэ (ажлын Бямба гараг г.м.), тиймээс хуваарь
-- өдрийн турш ажиллана; МУТСТ-ийн 24 цагийн тоолуур шөнө ч хэмжигдэнэ.
-- ============================================================

create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

grant usage on schema cron to postgres;

-- ── Дуудагч: Vault-аас нууц уншаад HTTPS GET (асинхрон, pg_net) ──

create or replace function public.crm_cron_call(p_path text)
returns bigint
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_secret text;
  v_base text := 'https://www.nemi.mn';
  v_request bigint;
begin
  if p_path is null or p_path !~ '^/api/cron/crm-[a-z-]+$' then
    raise exception 'crm_cron_call: зөвшөөрөгдөөгүй зам';
  end if;

  select ds.decrypted_secret into v_secret
  from vault.decrypted_secrets ds
  where ds.name = 'crm_cron_secret'
  order by ds.created_at desc
  limit 1;

  -- Нууц тохируулаагүй — чимээгүй алгасна.
  if v_secret is null or length(trim(v_secret)) = 0 then
    return null;
  end if;

  select net.http_get(
    url := v_base || p_path,
    headers := jsonb_build_object('Authorization', 'Bearer ' || v_secret),
    timeout_milliseconds := 60000
  ) into v_request;
  return v_request;
end $$;

revoke execute on function public.crm_cron_call(text) from public, anon, authenticated;

comment on function public.crm_cron_call(text) is
  'CRM cron route-ыг Vault-ийн crm_cron_secret-тэй дуудна; нууц байхгүй бол null буцааж алгасна';

-- ── Хуваарь (нэрээр идемпотент: байвал устгаад дахин үүсгэнэ) ──

do $$
declare
  j record;
begin
  for j in select jobid from cron.job where jobname in ('crm-sla-5min', 'crm-matching-10min') loop
    perform cron.unschedule(j.jobid);
  end loop;

  perform cron.schedule('crm-sla-5min', '*/5 * * * *',
    $cmd$select public.crm_cron_call('/api/cron/crm-sla')$cmd$);
  perform cron.schedule('crm-matching-10min', '*/10 * * * *',
    $cmd$select public.crm_cron_call('/api/cron/crm-matching')$cmd$);
end $$;
