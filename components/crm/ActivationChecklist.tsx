"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, CircleAlert, Rocket } from "lucide-react";

import { Card, CardBody } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { setPropertyStatus } from "@/lib/actions/crm-properties";
import type { CrmPropertyStatus } from "@/lib/constants-crm";

/**
 * Идэвхжүүлэлтийн босгын checklist (F-203): дутуу шаардлагыг жагсааж,
 * бүрэн болмогц Идэвхтэй болгоно. Эцсийн шалгалт DB guard-д — энд серверээс
 * ирсэн жагсаалт + идэвхжүүлэх оролдлогын алдааны жагсаалт хоёул харагдана.
 */
export function ActivationChecklist({
  propertyId,
  status,
  missing,
}: {
  propertyId: string;
  status: CrmPropertyStatus;
  missing: string[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [serverMissing, setServerMissing] = useState<string[] | null>(null);

  if (status !== "draft" && status !== "withdrawn") return null;

  const items = serverMissing ?? missing;
  const ready = items.length === 0;

  function activate() {
    setError(null);
    startTransition(async () => {
      const res = await setPropertyStatus(propertyId, "active");
      if (!res.ok) {
        setError(res.error ?? "Алдаа гарлаа.");
        if (res.missing) setServerMissing(res.missing);
        return;
      }
      setServerMissing(null);
      router.refresh();
    });
  }

  return (
    <Card>
      <CardBody className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-bold text-ink">Идэвхжүүлэлтийн босго (F-203)</h3>
          {ready ? (
            <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700">
              <CheckCircle2 className="size-4" /> Бэлэн
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-700">
              <CircleAlert className="size-4" /> {items.length} дутуу
            </span>
          )}
        </div>

        {ready ? (
          <p className="text-sm text-muted">Бүх шаардлага хангагдсан — листингийг идэвхжүүлж болно.</p>
        ) : (
          <ul className="space-y-1.5">
            {items.map((m) => (
              <li key={m} className="flex items-start gap-2 text-sm text-muted">
                <CircleAlert className="mt-0.5 size-4 shrink-0 text-amber-600" />
                {m}
              </li>
            ))}
          </ul>
        )}

        {error ? (
          <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</p>
        ) : null}

        <Button onClick={activate} disabled={pending} className="w-full">
          <Rocket className="size-4" />
          {pending ? "Идэвхжүүлж байна…" : "Идэвхтэй болгох"}
        </Button>
        <p className="text-xs text-subtle">
          Идэвхжимэгц урвуу тохируулга автоматаар ажиллаж, тохирох харилцагчийн жагсаалт үүснэ (Д-07, F-254).
        </p>
      </CardBody>
    </Card>
  );
}
