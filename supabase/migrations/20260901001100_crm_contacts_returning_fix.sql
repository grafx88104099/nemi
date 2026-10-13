-- ============================================================
-- PMC CRM — crm_contacts INSERT...RETURNING + RLS занга (UAT-д илэрсэн).
-- Асуудал: crm_contacts_select policy зөвхөн crm_can_view_contact(id)
--   функцээр шалгадаг байсан. Функц нь STABLE тул INSERT...RETURNING-ийн
--   үед statement snapshot-д шинээр орж буй мөр харагдахгүй → exists=false
--   → RETURNING-ийн SELECT шалгалт унаж «new row violates row-level
--   security policy» алдаа өгнө (tasks-ийн 20260611000200 засвартай ижил анги).
-- Засвар: created_by = auth.uid() нөхцөлийг ШУУД баганын предикатаар
--   (функц дуудалгүй) нэмэв — шинэ мөрөнд RETURNING шууд үнэлэгдэнэ,
--   бусад хэрэглэгчийн харах эрх crm_can_view_contact хэвээр.
-- ============================================================

drop policy if exists crm_contacts_select on public.crm_contacts;
create policy crm_contacts_select on public.crm_contacts for select
  using (
    office_id = (select public.crm_office_id())
    and (
      created_by = auth.uid()
      or public.crm_can_view_contact(id)
    )
  );
