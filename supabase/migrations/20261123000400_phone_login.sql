-- R09: Утсаар нэвтрэлт (otp-hearts, Stage 2).
--
-- Хамрах хүрээ:
--  1) public.profiles.phone_verified_at (nullable, default-гүй → метадата өөрчлөлт).
--  2) BEFORE INSERT OR UPDATE хамгаалалт trg_guard_profile_phone_verified:
--     хэрэглэгч (админ ч) phone_verified_at-ийг өөрөө тавих/хадгалах боломжгүй;
--     утсаа өөрчилбөл (normalize хийсэн утгаар) NULL болно.
--     Bypass: guards_bypassed() эсвэл is_service_role() (service role JWT, эсвэл
--     хэрэглэгчийн контекстгүй SQL — migration, handle_new_user, GoTrue).
--     is_admin()-д bypass ӨГӨХГҮЙ (guard_profile_privileges-ээс ялгаатай нь санаатай).
--  3) public.phone_otp_sends — Send SMS hook-ийн дугаар тутмын тоолуур. Зөвхөн service_role.
--     Дугаарыг HMAC(hook secret)-ээр hash хийж хадгална, түүхий дугаар хадгалахгүй.
--     pg_cron 'phone-otp-sends-cleanup' (17 3 * * *) 3 хоногоос хуучныг устгана.
--  4) Backfill (prod-д одоогоор 0 мөр: auth.users.phone_confirmed_at бүгд NULL).
--
-- auth.users дээр trigger ҮҮСГЭХГҮЙ: баталгаажуулалтыг markPhoneVerified() server action
-- (service role) бичнэ — утсаар нэвтрэх бүрт сэргээгдэнэ.
--
-- Prod-д шалгасан (SELECT-only, 2026-11-23):
--  * profiles: id, full_name, avatar_url, phone, email, role, office_id, created_at —
--    updated_at БАЙХГҮЙ. Trigger: зөвхөн trg_guard_profile_privileges (BEFORE UPDATE,
--    role/office_id/id-г хамгаална; service role/SQL-д bypass). Notify/pg_net trigger байхгүй.
--  * profiles RLS: profiles_select (өөрөө/admin/оффис), profiles_insert (id = auth.uid()),
--    profiles_update (өөрөө/admin). Шинэ багана хүснэгтийн түвшний grant-аар хамрагдана;
--    anon-д auth.uid() NULL тул мөр харагдахгүй → шинэ задрал үгүй (phone аль хэдийн
--    ижил бодлогоор харагддаг).
--  * guards_bypassed(), is_service_role(), crm2_normalize_phone(text) (IMMUTABLE) байгаа.
--  * phone_otp_sends хүснэгт, 'phone-otp-sends-cleanup' cron job байхгүй; pg_cron 1.6.4.
--  * public схемийн default privileges: шинэ хүснэгт/функц/sequence-д anon, authenticated-д
--    бүх эрх автоматаар өгдөг → доор ил revoke хийнэ.
--
-- Backfill-ийн сонголт: profiles дээр updated_at/notify trigger байхгүй тул UPDATE нь
-- дагалдах үйлдэлгүй. Migration нь JWT claims-гүй (auth.uid() NULL) ажиллана →
-- is_service_role() = true → хоёр guard хоёулаа өөрчлөлтийг хэвээр нь үлдээнэ.
-- Профайлын утсыг ДАРЖ бичихгүй: зөвхөн профайлын утас хоосон (→ auth утсаар бөглөнө)
-- эсвэл auth утастай normalize хийсэн утгаараа ижил үед л phone_verified_at тавина.
-- Ялгаатай бол NULL үлдээж, дараагийн утсан нэвтрэлтэд markPhoneVerified() тогтооно.

set local lock_timeout = '5s';

-- 1) Профайлын баталгаажсан мөч
alter table public.profiles
  add column if not exists phone_verified_at timestamptz;

comment on column public.profiles.phone_verified_at is
  'Supabase phone OTP-оор баталгаажсан мөч. Зөвхөн service role (markPhoneVerified) тогтооно; хэрэглэгч/админ утсаа өөрчилбөл NULL болно.';

-- 2) Хамгаалалт
create or replace function public.guard_profile_phone_verified()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.guards_bypassed() or public.is_service_role() then
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.phone_verified_at := null;
  elsif public.crm2_normalize_phone(new.phone) is distinct from public.crm2_normalize_phone(old.phone) then
    new.phone_verified_at := null;
  else
    new.phone_verified_at := old.phone_verified_at;
  end if;
  return new;
end;
$$;

-- Trigger-ийн функц: шууд дуудах эрх хэнд ч хэрэггүй (trigger галлахад EXECUTE шалгахгүй).
revoke all on function public.guard_profile_phone_verified() from public, anon, authenticated, service_role;

drop trigger if exists trg_guard_profile_phone_verified on public.profiles;
create trigger trg_guard_profile_phone_verified
  before insert or update on public.profiles
  for each row execute function public.guard_profile_phone_verified();

-- 3) SMS hook-ийн дугаар тутмын хязгаар (зөвхөн service role)
create table if not exists public.phone_otp_sends (
  id         bigint generated always as identity primary key,
  phone_hash text not null check (char_length(phone_hash) between 16 and 128),
  sent_at    timestamptz not null default now()
);
create index if not exists phone_otp_sends_hash_sent_idx
  on public.phone_otp_sends (phone_hash, sent_at desc);

alter table public.phone_otp_sends enable row level security;

revoke all on table public.phone_otp_sends from public, anon, authenticated, service_role;
grant select, insert, delete on table public.phone_otp_sends to service_role;
-- Identity sequence-д default privileges-ээр өгөгдсөн эрхийг хураана (identity insert-д
-- sequence эрх шаардлагагүй).
revoke all on sequence public.phone_otp_sends_id_seq from public, anon, authenticated, service_role;

-- Ил «хориглох» бодлого: хэн нэгэн дараа нь anon/authenticated-д эрх буцааж өгсөн ч мөр
-- харагдахгүй. (service_role ба postgres нь BYPASSRLS.)
drop policy if exists phone_otp_sends_no_client_access on public.phone_otp_sends;
create policy phone_otp_sends_no_client_access
  on public.phone_otp_sends
  as restrictive
  for all
  to anon, authenticated
  using (false)
  with check (false);

comment on table public.phone_otp_sends is
  'R09 Send SMS hook: дугаар тутмын илгээлтийн тоолуур (24 цаг). Зөвхөн service role. 3 хоногоос хуучныг cron устгана.';

-- Өдөр бүр хуучин мөрийг цэвэрлэнэ (идемпотент).
do $$
declare j record;
begin
  for j in select jobid from cron.job where jobname = 'phone-otp-sends-cleanup' loop
    perform cron.unschedule(j.jobid);
  end loop;
  perform cron.schedule('phone-otp-sends-cleanup', '17 3 * * *',
    $cmd$delete from public.phone_otp_sends where sent_at < now() - interval '3 days'$cmd$);
end $$;

-- 4) Backfill (идемпотент; одоогоор 0 мөр). Профайлын өөр утсыг дарж бичихгүй.
update public.profiles p
   set phone = case when coalesce(btrim(p.phone), '') = ''
                    then '+' || public.crm2_normalize_phone(u.phone)
                    else p.phone end,
       phone_verified_at = u.phone_confirmed_at
  from auth.users u
 where u.id = p.id
   and u.phone_confirmed_at is not null
   and public.crm2_normalize_phone(u.phone) ~ '^976[6-9][0-9]{7}$'
   and p.phone_verified_at is null
   and (coalesce(btrim(p.phone), '') = ''
        or public.crm2_normalize_phone(p.phone) = public.crm2_normalize_phone(u.phone));

notify pgrst, 'reload schema';
