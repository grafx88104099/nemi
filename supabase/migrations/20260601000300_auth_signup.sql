-- ============================================================
-- Auth signup сайжруулалт (Phase 2)
-- handle_new_user: metadata-аас role (buyer|agent) уншина.
-- role='agent' бол agents мөр автоматаар үүсгэнэ (verified=false).
-- Аюулгүй: зөвхөн buyer/agent зөвшөөрнө; office_admin/admin гараар.
-- ============================================================
-- Нэг profile → нэг agent (mock seed-д profile_id null тул partial)
create unique index if not exists agents_profile_uniq
  on public.agents (profile_id) where profile_id is not null;

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  requested text := new.raw_user_meta_data->>'role';
  resolved  user_role := case when requested in ('buyer','agent') then requested::user_role else 'buyer' end;
  fname     text := coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name');
begin
  insert into public.profiles (id, email, full_name, avatar_url, role)
  values (new.id, new.email, fname, new.raw_user_meta_data->>'avatar_url', resolved)
  on conflict (id) do nothing;

  if resolved = 'agent' and not exists (select 1 from public.agents where profile_id = new.id) then
    insert into public.agents (profile_id, display_name, phone)
    values (new.id, coalesce(fname, split_part(new.email, '@', 1)), new.phone);
  end if;

  return new;
end; $$;
