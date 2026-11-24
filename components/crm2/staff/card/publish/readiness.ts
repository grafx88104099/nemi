/**
 * «Нийтлэхэд бэлэн» бүлгийн өгөгдөл (P3) — картын шалгах жагсаалтаас (lib/crm2/checklist) цэвэр байдлаар.
 * Ноорог шатнаас харагдана: нийтлэхийн өмнөх 2 нөхцөл (батлагдсан гэрээ, идэвхтэй хөрөнгө), бүлгийн мөрүүд,
 * «Зөв» товчтой баталгаажаагүй нийтийн утга, нийтийн бичвэрийн эрсдэл.
 */
import { hasValidContract, type ChecklistGroupView, type ChecklistInput, type ChecklistTarget, type Checklist } from "@/lib/crm2/checklist";

import {
  publicTextFindings,
  unconfirmedRows,
  type ConfirmLabelers,
  type ConfirmRow,
  type ConfirmValueSource,
  type PublicTextFieldKey,
  type PublicTextFinding,
} from "./publish-model";

export type PublishGate = { key: "contract" | "active"; label: string; done: boolean; target: ChecklistTarget };

export type PublishReadiness = {
  /** Шалгах жагсаалтын «Нийтлэхэд бэлэн» бүлэг. */
  group: ChecklistGroupView | null;
  /** Нийтлэхийн өмнөх нөхцөл (DB: идэвхтэй төлөв, хүчинтэй гэрээ). */
  gates: PublishGate[];
  confirmRows: ConfirmRow[];
  /** «Зөв» дарах эрх (хөрөнгийг засах эрх). */
  canConfirm: boolean;
  textFindings: PublicTextFinding[];
};

export function buildPublishReadiness(args: {
  checklist: Checklist;
  input: ChecklistInput;
  property: ConfirmValueSource & Partial<Record<PublicTextFieldKey, string | null>>;
  canEdit: boolean;
  labelers?: ConfirmLabelers;
}): PublishReadiness {
  const { checklist, input, property } = args;
  const group = checklist.groups.find((g) => g.group === "publish") ?? null;
  const gates: PublishGate[] = [
    {
      key: "contract",
      label: "Батлагдсан, хүчинтэй зуучлалын гэрээ",
      done: hasValidContract(input),
      target: { sheet: "contract", field: null },
    },
    {
      key: "active",
      label: "Хөрөнгө идэвхтэй (гэрээ батлагдсаны дараа)",
      done: input.property.status === "active",
      target: { sheet: "checklist", field: null },
    },
  ];
  return {
    group,
    gates,
    confirmRows: unconfirmedRows(property, args.labelers),
    canConfirm: args.canEdit,
    textFindings: publicTextFindings(property),
  };
}

/** Бүлэг + нөхцөлийн нийт ба дууссан тоо (гарчгийн тэмдэгт). */
export function readinessCount(r: Pick<PublishReadiness, "group" | "gates">): { done: number; total: number } {
  const items = r.group?.items ?? [];
  return {
    done: items.filter((i) => i.done).length + r.gates.filter((g) => g.done).length,
    total: items.length + r.gates.length,
  };
}
