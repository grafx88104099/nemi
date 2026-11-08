"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowRightLeft } from "lucide-react";

import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { toast } from "@/components/ui/toast";
import { reassignLeadWithEvidence } from "@/lib/actions/crm-ownership";
import {
  REASSIGN_REASON_LABEL,
  reassignReasonsFor,
  type ReassignReason,
} from "@/lib/validation/crm-ownership";
import type { CrmRole } from "@/lib/constants-crm";

/**
 * Дахин хуваарилалт (§6.27): дур мэдэн булаах хориотой тул шалтгаан бүрт
 * системийн нотолгоо, тэмдэглэл заавал. Анхдагч сонголт байхгүй (UX-10) —
 * шалтгаан, шинэ эзэмшигчийг заавал сонгуулна.
 */
export function ReassignModal({
  open,
  onClose,
  leadId,
  roles,
  agents,
  currentOwnerId,
}: {
  open: boolean;
  onClose: () => void;
  leadId: string;
  roles: CrmRole[];
  agents: { profileId: string; name: string; onLeave?: boolean }[];
  currentOwnerId: string | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [reason, setReason] = useState<ReassignReason | "">("");
  const [newOwnerId, setNewOwnerId] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  const reasons = reassignReasonsFor(roles);
  const candidates = agents.filter((a) => a.profileId !== currentOwnerId && !a.onLeave);
  const needsLong = reason === "client_request" || reason === "zoning";
  const noteMin = needsLong ? 10 : 5;

  function close() {
    setReason("");
    setNewOwnerId("");
    setNote("");
    setError(null);
    onClose();
  }

  function submit() {
    setError(null);
    startTransition(async () => {
      const res = await reassignLeadWithEvidence({ leadId, newOwnerId, reason, note });
      if (!res.ok) {
        setError(res.error ?? "Шилжүүлж чадсангүй.");
        return;
      }
      toast.success("Сэжим шилжлээ", { description: "Шинэ эзэмшигчид мэдэгдэл, даалгавар очлоо." });
      close();
      router.refresh();
    });
  }

  return (
    <Modal
      open={open}
      onClose={close}
      title="Сэжим дахин хуваарилах"
      footer={
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="ghost" onClick={close}>
            Болих
          </Button>
          <Button
            onClick={submit}
            disabled={pending || !reason || !newOwnerId || note.trim().length < noteMin}
          >
            <ArrowRightLeft className="size-4" />
            {pending ? "Шилжүүлж байна…" : "Шилжүүлэх"}
          </Button>
        </div>
      }
    >
      {reasons.length === 0 ? (
        <p className="text-sm text-muted">
          Сэжим шилжүүлэх эрх Багийн ахлагч, Борлуулалт хариуцсан захирал, Үйл ажиллагаа-ЧМТ-д бий.
        </p>
      ) : (
        <div className="space-y-4">
          <p className="text-sm text-muted">
            Сэжмийг агентаас дур мэдэн шилжүүлэхгүй — шалтгаан бүрт системийн нотолгоо шаардлагатай.
            Шилжүүлэлт эзэмшлийн түүхэд үлдэж, эхний холболтын хугацаа шинэ эзэмшигчээс тоологдоно.
          </p>
          <Field label="Шалтгаан" hint={reason ? REASSIGN_REASON_LABEL[reason].hint : undefined}>
            <Select value={reason} onChange={(e) => setReason(e.target.value as ReassignReason | "")}>
              <option value="">Шалтгааныг сонгоно уу</option>
              {reasons.map((r) => (
                <option key={r} value={r}>
                  {REASSIGN_REASON_LABEL[r].label}
                </option>
              ))}
            </Select>
          </Field>
          <Field
            label="Шинэ эзэмшигч"
            hint={candidates.length === 0 ? "Шилжүүлэн авах идэвхтэй ажилтан алга (чөлөөтэйг хассан)." : undefined}
          >
            <Select value={newOwnerId} onChange={(e) => setNewOwnerId(e.target.value)}>
              <option value="">Ажилтныг сонгоно уу</option>
              {candidates.map((a) => (
                <option key={a.profileId} value={a.profileId}>
                  {a.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field
            label="Үндэслэл, нотолгоо"
            hint={`Юу болсныг, ямар нотолгоонд үндэслэснийг бичнэ үү (${noteMin}+ тэмдэгт).`}
          >
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={4}
              maxLength={1000}
              className="w-full rounded-xl border border-line bg-surface p-3 text-sm text-ink focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
            />
          </Field>
          {error ? (
            <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
              {error}
            </p>
          ) : null}
        </div>
      )}
    </Modal>
  );
}
