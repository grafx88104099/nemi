"use client";

import { fmtDateNum, fmtDateTime } from "@/lib/format";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Braces, History, Save } from "lucide-react";

import { Card, CardBody } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/components/ui/toast";
import { saveSetting } from "@/lib/actions/crm-settings";
import type { SettingVersionRow } from "@/lib/queries-crm-core";
import {
  buildSettingValue,
  settingValuesFrom,
  type SettingFormSpec,
  type SettingValues,
} from "@/lib/validation/crm-ownership";

/**
 * Хувилбартай параметрын засварлагч (D4, UX-11): бүтэцтэй маягт (хүрээ,
 * нийлбэрийн шалгалт, өмнөх утга) + «Нарийвчилсан» JSON. Шинэ утга бүр шинэ
 * хувилбар (update биш insert) — зөвхөн урагш үйлчилнэ.
 */
export function SettingEditor({
  settingKey,
  title,
  description,
  versions,
  canEdit,
  spec = null,
}: {
  settingKey: string;
  title: string;
  description?: string;
  versions: SettingVersionRow[];
  canEdit: boolean;
  spec?: SettingFormSpec | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const current = versions.find((v) => v.valid_to === null) ?? versions[0] ?? null;
  const previous = versions.find((v) => v.id !== current?.id) ?? null;
  const [mode, setMode] = useState<"form" | "json">(spec ? "form" : "json");
  const [values, setValues] = useState<SettingValues>(() => (spec ? settingValuesFrom(spec, current?.value) : {}));
  const [valueJson, setValueJson] = useState(() => (current ? JSON.stringify(current.value, null, 2) : ""));
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);

  const prevValues = useMemo(
    () => (spec && previous ? settingValuesFrom(spec, previous.value) : null),
    [spec, previous]
  );

  function onSave() {
    setError(null);
    let json = valueJson;
    if (mode === "form" && spec) {
      const built = buildSettingValue(spec, values, current?.value);
      if ("error" in built) {
        setError(built.error);
        return;
      }
      json = JSON.stringify(built.value);
    }
    startTransition(async () => {
      const res = await saveSetting({ key: settingKey, valueJson: json, note });
      if (!res.ok) {
        setError(res.error ?? "Алдаа гарлаа.");
        return;
      }
      toast.success("Шинэ хувилбар хадгалагдлаа", { description: "Одооноос эхлэн үйлчилнэ." });
      setNote("");
      router.refresh();
    });
  }

  const fields =
    spec?.kind === "scalar" ? [spec.field] : spec?.kind === "map" || spec?.kind === "toggle_map" ? spec.fields : [];
  const sum =
    spec?.kind === "map" && spec.sumTo != null
      ? fields.reduce((a, f) => a + (typeof values[f.name] === "number" ? (values[f.name] as number) : 0), 0)
      : null;

  return (
    <Card>
      <CardBody className="space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="font-bold text-ink">{title}</p>
            {description ? <p className="text-xs text-subtle">{description}</p> : null}
          </div>
          {current ? (
            <Badge tone="green">Хүчинтэй {fmtDateNum(current.valid_from)}-аас</Badge>
          ) : (
            <Badge tone="amber">Тохируулаагүй</Badge>
          )}
        </div>

        {mode === "form" && spec ? (
          <div className="space-y-3">
            {spec.kind === "toggle_map" ? (
              <label className="flex items-center gap-2 text-sm text-ink">
                <input
                  type="checkbox"
                  className="size-4"
                  checked={values[spec.toggle.name] === true}
                  disabled={!canEdit}
                  onChange={(e) => setValues((v) => ({ ...v, [spec.toggle.name]: e.target.checked }))}
                />
                {spec.toggle.label}
              </label>
            ) : null}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {fields.map((f) => {
                const prev = prevValues?.[f.name];
                return (
                  <label key={f.name} className="block space-y-1">
                    <span className="block text-sm font-medium text-ink">{f.label}</span>
                    <span className="flex items-center gap-2">
                      <Input
                        type="number"
                        inputMode="decimal"
                        min={f.min}
                        max={f.max}
                        step={f.step ?? 1}
                        value={typeof values[f.name] === "number" ? String(values[f.name]) : ""}
                        disabled={!canEdit}
                        onChange={(e) =>
                          setValues((v) => ({
                            ...v,
                            [f.name]: e.target.value === "" ? null : Number(e.target.value),
                          }))
                        }
                        className="h-10"
                      />
                      {f.unit ? <span className="text-xs text-subtle">{f.unit}</span> : null}
                    </span>
                    {typeof prev === "number" ? (
                      <span className="block text-xs text-subtle">Өмнөх хувилбар: {prev}</span>
                    ) : null}
                  </label>
                );
              })}
            </div>
            {sum != null && spec.kind === "map" ? (
              <p className={`text-xs ${sum === spec.sumTo ? "text-emerald-700" : "text-amber-700"}`}>
                Нийлбэр: {sum} / {spec.sumTo}
              </p>
            ) : null}
          </div>
        ) : (
          <textarea
            value={valueJson}
            onChange={(e) => setValueJson(e.target.value)}
            rows={Math.min(14, Math.max(4, valueJson.split("\n").length))}
            disabled={!canEdit}
            spellCheck={false}
            className="w-full rounded-xl border border-line bg-surface p-3 font-mono text-xs text-ink focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20 disabled:opacity-60"
            aria-label={`${title} — нарийвчилсан утга`}
          />
        )}

        <div className="flex flex-wrap items-center gap-2">
          {canEdit ? (
            <>
              <Input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Өөрчлөлтийн шалтгаан"
                className="h-9 max-w-xs text-xs"
                aria-label="Өөрчлөлтийн шалтгаан"
              />
              <Button size="sm" onClick={onSave} disabled={pending || (mode === "json" && !valueJson.trim())}>
                <Save className="size-4" /> Шинэ хувилбар хадгалах
              </Button>
            </>
          ) : (
            <p className="text-xs text-subtle">Зөвхөн харах эрхтэй.</p>
          )}
          {spec ? (
            <Button size="sm" variant="ghost" onClick={() => setMode((m) => (m === "form" ? "json" : "form"))}>
              <Braces className="size-4" /> {mode === "form" ? "Нарийвчилсан" : "Маягт"}
            </Button>
          ) : null}
          <Button size="sm" variant="ghost" onClick={() => setShowHistory((v) => !v)}>
            <History className="size-4" /> Түүх ({versions.length})
          </Button>
        </div>
        {error ? (
          <p role="alert" className="text-xs text-danger">
            {error}
          </p>
        ) : null}

        {showHistory ? (
          <div className="space-y-2 rounded-xl bg-surface-2 p-3">
            {versions.length === 0 ? (
              <p className="text-xs text-subtle">Түүх хоосон.</p>
            ) : (
              versions.map((v) => (
                <div key={v.id} className="rounded-lg border border-line bg-surface p-2">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                    <span className="text-muted">
                      {fmtDateTime(v.valid_from)} —{" "}
                      {v.valid_to ? fmtDateTime(v.valid_to) : "одоо"}
                    </span>
                    {v.note ? <span className="text-subtle">{v.note}</span> : null}
                  </div>
                  <pre className="mt-1 overflow-x-auto text-[11px] text-ink">{JSON.stringify(v.value, null, 2)}</pre>
                </div>
              ))
            )}
          </div>
        ) : null}
      </CardBody>
    </Card>
  );
}
