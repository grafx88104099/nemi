-- ============================================================
-- Даалгаврын модуль (Bitrix24 маягийн Task Management).
-- Оффис админ оффисынхоо агентуудад даалгавар оноож удирдана;
-- агент өөрт оноогдсон/үүсгэсэн/ажиглаж буй даалгавраа харна.
-- «Хоцорсон» нь хадгалагдах төлөв БИШ — deadline-аас UI-д тооцоологдоно.
-- ============================================================

create type task_status as enum ('pending', 'in_progress', 'completed', 'deferred');
create type task_priority as enum ('low', 'normal', 'high', 'urgent');
create type task_member_role as enum ('observer', 'participant');

create table public.tasks (
  id               uuid primary key default gen_random_uuid(),
  office_id        uuid not null references public.offices(id) on delete cascade,
  created_by       uuid not null references public.profiles(id) on delete cascade,
  responsible_id   uuid not null references public.profiles(id) on delete cascade,
  title            text not null,
  description      text,
  status           task_status not null default 'pending',
  priority         task_priority not null default 'normal',
  deadline         timestamptz,
  project_id       uuid references public.projects(id) on delete set null,
  tags             text[] not null default '{}',
  completed_at     timestamptz,
  last_activity_at timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index tasks_office_idx      on public.tasks (office_id, status);
create index tasks_responsible_idx on public.tasks (responsible_id, status);
create index tasks_creator_idx     on public.tasks (created_by);
create index tasks_deadline_idx    on public.tasks (deadline);
create index tasks_project_idx     on public.tasks (project_id);

-- Ажиглагч/оролцогч (үүсгэгч, хариуцагч нь tasks баганад тул энд орохгүй).
create table public.task_members (
  task_id    uuid not null references public.tasks(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  role       task_member_role not null default 'observer',
  created_at timestamptz not null default now(),
  primary key (task_id, profile_id)
);
create index task_members_profile_idx on public.task_members (profile_id);

create table public.task_comments (
  id         uuid primary key default gen_random_uuid(),
  task_id    uuid not null references public.tasks(id) on delete cascade,
  author_id  uuid not null references public.profiles(id) on delete cascade,
  body       text not null,
  created_at timestamptz not null default now()
);
create index task_comments_task_idx on public.task_comments (task_id, created_at);

create table public.task_checklist_items (
  id         uuid primary key default gen_random_uuid(),
  task_id    uuid not null references public.tasks(id) on delete cascade,
  label      text not null,
  done       boolean not null default false,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);
create index task_checklist_task_idx on public.task_checklist_items (task_id, sort_order);

-- Сэтгэгдэл нэмэгдэхэд last_activity_at-г шинэчилнэ (bump_lead_last_activity загвар).
create or replace function public.bump_task_last_activity()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update public.tasks
     set last_activity_at = greatest(coalesce(last_activity_at, new.created_at), new.created_at)
   where id = new.task_id;
  return new;
end;
$$;
create trigger task_comment_bump
  after insert on public.task_comments
  for each row execute function public.bump_task_last_activity();

-- Сэтгэгдэл realtime-аар дамжина.
alter publication supabase_realtime add table public.task_comments;

-- ── RLS helpers (SECURITY DEFINER — policy recursion-оос сэргийлнэ) ──

-- profiles.office_id агентад NULL байж болзошгүй тул agents.office_id-тай coalesce.
create or replace function public.my_task_office_id()
returns uuid language sql stable security definer set search_path = public as $$
  select coalesce(
    (select office_id from public.profiles where id = auth.uid()),
    (select office_id from public.agents where profile_id = auth.uid() limit 1)
  );
$$;

create or replace function public.is_task_member(t uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.tasks tk
    where tk.id = t and (tk.created_by = auth.uid() or tk.responsible_id = auth.uid())
  ) or exists (
    select 1 from public.task_members tm
    where tm.task_id = t and tm.profile_id = auth.uid()
  );
$$;

create or replace function public.can_view_task(t uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_admin()
      or public.is_task_member(t)
      or exists (
        select 1 from public.tasks tk
        where tk.id = t
          and tk.office_id = public.my_task_office_id()
          and public.jwt_role() = 'office_admin'
      );
$$;

create or replace function public.can_edit_task(t uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_admin()
      or exists (
        select 1 from public.tasks tk
        where tk.id = t
          and (tk.created_by = auth.uid()
               or tk.responsible_id = auth.uid()
               or (tk.office_id = public.my_task_office_id()
                   and public.jwt_role() = 'office_admin'))
      );
$$;

-- ── Policies ──

alter table public.tasks enable row level security;
alter table public.task_members enable row level security;
alter table public.task_comments enable row level security;
alter table public.task_checklist_items enable row level security;

create policy tasks_select on public.tasks for select
  using (public.can_view_task(id));
create policy tasks_insert on public.tasks for insert
  with check (
    created_by = auth.uid()
    and office_id = public.my_task_office_id()
    and public.jwt_role() in ('agent', 'office_admin', 'admin')
  );
create policy tasks_update on public.tasks for update
  using (public.can_edit_task(id)) with check (public.can_edit_task(id));
create policy tasks_delete on public.tasks for delete
  using (
    public.is_admin()
    or created_by = auth.uid()
    or (office_id = public.my_task_office_id() and public.jwt_role() = 'office_admin')
  );

create policy task_members_select on public.task_members for select
  using (public.can_view_task(task_id));
create policy task_members_write on public.task_members for all
  using (public.can_edit_task(task_id)) with check (public.can_edit_task(task_id));

create policy task_comments_select on public.task_comments for select
  using (public.can_view_task(task_id));
create policy task_comments_insert on public.task_comments for insert
  with check (public.can_view_task(task_id) and author_id = auth.uid());

create policy task_checklist_select on public.task_checklist_items for select
  using (public.can_view_task(task_id));
create policy task_checklist_write on public.task_checklist_items for all
  using (public.can_edit_task(task_id)) with check (public.can_edit_task(task_id));
