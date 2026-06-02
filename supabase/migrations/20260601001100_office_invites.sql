-- ============================================================
-- Оффис агентаа линкээр урих (SMTP-гүй)
-- Оффисын админ invite үүсгэнэ → /agent-signup?invite=<token>
-- → бүртгүүлсэн агент ШУУД active (оффис өөрөө урьсан тул).
-- ============================================================
create table public.office_invites (
  id         uuid primary key default gen_random_uuid(),
  token      text unique not null,
  office_id  uuid not null references public.offices(id) on delete cascade,
  email      text,
  created_by uuid references public.profiles(id) on delete set null,
  expires_at timestamptz,
  used_by    uuid references public.profiles(id) on delete set null,
  used_at    timestamptz,
  created_at timestamptz not null default now()
);
create index office_invites_office_idx on public.office_invites (office_id);

alter table public.office_invites enable row level security;

-- Оффисын админ өөрийн оффисын урилгуудыг харах/үүсгэх/устгах
create policy office_invites_select on public.office_invites for select
  using (public.is_admin() or (office_id = public.my_office_id() and public.jwt_role() = 'office_admin'));
create policy office_invites_insert on public.office_invites for insert
  with check (public.is_admin() or (office_id = public.my_office_id() and public.jwt_role() = 'office_admin'));
create policy office_invites_delete on public.office_invites for delete
  using (public.is_admin() or (office_id = public.my_office_id() and public.jwt_role() = 'office_admin'));

-- Нэвтрээгүй хэрэглэгч token-оор оффисоо шалгах (SECURITY DEFINER RPC)
create or replace function public.invite_lookup(p_token text)
returns table(office_id uuid, office_name text)
language sql security definer set search_path = public as $$
  select i.office_id, o.name
  from public.office_invites i
  join public.offices o on o.id = i.office_id
  where i.token = p_token
    and i.used_by is null
    and (i.expires_at is null or i.expires_at > now());
$$;
grant execute on function public.invite_lookup(text) to anon, authenticated;

-- handle_new_user: invite token байвал агентыг active болгож, урилгыг used болгоно
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  requested   text := new.raw_user_meta_data->>'role';
  resolved    user_role := case when requested in ('buyer','agent') then requested::user_role else 'buyer' end;
  fname       text := coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name');
  off_id      uuid := nullif(new.raw_user_meta_data->>'office_id', '')::uuid;
  inv_token   text := nullif(new.raw_user_meta_data->>'invite', '');
  inv_id      uuid;
  inv_office  uuid;
  new_status  agent_status;
begin
  -- Урилга шалгах
  if inv_token is not null then
    select id, office_id into inv_id, inv_office
    from public.office_invites
    where token = inv_token and used_by is null and (expires_at is null or expires_at > now());
    if inv_id is not null then
      resolved := 'agent';
      off_id := inv_office;
    end if;
  end if;

  insert into public.profiles (id, email, full_name, avatar_url, role)
  values (new.id, new.email, fname, new.raw_user_meta_data->>'avatar_url', resolved)
  on conflict (id) do nothing;

  if resolved = 'agent' and not exists (select 1 from public.agents where profile_id = new.id) then
    new_status := case when inv_id is not null then 'active'::agent_status else 'pending'::agent_status end;
    insert into public.agents (profile_id, display_name, phone, office_id, status)
    values (new.id, coalesce(fname, split_part(new.email, '@', 1)), new.phone, off_id, new_status);

    if inv_id is not null then
      update public.office_invites set used_by = new.id, used_at = now() where id = inv_id;
    end if;
  end if;

  return new;
end; $$;
