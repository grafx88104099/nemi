"use client";

import { useState, useTransition } from "react";
import { Sparkles } from "lucide-react";

import { createPremierInvoice } from "@/lib/actions/payments";
import { Button } from "@/components/ui/button";

export function PremierUpgrade() {
  const [pending, startTransition] = useTransition();
  const [qr, setQr] = useState<{ image: string; text: string } | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  function buy() {
    setMsg(null);
    setQr(null);
    startTransition(async () => {
      const res = await createPremierInvoice();
      if (res.error === "no_creds") {
        setMsg("QPay тохиргоо хийгдээгүй байна (QPAY_USERNAME/PASSWORD/INVOICE_CODE).");
      } else if (res.error) {
        setMsg(`Алдаа: ${res.error}`);
      } else if (res.qrImage) {
        setQr({ image: res.qrImage, text: res.qrText ?? "" });
      }
    });
  }

  return (
    <div className="rounded-2xl border border-brand-200 bg-brand-50 p-5">
      <div className="flex items-center gap-2 font-bold text-brand-700">
        <Sparkles className="size-5" /> Premier болох
      </div>
      <p className="mt-1 text-sm text-brand-700/80">
        Онцлох байршил, Premier тэмдэг, AI хэрэгслүүд. Сард 99,000₮.
      </p>
      {!qr && (
        <Button className="mt-3" onClick={buy} disabled={pending}>
          {pending ? "Нэхэмжлэх үүсгэж байна..." : "QPay-ээр төлөх"}
        </Button>
      )}
      {msg && <p className="mt-3 text-sm text-muted">{msg}</p>}
      {qr && (
        <div className="mt-4 flex flex-col items-center gap-2 rounded-xl bg-surface p-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={qr.image.startsWith("data:") ? qr.image : `data:image/png;base64,${qr.image}`}
            alt="QPay QR"
            className="size-48"
          />
          <p className="text-sm text-muted">QPay аппаар уншуулж төлнө үү. Төлбөр баталгаажмагц Premier идэвхжинэ.</p>
        </div>
      )}
    </div>
  );
}
