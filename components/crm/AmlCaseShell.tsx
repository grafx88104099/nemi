"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlarmClock, Download, Lock, ShieldAlert, ShieldCheck, Timer } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { BackLink } from "@/components/ui/back-link";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { Input, Field } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { Select } from "@/components/ui/select";
import { Tabs, TabPanel } from "@/components/ui/tabs";
import {
  setCaseStatus,
  decideStr,
  recordGateCheck,
  placeHold,
  releaseHold,
  upsertContactAml,
  assignCaseOfficer,
} from "@/lib/actions/crm-aml";
import type { AmlCaseRow, AmlCaseDetail, ActiveHoldRow, AmlAlertRow, AmlCounters } from "@/lib/queries-crm-aml";
import {
  AML_CASE_STATUSES,
  AML_CASE_STATUS_LABEL,
  KYC_STATUSES,
  KYC_STATUS_LABEL,
  GATES,
  GATE_LABEL,
  type AmlCaseStatus,
  type GateCode,
  type KycStatus,
  type CrmRole,
} from "@/lib/constants-crm";

/**
 * R-13 МУТСТ нийцлийн самбар + кейсийн хавтас (§7.5–7.6, Д-25/Д-26).
 * Зөвхөн aml_officer (бичих) + ceo (унших) — RLS/RPC давхар сахина.
 * Кейс/дохионы дэлгэцийн хандалт бүр аудитад (definer RPC — D7-5).
 */

function DueBadge({ due, kind }: { due: string | null; kind: "5d" | "24h" }) {
  // Рендерийн мөчийн «одоо» — нэг л удаа тогтооно (react purity).
  const [now] = useState(() => Date.now());
  if (!due) return null;
  const dueMs = new Date(due).getTime();
  const left = dueMs - now;
  const overdue = left < 0;
  const soon = !overdue && left < (kind === "5d" ? 86400000 : 6 * 3600000);
  return (
    <Badge tone={overdue ? "rose" : soon ? "amber" : "neutral"}>
      {kind === "5d" ? <AlarmClock className="size-3" /> : <Timer className="size-3" />}
      {kind === "5d" ? "СМА 5 өдөр: " : "СГТ 24ц: "}
      {kind === "5d" ? due.slice(0, 10) : new Date(due).toLocaleString("mn-MN")}
      {overdue && " — ХЭТЭРСЭН"}
    </Badge>
  );
}

// ════════════════════════════════════════════════════════════
// Жагсаалтын самбар (R-13)
// ════════════════════════════════════════════════════════════

export function AmlCaseShell({
  cases,
  alerts,
  holds,
  counters,
  statusFilter,
}: {
  cases: AmlCaseRow[];
  alerts: AmlAlertRow[];
  holds: ActiveHoldRow[];
  counters: AmlCounters;
  statusFilter?: AmlCaseStatus;
}) {
  const router = useRouter();
  const [tab, setTab] = useState("cases");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [releaseFor, setReleaseFor] = useState<string | null>(null);
  const [releaseReason, setReleaseReason] = useState("");

  function doRelease() {
    if (!releaseFor) return;
    startTransition(async () => {
      const res = await releaseHold(releaseFor, releaseReason);
      if (!res.ok) {
        setError(res.error ?? "Алдаа гарлаа.");
        return;
      }
      setReleaseFor(null);
      setReleaseReason("");
      router.refresh();
    });
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="flex items-center gap-2 text-2xl font-bold text-ink">
          <Lock className="size-6 text-rose-600" />
          МУТСТ нийцэл (R-13)
        </h1>
        <p className="text-sm text-muted">Хязгаарлагдмал бүс — хандалт бүр аудитад бүртгэгдэнэ.</p>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          { label: "Нээлттэй кейс", value: counters.openCases, tone: "text-ink" },
          { label: "5 өдрийн босго дөхсөн", value: counters.thresholdDueSoon, tone: "text-amber-600" },
          { label: "СГТ 24ц дөхсөн", value: counters.strDueSoon, tone: "text-rose-600" },
          { label: "Идэвхтэй hold", value: counters.activeHolds, tone: "text-rose-600" },
        ].map((c) => (
          <Card key={c.label}>
            <CardBody className="py-4">
              <p className={`text-2xl font-bold ${c.tone}`}>{c.value}</p>
              <p className="text-xs text-muted">{c.label}</p>
            </CardBody>
          </Card>
        ))}
      </div>

      <Tabs
        value={tab}
        onValueChange={setTab}
        items={[
          { value: "cases", label: `Кейс (${cases.length})` },
          { value: "alerts", label: `Шинэ дохио (${alerts.length})` },
          { value: "holds", label: `Hold (${holds.length})` },
        ]}
      />
      {error && <p className="text-sm text-danger">{error}</p>}

      <TabPanel when="cases" value={tab}>
        <div className="space-y-3">
          <Select
            className="w-48"
            value={statusFilter ?? ""}
            onChange={(e) =>
              router.push(`/office/crm/aml${e.target.value ? `?status=${e.target.value}` : ""}`)
            }
          >
            <option value="">Бүх төлөв</option>
            {AML_CASE_STATUSES.map((s) => (
              <option key={s} value={s}>
                {AML_CASE_STATUS_LABEL[s].label}
              </option>
            ))}
          </Select>
          {cases.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted">Кейс алга.</p>
          ) : (
            <ul className="divide-y divide-line rounded-2xl border border-line bg-surface">
              {cases.map((c) => (
                <li key={c.id}>
                  <Link href={`/office/crm/aml/${c.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-surface-2">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-ink">
                        {c.contact_name}
                        {c.transaction_number && <span className="text-muted"> · {c.transaction_number}</span>}
                      </p>
                      <p className="text-xs text-muted">
                        Дохио: {c.alert_count} · KYC: {KYC_STATUS_LABEL[c.kyc_public_status]?.label ?? "?"}
                        {c.amount_mnt != null && ` · ${Math.round(c.amount_mnt).toLocaleString()}₮`}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center justify-end gap-1.5">
                      <DueBadge due={c.threshold_due_on} kind="5d" />
                      <DueBadge due={c.str_due_at} kind="24h" />
                      {c.on_hold && (
                        <Badge tone="rose">
                          <ShieldAlert className="size-3" />
                          Hold
                        </Badge>
                      )}
                      <Badge tone={AML_CASE_STATUS_LABEL[c.status].tone}>
                        {AML_CASE_STATUS_LABEL[c.status].label}
                      </Badge>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </TabPanel>

      <TabPanel when="alerts" value={tab}>
        {alerts.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted">Кейст холбогдоогүй дохио алга.</p>
        ) : (
          <ul className="divide-y divide-line rounded-2xl border border-line bg-surface">
            {alerts.map((a) => (
              <li key={a.id} className="space-y-1 px-4 py-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone={a.alert_kind === "threshold" ? "amber" : "blue"}>
                    {a.alert_kind === "threshold" ? "Босго (Д-25)" : "Гараар"}
                  </Badge>
                  {a.urgent && <Badge tone="rose">Яаралтай</Badge>}
                  <span className="ml-auto text-xs text-subtle">
                    {new Date(a.detected_at).toLocaleString("mn-MN")}
                  </span>
                </div>
                <p className="text-sm text-ink">{a.observed ?? a.category ?? "—"}</p>
                {a.amount_mnt != null && (
                  <p className="text-xs text-muted">
                    {Math.round(a.amount_mnt).toLocaleString()}₮ · {a.payment_method ?? "?"}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </TabPanel>

      <TabPanel when="holds" value={tab}>
        {holds.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted">Идэвхтэй hold алга.</p>
        ) : (
          <ul className="divide-y divide-line rounded-2xl border border-line bg-surface">
            {holds.map((h) => (
              <li key={h.id} className="flex items-center gap-3 px-4 py-3">
                <ShieldAlert className="size-4 shrink-0 text-rose-600" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-ink">
                    {h.transaction_number ?? h.transaction_id}
                  </p>
                  <p className="text-xs text-muted">
                    {new Date(h.placed_at).toLocaleString("mn-MN")} · {h.rationale}
                  </p>
                </div>
                <Button variant="outline" size="sm" onClick={() => setReleaseFor(h.id)} disabled={pending}>
                  <ShieldCheck className="size-4" />
                  Суллах
                </Button>
              </li>
            ))}
          </ul>
        )}
      </TabPanel>

      <Modal
        open={!!releaseFor}
        onClose={() => setReleaseFor(null)}
        title="Hold суллах (§7.5)"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setReleaseFor(null)}>
              Болих
            </Button>
            <Button onClick={doRelease} disabled={pending || !releaseReason.trim()}>
              Суллах
            </Button>
          </div>
        }
      >
        <Field label="Суллах үндэслэл" hint="Суллалт бүр огноо + үндэслэлтэй аудитад бүртгэгдэнэ.">
          <Input value={releaseReason} onChange={(e) => setReleaseReason(e.target.value)} />
        </Field>
      </Modal>
    </div>
  );
}

// ════════════════════════════════════════════════════════════
// Кейсийн хавтас
// ════════════════════════════════════════════════════════════

const GATE_FIELDS: { key: string; label: string }[] = [
  { key: "kyc_status", label: "KYC-ийн төлөв" },
  { key: "risk_assessment", label: "Эрсдэлийн үнэлгээ" },
  { key: "pep_status", label: "УТНБЭ (PEP)-ийн төлөв" },
  { key: "sanctions_check", label: "Хориг арга хэмжээний шалгалт" },
  { key: "ubo", label: "Эцсийн өмчлөгч (UBO)" },
  { key: "funds_source", label: "Хөрөнгийн эх үүсвэр" },
  { key: "payment_form", label: "Төлбөрийн хэлбэр" },
  { key: "third_party", label: "Гуравдагч этгээд" },
  { key: "risk_flags", label: "Эрсдэлийн дохио" },
  { key: "decision", label: "Шийдвэр" },
  { key: "info_status", label: "Мэдээллийн төлөв" },
  { key: "next_check_on", label: "Дараагийн шалгалтын огноо" },
];

export function AmlCaseDetailShell({
  detail,
  roles,
}: {
  detail: AmlCaseDetail;
  roles: CrmRole[];
}) {
  const router = useRouter();
  const isOfficer = roles.includes("aml_officer");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const [closeOpen, setCloseOpen] = useState(false);
  const [decision, setDecision] = useState("no_report");
  const [rationale, setRationale] = useState("");

  const [strOpen, setStrOpen] = useState(false);
  const [strRationale, setStrRationale] = useState("");

  const [holdOpen, setHoldOpen] = useState(false);
  const [holdReason, setHoldReason] = useState("");

  const [gate, setGate] = useState<GateCode>("g4");
  const [gateValues, setGateValues] = useState<Record<string, string>>({});

  const [kyc, setKyc] = useState<KycStatus>(detail.contact_aml?.kyc_status ?? "pending");

  function run(fn: () => Promise<{ ok: boolean; error?: string }>, after?: () => void) {
    setError(null);
    startTransition(async () => {
      const res = await fn();
      if (!res.ok) {
        setError(res.error ?? "Алдаа гарлаа.");
        return;
      }
      after?.();
      router.refresh();
    });
  }

  function exportForm() {
    // F-611: СГТ/дотоод дохиоллын маягтын экспорт (СМА-ийн интеграци = INT- заглушка;
    // текст файлын экспорт + огнооны баталгаа).
    const lines = [
      "СГТ / ДОТООД ДОХИОЛЛЫН МАЯГТ (PMC CRM экспорт)",
      `Экспортын огноо: ${new Date().toISOString()}`,
      `Кейс: ${detail.id}`,
      `Төлөв: ${AML_CASE_STATUS_LABEL[detail.status].label}`,
      `Харилцагч: ${detail.contact?.display_name ?? "?"}`,
      `Хэлцэл: ${detail.transaction?.number ?? "—"} (${detail.transaction ? Math.round(detail.transaction.amount_mnt).toLocaleString() + "₮" : "—"})`,
      `Шийдвэр: ${detail.decision ?? "—"}`,
      `Үндэслэл: ${detail.decision_rationale ?? "—"}`,
      "",
      "Дохионууд:",
      ...detail.alerts.map(
        (a) =>
          `  • [${a.alert_kind}] ${new Date(a.detected_at).toLocaleString("mn-MN")} — ${a.observed ?? a.category ?? ""} (${a.amount_mnt != null ? Math.round(a.amount_mnt).toLocaleString() + "₮" : "—"}, ${a.payment_method ?? "—"})`
      ),
    ];
    const blob = new Blob([lines.join("\n")], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `aml-case-${detail.id.slice(0, 8)}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const statusMeta = AML_CASE_STATUS_LABEL[detail.status];
  const activeHolds = detail.holds.filter((h) => !h.released_at);

  return (
    <div className="space-y-5">
      <BackLink href="/office/crm/aml" label="МУТСТ самбар" />

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-bold text-ink">{detail.contact?.display_name ?? "Кейс"}</h1>
            <Badge tone={statusMeta.tone}>{statusMeta.label}</Badge>
            {activeHolds.length > 0 && (
              <Badge tone="rose">
                <ShieldAlert className="size-3" />
                Hold идэвхтэй
              </Badge>
            )}
          </div>
          <div className="flex flex-wrap gap-1.5">
            <DueBadge due={detail.threshold_due_on} kind="5d" />
            <DueBadge due={detail.str_due_at} kind="24h" />
          </div>
          {detail.transaction && (
            <p className="text-sm text-muted">
              Хэлцэл:{" "}
              <Link href={`/office/crm/transactions/${detail.transaction.id}`} className="text-brand-700 hover:underline">
                {detail.transaction.number}
              </Link>{" "}
              · {Math.round(detail.transaction.amount_mnt).toLocaleString()}₮
            </p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={exportForm}>
            <Download className="size-4" />
            Маягт экспорт (F-611)
          </Button>
          {isOfficer && detail.status === "open" && (
            <Button
              size="sm"
              onClick={() => run(() => setCaseStatus(detail.id, "investigating"))}
              disabled={pending}
            >
              Шалгалт эхлүүлэх
            </Button>
          )}
          {isOfficer && detail.status === "investigating" && (
            <>
              <Button size="sm" variant="secondary" onClick={() => setStrOpen(true)} disabled={pending}>
                СГТ шийдвэр (Д-26)
              </Button>
              {detail.decision === "str" && (
                <Button
                  size="sm"
                  onClick={() => run(() => setCaseStatus(detail.id, "str_sent", "str", detail.decision_rationale ?? "СГТ илгээсэн"))}
                  disabled={pending}
                >
                  СГТ илгээснийг бүртгэх
                </Button>
              )}
            </>
          )}
          {isOfficer && detail.status !== "closed" && (
            <Button size="sm" variant="outline" onClick={() => setCloseOpen(true)} disabled={pending}>
              Кейс хаах
            </Button>
          )}
          {isOfficer && !detail.officer_id && (
            <Button size="sm" variant="ghost" onClick={() => run(() => assignCaseOfficer(detail.id))} disabled={pending}>
              Өөртөө авах
            </Button>
          )}
        </div>
      </div>
      {error && <p className="text-sm text-danger">{error}</p>}

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Харилцагчийн МУТСТ бүртгэл */}
        <Card>
          <CardBody className="space-y-3">
            <h2 className="font-semibold text-ink">Харилцагчийн МУТСТ бүртгэл</h2>
            {detail.contact_aml ? (
              <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                <dt className="text-muted">KYC</dt>
                <dd className="text-ink">{KYC_STATUS_LABEL[detail.contact_aml.kyc_status]?.label}</dd>
                <dt className="text-muted">Эрсдэл</dt>
                <dd className="text-ink">{detail.contact_aml.risk ?? "—"} ({detail.contact_aml.risk_score ?? "—"})</dd>
                <dt className="text-muted">PEP</dt>
                <dd className="text-ink">{detail.contact_aml.pep_status ?? "—"}</dd>
                <dt className="text-muted">Хориг шалгалт</dt>
                <dd className="text-ink">{detail.contact_aml.sanctions_result ?? "—"}</dd>
                <dt className="text-muted">UBO</dt>
                <dd className="text-ink">{detail.contact_aml.ubo_verified ?? "—"}</dd>
                <dt className="text-muted">Эх үүсвэр</dt>
                <dd className="text-ink">{detail.contact_aml.funds_source ?? "—"}</dd>
              </dl>
            ) : (
              <p className="text-sm text-muted">Бүртгэл үүсээгүй.</p>
            )}
            {isOfficer && detail.contact && (
              <div className="flex items-end gap-2 border-t border-line pt-3">
                <div className="flex-1">
                  <label className="mb-1 block text-xs font-medium text-muted">KYC төлөв солих</label>
                  <Select value={kyc} onChange={(e) => setKyc(e.target.value as KycStatus)}>
                    {KYC_STATUSES.map((k) => (
                      <option key={k} value={k}>
                        {KYC_STATUS_LABEL[k].label}
                      </option>
                    ))}
                  </Select>
                </div>
                <Button
                  size="sm"
                  onClick={() =>
                    run(() => upsertContactAml({ contactId: detail.contact!.id, kycStatus: kyc }))
                  }
                  disabled={pending}
                >
                  Хадгалах
                </Button>
              </div>
            )}
          </CardBody>
        </Card>

        {/* Гейтийн шалгалтын бүртгэл (§7.3) */}
        <Card>
          <CardBody className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-ink">Гейтийн шалгалт (журмын 6.18)</h2>
              <Select className="w-40" value={gate} onChange={(e) => setGate(e.target.value as GateCode)}>
                {GATES.map((g) => (
                  <option key={g} value={g}>
                    {GATE_LABEL[g]}
                  </option>
                ))}
              </Select>
            </div>
            {detail.gate_checks?.[gate] != null && (
              <p className="text-xs text-emerald-600">Энэ гейтэд снапшот бүртгэгдсэн байна — шинээр хадгалбал шинэчлэгдэнэ.</p>
            )}
            {isOfficer ? (
              <>
                <div className="grid grid-cols-2 gap-2">
                  {GATE_FIELDS.map((f) => (
                    <div key={f.key}>
                      <label className="mb-0.5 block text-xs text-muted">{f.label}</label>
                      <Input
                        value={gateValues[f.key] ?? ""}
                        onChange={(e) => setGateValues((p) => ({ ...p, [f.key]: e.target.value }))}
                        className="h-9"
                      />
                    </div>
                  ))}
                </div>
                <Button
                  size="sm"
                  onClick={() =>
                    run(
                      () => recordGateCheck({ caseId: detail.id, gate, snapshot: gateValues }),
                      () => setGateValues({})
                    )
                  }
                  disabled={pending || Object.values(gateValues).every((v) => !v.trim())}
                >
                  Снапшот хадгалах
                </Button>
              </>
            ) : (
              <pre className="overflow-x-auto rounded-xl bg-surface-2 p-3 text-xs text-muted">
                {JSON.stringify(detail.gate_checks ?? {}, null, 2)}
              </pre>
            )}
          </CardBody>
        </Card>
      </div>

      {/* Дохионууд */}
      <Card>
        <CardBody className="space-y-3">
          <h2 className="font-semibold text-ink">Дохионууд ({detail.alerts.length})</h2>
          {detail.alerts.length === 0 ? (
            <p className="text-sm text-muted">Дохио алга.</p>
          ) : (
            <ul className="divide-y divide-line">
              {detail.alerts.map((a) => (
                <li key={a.id} className="space-y-1 py-2.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone={a.alert_kind === "threshold" ? "amber" : "blue"}>
                      {a.alert_kind === "threshold" ? "Босго (Д-25)" : "Гараар"}
                    </Badge>
                    {a.urgent && <Badge tone="rose">Яаралтай</Badge>}
                    <span className="ml-auto text-xs text-subtle">
                      {new Date(a.detected_at).toLocaleString("mn-MN")}
                    </span>
                  </div>
                  <p className="text-sm text-ink">{a.observed ?? a.category ?? "—"}</p>
                  {a.amount_mnt != null && (
                    <p className="text-xs text-muted">
                      {Math.round(a.amount_mnt).toLocaleString()}₮ · {a.payment_method ?? "?"}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>

      {/* Hold удирдлага */}
      <Card>
        <CardBody className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-ink">Hold — 5 үйлдлийн түгжээ (§7.5)</h2>
            {isOfficer && detail.transaction && activeHolds.length === 0 && (
              <Button size="sm" variant="danger" onClick={() => setHoldOpen(true)} disabled={pending}>
                <ShieldAlert className="size-4" />
                Hold тавих
              </Button>
            )}
          </div>
          {detail.holds.length === 0 ? (
            <p className="text-sm text-muted">Hold бүртгэл алга.</p>
          ) : (
            <ul className="divide-y divide-line">
              {detail.holds.map((h) => (
                <li key={h.id} className="flex items-center gap-3 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-ink">{h.rationale}</p>
                    <p className="text-xs text-muted">
                      Тавьсан: {new Date(h.placed_at).toLocaleString("mn-MN")}
                      {h.released_at &&
                        ` · Сулласан: ${new Date(h.released_at).toLocaleString("mn-MN")} (${h.release_rationale ?? ""})`}
                    </p>
                  </div>
                  <Badge tone={h.released_at ? "green" : "rose"}>{h.released_at ? "Суллагдсан" : "Идэвхтэй"}</Badge>
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>

      {detail.decision_rationale && (
        <Card>
          <CardBody>
            <h2 className="mb-1 font-semibold text-ink">Шийдвэрийн үндэслэл</h2>
            <p className="text-sm text-muted">
              {detail.decision ?? "—"}: {detail.decision_rationale}
            </p>
          </CardBody>
        </Card>
      )}

      {/* ── Модалууд ── */}
      <Modal
        open={strOpen}
        onClose={() => setStrOpen(false)}
        title="СГТ үүсгэх шийдвэр (Д-26)"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setStrOpen(false)}>
              Болих
            </Button>
            <Button
              onClick={() =>
                run(
                  () => decideStr(detail.id, strRationale),
                  () => setStrOpen(false)
                )
              }
              disabled={pending || !strRationale.trim()}
            >
              Шийдвэр бүртгэх (24ц тоолуур)
            </Button>
          </div>
        }
      >
        <Field
          label="Үндэслэл"
          hint="Шийдвэрийн мөчөөс СМА-д илгээх 24 цагийн хуулийн тоолуур эхэлнэ; дөхөхөд эскалацийн мэдэгдэл."
        >
          <Input value={strRationale} onChange={(e) => setStrRationale(e.target.value)} />
        </Field>
      </Modal>

      <Modal
        open={closeOpen}
        onClose={() => setCloseOpen(false)}
        title="Кейс хаах"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setCloseOpen(false)}>
              Болих
            </Button>
            <Button
              onClick={() =>
                run(
                  () => setCaseStatus(detail.id, "closed", decision, rationale),
                  () => setCloseOpen(false)
                )
              }
              disabled={pending || !rationale.trim()}
            >
              Хаах
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <Field label="Шийдвэр">
            <Select value={decision} onChange={(e) => setDecision(e.target.value)}>
              <option value="no_report">Мэдээлэхгүй (үндэслэлтэй)</option>
              <option value="str">СГТ илгээсэн</option>
              <option value="threshold_report">Босгын мэдээлэл илгээсэн</option>
              <option value="rejected">Харилцааг татгалзсан</option>
            </Select>
          </Field>
          <Field label="Шийдвэрийн үндэслэл" hint="Мэдээлэх/эс мэдээлэх үндэслэл нууц кейс хавтаст үлдэнэ (§7.6-5).">
            <Input value={rationale} onChange={(e) => setRationale(e.target.value)} />
          </Field>
        </div>
      </Modal>

      <Modal
        open={holdOpen}
        onClose={() => setHoldOpen(false)}
        title="Hold тавих (§7.5)"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setHoldOpen(false)}>
              Болих
            </Button>
            <Button
              variant="danger"
              onClick={() =>
                run(
                  () => placeHold(detail.transaction!.id, holdReason),
                  () => setHoldOpen(false)
                )
              }
              disabled={pending || !holdReason.trim()}
            >
              Hold тавих
            </Button>
          </div>
        }
      >
        <Field
          label="Үндэслэл"
          hint="Hold идэвхтэй үед: шат ахиулах, гэрээ, орлогын төлбөр/нэхэмжлэх, шимтгэл, хүлээлцэх — 5 үйлдэл түгжигдэнэ."
        >
          <Input value={holdReason} onChange={(e) => setHoldReason(e.target.value)} />
        </Field>
      </Modal>
    </div>
  );
}
