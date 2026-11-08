"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ClipboardCheck, Plus } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { Select } from "@/components/ui/select";
import { toast } from "@/components/ui/toast";
import { startQualityAudit } from "@/lib/actions/crm-quality";
import { AUDIT_SCOPE_LABEL, AUDIT_STATUS_LABEL } from "@/lib/crm/quality";
import type { AuditScopeOptions, QualityAuditRow } from "@/lib/queries-crm-kpi";

/**
 * Чанарын аудитын жагсаалт (§6.29): Үйл ажиллагаа-ЧМТ хугацаа, хүрээ
 * сонгож аудит эхлүүлнэ — систем 12 шалгуур бүрээс санамсаргүй түүвэр
 * гаргаж, автомат дүнг тавина; аудитор мөр бүрийг баталж оноо гаргана.
 */
export function AuditListShell({
  audits,
  canRun,
  scopes,
  defaultSample,
  defaultFrom,
  defaultTo,
  passScore,
}: {
  audits: QualityAuditRow[];
  canRun: boolean;
  scopes: AuditScopeOptions;
  defaultSample: number;
  defaultFrom: string;
  defaultTo: string;
  passScore: number;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [form, setForm] = useState({
    from: defaultFrom,
    to: defaultTo,
    scope: "office" as "office" | "branch" | "agent",
    branchId: "",
    agentId: "",
    sample: String(defaultSample),
  });
  const [error, setError] = useState<string | null>(null);

  function submit() {
    setError(null);
    start(async () => {
      const res = await startQualityAudit({
        periodStart: form.from,
        periodEnd: form.to,
        scope: form.scope,
        branchId: form.scope === "branch" ? form.branchId || null : null,
        agentId: form.scope === "agent" ? form.agentId || null : null,
        sample: Number(form.sample) || null,
      });
      if (res.error || !res.id) {
        setError(res.error ?? "Аудит эхлүүлж чадсангүй.");
        return;
      }
      toast.success("Аудитын түүвэр бэлэн боллоо");
      setOpen(false);
      router.push(`/office/crm/quality/${res.id}`);
    });
  }

  return (
    <div className="mt-5 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted">
          Аудитын тэнцэх оноо: <span className="font-semibold text-ink">{passScore}</span>. Тэнцээгүй мөр бүрт засах
          даалгавар оноож, хариуцагч агент ба багийн ахлагчид мэдэгдэнэ.
        </p>
        {canRun && (
          <Button size="sm" onClick={() => setOpen(true)}>
            <Plus className="size-4" /> Аудит эхлүүлэх
          </Button>
        )}
      </div>

      {audits.length === 0 ? (
        <EmptyState
          icon={ClipboardCheck}
          title="Чанарын аудит хийгдээгүй байна"
          description={
            canRun
              ? "Хугацаа, хүрээгээ сонгож аудит эхлүүлбэл 12 шалгуур бүрээс түүвэр гарч, автомат шалгалтын дүн бэлэн болно."
              : "Үйл ажиллагаа-ЧМТ аудит хийсний дараа дүн энд харагдана."
          }
          action={canRun ? { label: "Аудит эхлүүлэх", onClick: () => setOpen(true) } : undefined}
        />
      ) : (
        <div className="grid gap-3">
          {audits.map((a) => {
            const st = AUDIT_STATUS_LABEL[a.status] ?? { label: a.status, tone: "neutral" as const };
            return (
              <Link key={a.id} href={`/office/crm/quality/${a.id}`} className="group">
                <Card className="transition group-hover:border-brand-300">
                  <CardBody>
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-semibold text-ink">
                          {a.period_start.replaceAll("-", ".")} – {a.period_end.replaceAll("-", ".")}
                        </p>
                        <p className="text-xs text-muted">
                          {AUDIT_SCOPE_LABEL[a.scope] ?? "Хүрээ"}
                          {a.scope_label ? `: ${a.scope_label}` : ""} · Аудитор: {a.auditor_name ?? "—"} · шалгуур
                          бүрээс {a.sample_per_criterion} хүртэл бүртгэл
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        {a.score != null && (
                          <span
                            className={
                              "text-xl font-extrabold tabular-nums " + (a.score >= passScore ? "text-emerald-700" : "text-danger")
                            }
                          >
                            {a.score}
                          </span>
                        )}
                        <Badge tone={st.tone}>{st.label}</Badge>
                      </div>
                    </div>
                  </CardBody>
                </Card>
              </Link>
            );
          })}
        </div>
      )}

      <Modal open={open} onClose={() => setOpen(false)} title="Чанарын аудит эхлүүлэх">
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Хугацааны эхлэл">
              <Input type="date" value={form.from} onChange={(e) => setForm({ ...form, from: e.target.value })} />
            </Field>
            <Field label="Хугацааны төгсгөл">
              <Input type="date" value={form.to} onChange={(e) => setForm({ ...form, to: e.target.value })} />
            </Field>
          </div>
          <Field label="Хүрээ">
            <Select
              value={form.scope}
              onChange={(e) => setForm({ ...form, scope: e.target.value as "office" | "branch" | "agent" })}
            >
              <option value="office">Оффис бүхэлдээ</option>
              <option value="branch" disabled={!scopes.branches.length}>
                Салбар
              </option>
              <option value="agent" disabled={!scopes.agents.length}>
                Агент
              </option>
            </Select>
          </Field>
          {form.scope === "branch" && (
            <Field label="Салбар">
              <Select value={form.branchId} onChange={(e) => setForm({ ...form, branchId: e.target.value })}>
                <option value="">Сонгох…</option>
                {scopes.branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </Select>
            </Field>
          )}
          {form.scope === "agent" && (
            <Field label="Агент">
              <Select value={form.agentId} onChange={(e) => setForm({ ...form, agentId: e.target.value })}>
                <option value="">Сонгох…</option>
                {scopes.agents.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </Select>
            </Field>
          )}
          <Field label="Шалгуур бүрээс авах бүртгэлийн тоо" hint="Тохиргооны анхдагч утга санал болгогдсон">
            <Input
              type="number"
              min={1}
              max={200}
              value={form.sample}
              onChange={(e) => setForm({ ...form, sample: e.target.value })}
            />
          </Field>
          <p className="text-xs text-muted">
            Үзлэг, үнийн санал, алдсан боломж, хэлцлийг сонгосон хугацаанд болсноор нь; эзэмшигч, дараагийн үйлдэл,
            ангилал зэрэг төлөвийн шалгуурыг одоогийн байдлаар нь түүвэрлэнэ.
          </p>
          {error && <p className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Болих
            </Button>
            <Button disabled={pending || !form.from || !form.to} onClick={submit}>
              {pending ? "Түүвэрлэж байна…" : "Эхлүүлэх"}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
