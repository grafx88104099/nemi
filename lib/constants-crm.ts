/**
 * CRM-ийн ажилтны дүр (DB enum crm_role) — crm_staff.roles, эрхийн шалгалт,
 * дүр сонгох маягт гурвуулаа нэг эх сурвалж.
 */

export const CRM_ROLES = [
  "agent",
  "team_lead",
  "sales_director",
  "ops_qc",
  "marketing",
  "property_manager",
  "finance",
  "aml_officer",
  "ceo",
  "sysadmin",
] as const;
export type CrmRole = (typeof CRM_ROLES)[number];

export const CRM_ROLE_LABEL: Record<CrmRole, string> = {
  agent: "Агент",
  team_lead: "Багийн ахлагч",
  sales_director: "Борлуулалт хариуцсан захирал",
  ops_qc: "Үйл ажиллагаа-ЧМТ",
  marketing: "Маркетинг",
  property_manager: "ҮХХ менежмент",
  finance: "Санхүү",
  aml_officer: "МУТСТ ажилтан",
  ceo: "CEO",
  sysadmin: "Системийн админ",
};
