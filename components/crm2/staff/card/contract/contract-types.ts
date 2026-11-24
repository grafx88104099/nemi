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
 * ContractSheet-д хэрэгтэй хөрөнгийн мэдээлэл (сериалчлагдана). Картаас (AgreementTab) шууд,
 * бусад газраас (дутуу жагсаалт г.м.) loadContractContext()-оор ирнэ.
 */
export type ContractContext = {
  propertyId: string;
  officeId: string;
  propertyCode: string;
  propertyStatus: Crm2PropertyStatus;
  property: {
    category: string | null;
    price_total: number | null;
    currency: string | null;
    price_period: string | null;
    price_basis: string | null;
    contract_agent_id: string | null;
    listing_agent_id: string | null;
    unconfirmed: string[];
  };
  /** Хөрөнгө засах эрх (гэрээ байгуулсан агентыг бичих). */
  canEditProperty: boolean;
  owner: ContractOwner | null | "hidden";
  ownerPending: Crm2OwnerPending | null;
  meId: string;
  /** Миний багийн team_id (AgentPicker «Миний баг»). */
  teamIds: string[];
  /** Шалгах жагсаалтын суурь оролт (гэрээг маягтаас дахин тооцно). */
  checklist: ChecklistInput;
  contracts: BrokerageItem[];
  today: string;
};
