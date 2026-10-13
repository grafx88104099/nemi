"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { History, Save } from "lucide-react";

import { Card, CardBody } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { saveCommissionConfig } from "@/lib/actions/crm-commissions";
import {
  COMMISSION_POLICY_CODES,
  COMMISSION_POLICY_LABEL,
  DEFAULT_POLICY_PAYLOADS,
  type CommissionPolicyCode,
} from "@/lib/crm/commission";
import type { CommissionConfigRow } from "@/lib/queries-crm-commissions";

/**
 * 5 журмын хувилбартай тохиргоо (crm_commission_config_versions, F-452/453):
 * журам бүрд нээлттэй хувилбарын payload-ыг JSON-оор засаж ШИНЭ хувилбар
 * үүсгэнэ (хуучин нь valid_to-оор хаагдана — өмнөх тооцоонд нөлөөлөхгүй).
 * Бичих эрх: сисадмин/ЧМТ (§1.2 тайлбар 3) — action + RLS давхар шалгана.
 */
export function CommissionConfigShell({
  configs,
  canEdit,
}: {
  configs: CommissionConfigRow[];
  canEdit: boolean;
}) {
  return (
    <div className="space-y-4">
      {COMMISSION_POLICY_CODES.map((code) => (
        <PolicyCard
          key={code}
          code={code}
          versions={configs.filter((c) => c.policy_code === code)}
          canEdit={canEdit}
        />
      ))}
    </div>
  );
}

function PolicyCard({
  code,
  versions,
  canEdit,
}: {
  code: CommissionPolicyCode;
  versions: CommissionConfigRow[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const current = versions.find((v) => v.valid_to === null) ?? null;
  const [payloadJson, setPayloadJson] = useState(() =>
    JSON.stringify(current?.payload ?? DEFAULT_POLICY_PAYLOADS[code], null, 2)
  );
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);

  function onSave() {
    setError(null);
    let payload: Record<string, unknown>;
    try {
      const parsed: unknown = JSON.parse(payloadJson);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        setError("Payload нь JSON объект байх ёстой.");
        return;
      }
      payload = parsed as Record<string, unknown>;
    } catch {
      setError("JSON бичиглэл буруу байна.");
      return;
    }
    startTransition(async () => {
      const res = await saveCommissionConfig({ policyCode: code, payload, note: note || undefined });
      if (res.error) {
        setError(res.error);
        return;
      }
      setNote("");
      router.refresh();
    });
  }

  return (
    <Card>
      <CardBody className="space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="font-bold text-ink">{COMMISSION_POLICY_LABEL[code]}</p>
            <p className="text-xs text-subtle">
              журам: <code className="rounded bg-surface-2 px-1">{code}</code>
            </p>
          </div>
          {current ? (
            <Badge tone="green">
              Хүчинтэй {new Date(current.valid_from).toLocaleDateString("mn-MN")}-аас
            </Badge>
          ) : (
            <Badge tone="amber">Тохируулаагүй — эхний тооцоонд default хувилбар автоматаар үүснэ</Badge>
          )}
        </div>

        <textarea
          value={payloadJson}
          onChange={(e) => setPayloadJson(e.target.value)}
          rows={Math.min(18, Math.max(4, payloadJson.split("\n").length))}
          disabled={!canEdit}
          spellCheck={false}
          className="w-full rounded-xl border border-line bg-surface p-3 font-mono text-xs text-ink focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20 disabled:opacity-60"
          aria-label={`${COMMISSION_POLICY_LABEL[code]} — payload JSON`}
        />

        {canEdit ? (
          <div className="flex flex-wrap items-center gap-2">
            <Input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Өөрчлөлтийн тайлбар (сонголтоор)"
              className="h-9 max-w-xs text-xs"
            />
            <Button size="sm" onClick={onSave} disabled={pending || !payloadJson.trim()}>
              <Save className="size-4" /> Шинэ хувилбар хадгалах
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setShowHistory((v) => !v)}>
              <History className="size-4" /> Түүх ({versions.length})
            </Button>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <p className="text-xs text-subtle">Зөвхөн харах эрхтэй (бичих: сисадмин/ЧМТ).</p>
            <Button size="sm" variant="ghost" onClick={() => setShowHistory((v) => !v)}>
              <History className="size-4" /> Түүх ({versions.length})
            </Button>
          </div>
        )}
        {error ? <p className="text-xs text-danger">{error}</p> : null}

        {showHistory ? (
          <div className="space-y-2 rounded-xl bg-surface-2 p-3">
            {versions.length === 0 ? (
              <p className="text-xs text-subtle">Түүх хоосон.</p>
            ) : (
              versions.map((v) => (
                <div key={v.id} className="rounded-lg border border-line bg-surface p-2">
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <span className="text-muted">
                      {new Date(v.valid_from).toLocaleString("mn-MN")} —{" "}
                      {v.valid_to ? new Date(v.valid_to).toLocaleString("mn-MN") : "одоо"}
                    </span>
                  </div>
                  <pre className="mt-1 overflow-x-auto text-[11px] text-ink">
                    {JSON.stringify(v.payload, null, 2)}
                  </pre>
                </div>
              ))
            )}
          </div>
        ) : null}
      </CardBody>
    </Card>
  );
}
