import type { ChecklistInput } from "@/lib/crm2/checklist";
import type { BrokerageItem } from "@/lib/crm2/queries/properties";
import type { Crm2OwnerPending, Crm2PropertyStatus } from "@/lib/crm2/types";

/** Хөрөнгийн эзэн (гэрээнд хуулагдана). 'hidden' = хувийн талбар харах эрхгүй. */
export type ContractOwner = {
  id: string;
  code: string;
  full_name: string;
  source: string | null;
  name_unverified: boolean;
};

/**
 * ContractSheet («Гэрээ бүртгэх») -д хэрэгтэй хөрөнгийн мэдээлэл (сериалчлагдана). Картаас (AgreementTab)
 * шууд, бусад газраас (дутуу жагсаалт г.м.) loadContractContext()-оор ирнэ.
 */
export type ContractContext = {
  propertyId: string;
  officeId: string;
  propertyCode: string;
  propertyStatus: Crm2PropertyStatus;
  property: {
    contract_agent_id: string | null;
    listing_agent_id: string | null;
    photo_agent_id: string | null;
    unconfirmed: string[];
  };
  /** Хөрөнгө засах эрх (гэрээ байгуулсан агентыг солих, эзэн бүртгэх). */
  canEditProperty: boolean;
  owner: ContractOwner | null | "hidden";
  ownerPending: Crm2OwnerPending | null;
  meId: string;
  /** Би оффисын идэвхтэй ажилтан (crm_my_staff_id) — бүртгэхэд хоосон «гэрээ байгуулсан агент»-ыг бөглөх нөхцөл. */
  meIsStaff: boolean;
  /** property.same_agent_multi_role — нэг агент олон үүрэг (бүртгэгчээр бөглөх дүрэмд). */
  sameAgentMultiRole: boolean;
  /** Миний багийн team_id (AgentPicker «Миний баг»). */
  teamIds: string[];
  /** Дуусах огнооны анхдагч хугацаа (brokerage.default_term_months). */
  termMonths: number;
  /** Анхдагч дуусах огноо: өнөөдөр + termMonths − 1 хоног. */
  defaultEndDate: string;
  /** brokerage.require_owner — эзэнгүй бол бүртгэхгүй. */
  requireOwner: boolean;
  /** Шалгах жагсаалтын суурь оролт (гэрээг маягтаас дахин тооцно). */
  checklist: ChecklistInput;
  contracts: BrokerageItem[];
  today: string;
};
