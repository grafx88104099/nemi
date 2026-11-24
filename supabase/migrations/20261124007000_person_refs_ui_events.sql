-- «Хасах» (20261124005000) ба Staff хялбарчлал (20261124000100–000800) хоорондын уялдаа.
--
-- crm2_ui_events (Staff-ийн хэрэглээний хэмжилт: зөвхөн хугацаа, тоо, туг) нь хувь хүний лог —
-- crm2_digest_log / crm2_nudge_log-той адил ажлын түүх биш. Үүнийг хасахгүй бол шинэ формыг
-- ашигласан агент бүр «CRM ажилтай» гэж тооцогдож, зар оруулж байгаагүй ч бүрэн устгагдахгүй
-- (архивлагдана). Бүрэн устгахад мөрүүд profiles FK-ийн cascade-аар хамт устна (20261124000100).
--
-- Өөрчлөлт: v_personal жагсаалтад 'crm2_ui_events' нэмэгдсэн; бусад нь 20261124005000-тай яг ижил.

create or replace function public.office_person_refs(p_profile uuid, p_staff uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  r record;
  n bigint;
  v jsonb := '{}'::jsonb;
  v_crm_re constant text := '^(crm_|crm2_|task_|tasks$|staff_chat|concierge_)';
  -- crm2_digest_log / crm2_nudge_log — илгээсэн сануулгын бүртгэл (мэдэгдэл шиг); crm2_ui_events — хэрэглээний хэмжилт.
  v_personal constant text[] := array[
    'crm_notification_prefs', 'crm_push_subscriptions', 'crm_saved_views',
    'crm_today_snoozes', 'staff_chat_members', 'crm2_digest_log', 'crm2_nudge_log', 'crm2_ui_events'];
  v_personal_fk constant text[] := array[
    'agents.profile_id', 'favorites.user_id', 'recently_viewed.user_id',
    'notifications.user_id', 'saved_searches.user_id', 'conversations.buyer_id',
    'messages.sender_id', 'reviews.author_id', 'viewings.buyer_id',
    'owner_requests.user_id', 'office_invites.used_by', 'listing_share_posts.posted_by',
    'listings.owner_id', 'office_requests.requester_id'];
begin
  if p_profile is null then
    return v;
  end if;

  for r in
    select c.oid::regclass as tbl, c.relname::text as name,
           string_agg(
             case
               when t.typname = 'uuid' then format('%I in ($1, $2)', a.attname)
               when t.typname = '_uuid' then format('%I && array[$1, $2]', a.attname)
               else format('(strpos(%1$I::text, $1::text) > 0 or strpos(%1$I::text, $2::text) > 0)', a.attname)
             end, ' or ' order by a.attnum) as cond
      from pg_class c
      join pg_namespace ns on ns.oid = c.relnamespace and ns.nspname = 'public'
      join pg_attribute a on a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped
      join pg_type t on t.oid = a.atttypid
     where c.relkind = 'r'
       and not c.relispartition
       and c.relname ~ v_crm_re
       and c.relname <> all (v_personal)
       and t.typname in ('uuid', '_uuid', 'jsonb', 'json')
       -- Аудитын бүртгэлд зөвхөн «хэн хийсэн» нь түүх; ажилтны мөрийн өөрийн
       -- үүсгэлт/өөрчлөлтийн бичлэг (entity_id, утгууд) тоологдохгүй.
       and not (c.relname = 'crm_audit_log' and a.attname <> 'actor_id')
       and c.relname <> 'crm_staff_removals'
       -- Хүний өөрийн crm_staff мөр (бусдын leave_substitute_id тоологдоно).
       and not (c.relname = 'crm_staff' and a.attname in ('id', 'profile_id'))
       -- Тооцоолсон агшин зураг (хуучин CRM-ийн cron) — ажлын түүх биш,
       -- бүрэн устгалд хамт устна.
       and c.relname <> 'crm_agent_daily_stats'
       -- Багийн ахлагч/санал болгосон ахлагч — идэвхгүй болгоход
       -- crm_staff_team_sync цэвэрлэнэ (тохиргоо, түүх биш).
       and not (c.relname = 'crm_teams' and a.attname in ('lead_profile_id', 'pending_lead_profile_id'))
     group by c.oid, c.relname
  loop
    execute format('select count(*) from %s where %s', r.tbl, r.cond)
      into n using p_profile, coalesce(p_staff, p_profile);
    if n > 0 then
      v := v || jsonb_build_object(r.name, n);
    end if;
  end loop;

  for r in
    select k.conrelid::regclass as tbl, cl.relname::text as name, a.attname::text as col
      from pg_constraint k
      join pg_class cl on cl.oid = k.conrelid
      join pg_namespace ns on ns.oid = cl.relnamespace and ns.nspname = 'public'
      join pg_attribute a on a.attrelid = k.conrelid and a.attnum = k.conkey[1]
     where k.contype = 'f'
       and k.confrelid = 'public.profiles'::regclass
       and cardinality(k.conkey) = 1
       and cl.relname !~ v_crm_re
       and (cl.relname || '.' || a.attname) <> all (v_personal_fk)
  loop
    execute format('select count(*) from %s where %I = $1', r.tbl, r.col) into n using p_profile;
    if n > 0 then
      v := v || jsonb_build_object(r.name || '.' || r.col, n);
    end if;
  end loop;

  return v;
end $$;

revoke all on function public.office_person_refs(uuid, uuid) from public, anon, authenticated;
grant execute on function public.office_person_refs(uuid, uuid) to service_role;
