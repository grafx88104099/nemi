-- Tasks Phase 3: нэг оффисын гишүүд бие биеийн профайлыг харна.
-- Өмнө profiles_select зөвхөн өөрийнхийг нээдэг байсан тул даалгаврын
-- хариуцагч/үүсгэгч/гишүүн/сэтгэгдлийн зохиогчийн нэр join-д null болж байв.
-- my_task_office_id() нь SECURITY DEFINER тул policy recursion үүсгэхгүй.

drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles
  for select using (
    id = auth.uid()
    or public.is_admin()
    or (
      public.my_task_office_id() is not null
      and (
        profiles.office_id = public.my_task_office_id()
        or exists (
          select 1 from public.agents a
          where a.profile_id = profiles.id
            and a.office_id = public.my_task_office_id()
        )
      )
    )
  );
