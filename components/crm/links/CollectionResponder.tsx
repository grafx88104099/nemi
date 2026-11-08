"use client";

import { useState, useTransition } from "react";
import { Check, HelpCircle, ThumbsDown } from "lucide-react";

import { respondToCollection } from "@/lib/actions/crm-public-links";
import type { MatchResponse } from "@/lib/constants-crm";
import { cn } from "@/lib/utils";

const OPTIONS: { value: MatchResponse; label: string; icon: typeof Check; cls: string }[] = [
  { value: "interested", label: "Сонирхсон", icon: Check, cls: "border-emerald-300 bg-emerald-50 text-emerald-800" },
  { value: "maybe", label: "Магадгүй", icon: HelpCircle, cls: "border-amber-300 bg-amber-50 text-amber-800" },
  { value: "not_fit", label: "Тохироогүй", icon: ThumbsDown, cls: "border-rose-300 bg-rose-50 text-rose-800" },
];

/** Сонголтын жагсаалтын мөр бүрийн хариу (нэвтрэлтгүй, токеноор). */
export function CollectionResponder({
  token,
  propertyId,
  initial,
  initialComment,
}: {
  token: string;
  propertyId: string;
  initial: MatchResponse | null;
  initialComment: string | null;
}) {
  const [value, setValue] = useState<MatchResponse | null>(initial);
  const [comment, setComment] = useState(initialComment ?? "");
  const [saved, setSaved] = useState(!!initial);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function send(v: MatchResponse, note = comment) {
    setValue(v);
    setError(null);
    start(async () => {
      const res = await respondToCollection({ token, propertyId, response: v, comment: note });
      if (!res.ok) {
        setError(res.error ?? "Хадгалж чадсангүй.");
        setSaved(false);
        return;
      }
      setSaved(true);
    });
  }

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-3 gap-2">
        {OPTIONS.map((o) => (
          <button
            key={o.value}
            type="button"
            disabled={pending}
            onClick={() => send(o.value)}
            className={cn(
              "inline-flex h-11 items-center justify-center gap-1.5 rounded-xl border text-sm font-medium",
              value === o.value ? o.cls : "border-line bg-surface text-ink hover:bg-surface-2"
            )}
            aria-pressed={value === o.value}
          >
            <o.icon className="size-4" /> {o.label}
          </button>
        ))}
      </div>
      {value ? (
        <div className="flex gap-2">
          <input
            value={comment}
            onChange={(e) => {
              setComment(e.target.value);
              setSaved(false);
            }}
            maxLength={500}
            placeholder={value === "not_fit" ? "Юу тохирохгүй байна вэ? (үнэ, байршил…)" : "Сэтгэгдэл, асуулт (заавал биш)"}
            className="h-10 min-w-0 flex-1 rounded-xl border border-line bg-surface px-3 text-sm"
          />
          <button
            type="button"
            disabled={pending || saved}
            onClick={() => value && send(value, comment)}
            className="h-10 shrink-0 rounded-xl bg-brand-500 px-3 text-sm font-medium text-white disabled:opacity-50"
          >
            Илгээх
          </button>
        </div>
      ) : null}
      {saved && !pending ? <p className="text-xs text-emerald-700">Хариу агентад хүрлээ. Баярлалаа!</p> : null}
      {error ? <p className="text-xs text-danger">{error}</p> : null}
    </div>
  );
}
