"use client";

import { ContractSheet, type ContractSheetProps } from "../contract/ContractSheet";

/**
 * Хуучин «Зуучлалын гэрээ нэмэх» маягтын нэр (нийцтэй байдлын хувьд). Одоо ContractSheet —
 * урьдчилан бөглөсөн 2 алхамтай доод цонх; эзэн, гарын үсэг зурагчийг OwnerPhoneField-ээр авна.
 */
export type BrokerageFormProps = ContractSheetProps & { open: boolean };

export function BrokerageForm({ open, ...props }: BrokerageFormProps) {
  if (!open) return null;
  return <ContractSheet {...props} open />;
}
