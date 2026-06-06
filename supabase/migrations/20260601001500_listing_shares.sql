-- ============================================================
-- Зар хуваалцах (co-listing) — агент өөрийн зарыг ОФФИСЫНХОО
-- бусад агентуудтай хуваалцана. Хүлээн авагч агент тухайн
-- зарыг (ноорог ч гэсэн) харж, өөрийн худалдан авагчдад санал
-- болгож хамтран ажиллана. Эзэмшил эзэн агентад хэвээр үлдэнэ.
-- ============================================================

create table public.listing_shares (
  id          uuid primary key default gen_random_uuid(),
  listing_id  uuid not null references public.listings(id) on delete cascade,
  agent_id    uuid not null references public.agents(id) on delete cascade,  -- хүлээн авагч
  shared_by   uuid references public.agents(id) on delete set null,          -- хуваалцсан эзэн
  created_at  timestamptz not null default now(),
  unique (listing_id, agent_id)
);
create index listing_shares_agent_idx   on public.listing_shares (agent_id);
create index listing_shares_listing_idx on public.listing_shares (listing_id);

-- ---------- Туслах функцууд (RLS-д) ----------

-- Нэвтэрсэн хэрэглэгчид (агентаар нь) тухайн зар хуваалцагдсан эсэх.
create or replace function public.listing_shared_with_me(l uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from public.listing_shares s
    join public.agents a on a.id = s.agent_id
    where s.listing_id = l and a.profile_id = auth.uid()
  );
$$;

-- Зарыг (l) тухайн агенттай (a) хуваалцаж БОЛОХ эсэх:
-- хүлээн авагч нь эзэнтэй ИЖИЛ оффист, өөр хүн, идэвхтэй байх.
create or replace function public.can_share_listing_with(l uuid, a uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from public.listings ls
    join public.agents owner on owner.id = ls.agent_id
    join public.agents recip on recip.id = a
    where ls.id = l
      and recip.office_id is not null
      and recip.office_id = owner.office_id
      and recip.id <> owner.id
      and recip.status = 'active'
  );
$$;

-- ---------- listings_select-д хуваалцсан зарыг нэмнэ ----------
drop policy if exists listings_select on public.listings;
create policy listings_select on public.listings for select
  using (
    status = 'active'
    or public.can_manage_agent(agent_id)
    or public.listing_shared_with_me(id)
  );

-- ---------- listing_shares RLS ----------
alter table public.listing_shares enable row level security;

-- Унших: зарын эзэн/удирдагч ЭСВЭЛ хүлээн авагч агент.
create policy listing_shares_select on public.listing_shares for select
  using (public.can_manage_listing(listing_id) or public.owns_agent(agent_id));

-- Нэмэх: зөвхөн зарын эзэн/удирдагч, хүлээн авагч нь ижил оффисын идэвхтэй агент.
create policy listing_shares_insert on public.listing_shares for insert
  with check (
    public.can_manage_listing(listing_id)
    and public.can_share_listing_with(listing_id, agent_id)
  );

-- Устгах (хуваалцлыг цуцлах): зөвхөн зарын эзэн/удирдагч.
create policy listing_shares_delete on public.listing_shares for delete
  using (public.can_manage_listing(listing_id));
