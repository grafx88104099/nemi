-- ============================================================
-- Нэми — Row Level Security (Phase 1)
-- Туслах функцууд SECURITY DEFINER — profiles policy дотор
-- profiles-ийг асуухад recursion гарахаас сэргийлнэ.
-- ============================================================

-- ---------- Туслах функцууд ----------
create or replace function public.jwt_role()
returns user_role language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid();
$$;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select role = 'admin' from public.profiles where id = auth.uid()), false);
$$;

create or replace function public.my_office_id()
returns uuid language sql stable security definer set search_path = public as $$
  select office_id from public.profiles where id = auth.uid();
$$;

create or replace function public.owns_agent(a uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.agents where id = a and profile_id = auth.uid());
$$;

create or replace function public.can_manage_agent(a uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_admin() or exists (
    select 1 from public.agents ag
    where ag.id = a
      and (ag.profile_id = auth.uid()
           or (ag.office_id = public.my_office_id() and public.jwt_role() = 'office_admin'))
  );
$$;

create or replace function public.can_manage_listing(l uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.listings ls
    where ls.id = l and public.can_manage_agent(ls.agent_id)
  );
$$;

create or replace function public.in_conversation(c uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.conversations cv
    where cv.id = c
      and (cv.buyer_id = auth.uid() or public.owns_agent(cv.agent_id))
  );
$$;

-- ---------- RLS идэвхжүүлэх ----------
alter table public.profiles        enable row level security;
alter table public.offices         enable row level security;
alter table public.agents          enable row level security;
alter table public.listings        enable row level security;
alter table public.listing_photos  enable row level security;
alter table public.ai_valuations   enable row level security;
alter table public.favorites       enable row level security;
alter table public.saved_searches  enable row level security;
alter table public.recently_viewed enable row level security;
alter table public.leads           enable row level security;
alter table public.conversations   enable row level security;
alter table public.messages        enable row level security;
alter table public.viewings        enable row level security;
alter table public.reviews         enable row level security;
alter table public.subscriptions   enable row level security;
alter table public.payments        enable row level security;
alter table public.notifications   enable row level security;

-- ============ profiles ============
create policy profiles_select on public.profiles for select
  using (id = auth.uid() or public.is_admin());
create policy profiles_insert on public.profiles for insert
  with check (id = auth.uid());
create policy profiles_update on public.profiles for update
  using (id = auth.uid() or public.is_admin())
  with check (id = auth.uid() or public.is_admin());

-- ============ offices (нийтэд унших) ============
create policy offices_select on public.offices for select using (true);
create policy offices_write on public.offices for all
  using (public.is_admin() or (public.jwt_role() = 'office_admin' and id = public.my_office_id()))
  with check (public.is_admin() or (public.jwt_role() = 'office_admin' and id = public.my_office_id()));

-- ============ agents (нийтэд унших) ============
create policy agents_select on public.agents for select using (true);
create policy agents_insert on public.agents for insert
  with check (
    public.is_admin()
    or profile_id = auth.uid()
    or (office_id = public.my_office_id() and public.jwt_role() = 'office_admin')
  );
create policy agents_update on public.agents for update
  using (public.can_manage_agent(id)) with check (public.can_manage_agent(id));
create policy agents_delete on public.agents for delete
  using (public.is_admin() or (office_id = public.my_office_id() and public.jwt_role() = 'office_admin'));

-- ============ listings ============
create policy listings_select on public.listings for select
  using (status = 'active' or public.can_manage_agent(agent_id));
create policy listings_insert on public.listings for insert
  with check (public.can_manage_agent(agent_id));
create policy listings_update on public.listings for update
  using (public.can_manage_agent(agent_id)) with check (public.can_manage_agent(agent_id));
create policy listings_delete on public.listings for delete
  using (public.can_manage_agent(agent_id));

-- ============ listing_photos ============
create policy listing_photos_select on public.listing_photos for select using (true);
create policy listing_photos_write on public.listing_photos for all
  using (public.can_manage_listing(listing_id))
  with check (public.can_manage_listing(listing_id));

-- ============ ai_valuations (унших нийтэд; бичих зөвхөн service_role) ============
create policy ai_valuations_select on public.ai_valuations for select using (true);

-- ============ favorites / saved_searches / recently_viewed (зөвхөн эзэн) ============
create policy favorites_own on public.favorites for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy saved_searches_own on public.saved_searches for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy recently_viewed_own on public.recently_viewed for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ============ leads (агент/оффис) ============
create policy leads_all on public.leads for all
  using (public.can_manage_agent(agent_id))
  with check (public.can_manage_agent(agent_id));

-- ============ conversations ============
create policy conversations_select on public.conversations for select
  using (buyer_id = auth.uid() or public.owns_agent(agent_id) or public.is_admin());
create policy conversations_insert on public.conversations for insert
  with check (buyer_id = auth.uid());
create policy conversations_update on public.conversations for update
  using (buyer_id = auth.uid() or public.owns_agent(agent_id))
  with check (buyer_id = auth.uid() or public.owns_agent(agent_id));

-- ============ messages ============
create policy messages_select on public.messages for select
  using (public.in_conversation(conversation_id));
create policy messages_insert on public.messages for insert
  with check (public.in_conversation(conversation_id) and sender_id = auth.uid());

-- ============ viewings ============
create policy viewings_select on public.viewings for select
  using (buyer_id = auth.uid() or public.owns_agent(agent_id) or public.is_admin());
create policy viewings_insert on public.viewings for insert
  with check (buyer_id = auth.uid());
create policy viewings_update on public.viewings for update
  using (buyer_id = auth.uid() or public.owns_agent(agent_id))
  with check (buyer_id = auth.uid() or public.owns_agent(agent_id));

-- ============ reviews (унших нийтэд) ============
create policy reviews_select on public.reviews for select using (true);
create policy reviews_insert on public.reviews for insert
  with check (author_id = auth.uid());
create policy reviews_update on public.reviews for update
  using (author_id = auth.uid() or public.is_admin())
  with check (author_id = auth.uid() or public.is_admin());
create policy reviews_delete on public.reviews for delete
  using (author_id = auth.uid() or public.is_admin());

-- ============ subscriptions / payments (унших эзэн; бичих service_role) ============
create policy subscriptions_select on public.subscriptions for select
  using (public.owns_agent(agent_id) or public.is_admin());
create policy payments_select on public.payments for select
  using (public.owns_agent(agent_id) or public.is_admin());

-- ============ notifications (зөвхөн эзэн; insert service_role) ============
create policy notifications_select on public.notifications for select
  using (user_id = auth.uid());
create policy notifications_update on public.notifications for update
  using (user_id = auth.uid()) with check (user_id = auth.uid());
