"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { UserPlus, Share2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Input, Field } from "@/components/ui/input";
import { createReferral } from "@/lib/actions/crm-post-sale";

/**
 * Рефералын самбар (F-752/753) — харилцагчийн 360° картад залгагдана.
 * Ирсэн нэр шинэ сэжим болж P-01 стандарт урсгалаар (Д-01 хуваарилалт,
 * давхардлын хаалт) бүртгэгдэж, санал болгогчтой хоёр чиглэлээр холбогдоно.
 */

export type ReferralRow = {
  id: string;
  referrer_contact_id: string;
  referrer_name?: string | null;
  lead_id: string;
  lead_contact_name?: string | null;
  lead_status?: string | null;
  created_at: string;
};

export function ReferralPanel({
  contactId,
  contactName,
  referrals,
  basePath = "/office/crm",
}: {
  /** Санал болгогч харилцагч (энэ картаас реферал үүсгэнэ). */
  contactId: string;
  contactName: string;
  referrals: ReferralRow[];
  basePath?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit() {
    setError(null);
    startTransition(async () => {
      const res = await createReferral({
        referrerContactId: contactId,
        firstName: firstName.trim(),
        lastName: lastName.trim() || null,
        phone: phone.trim(),
        note: note.trim() || null,
      });
      if (res.error) {
        setError(res.error);
        return;
      }
      setOpen(false);
      setFirstName("");
      setLastName("");
      setPhone("");
      setNote("");
      router.refresh();
    });
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Share2 className="size-4 text-brand-600" />
          <span className="text-sm font-semibold text-ink">Санал болголт</span>
          {referrals.length > 0 && <Badge tone="brand">{referrals.length}</Badge>}
        </div>
        <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
          <UserPlus className="size-4" />
          Реферал бүртгэх
        </Button>
      </div>

      {referrals.length === 0 ? (
        <p className="py-4 text-center text-sm text-muted">
          Реферал бүртгэгдээгүй. Рефералын хөлс тусдаа бодлогоор — систем зөвхөн бүртгэл, холбоос хөтөлнө (F-753).
        </p>
      ) : (
        <ul className="divide-y divide-line rounded-xl border border-line bg-surface">
          {referrals.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center gap-2 px-3 py-2.5">
              <span className="text-sm text-ink">
                {r.referrer_contact_id === contactId ? (
                  <>
                    Санал болгосон:{" "}
                    <Link href={`${basePath}/leads/${r.lead_id}`} className="font-medium text-brand-700 hover:underline">
                      {r.lead_contact_name ?? "Шинэ сэжим"}
                    </Link>
                  </>
                ) : (
                  <>Санал болгогч: {r.referrer_name ?? r.referrer_contact_id}</>
                )}
              </span>
              {r.lead_status && <Badge tone="neutral">{r.lead_status}</Badge>}
              <span className="ml-auto text-xs text-subtle">
                {new Date(r.created_at).toLocaleDateString("mn-MN")}
              </span>
            </li>
          ))}
        </ul>
      )}

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={`Реферал бүртгэх — ${contactName}`}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Болих
            </Button>
            <Button onClick={submit} disabled={pending || !firstName.trim() || !phone.trim()}>
              {pending ? "Бүртгэж байна…" : "Сэжим үүсгэх"}
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <p className="text-sm text-muted">
            Шинэ сэжим «Санал болголт» эх сурвалжтайгаар үүсч, стандарт урсгалаар (хуваарилалт, SLA) явна.
          </p>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Нэр">
              <Input value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder="Нэр" />
            </Field>
            <Field label="Овог (заавал биш)">
              <Input value={lastName} onChange={(e) => setLastName(e.target.value)} placeholder="Овог" />
            </Field>
          </div>
          <Field label="Утасны дугаар">
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="99112233" />
          </Field>
          <Field label="Тэмдэглэл (заавал биш)">
            <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Юу сонирхож буй г.м." />
          </Field>
          {error && <p className="text-sm text-danger">{error}</p>}
        </div>
      </Modal>
    </div>
  );
}
