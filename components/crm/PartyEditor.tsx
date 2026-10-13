"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { UserPlus, X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { addParty, removeParty } from "@/lib/actions/crm-transactions";
import type { TxnParty } from "@/lib/queries-crm-transactions";
import type { ContactOption } from "@/lib/queries-crm-transactions";
import {
  PARTY_ROLES,
  PARTY_ROLE_LABEL,
  KYC_STATUS_LABEL,
  type PartyRole,
  type KycStatus,
  type TxnType,
} from "@/lib/constants-crm";

/**
 * Хэлцлийн талууд (F-402): худалдагч/авагч эсвэл түрээслүүлэгч/түрээслэгч —
 * харилцагчийн бүртгэлээс сонгоно. Хасах зөвхөн ноорог төлөвт (RLS).
 */
export function PartyEditor({
  txnId,
  txnType,
  txnStatus,
  parties,
  contactOptions,
  editable,
}: {
  txnId: string;
  txnType: TxnType;
  txnStatus: string;
  parties: TxnParty[];
  contactOptions: ContactOption[];
  editable: boolean;
}) {
  const router = useRouter();
  const isSale = txnType === "sale" || txnType === "international_sale";
  const relevantRoles = (PARTY_ROLES as readonly PartyRole[]).filter((r) =>
    isSale ? r === "seller" || r === "buyer" : r === "lessor" || r === "lessee"
  );
  const [contactId, setContactId] = useState("");
  const [role, setRole] = useState<PartyRole>(relevantRoles[0]);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function add() {
    if (!contactId) {
      setError("Харилцагч сонгоно уу.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const res = await addParty(txnId, contactId, role);
      if (!res.ok) {
        setError(res.error ?? "Алдаа гарлаа.");
        return;
      }
      setContactId("");
      router.refresh();
    });
  }

  function remove(partyId: string) {
    startTransition(async () => {
      const res = await removeParty(partyId, txnId);
      if (!res.ok) {
        setError(res.error ?? "Алдаа гарлаа.");
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="space-y-3">
      {parties.length === 0 ? (
        <p className="py-4 text-center text-sm text-muted">
          Тал бүртгэгдээгүй — «Гэрээ» төлөвт орохын өмнө {relevantRoles.map((r) => PARTY_ROLE_LABEL[r]).join(" + ")}{" "}
          хоёул заавал (F-402).
        </p>
      ) : (
        <ul className="divide-y divide-line rounded-xl border border-line bg-surface">
          {parties.map((p) => (
            <li key={p.id} className="flex items-center gap-3 px-3 py-2.5">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-ink">{p.contact_name}</p>
                <p className="text-xs text-muted">{PARTY_ROLE_LABEL[p.role]}</p>
              </div>
              <Badge tone={KYC_STATUS_LABEL[p.kyc_public_status as KycStatus]?.tone ?? "neutral"}>
                KYC: {KYC_STATUS_LABEL[p.kyc_public_status as KycStatus]?.label ?? p.kyc_public_status}
              </Badge>
              {editable && txnStatus === "draft" && (
                <Button variant="ghost" size="sm" onClick={() => remove(p.id)} disabled={pending} title="Хасах">
                  <X className="size-4" />
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}

      {editable && (
        <div className="flex flex-wrap items-end gap-2 rounded-xl border border-line bg-surface-2 p-3">
          <div className="min-w-48 flex-[2]">
            <label className="mb-1 block text-xs font-medium text-muted">Харилцагч</label>
            <Select value={contactId} onChange={(e) => setContactId(e.target.value)}>
              <option value="">— Сонгох —</option>
              {contactOptions.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.display_name}
                </option>
              ))}
            </Select>
          </div>
          <div className="min-w-36 flex-1">
            <label className="mb-1 block text-xs font-medium text-muted">Үүрэг</label>
            <Select value={role} onChange={(e) => setRole(e.target.value as PartyRole)}>
              {relevantRoles.map((r) => (
                <option key={r} value={r}>
                  {PARTY_ROLE_LABEL[r]}
                </option>
              ))}
            </Select>
          </div>
          <Button size="sm" onClick={add} disabled={pending}>
            <UserPlus className="size-4" />
            Нэмэх
          </Button>
        </div>
      )}
      {error && <p className="text-sm text-danger">{error}</p>}
    </div>
  );
}
