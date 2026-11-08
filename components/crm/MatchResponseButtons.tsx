"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Modal } from "@/components/ui/modal";
import { Input, Field } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";
import { recordMatchResponse } from "@/lib/actions/crm-matching";
import { MATCH_RESPONSES, MATCH_RESPONSE_LABEL, type MatchResponse } from "@/lib/constants-crm";

/**
 * Харилцагчийн 4 хариу (§6.10.7): Сонирхсон / Магадгүй / Тохироогүй / Хариу өгөөгүй.
 * «Тохироогүй» → шалтгаан заавал (түгээмэл шалтгааныг нэг товшилтоор) +
 * хэрэгцээний профайл шинэчлэх холбоос (§6.10.8); «Сонирхсон» → үзлэгийн
 * даалгавар автомат (action талд).
 */

/** Түгээмэл шалтгаан — сонгоход текст бөглөгдөнө, агент нэмж тайлбарлаж болно. */
const NOT_FIT_REASONS = ["Үнэ", "Байршил", "Хэмжээ, төлөвлөлт", "Нөхцөл байдал", "Давхар", "Хугацаа", "Санхүүжилт"];

export function MatchResponseButtons({
  matchId,
  response,
  responseReason,
  contactHref,
}: {
  matchId: string;
  response: MatchResponse | null;
  responseReason: string | null;
  /** Харилцагчийн карт (хэрэгцээний профайл шинэчлэх). */
  contactHref?: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [reasonOpen, setReasonOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [hint, setHint] = useState(false);

  function submit(r: MatchResponse, reasonText?: string) {
    setError(null);
    startTransition(async () => {
      const res = await recordMatchResponse(matchId, r, reasonText);
      if (!res.ok) {
        setError(res.error ?? "Алдаа гарлаа.");
        return;
      }
      setReasonOpen(false);
      setReason("");
      if (res.profileUpdateHint) setHint(true);
      toast.success(`Хариу бүртгэгдлээ: ${MATCH_RESPONSE_LABEL[r].label}.`);
      router.refresh();
    });
  }

  if (response) {
    return (
      <div className="flex flex-wrap items-center gap-1.5">
        <Badge tone={MATCH_RESPONSE_LABEL[response].tone}>{MATCH_RESPONSE_LABEL[response].label}</Badge>
        {responseReason ? <span className="text-xs text-subtle">{responseReason}</span> : null}
        {response === "not_fit" && contactHref ? (
          <Link href={contactHref} className="text-xs font-semibold text-brand-700 hover:underline">
            Хэрэгцээний профайл шинэчлэх
          </Link>
        ) : null}
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap items-center gap-1.5">
        {MATCH_RESPONSES.map((r) => (
          <Button
            key={r}
            size="sm"
            variant={r === "interested" ? "primary" : "outline"}
            disabled={pending}
            onClick={() => (r === "not_fit" ? setReasonOpen(true) : submit(r))}
          >
            {MATCH_RESPONSE_LABEL[r].label}
          </Button>
        ))}
      </div>
      {error ? <p className="text-xs text-danger">{error}</p> : null}
      {hint ? (
        <p className="text-xs text-amber-700">
          Шалтгаан бүртгэгдлээ — шаардлага өөрчлөгдсөн бол хэрэгцээний профайлыг өнөөдөр шинэчилнэ үү.{" "}
          {contactHref ? (
            <Link href={contactHref} className="font-semibold text-brand-700 hover:underline">
              Профайл руу очих
            </Link>
          ) : null}
        </p>
      ) : null}

      <Modal
        open={reasonOpen}
        onClose={() => setReasonOpen(false)}
        title="Тохироогүй — шалтгаан"
        footer={
          <div className="flex w-full items-center justify-end gap-2">
            <Button variant="ghost" onClick={() => setReasonOpen(false)} disabled={pending}>
              Болих
            </Button>
            <Button onClick={() => submit("not_fit", reason.trim())} disabled={pending || !reason.trim()}>
              {pending ? "Хадгалж байна…" : "Бүртгэх"}
            </Button>
          </div>
        }
      >
        <div className="space-y-3">
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Түгээмэл шалтгаан">
            {NOT_FIT_REASONS.map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setReason((cur) => (cur.trim() ? (cur.includes(r) ? cur : `${cur}, ${r}`) : r))}
                className="min-h-9 rounded-full border border-line px-3 text-xs font-medium text-ink hover:bg-surface-2"
              >
                {r}
              </button>
            ))}
          </div>
          <Field label="Шалтгаан (заавал)" hint="Шалтгаанаар хэрэгцээний профайлыг шинэчлэх эсэхийг шийднэ">
            <Input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Жишээ: давхар өндөр, гэрэлтүүлэг муу…"
            />
          </Field>
          {error ? <p className="text-xs text-danger">{error}</p> : null}
        </div>
      </Modal>
    </div>
  );
}
