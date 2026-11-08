"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Save, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { toast } from "@/components/ui/toast";
import { saveBudget, saveKpiSetting } from "@/lib/actions/crm-budget";
import { shortMNT } from "@/lib/format";
import type { KpiTargets, QualitySettings } from "@/lib/crm/quality";
import type { BudgetRow } from "@/lib/queries-crm-kpi";

/**
 * Төсөв (§8.5(1)) ба KPI-ийн жишиг, чанарын аудитын тохиргоо, аяны зардал.
 * Утга бүр хувилбартай хадгалагдаж, зөвхөн урагш үйлчилнэ.
 */

const MONTHS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12"];

export function BudgetEditor({
  year,
  budgets,
  branches,
  canEdit,
}: {
  year: number;
  budgets: BudgetRow[];
  branches: { id: string; name: string }[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [branchId, setBranchId] = useState<string>("");
  const scoped = budgets.filter((b) => (b.branch_id ?? "") === branchId);
  const initial = Object.fromEntries(
    MONTHS.map((_, i) => {
      const key = `${year}-${String(i + 1).padStart(2, "0")}`;
      const row = scoped.find((b) => b.month.startsWith(key));
      return [key, row ? String(Math.round(row.amount)) : ""];
    })
  );
  const [values, setValues] = useState<Record<string, string>>(initial);
  const [scopeKey, setScopeKey] = useState(branchId);
  if (scopeKey !== branchId) {
    setScopeKey(branchId);
    setValues(initial);
  }

  function saveMonth(month: string) {
    const raw = values[month]?.replace(/[\s,]/g, "") ?? "";
    if (raw === "") return;
    const amount = Number(raw);
    if (!Number.isFinite(amount) || amount < 0) {
      toast.error("Төсөв 0-ээс багагүй тоо байна.");
      return;
    }
    start(async () => {
      const res = await saveBudget({ month, branchId: branchId || null, amount });
      if (!res.ok) {
        toast.error(res.error ?? "Хадгалж чадсангүй.");
        return;
      }
      toast.success(`${month.replace("-", " оны ")}-р сарын төсөв хадгалагдлаа`);
      router.refresh();
    });
  }

  const total = Object.values(values).reduce((s, v) => s + (Number(v.replace(/[\s,]/g, "")) || 0), 0);

  return (
    <Card>
      <CardBody>
        <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-ink">Орлогын төсөв — {year} он</h2>
            <p className="text-xs text-muted">
              Сар бүрийн хаагдсан орлогын төсөв (₮). Долоо хоногийн төсвийг сарын төсвөөс хоногоор хувааж тооцно.
            </p>
          </div>
          <div className="flex items-end gap-2">
            <form method="get" className="flex items-end gap-2">
              <label className="text-xs text-muted">
                Он
                <input
                  type="number"
                  name="year"
                  defaultValue={year}
                  min={2020}
                  max={2100}
                  className="mt-1 block h-10 w-24 rounded-xl border border-line bg-surface px-3 text-sm text-ink"
                />
              </label>
              <button type="submit" className="h-10 rounded-xl border border-line-strong px-3 text-sm font-semibold text-ink">
                Харах
              </button>
            </form>
            {branches.length > 0 && (
              <div className="w-44">
                <Select value={branchId} onChange={(e) => setBranchId(e.target.value)} aria-label="Хүрээ">
                  <option value="">Оффис бүхэлдээ</option>
                  {branches.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </Select>
              </div>
            )}
          </div>
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {MONTHS.map((m, i) => {
            const key = `${year}-${String(i + 1).padStart(2, "0")}`;
            const saved = scoped.find((b) => b.month.startsWith(key));
            const dirty = (values[key] ?? "") !== (saved ? String(Math.round(saved.amount)) : "");
            return (
              <div key={key} className="flex items-end gap-2 rounded-xl border border-line px-3 py-2">
                <div className="min-w-0 flex-1">
                  <label className="text-xs font-medium text-muted" htmlFor={`b-${key}`}>
                    {m}-р сар
                  </label>
                  <Input
                    id={`b-${key}`}
                    inputMode="numeric"
                    value={values[key] ?? ""}
                    disabled={!canEdit}
                    onChange={(e) => setValues({ ...values, [key]: e.target.value })}
                    placeholder="Төсөв оруулаагүй"
                    className="h-10"
                  />
                </div>
                {canEdit && (
                  <Button size="sm" variant={dirty ? "primary" : "ghost"} disabled={pending || !dirty} onClick={() => saveMonth(key)} aria-label="Хадгалах">
                    <Save className="size-4" />
                  </Button>
                )}
              </div>
            );
          })}
        </div>
        <p className="mt-3 text-sm text-muted">
          Жилийн нийт: <span className="font-semibold text-ink">{shortMNT(total)}</span>
          {!canEdit && " · Төсвийг CEO, Санхүү эсвэл Борлуулалт хариуцсан захирал засна."}
        </p>
      </CardBody>
    </Card>
  );
}

type NumField = { name: string; label: string; unit?: string; min: number; max: number; step?: number; nullable?: boolean };

function NumberSettingCard({
  title,
  description,
  settingKey,
  fields,
  value,
  canEdit,
}: {
  title: string;
  description: string;
  settingKey: string;
  fields: NumField[];
  value: Record<string, number | null>;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [form, setForm] = useState<Record<string, string>>(
    Object.fromEntries(fields.map((f) => [f.name, value[f.name] == null ? "" : String(value[f.name])]))
  );
  const [error, setError] = useState<string | null>(null);

  function save() {
    setError(null);
    const out: Record<string, number | null> = {};
    for (const f of fields) {
      const raw = (form[f.name] ?? "").replace(/[\s,]/g, "");
      if (raw === "") {
        if (f.nullable) {
          out[f.name] = null;
          continue;
        }
        setError(`«${f.label}» утгыг оруулна уу.`);
        return;
      }
      const n = Number(raw);
      if (!Number.isFinite(n) || n < f.min || n > f.max) {
        setError(`«${f.label}» ${f.min}–${f.max} хооронд байна.`);
        return;
      }
      out[f.name] = n;
    }
    start(async () => {
      const res = await saveKpiSetting({ key: settingKey, value: out });
      if (!res.ok) {
        setError(res.error ?? "Хадгалж чадсангүй.");
        return;
      }
      toast.success("Тохиргоо шинэ хувилбараар хадгалагдлаа");
      router.refresh();
    });
  }

  return (
    <Card>
      <CardBody>
        <h2 className="text-sm font-semibold text-ink">{title}</h2>
        <p className="mb-3 text-xs text-muted">{description}</p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {fields.map((f) => (
            <Field key={f.name} label={`${f.label}${f.unit ? ` (${f.unit})` : ""}`}>
              <Input
                inputMode="decimal"
                value={form[f.name] ?? ""}
                disabled={!canEdit}
                placeholder={f.nullable ? "Хоосон бол төсвөөс тооцно" : undefined}
                onChange={(e) => setForm({ ...form, [f.name]: e.target.value })}
              />
            </Field>
          ))}
        </div>
        {error && <p className="mt-3 rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}
        {canEdit ? (
          <div className="mt-3 flex justify-end">
            <Button size="sm" disabled={pending} onClick={save}>
              <Save className="size-4" /> Хадгалах
            </Button>
          </div>
        ) : (
          <p className="mt-3 text-xs text-subtle">Танд энэ тохиргоог өөрчлөх эрх алга.</p>
        )}
      </CardBody>
    </Card>
  );
}

export function KpiTargetsEditor({ value, canEdit }: { value: KpiTargets; canEdit: boolean }) {
  return (
    <NumberSettingCard
      title="KPI-ийн жишиг түвшин"
      description="Эргэн холбогдох ажиллагааны KPI-ийн жишиг, хангалттай урсгалын босго. Борлуулалт хариуцсан захирал тогтооно."
      settingKey="kpi_targets"
      canEdit={canEdit}
      value={value as unknown as Record<string, number | null>}
      fields={[
        { name: "next_step_coverage_pct", label: "Дараагийн үйлдлийн огноотой идэвхтэй сэжим", unit: "%", min: 0, max: 100 },
        { name: "overdue_max_pct", label: "Хугацаа хэтэрсэн эргэн холбогдолтын дээд", unit: "%", min: 0, max: 100 },
        { name: "showing_feedback_hours", label: "Үзлэгийн эргэх холбоо авах хугацаа", unit: "цаг", min: 1, max: 168 },
        { name: "showing_feedback_pct", label: "Хугацаандаа авсан үзлэгийн хариу", unit: "%", min: 0, max: 100 },
        { name: "offer_followup_pct", label: "Идэвхтэй үнийн саналын эргэн холбогдолт", unit: "%", min: 0, max: 100 },
        { name: "hot_lead_frequency_pct", label: "Халуун сэжмийн давтамж хангасан", unit: "%", min: 0, max: 100 },
        { name: "same_day_logging_pct", label: "Тухайн өдөрт нь бүртгэсэн", unit: "%", min: 0, max: 100 },
        {
          name: "sufficient_pipeline_mnt",
          label: "Хангалттай урсгалын босго — жинлэсэн хөлс",
          unit: "₮",
          min: 0,
          max: 1e13,
          nullable: true,
        },
      ]}
    />
  );
}

export function QualitySettingsEditor({ value, canEdit }: { value: QualitySettings; canEdit: boolean }) {
  return (
    <NumberSettingCard
      title="Чанарын аудитын тохиргоо"
      description="Түүврийн хэмжээ, шалгалтын хоног, тэнцэх оноо, урамшууллын хяналтын босго. Үйл ажиллагаа-ЧМТ тогтооно."
      settingKey="quality_audit"
      canEdit={canEdit}
      value={value as unknown as Record<string, number | null>}
      fields={[
        { name: "sample_per_criterion", label: "Шалгуур бүрээс авах бүртгэл", unit: "ш", min: 1, max: 200 },
        { name: "grade_review_days", label: "Ангилал шинэчлэх хугацаа", unit: "хоног", min: 1, max: 365 },
        { name: "profile_complete_pct", label: "Хэрэгцээний профайл бүрэн гэж тооцох", unit: "%", min: 0, max: 100 },
        { name: "showing_note_hours", label: "Үзлэгийн тэмдэглэл бөглөх хугацаа", unit: "цаг", min: 1, max: 720 },
        { name: "consent_grace_days", label: "Мэдээлэл ашиглах зөвшөөрөл асуух хугацаа", unit: "хоног", min: 0, max: 365 },
        { name: "fix_due_days", label: "Засах даалгаврын хугацаа", unit: "хоног", min: 1, max: 60 },
        { name: "pass_score", label: "Аудитын тэнцэх оноо", min: 0, max: 100 },
        { name: "commission_quality_min_pct", label: "Урамшууллыг хяналтад оруулах чанарын босго", unit: "%", min: 0, max: 100 },
      ]}
    />
  );
}

export function CostsEditor({
  title,
  description,
  settingKey,
  value,
  canEdit,
  codeLabel,
  options,
  anchor,
}: {
  title: string;
  description: string;
  settingKey: "campaign_costs" | "marketing_costs";
  value: Record<string, number>;
  canEdit: boolean;
  codeLabel: string;
  /** Сонгох код (эх сурвалжийн лавлах); байхгүй бол чөлөөт код. */
  options?: { code: string; label: string }[];
  anchor?: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [rows, setRows] = useState<{ code: string; amount: string }[]>(
    Object.entries(value).map(([code, amount]) => ({ code, amount: String(amount) }))
  );
  const [error, setError] = useState<string | null>(null);

  function save() {
    setError(null);
    const out: Record<string, number> = {};
    for (const r of rows) {
      const code = r.code.trim();
      if (!code) continue;
      const n = Number(r.amount.replace(/[\s,]/g, ""));
      if (!Number.isFinite(n) || n < 0) {
        setError(`«${code}»-ийн зардал 0-ээс багагүй тоо байна.`);
        return;
      }
      if (out[code] != null) {
        setError(`«${code}» давхардсан байна.`);
        return;
      }
      out[code] = n;
    }
    start(async () => {
      const res = await saveKpiSetting({ key: settingKey, value: out });
      if (!res.ok) {
        setError(res.error ?? "Хадгалж чадсангүй.");
        return;
      }
      toast.success("Зардал хадгалагдлаа");
      router.refresh();
    });
  }

  return (
    <Card>
      <CardBody>
        <div id={anchor} className="scroll-mt-24" />
        <h2 className="text-sm font-semibold text-ink">{title}</h2>
        <p className="mb-3 text-xs text-muted">{description}</p>
        <div className="space-y-2">
          {rows.length === 0 && <p className="text-sm text-subtle">Зардал оруулаагүй байна.</p>}
          {rows.map((r, i) => (
            <div key={i} className="flex items-end gap-2">
              <div className="min-w-0 flex-1">
                {options ? (
                  <Select
                    value={r.code}
                    disabled={!canEdit}
                    aria-label={codeLabel}
                    onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, code: e.target.value } : x)))}
                  >
                    <option value="">{codeLabel}…</option>
                    {options.map((o) => (
                      <option key={o.code} value={o.code}>
                        {o.label}
                      </option>
                    ))}
                  </Select>
                ) : (
                  <Input
                    value={r.code}
                    disabled={!canEdit}
                    aria-label={codeLabel}
                    placeholder={codeLabel}
                    onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, code: e.target.value } : x)))}
                  />
                )}
              </div>
              <div className="w-40">
                <Input
                  inputMode="numeric"
                  value={r.amount}
                  disabled={!canEdit}
                  aria-label="Зардал (₮)"
                  placeholder="₮"
                  onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, amount: e.target.value } : x)))}
                />
              </div>
              {canEdit && (
                <Button size="sm" variant="ghost" aria-label="Устгах" onClick={() => setRows(rows.filter((_, j) => j !== i))}>
                  <Trash2 className="size-4" />
                </Button>
              )}
            </div>
          ))}
        </div>
        {error && <p className="mt-3 rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}
        {canEdit && (
          <div className="mt-3 flex justify-between gap-2">
            <Button size="sm" variant="outline" onClick={() => setRows([...rows, { code: "", amount: "" }])}>
              <Plus className="size-4" /> Мөр нэмэх
            </Button>
            <Button size="sm" disabled={pending} onClick={save}>
              <Save className="size-4" /> Хадгалах
            </Button>
          </div>
        )}
      </CardBody>
    </Card>
  );
}
