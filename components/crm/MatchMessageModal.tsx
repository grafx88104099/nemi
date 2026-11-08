"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Copy, MessageCircle } from "lucide-react";

import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Input, Field } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { toast } from "@/components/ui/toast";
import {
  getMatchMessageDraft,
  recordMatchMessage,
  type MatchMessageChannel,
  type MatchMessageDraft,
} from "@/lib/actions/crm-matching";

/**
 * Хувь хүнд чиглэсэн зурвас (§6.10.5): системийн загварыг агент засаж,
 * Messenger / SMS / цахим шуудангаар өөрөө илгээнэ → «Илгээснээ бүртгэх»
 * дарахад тохируулга санал болгосон болж, үйл ажиллагааны бүртгэлд орно.
 * Автомат илгээлт байхгүй.
 */

const CHANNEL_OPTIONS: { value: MatchMessageChannel; label: string }[] = [
  { value: "chat", label: "Чат (Messenger, SMS г.м.)" },
  { value: "email", label: "Цахим шуудан" },
  { value: "call", label: "Дуудлага" },
];

function tomorrowIso(): string {
  const d = new Date(Date.now() + 86400000 + 8 * 3600000);
  return d.toISOString().slice(0, 10);
}

export function MatchMessageModal({
  matchId,
  open,
  onClose,
}: {
  matchId: string | null;
  open: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [draft, setDraft] = useState<MatchMessageDraft | null>(null);
  const [text, setText] = useState("");
  const [channel, setChannel] = useState<MatchMessageChannel>("chat");
  const [nextStep, setNextStep] = useState("Хариуг асууж, үзлэг товлох");
  const [nextStepDate, setNextStepDate] = useState(tomorrowIso());
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !matchId) return;
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- модал нээгдэх бүрт төлөвийг шинэчилнэ
    setLoading(true);
    setError(null);
    setDraft(null);
    getMatchMessageDraft(matchId).then((res) => {
      if (cancelled) return;
      setLoading(false);
      if (res.error || !res.draft) {
        setError(res.error ?? "Зурвасын загвар бэлтгэж чадсангүй.");
        return;
      }
      setDraft(res.draft);
      setText(res.draft.text);
    });
    return () => {
      cancelled = true;
    };
  }, [open, matchId]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Зурвас хуулагдлаа — илгээсний дараа «Илгээснээ бүртгэх» дарна уу.");
    } catch {
      toast.error("Хуулж чадсангүй. Текстийг гараар сонгож хуулна уу.");
    }
  }

  function submit() {
    if (!matchId) return;
    setError(null);
    startTransition(async () => {
      const res = await recordMatchMessage(matchId, {
        channel,
        text,
        nextStep: nextStep.trim() || undefined,
        nextStepDate: nextStepDate || undefined,
      });
      if (!res.ok) {
        setError(res.error ?? "Хадгалахад алдаа гарлаа.");
        return;
      }
      toast.success("Санал болголт бүртгэгдлээ.");
      onClose();
      router.refresh();
    });
  }

  const missingNext = !!draft?.needsNextStep && (!nextStep.trim() || !nextStepDate);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Хувь хүнд чиглэсэн зурвас"
      footer={
        <div className="flex w-full flex-wrap items-center justify-end gap-2">
          <Button variant="ghost" onClick={onClose} disabled={pending}>
            Болих
          </Button>
          <Button variant="outline" onClick={copy} disabled={!text.trim() || loading}>
            <Copy className="size-4" /> Хуулах
          </Button>
          <Button onClick={submit} disabled={pending || loading || !draft || text.trim().length < 10 || missingNext}>
            <MessageCircle className="size-4" /> {pending ? "Бүртгэж байна…" : "Илгээснээ бүртгэх"}
          </Button>
        </div>
      }
    >
      <div className="space-y-3">
        {loading ? <p className="text-sm text-muted">Загвар бэлтгэж байна…</p> : null}
        {draft ? (
          <>
            <p className="text-xs text-muted">
              {draft.contactName ?? "Харилцагч"} · {draft.propertyName}. Зурвасыг засаад өөрийн сувгаар илгээнэ үү —
              систем автоматаар илгээхгүй.
            </p>
            <Field label="Зурвас" htmlFor="match-msg-text">
              <textarea
                id="match-msg-text"
                value={text}
                onChange={(e) => setText(e.target.value)}
                rows={7}
                className="w-full rounded-xl border border-line bg-surface px-3.5 py-2.5 text-sm text-ink placeholder:text-subtle focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
              />
            </Field>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Илгээсэн суваг" htmlFor="match-msg-channel">
                <Select
                  id="match-msg-channel"
                  value={channel}
                  onChange={(e) => setChannel(e.target.value as MatchMessageChannel)}
                >
                  {CHANNEL_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label={draft.needsNextStep ? "Дараагийн үйлдлийн огноо (заавал)" : "Дараагийн үйлдлийн огноо"} htmlFor="match-msg-date">
                <Input
                  id="match-msg-date"
                  type="date"
                  value={nextStepDate}
                  onChange={(e) => setNextStepDate(e.target.value)}
                />
              </Field>
            </div>
            <Field label={draft.needsNextStep ? "Дараагийн үйлдэл (заавал)" : "Дараагийн үйлдэл"} htmlFor="match-msg-next">
              <Input id="match-msg-next" value={nextStep} onChange={(e) => setNextStep(e.target.value)} />
            </Field>
          </>
        ) : null}
        {error ? <p className="text-sm text-danger">{error}</p> : null}
      </div>
    </Modal>
  );
}
