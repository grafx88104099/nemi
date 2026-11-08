-- МУТСТ хэргийн уншилт хандалтыг crm_audit_log-д бичдэг (INSERT) тул STABLE
-- байж болохгүй: Postgres «INSERT is not allowed in a non-volatile function»
-- алдаа өгч, /office/crm/aml жагсаалт ба хэргийн хуудас нээгддэггүй байв.
alter function public.crm_get_aml_case(uuid) volatile;
alter function public.crm_get_aml_cases(text) volatile;
