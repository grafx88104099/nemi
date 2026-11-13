"use client";

import * as React from "react";
import { RotateCw, TriangleAlert } from "lucide-react";

import { Button } from "@/components/ui/button";

/**
 * CRM-ийн хуудсыг ачаалах үеийн гэнэтийн алдаа (crm/error.tsx, хоёр панелд).
 * CRM-ийн цэс хэвээр үлдэнэ; «Дахин оролдох» нь сегментийг серверээс дахин ачаална.
 * Серверийн алдааны текстийг харуулахгүй (production-д нууцлагдсан) — digest-ийг л.
 */
export function CrmError({
  error,
  reset,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  reset: () => void;
  unstable_retry?: () => void;
}) {
  React.useEffect(() => {
    console.error("CRM:", error);
  }, [error]);

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-10 md:px-6">
      <div role="alert" className="mx-auto max-w-md rounded-2xl border border-line bg-surface p-6 text-center shadow-sm">
        <span className="mx-auto flex size-12 items-center justify-center rounded-full bg-rose-50 text-rose-600">
          <TriangleAlert className="size-6" aria-hidden />
        </span>
        <h1 className="mt-3 text-lg font-bold text-ink">Ачаалахад алдаа гарлаа</h1>
        <p className="mt-1 text-sm text-muted">Мэдээллийг уншиж чадсангүй. Сүлжээгээ шалгаад дахин оролдоно уу.</p>
        {error.digest ? <p className="mt-2 font-mono text-xs text-subtle">Код: {error.digest}</p> : null}
        <Button type="button" className="mt-4" onClick={() => (unstable_retry ?? reset)()}>
          <RotateCw className="size-4" aria-hidden /> Дахин оролдох
        </Button>
      </div>
    </div>
  );
}
