-- R08c ухаалаг хайлт (Stage 3, AI fallback): давтамжийн хязгаарлагч.
-- Зөвхөн AI хайлтыг асаах үед хэрэгтэй; бусад migration-оос хамааралгүй.
-- Тогтмол цонх (fixed window): (key, window_start) мөр бүр нэг цонхны тоолуур.
-- Түлхүүр нь хэшлэсэн IP ('ai-search:ip:<sha256>') эсвэл нийт хязгаар ('ai-search:global') —
-- түүхий IP ХЭЗЭЭ Ч хадгалахгүй.
-- Хандалт: зөвхөн service_role (createAdminClient) ба доорх security definer функц.
-- anon/authenticated хүснэгтэд ч, функцэд ч хандахгүй (public schema-ийн default ACL
-- anon/authenticated-д шууд эрх олгодог тул ил revoke хийнэ).
-- Хуучин цонхыг функц өөрөө үе үе цэвэрлэнэ — pg_cron ажил нэмэхгүй.
-- phone_otp_sends (otp-hearts)-оос тусдаа: тэнд HMAC-тай гулсах цонх, энд ерөнхий тогтмол цонх.

-- 1. Хүснэгт
create table if not exists public.api_rate_limits (
  key          text        not null check (char_length(key) between 1 and 200),
  window_start timestamptz not null,
  hits         int         not null default 0 check (hits >= 0),
  primary key (key, window_start)
);

comment on table public.api_rate_limits is
  'Fixed-window rate-limit counters (AI search). Keys are hashed; service_role only. Written via rate_limit_hit().';

-- Цэвэрлэгээний DELETE-д (window_start < now() - 8 days)
create index if not exists api_rate_limits_window_start_idx
  on public.api_rate_limits (window_start);

-- 2. RLS + эрх: клиент ролиудад юу ч үгүй
alter table public.api_rate_limits enable row level security;

revoke all on table public.api_rate_limits from public, anon, authenticated;
grant select, insert, update, delete on table public.api_rate_limits to service_role;

-- Ил «хориглох» бодлого: хэн нэгэн дараа нь anon/authenticated-д эрх буцааж өгсөн ч мөр харагдахгүй.
-- (service_role ба хүснэгтийн эзэн postgres нь BYPASSRLS тул нөлөөлөхгүй.)
drop policy if exists api_rate_limits_no_client_access on public.api_rate_limits;
create policy api_rate_limits_no_client_access
  on public.api_rate_limits
  as restrictive
  for all
  to anon, authenticated
  using (false)
  with check (false);

-- 3. Хязгаарлагч: true = зөвшөөрнө (энэ цонхонд p_max-аас хэтрээгүй), false = татгалзана.
-- Буруу параметр → false (fail closed). Оролдлого бүрийг тоолно (хязгаараас хэтэрсэн ч).
create or replace function public.rate_limit_hit(p_key text, p_window_seconds int, p_max int)
returns boolean
language plpgsql
volatile
security definer
set search_path = pg_catalog, public
as $$
declare
  v_start timestamptz;
  v_hits  int;
begin
  if p_key is null or char_length(p_key) not between 1 and 200
     or p_window_seconds is null or p_window_seconds < 1 or p_window_seconds > 604800
     or p_max is null or p_max < 1 then
    return false;
  end if;

  -- UTC epoch-д тэгшилсэн цонх (86400 → UTC өдөр).
  v_start := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);

  insert into public.api_rate_limits as r (key, window_start, hits)
  values (p_key, v_start, 1)
  on conflict (key, window_start)
    do update set hits = least(r.hits, 2147483646) + 1   -- int overflow-оос хамгаална
  returning r.hits into v_hits;

  -- Хуучин цонхыг үе үе цэвэрлэнэ (~2% дуудлагад). Хамгийн урт цонх 7 хоног < 8 хоног,
  -- тиймээс идэвхтэй цонх хэзээ ч устахгүй.
  if random() < 0.02 then
    delete from public.api_rate_limits where window_start < now() - interval '8 days';
  end if;

  return v_hits <= p_max;
end
$$;

comment on function public.rate_limit_hit(text, int, int) is
  'Fixed-window limiter: counts one hit for p_key in the current p_window_seconds window; returns true while hits <= p_max. service_role only.';

revoke all on function public.rate_limit_hit(text, int, int) from public, anon, authenticated;
grant execute on function public.rate_limit_hit(text, int, int) to service_role;

notify pgrst, 'reload schema';
