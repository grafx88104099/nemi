"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Modal } from "@/components/ui/modal";
import { Input, Field } from "@/components/ui/input";
import { recordMatchResponse } from "@/lib/actions/crm-matching";
import { MATCH_RESPONSES, MATCH_RESPONSE_LABEL, type MatchResponse } from "@/lib/constants-crm";

/**
 * Харилцагчийн 4 хариу (F-256): Сонирхсон / Магадгүй / Тохироогүй / Хариу өгөөгүй.
 * «Тохироогүй» → шалтгаан заавал + профайл шинэчлэх санал (F-260);
 * «Сонирхсон» → үзлэгийн даалгавар автомат (F-261) — action талд.
 */
export function MatchResponseButtons({
  matchId,
  response,
  responseReason,
}: {
  matchId: string;
  response: MatchResponse | null;
  responseReason: string | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [reasonOpen, setReasonOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);

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
      if (res.profileUpdateHint) {
        setHint("Шалтгаан бүртгэгдлээ — хэрэгцээний профайлыг шинэчлэхийг зөвлөж байна (F-260).");
      }
      router.refresh();
    });
  }

  if (response) {
    return (
      <div className="flex flex-wrap items-center gap-1.5">
        <Badge tone={MATCH_RESPONSE_LABEL[response].tone}>{MATCH_RESPONSE_LABEL[response].label}</Badge>
        {responseReason ? <span className="text-xs text-subtle">{responseReason}</span> : null}
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
      {hint ? <p className="text-xs text-amber-700">{hint}</p> : null}

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
        <Field label="Шалтгаан (заавал)" hint="Шалтгаан профайл шинэчлэх саналд ашиглагдана (F-260)">
          <Input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Жишээ: давхар өндөр, гэрэлтүүлэг муу…"
          />
        </Field>
        {error ? <p className="mt-2 text-xs text-danger">{error}</p> : null}
      </Modal>
    </div>
  );
}
