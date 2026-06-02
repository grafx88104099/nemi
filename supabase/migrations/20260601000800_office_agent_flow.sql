-- ============================================================
-- Оффис-агент модел (Монголын зуучлагч оффисын логик)
-- 1) Оффис нээх хүсэлт → админ батлах
-- 2) Агент заавал оффистой, оффисын админ баталснаар идэвхждэг
-- ============================================================

-- ---------- Оффис нээх хүсэл ----------
create type office_request_status as enum ('pending', 'approved', 'rejected');

create table public.office_requests (
  id            uuid primary key default gen_random_uuid(),
  requester_id  uuid not null references public.profiles(id) on delete cascade,
  name          text not null,
  phone         text,
  note          text,
  status        office_request_status not null default 'pending',
  office_id     uuid references public.offices(id) on delete set null,
  reviewed_by   uuid references public.profiles(id),
  reviewed_at   timestamptz,
  created_at    timestamptz not null default now()
);
create index office_requests_status_idx on public.office_requests (status);

alter table public.office_requests enable row level security;
create policy office_requests_insert on public.office_requests for insert
  with check (requester_id = auth.uid());
create policy office_requests_select on public.office_requests for select
  using (requester_id = auth.uid() or public.is_admin());
create policy office_requests_admin_update on public.office_requests for update
  using (public.is_admin()) with check (public.is_admin());

-- ---------- Агентын төлөв (оффис баталгаажуулалт) ----------
create type agent_status as enum ('pending', 'active', 'rejected');
alter table public.agents add column status agent_status not null default 'active';
create index agents_status_idx on public.agents (status);

-- Нийтэд зөвхөн ИДЭВХТЭЙ агент харагдана; өөрийн болон оффисынхоо
-- агентыг (pending ч гэсэн) эзэн/оффисын админ хардаг.
drop policy if exists agents_select on public.agents;
create policy agents_select on public.agents for select
  using (status = 'active' or profile_id = auth.uid() or public.can_manage_agent(id));

-- ---------- handle_new_user: агент заавал оффистой, pending ----------
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  requested text := new.raw_user_meta_data->>'role';
  resolved  user_role := case when requested in ('buyer','agent') then requested::user_role else 'buyer' end;
  fname     text := coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name');
  off_id    uuid := nullif(new.raw_user_meta_data->>'office_id', '')::uuid;
begin
  insert into public.profiles (id, email, full_name, avatar_url, role)
  values (new.id, new.email, fname, new.raw_user_meta_data->>'avatar_url', resolved)
  on conflict (id) do nothing;

  -- Агентаар бүртгүүлбэл оффис сонгосон тохиолдолд pending агент үүснэ
  -- (оффисын админ баталснаар идэвхжинэ).
  if resolved = 'agent' and not exists (select 1 from public.agents where profile_id = new.id) then
    insert into public.agents (profile_id, display_name, phone, office_id, status)
    values (new.id, coalesce(fname, split_part(new.email, '@', 1)), new.phone, off_id, 'pending');
  end if;

  return new;
end; $$;
