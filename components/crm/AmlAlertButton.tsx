"use client";

import { useState, useTransition } from "react";
import { ShieldAlert } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Input, Field } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { submitAmlAlert } from "@/lib/actions/crm-aml";

/**
 * Дотоод дохиоллын маягт — Маягт 1 (§7.6). БҮХ дүрд нээлттэй; илгээснийхээ
 * дараа зөвхөн «Дохио илгээгдлээ» баталгаа харагдана — явц/шийдвэр/үр дүн
 * үүсгэгчид ХЭЗЭЭ Ч харагдахгүй (tipping-off хориглол).
 */

const CATEGORIES = [
  ["cash_structuring", "Бэлэн мөнгөний хэлбэржүүлэлт"],
  ["source_unclear", "Хөрөнгийн эх үүсвэр тодорхойгүй"],
  ["third_party", "Гуравдагч этгээдийн төлбөр"],
  ["identity_doubt", "Иргэний баримтын эргэлзээ"],
  ["price_anomaly", "Үнийн хэвийн бус зөрүү"],
  ["behavior", "Сэжигтэй зан төлөв"],
  ["other", "Бусад"],
] as const;

export function AmlAlertButton({
  contactId,
  transactionId,
  amountMnt,
}: {
  contactId?: string | null;
  transactionId?: string | null;
  amountMnt?: number | null;
}) {
  const [open, setOpen] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [category, setCategory] = useState<string>("other");
  const [observed, setObserved] = useState("");
  const [amount, setAmount] = useState(amountMnt != null ? String(amountMnt) : "");
  const [method, setMethod] = useState("");
  const [parties, setParties] = useState("");
  const [urgent, setUrgent] = useState(false);
  const [pending, startTransition] = useTransition();

  function submit() {
    setError(null);
    startTransition(async () => {
      const res = await submitAmlAlert({
        contactId: contactId ?? null,
        transactionId: transactionId ?? null,
        category,
        observed,
        amountMnt: amount ? Number(amount) : null,
        paymentMethod: method || null,
        parties: parties || null,
        urgent,
      });
      if (!res.ok) {
        setError(res.error ?? "Алдаа гарлаа.");
        return;
      }
      setSent(true);
    });
  }

  function close() {
    setOpen(false);
    // Дараагийн нээлтэд маягт цэвэр (илгээсэн агуулга дахин харагдахгүй).
    setSent(false);
    setObserved("");
    setParties("");
    setError(null);
  }

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <ShieldAlert className="size-4" />
        МУТСТ дохио
      </Button>
      <Modal
        open={open}
        onClose={close}
        title="Дотоод дохиоллын маягт (Маягт 1)"
        footer={
          sent ? (
            <Button onClick={close}>Хаах</Button>
          ) : (
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={close}>
                Болих
              </Button>
              <Button onClick={submit} disabled={pending || !observed.trim()}>
                {pending ? "Илгээж байна…" : "Дохио илгээх"}
              </Button>
            </div>
          )
        }
      >
        {sent ? (
          <div className="space-y-2 py-4 text-center">
            <ShieldAlert className="mx-auto size-8 text-emerald-600" />
            <p className="font-medium text-ink">Дохио илгээгдлээ.</p>
            <p className="text-sm text-muted">
              Дохиолол зөвхөн МУТСТ-ийн хяналт тавих ажилтанд хүрнэ. Энэ асуудлыг харилцагчтай
              хэлэлцэхийг хориглоно.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            <Field label="Эрсдэлийн дохионы ангилал">
              <Select value={category} onChange={(e) => setCategory(e.target.value)}>
                {CATEGORIES.map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Ажигласан нөхцөл байдал" error={error ?? undefined}>
              <textarea
                value={observed}
                onChange={(e) => setObserved(e.target.value)}
                rows={4}
                className="w-full rounded-xl border border-line bg-surface p-3 text-sm text-ink placeholder:text-subtle focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
                placeholder="Юу ажигласнаа тодорхой бичнэ үү…"
              />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Дүн (₮ дүйцлээр)">
                <Input
                  type="number"
                  inputMode="numeric"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0"
                />
              </Field>
              <Field label="Төлбөрийн хэлбэр">
                <Select value={method} onChange={(e) => setMethod(e.target.value)}>
                  <option value="">Сонгоогүй</option>
                  <option value="cash">Бэлэн мөнгө</option>
                  <option value="bank">Банк шилжүүлэг</option>
                  <option value="foreign">Гадаад төлбөр</option>
                  <option value="virtual">Виртуал хөрөнгө</option>
                  <option value="other">Бусад</option>
                </Select>
              </Field>
            </div>
            <Field label="Талууд (нэрс, хамаарал)">
              <Input value={parties} onChange={(e) => setParties(e.target.value)} placeholder="—" />
            </Field>
            <label className="flex items-center gap-2 text-sm text-ink">
              <input
                type="checkbox"
                checked={urgent}
                onChange={(e) => setUrgent(e.target.checked)}
                className="size-4 rounded border-line"
              />
              Яаралтай эрсдэл
            </label>
          </div>
        )}
      </Modal>
    </>
  );
}
