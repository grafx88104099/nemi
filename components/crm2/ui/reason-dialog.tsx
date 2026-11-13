"use client";

import * as React from "react";

import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { Select } from "@/components/ui/select";

/**
 * Шалтгаан асуух цонх (татгалзах, цуцлах, төлөв өөрчлөх хүсэлт, хүчингүй болгох,
 * шилжүүлэх). options өгвөл шалтгааны жагсаалт (жишээ: deal.cancel_reasons) +
 * тайлбар; textRequiredFor-д орсон кодод (анхдагч «other») тайлбар заавал.
 * onSubmit алдааны текст буцаавал цонх хаагдахгүй.
 *
 *   <ReasonDialog open title="Хэлцэл цуцлах" options={settingOptions(s["deal.cancel_reasons"])}
 *     onSubmit={async ({ code, text }) => {
 *       const r = await cancelDeal({ deal_id, reason_code: code!, reason: text });
 *       return r.ok ? null : r.error;
 *     }} />
 */
export type ReasonValue = { code: string | null; text: string };

export function ReasonDialog({
  open,
  onClose,
  title,
  description,
  children,
  label = "Шалтгаан",
  placeholder = "Шалтгаанаа бичнэ үү",
  optionsLabel = "Шалтгаан",
  options,
  textRequired,
  textRequiredFor = ["other"],
  maxLength = 2000,
  confirmLabel = "Хадгалах",
  cancelLabel = "Болих",
  tone = "primary",
  onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: React.ReactNode;
  /** Нэмэлт талбар (жишээ: агент сонгох) — шалтгааны дээр. */
  children?: React.ReactNode;
  label?: string;
  placeholder?: string;
  optionsLabel?: string;
  options?: { value: string; label: string }[];
  /** Тайлбар заавал эсэх. Анхдагч: options байхгүй бол заавал, байвал зөвхөн textRequiredFor-д. */
  textRequired?: boolean;
  textRequiredFor?: string[];
  maxLength?: number;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: "primary" | "danger";
  onSubmit: (value: ReasonValue) => void | null | undefined | string | Promise<void | null | undefined | string>;
}) {
  const ids = React.useId();
  const [code, setCode] = React.useState("");
  const [text, setText] = React.useState("");
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [prevOpen, setPrevOpen] = React.useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) {
      setCode("");
      setText("");
      setError(null);
    }
  }

  const hasOptions = !!options?.length;
  const needText = textRequired ?? (!hasOptions || textRequiredFor.includes(code));
  const canSubmit = (!hasOptions || !!code) && (!needText || text.trim().length > 0) && text.length <= maxLength;

  async function submit(e?: React.FormEvent) {
    e?.preventDefault();
    if (!canSubmit || pending) return;
    setPending(true);
    setError(null);
    try {
      const res = await onSubmit({ code: hasOptions ? code : null, text: text.trim() });
      if (typeof res === "string" && res) setError(res);
      else onClose();
    } catch (err) {
      console.error("ReasonDialog:", err);
      setError("Алдаа гарлаа. Дахин оролдоно уу.");
    } finally {
      setPending(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={() => !pending && onClose()}
      title={title}
      closeOnBackdrop={!pending}
      footer={
        <div className="flex flex-col-reverse gap-2 border-t border-line p-4 sm:flex-row sm:justify-end">
          <Button type="button" variant="ghost" onClick={onClose} disabled={pending}>
            {cancelLabel}
          </Button>
          <Button
            type="submit"
            form={`${ids}-form`}
            variant={tone === "danger" ? "danger" : "primary"}
            disabled={!canSubmit || pending}
          >
            {pending ? "Түр хүлээнэ үү…" : confirmLabel}
          </Button>
        </div>
      }
    >
      <form id={`${ids}-form`} onSubmit={submit} className="space-y-3 p-4">
        {description ? <div className="text-sm text-muted">{description}</div> : null}
        {children}
        {hasOptions ? (
          <Field label={optionsLabel} htmlFor={`${ids}-code`}>
            <Select id={`${ids}-code`} value={code} onChange={(e) => setCode(e.target.value)} required>
              <option value="">Сонгоно уу</option>
              {options!.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </Select>
          </Field>
        ) : null}
        <Field
          label={needText ? label : `${label} (заавал биш)`}
          htmlFor={`${ids}-text`}
          hint={`${text.length}/${maxLength}`}
        >
          <textarea
            id={`${ids}-text`}
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={4}
            maxLength={maxLength}
            placeholder={placeholder}
            required={needText}
            className="w-full rounded-xl border border-line bg-surface px-3.5 py-2.5 text-sm text-ink placeholder:text-subtle focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
          />
        </Field>
        {error ? (
          <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
            {error}
          </p>
        ) : null}
      </form>
    </Modal>
  );
}
