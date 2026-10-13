-- ============================================================
-- PMC CRM — олон дүртэй хэрэглэгчийн RLS засвар (UAT-д илэрсэн).
-- Асуудал: crm_contacts_insert / crm_leads_insert policy-ууд
--   `not has_crm_role('marketing')` гэсэн ХАСАХ нөхцөлтэй байсан тул
--   marketing дүрийг БУСАД дүрийн ХАМТ эзэмшсэн хэрэглэгч (ToR 2.4:
--   «нэг хүн олон дүртэй байж болно») харилцагч/сэжим үүсгэж чадахгүй
--   байв (жишээ: sales_director + marketing).
-- Засвар: ACC- матрицын дагуу үүсгэх эрхтэй дүрүүдийн ЭЕРЭГ жагсаалтад
--   шилжив — agent, team_lead, sales_director, ops_qc, property_manager.
--   Дан marketing/finance/aml_officer/ceo/sysadmin хэвээр үүсгэх эрхгүй.
-- ============================================================

drop policy if exists crm_contacts_insert on public.crm_contacts;
create policy crm_contacts_insert on public.crm_contacts for insert
  with check (
    office_id = (select public.crm_office_id())
    and created_by = auth.uid()
    and (select public.crm_my_staff_id()) is not null
    and (select public.has_crm_role('agent', 'team_lead', 'sales_director', 'ops_qc', 'property_manager'))
  );

drop policy if exists crm_leads_insert on public.crm_leads;
create policy crm_leads_insert on public.crm_leads for insert
  with check (
    office_id = (select public.crm_office_id())
    and created_by = auth.uid()
    and (select public.crm_my_staff_id()) is not null
    and (select public.has_crm_role('agent', 'team_lead', 'sales_director', 'ops_qc', 'property_manager'))
  );
