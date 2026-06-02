-- ============================================================
-- Aggregate triggers — агент/оффисын тоонуудыг бодит датагаас
-- автоматаар тооцоолж байнга шинэчилнэ.
-- Тэмдэглэл: agents.sold нь КАРЬЕРИЙН нийт тоо тул энд хамаарахгүй
-- (зөвхөн listings_count, reviews_count, rating-ийг тооцоолно).
-- ============================================================

create or replace function public.recalc_agent_aggregates(p_agent uuid)
returns void language sql security definer set search_path = public as $$
  update public.agents a set
    listings_count = (select count(*) from public.listings l where l.agent_id = p_agent and l.status = 'active'),
    reviews_count  = (select count(*) from public.reviews  r where r.agent_id = p_agent),
    rating         = (select round(avg(r.rating)::numeric, 1) from public.reviews r where r.agent_id = p_agent and r.rating is not null)
  where a.id = p_agent;
$$;

create or replace function public.recalc_office_aggregates(p_office uuid)
returns void language sql security definer set search_path = public as $$
  update public.offices o set
    agents_count   = (select count(*) from public.agents a where a.office_id = p_office and a.status = 'active'),
    listings_count = (select count(*) from public.listings l
                        join public.agents a on a.id = l.agent_id
                       where a.office_id = p_office and l.status = 'active')
  where o.id = p_office;
$$;

-- ---------- listings → agent + office ----------
create or replace function public.tg_listings_aggregates()
returns trigger language plpgsql security definer set search_path = public as $$
declare off_id uuid;
begin
  if tg_op in ('INSERT','UPDATE') and new.agent_id is not null then
    perform public.recalc_agent_aggregates(new.agent_id);
    select office_id into off_id from public.agents where id = new.agent_id;
    if off_id is not null then perform public.recalc_office_aggregates(off_id); end if;
  end if;
  if tg_op in ('UPDATE','DELETE') and old.agent_id is not null
     and (tg_op = 'DELETE' or old.agent_id is distinct from new.agent_id) then
    perform public.recalc_agent_aggregates(old.agent_id);
    select office_id into off_id from public.agents where id = old.agent_id;
    if off_id is not null then perform public.recalc_office_aggregates(off_id); end if;
  end if;
  return null;
end; $$;

create trigger listings_aggregates
  after insert or update of status, agent_id or delete on public.listings
  for each row execute function public.tg_listings_aggregates();

-- ---------- reviews → agent ----------
create or replace function public.tg_reviews_aggregates()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op in ('INSERT','UPDATE') then perform public.recalc_agent_aggregates(new.agent_id); end if;
  if tg_op in ('UPDATE','DELETE') and (tg_op = 'DELETE' or old.agent_id is distinct from new.agent_id) then
    perform public.recalc_agent_aggregates(old.agent_id);
  end if;
  return null;
end; $$;

create trigger reviews_aggregates
  after insert or update or delete on public.reviews
  for each row execute function public.tg_reviews_aggregates();

-- ---------- agents (status/office өөрчлөгдөхөд) → office ----------
create or replace function public.tg_agents_aggregates()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op in ('INSERT','UPDATE') and new.office_id is not null then
    perform public.recalc_office_aggregates(new.office_id);
  end if;
  if tg_op in ('UPDATE','DELETE') and old.office_id is not null
     and (tg_op = 'DELETE' or old.office_id is distinct from new.office_id) then
    perform public.recalc_office_aggregates(old.office_id);
  end if;
  return null;
end; $$;

create trigger agents_aggregates
  after insert or update of status, office_id or delete on public.agents
  for each row execute function public.tg_agents_aggregates();

-- ---------- Backfill (одоогийн датаг зөв болгох) ----------
do $$
declare r record;
begin
  for r in select id from public.agents loop
    perform public.recalc_agent_aggregates(r.id);
  end loop;
  for r in select id from public.offices loop
    perform public.recalc_office_aggregates(r.id);
  end loop;
end $$;
