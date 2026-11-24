"use client";

import * as React from "react";
import { ArrowRightLeft, UserPlus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { transferContact } from "@/lib/crm2/actions/contacts";
import type { Crm2ApplyOutcome } from "@/lib/crm2/types";

import type { OwnerMatch } from "./owner-model";

const DEFAULT_REASON = "Энэ хүний хөрөнгийг би бүртгэж байна";

/**
 * Утас өөр агентын (харах эрхгүй) харилцагчид бүртгэлтэй. Зөвхөн нууцалсан нэр, код, хариуцагчийг
 * харуулна. «Шилжүүлэх хүсэлт» — одоо байгаа transferContact (надад); «Тусдаа хүн» — шинэ харилцагч.
 * Шийдтэл утас owner_pending-д хадгалагдана. Фокус хулгайлахгүй (aria-live=polite).
 */
export function ForeignOwnerNotice({
  idPrefix,
  matches,
  meId,
  separateChosen,
  transferRequested,
  disabled,
  onSeparate,
  onUndo,
  onTransferred,
}: {
  idPrefix: string;
  matches: OwnerMatch[];
  meId: string;
  separateChosen: boolean;
  transferRequested: boolean;
  disabled?: boolean;
  onSeparate: () => void;
  onUndo: () => void;
  /** 'applied' — харилцагч надад шилжсэн (дахин шалгана); 'pending' — хүсэлт илгээгдсэн. */
  onTransferred: (outcome: Crm2ApplyOutcome, contactId: string) => void;
}) {
  const [openFor, setOpenFor] = React.useState<string | null>(null);
  const [reason, setReason] = React.useState(DEFAULT_REASON);
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function send(contactId: string) {
    const text = reason.trim();
    if (!text) return setError("Шилжүүлэх шалтгааныг бичнэ үү.");
    setPending(true);
    setError(null);
    try {
      const res = await transferContact({ contact_id: contactId, to_agent_id: meId, reason: text });
      if (!res.ok) return setError(res.error);
      setOpenFor(null);
      onTransferred(res.data, contactId);
    } catch {
      setError("Хүсэлт илгээж чадсангүй. Дахин оролдоно уу.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div role="status" aria-live="polite" className="space-y-3 rounded-xl border border-amber-200 bg-amber-50 p-3">
      <div className="space-y-0.5">
        <p className="text-sm font-semibold text-amber-900">Энэ дугаар өөр агентын харилцагчид бүртгэлтэй</p>
        <p className="text-xs text-amber-900">
          Утсыг хадгална. Шийдэгдэх хүртэл картад «Эзнийг шалгах» гарна.
        </p>
      </div>

      <ul className="space-y-2">
        {matches.map((m) => {
          const reasonId = `${idPrefix}-transfer-${m.contactId}`;
          return (
            <li key={m.contactId} className="space-y-2 rounded-lg bg-surface px-3 py-2.5">
              <p className="min-w-0 text-sm">
                <span className="font-semibold text-ink">{m.name}</span>
                <span className="text-muted"> · {m.code}</span>
                {m.agentName ? <span className="block text-xs text-muted">Хариуцагч: {m.agentName}</span> : null}
              </p>
              {openFor === m.contactId ? (
                <div className="space-y-2">
                  <label htmlFor={reasonId} className="block text-sm font-medium text-ink">
                    Шилжүүлэх шалтгаан
                  </label>
                  <textarea
                    id={reasonId}
                    value={reason}
                    rows={2}
                    maxLength={2000}
                    disabled={disabled || pending}
                    onChange={(e) => setReason(e.target.value)}
                    className="w-full rounded-xl border border-line bg-surface px-3.5 py-2.5 text-base text-ink focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20 sm:text-sm"
                  />
                  <div className="flex flex-wrap gap-2">
                    <Button type="button" size="touch" disabled={disabled || pending} onClick={() => send(m.contactId)}>
                      {pending ? "Илгээж байна…" : "Хүсэлт илгээх"}
                    </Button>
                    <Button type="button" size="touch" variant="ghost" disabled={pending} onClick={() => setOpenFor(null)}>
                      Болих
                    </Button>
                  </div>
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>

      {error ? <p className="text-sm text-rose-700">{error}</p> : null}

      {transferRequested ? (
        <p className="text-sm font-medium text-amber-900">Шилжүүлэх хүсэлт илгээгдлээ — батлагдвал эзнээр холбоно уу.</p>
      ) : null}

      {separateChosen ? (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm text-ink">Тусдаа хүн гэж шинээр бүртгэнэ.</p>
          <Button type="button" size="touch" variant="ghost" disabled={disabled} onClick={onUndo}>
            Буцаах
          </Button>
        </div>
      ) : openFor === null ? (
        <div className="grid grid-cols-1 gap-2 min-[400px]:grid-cols-2">
          {!transferRequested ? (
            <Button
              type="button"
              size="touch"
              variant="secondary"
              disabled={disabled}
              onClick={() => {
                setError(null);
                setOpenFor(matches[0]?.contactId ?? null);
              }}
            >
              <ArrowRightLeft className="size-4" aria-hidden />
              Шилжүүлэх хүсэлт
            </Button>
          ) : null}
          <Button type="button" size="touch" variant="outline" disabled={disabled} onClick={onSeparate}>
            <UserPlus className="size-4" aria-hidden />
            Тусдаа хүн
          </Button>
        </div>
      ) : null}
    </div>
  );
}
