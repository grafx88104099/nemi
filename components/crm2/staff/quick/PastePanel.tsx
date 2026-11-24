"use client";

import * as React from "react";
import { ChevronDown, ClipboardPaste, Loader2, Sparkles } from "lucide-react";

import { Textarea } from "@/components/crm2/staff/form/fields";
import { Button } from "@/components/ui/button";
import { parseListingTextAi } from "@/lib/crm2/actions/parse";
import { LISTING_TEXT_MAX, parseListingText, type ListingTextContext, type ParsedListingFields } from "@/lib/crm2/listing-text";
import { cn } from "@/lib/utils";

import { PhoneOwnerQuestion } from "./PhoneOwnerQuestion";

export type PasteResult = {
  fields: ParsedListingFields;
  /** Нууцалсан үлдэгдэл бичвэр (тэмдэглэл, field_notes.source_text). */
  restMasked: string;
  method: "rules" | "ai";
};

const FIELD_KEYS = [
  "category",
  "property_type",
  "area_m2",
  "rooms",
  "floor",
  "building_floors",
  "price",
  "currency",
  "price_basis",
  "price_period",
  "year_in_use",
  "district",
  "project_id",
  "project_name",
  "features",
  "parking_spaces",
  "rent_advance_months",
  "rent_deposit_months",
] as const;

/** AI-ийн (zod-оор шүүсэн) хариу → дүрмийн задлагчийн хэлбэр (null утгыг хаяна). */
export function fieldsFromAi(raw: Record<string, unknown>): ParsedListingFields {
  const out: Record<string, unknown> = {};
  for (const k of FIELD_KEYS) {
    const v = raw[k];
    if (v === null || v === undefined || v === "") continue;
    if (Array.isArray(v) && !v.length) continue;
    out[k] = v;
  }
  return out as ParsedListingFields;
}

/**
 * «Зарын текст наах» (P9): наангуут дүрмээр задлаад ЗӨВХӨН хоосон талбарыг шараар бөглөнө (эцэг
 * mergeParsed-ээр). Олдсон утсыг эзний талбарт автоматаар хийхгүй — «Энэ дугаар эзнийх үү?».
 * «AI-аар задлах» зөвхөн сервер ба оффис зөвшөөрсөн үед (aiAvailable).
 */
export function PastePanel({
  ctx,
  aiAvailable,
  initialText,
  initialPhones,
  initialMessage,
  disabled,
  ownerPhoneEmpty,
  onParsed,
  onOwnerPhone,
}: {
  ctx: ListingTextContext;
  aiAvailable: boolean;
  /** Хуваалцсан бичвэр (эцэг аль хэдийн задалж ноорогт хадгалсан) — харуулахад. */
  initialText?: string | null;
  /** Хуваалцсан бичвэрт олдсон дугаар («Энэ дугаар эзнийх үү?»). */
  initialPhones?: string[];
  initialMessage?: string | null;
  disabled?: boolean;
  /** Эзний утас хоосон үед л «Энэ дугаар эзнийх үү?» асууна. */
  ownerPhoneEmpty: boolean;
  /** → бөглөсөн талбарын тоо. */
  onParsed: (r: PasteResult) => number;
  onOwnerPhone: (phone: string) => void;
}) {
  const [open, setOpen] = React.useState(!!initialText);
  const [text, setText] = React.useState(initialText ?? "");
  const [phones, setPhones] = React.useState<string[]>(initialPhones ?? []);
  const [message, setMessage] = React.useState<{ tone: "ok" | "warn" | "error"; text: string } | null>(
    initialMessage ? { tone: "ok", text: initialMessage } : null
  );
  const [aiBusy, setAiBusy] = React.useState(false);
  const panelId = React.useId();
  const onParsedRef = React.useRef(onParsed);
  React.useEffect(() => {
    onParsedRef.current = onParsed;
  });

  const runRules = React.useCallback(
    (value: string) => {
      const src = value.trim();
      if (!src) return;
      const parsed = parseListingText(src, ctx);
      const filled = onParsedRef.current({ fields: parsed.fields, restMasked: parsed.restMasked, method: "rules" });
      setPhones(parsed.phones);
      setMessage(
        filled > 0
          ? { tone: "ok", text: `${filled} талбар бөглөгдлөө — шараар тэмдэглэснийг шалгана уу.` }
          : { tone: "warn", text: "Хоосон талбарт тохирох утга олдсонгүй. Бичвэр тэмдэглэлд хадгалагдлаа." }
      );
    },
    [ctx]
  );

  async function runAi() {
    const src = text.trim();
    if (!src || aiBusy) return;
    setAiBusy(true);
    try {
      const res = await parseListingTextAi(src);
      if ("error" in res) {
        setMessage({ tone: "error", text: res.error });
        return;
      }
      const fields = fieldsFromAi(res.fields as Record<string, unknown>);
      const rest = parseListingText(src, ctx).restMasked;
      const filled = onParsedRef.current({ fields, restMasked: rest, method: "ai" });
      setMessage({ tone: filled ? "ok" : "warn", text: filled ? `AI: ${filled} талбар нэмж бөглөлөө — шалгана уу.` : "AI нэмэлт утга олсонгүй." });
    } catch {
      setMessage({ tone: "error", text: "AI задалж чадсангүй. Утгуудыг гараар бөглөнө үү." });
    } finally {
      setAiBusy(false);
    }
  }

  return (
    <div className="rounded-2xl border border-dashed border-line-strong bg-surface">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((o) => !o)}
        className="flex min-h-12 w-full items-center justify-between gap-2 px-4 text-left text-sm font-semibold text-ink"
      >
        <span className="flex items-center gap-2">
          <ClipboardPaste className="size-4 text-brand-600" aria-hidden />
          Зарын текст наах
          <span className="font-normal text-muted">(заавал биш)</span>
        </span>
        <ChevronDown className={cn("size-4 transition", open && "rotate-180")} aria-hidden />
      </button>
      {open ? (
        <div id={panelId} className="space-y-3 border-t border-line px-4 pb-4 pt-3">
          <Textarea
            aria-label="Зарын текст"
            rows={5}
            value={text}
            maxLength={LISTING_TEXT_MAX}
            disabled={disabled}
            placeholder="Viber, Facebook-ийн зарын текстийг энд наана уу"
            onChange={(e) => setText(e.target.value)}
            onPaste={(e) => {
              const pasted = e.clipboardData.getData("text");
              if (!pasted) return;
              // Наасны дараах бүтэн утгаар задлана.
              const el = e.currentTarget;
              window.requestAnimationFrame(() => runRules(el.value));
            }}
          />
          <div className="flex flex-col gap-2 min-[420px]:flex-row">
            <Button type="button" variant="outline" size="md" disabled={disabled || !text.trim()} onClick={() => runRules(text)}>
              Задлах
            </Button>
            {aiAvailable ? (
              <Button type="button" variant="secondary" size="md" disabled={disabled || aiBusy || !text.trim()} onClick={() => void runAi()}>
                {aiBusy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Sparkles className="size-4" aria-hidden />}
                AI-аар задлах
              </Button>
            ) : null}
          </div>
          <div aria-live="polite">
            {message ? (
              <p
                className={cn(
                  "rounded-lg px-3 py-2 text-sm",
                  message.tone === "ok" && "bg-emerald-50 text-emerald-900",
                  message.tone === "warn" && "bg-amber-50 text-amber-900",
                  message.tone === "error" && "bg-rose-50 text-rose-800"
                )}
              >
                {message.text}
              </p>
            ) : null}
          </div>
          {ownerPhoneEmpty && phones.length ? (
            <PhoneOwnerQuestion
              key={phones.join(",")}
              phones={phones}
              disabled={disabled}
              onYes={(p) => {
                onOwnerPhone(p);
                setPhones([]);
              }}
              onDismiss={() => setPhones([])}
            />
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
