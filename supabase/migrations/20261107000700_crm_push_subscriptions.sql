-- ============================================================
-- PMC CRM — PRO-001 v2.1 нийцүүлэлт (U2 crm-sla-automation), 3/3.
-- Web Push захиалга (§6.4, §6.28 — гар утсанд дэлгэц хаалттай үед ч
-- сэжимийн дохио очих; R4 сервер тал).
--
-- Хэрэглэгч бүр олон төхөөрөмжтэй байж болно (endpoint бүр нэг мөр).
-- Илгээлт зөвхөн сервер талд (service role, lib/crm/push.ts); хэрэглэгч
-- өөрийн мөрийг л харж, нэмж, устгана. 404/410 хариу авсан захиалгыг
-- сервер идэвхгүй болгоно (disabled_at).
-- ============================================================

create table if not exists public.crm_push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  endpoint text not null,
  p256dh text not null,
  auth text not null,
  user_agent text,
  failed_count int not null default 0,
  disabled_at timestamptz,
  last_success_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint crm_push_subscriptions_endpoint_key unique (endpoint),
  constraint crm_push_subscriptions_endpoint_https check (endpoint ~ '^https://')
);

create index if not exists crm_push_subscriptions_profile_idx
  on public.crm_push_subscriptions (profile_id)
  where disabled_at is null;

drop trigger if exists crm_push_subscriptions_touch on public.crm_push_subscriptions;
create trigger crm_push_subscriptions_touch
  before update on public.crm_push_subscriptions
  for each row execute function public.crm_set_updated_at();

alter table public.crm_push_subscriptions enable row level security;

drop policy if exists crm_push_subscriptions_select on public.crm_push_subscriptions;
create policy crm_push_subscriptions_select on public.crm_push_subscriptions for select
  to authenticated
  using (profile_id = (select auth.uid()));

drop policy if exists crm_push_subscriptions_insert on public.crm_push_subscriptions;
create policy crm_push_subscriptions_insert on public.crm_push_subscriptions for insert
  to authenticated
  with check (profile_id = (select auth.uid()));

drop policy if exists crm_push_subscriptions_update on public.crm_push_subscriptions;
create policy crm_push_subscriptions_update on public.crm_push_subscriptions for update
  to authenticated
  using (profile_id = (select auth.uid()))
  with check (profile_id = (select auth.uid()));

drop policy if exists crm_push_subscriptions_delete on public.crm_push_subscriptions;
create policy crm_push_subscriptions_delete on public.crm_push_subscriptions for delete
  to authenticated
  using (profile_id = (select auth.uid()));

revoke all on public.crm_push_subscriptions from anon;
grant select, insert, update, delete on public.crm_push_subscriptions to authenticated;

comment on table public.crm_push_subscriptions is
  'Web Push захиалга (төхөөрөмж бүр) — илгээлт зөвхөн сервер талд';
