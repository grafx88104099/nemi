-- ============================================================
-- tasks RLS засвар: INSERT/UPDATE ... RETURNING нь шинэ мөрийг SELECT
-- policy-оор давхар шалгадаг. can_view_task(id) нь tasks-аас өөрөөс нь
-- subquery хийдэг тул insert хийгдэж буй мөрөө өөрийн snapshot-д харахгүй
-- → RETURNING унадаг байв. tasks-ийн policies-г мөрийн баганад ШУУД
-- тулгуурласан болгож засна. can_view_task/can_edit_task нь child
-- хүснэгтүүдэд (members/comments/checklist) хэвээр ашиглагдана —
-- тэнд task мөр аль хэдийн байдаг тул асуудалгүй.
-- ============================================================

-- Зөвхөн task_members-ийг шалгадаг нарийн helper (definer — RLS тойрно).
create or replace function public.in_task_members(t uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.task_members tm
    where tm.task_id = t and tm.profile_id = auth.uid()
  );
$$;

drop policy tasks_select on public.tasks;
create policy tasks_select on public.tasks for select using (
  public.is_admin()
  or created_by = auth.uid()
  or responsible_id = auth.uid()
  or public.in_task_members(id)
  or (office_id = public.my_task_office_id() and public.jwt_role() = 'office_admin')
);

drop policy tasks_update on public.tasks;
create policy tasks_update on public.tasks for update
  using (
    public.is_admin()
    or created_by = auth.uid()
    or responsible_id = auth.uid()
    or (office_id = public.my_task_office_id() and public.jwt_role() = 'office_admin')
  )
  -- WITH CHECK: ХЭН засахыг USING шийдсэн тул энд зөвхөн мөр ямар болж
  -- болохыг хязгаарлана (оффисоос гаргахгүй). Ингэснээр хариуцагч даалгавраа
  -- хамт олондоо шилжүүлж (delegate) чадна.
  with check (public.is_admin() or office_id = public.my_task_office_id());
