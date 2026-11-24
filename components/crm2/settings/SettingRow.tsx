"use client";

import * as React from "react";
import { AlertTriangle, Info, Lock, Plus, RotateCcw, X } from "lucide-react";

import { cn } from "@/lib/utils";
import { fmtDateTime } from "@/lib/format";
import { CRM2_SETTING_LABEL, type Crm2SettingKey } from "@/lib/crm2/settings";
import {
  SETTING_CODE_RE,
  isDefaultSetting,
  normalizeSettingValue,
  sameSettingValue,
  settingEditor,
  settingValueText,
  validateSettingValue,
  type SettingEditor,
} from "@/lib/crm2/settings-policies";
import { resetCrm2Setting, setCrm2Setting } from "@/lib/crm2/actions/settings";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";
import { ConfirmDialog } from "@/components/crm2/ui";

import { CategoryHintsEditor } from "./CategoryHintsEditor";
import { CommissionDefaultsEditor } from "./CommissionDefaultsEditor";
import { StaffPickerEditor } from "./StaffPickerEditor";
import {
  commissionRowError,
  readCommissionRow,
  staffPickerView,
  staffRowText,
  type SettingNote,
  type StaffOption,
} from "./editor-model";

/**
 * Нэг тохиргооны мөр: нэр, тайлбар, утгын төрөлд тохирсон засварлагч, хадгалах /
 * анхдагч руу буцаах. Засах эрхгүй бол утгыг текстээр харуулна. Эцсийн шалгалт DB-д.
 * Утсанд: товч, сонголт ≥ 44px, оруулах талбар 16px (iOS томруулахгүй).
 */

/** Зарим засварлагчид серверээс дамжуулах өгөгдөл (сериализлагдах). */
export type SettingRowContext = {
  /** staff.quick_add_pilot — оффисын идэвхтэй ажилтан (crm2_staff_directory). */
  staff?: StaffOption[];
  /** Оффисын ангиллын нэр (property.category_labels). */
  categoryLabels?: Partial<Record<string, string>>;
};

export type SettingRowProps = {
  settingKey: Crm2SettingKey;
  description: string;
  value: unknown;
  defaultValue: unknown;
  override: { updatedAt: string; updatedByName: string | null } | null;
  canEdit: boolean;
  lockReason: string | null;
  context?: SettingRowContext;
  /** Мөрийн доорх тэмдэглэл, сануулга (тохиргооны хоорондын хамаарал). */
  notes?: SettingNote[];
};

export function SettingRow({
  settingKey,
  description,
  value,
  defaultValue,
  override,
  canEdit,
  lockReason,
  context,
  notes,
}: SettingRowProps) {
  const ed = settingEditor(settingKey);
  const label = CRM2_SETTING_LABEL[settingKey];
  const [draft, setDraft] = React.useState<unknown>(value);
  const [prevValue, setPrevValue] = React.useState<unknown>(value);
  if (value !== prevValue) {
    setPrevValue(value);
    setDraft(value);
  }
  const [pending, startTransition] = React.useTransition();
  const [resetOpen, setResetOpen] = React.useState(false);

  const normalized = normalizeSettingValue(settingKey, draft);
  const dirty = !sameSettingValue(settingKey, normalized, value);
  const error = dirty ? validateSettingValue(settingKey, normalized) : null;
  const isDefault = isDefaultSetting(settingKey, value);
  // Шимтгэлийн мөр бүр алдаагаа доороо харуулна — давхар (кодтой) текст гаргахгүй.
  const inlineErrors =
    ed.kind === "commissionDefaults" &&
    !!normalized &&
    typeof normalized === "object" &&
    Object.values(normalized as Record<string, unknown>).some((v) => !!commissionRowError(readCommissionRow(v)));

  function save() {
    if (!dirty || error) return;
    startTransition(async () => {
      const r = await setCrm2Setting(settingKey, normalized);
      if (!r.ok) toast.error(r.error);
      else toast.success(`«${label}» хадгалагдлаа`);
    });
  }

  return (
    <div id={`setting-${settingKey}`} className="scroll-mt-28 border-t border-line py-4 first:border-t-0 first:pt-0 last:pb-0">
      <div className="flex flex-col gap-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <h3 className="font-semibold text-ink">{label}</h3>
          {override ? (
            <Badge tone="amber" className="font-medium">
              Өөрчилсөн
            </Badge>
          ) : (
            <Badge tone="neutral" className="font-medium">
              Анхдагч
            </Badge>
          )}
          {!canEdit ? <Lock className="size-3.5 text-subtle" aria-label="Засах эрхгүй" /> : null}
        </div>
        <p className="text-sm text-muted">{description}</p>
        {override ? (
          <p className="text-xs text-subtle">
            {override.updatedByName ?? "Ажилтан"} · {fmtDateTime(override.updatedAt)}
          </p>
        ) : null}
      </div>

      <div className="mt-3">
        {canEdit ? (
          <Editor ed={ed} settingKey={settingKey} value={draft} onChange={setDraft} disabled={pending} context={context} />
        ) : (
          <p className="break-words rounded-xl bg-surface-2 px-3 py-2 text-sm text-ink">{readOnlyText(settingKey, value, context)}</p>
        )}
      </div>

      {notes?.length ? (
        <ul className="mt-2 space-y-1.5">
          {notes.map((n) => (
            <li
              key={n.text}
              className={cn(
                "flex items-start gap-2 rounded-xl px-3 py-2 text-sm",
                n.tone === "warn" ? "border border-amber-200 bg-amber-50 text-amber-800" : "bg-surface-2 text-muted"
              )}
            >
              {n.tone === "warn" ? (
                <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
              ) : (
                <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
              )}
              <span>{n.text}</span>
            </li>
          ))}
        </ul>
      ) : null}

      {error && !inlineErrors ? (
        <p role="alert" className="mt-2 text-sm text-danger">
          {error}
        </p>
      ) : null}
      {!canEdit && lockReason ? <p className="mt-1.5 text-xs text-muted">{lockReason}</p> : null}
      {!isDefault ? (
        <p className="mt-1.5 text-xs text-muted">Анхдагч: {settingValueText(settingKey, defaultValue)}</p>
      ) : null}

      {canEdit && (dirty || override) ? (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {dirty ? (
            <>
              <Button type="button" size="touch" onClick={save} disabled={pending || !!error}>
                {pending ? "Хадгалж байна…" : "Хадгалах"}
              </Button>
              <Button type="button" size="touch" variant="ghost" onClick={() => setDraft(value)} disabled={pending}>
                Болих
              </Button>
            </>
          ) : null}
          {override && !dirty ? (
            <Button type="button" size="touch" variant="outline" onClick={() => setResetOpen(true)} disabled={pending}>
              <RotateCcw className="size-4" aria-hidden />
              Анхдагч руу буцаах
            </Button>
          ) : null}
        </div>
      ) : null}

      <ConfirmDialog
        open={resetOpen}
        onClose={() => setResetOpen(false)}
        title="Анхдагч утга руу буцаах уу?"
        description={`«${label}» анхдагч утгаараа ажиллана: ${settingValueText(settingKey, defaultValue)}`}
        confirmLabel="Буцаах"
        onConfirm={async () => {
          const r = await resetCrm2Setting(settingKey);
          if (!r.ok) return r.error;
          toast.success(`«${label}» анхдагч утгадаа буцлаа`);
          return null;
        }}
      />
    </div>
  );
}

// ── Засварлагчид ───────────────────────────────────────────────────────────

type EditorProps = {
  ed: SettingEditor;
  settingKey: Crm2SettingKey;
  value: unknown;
  onChange: (v: unknown) => void;
  disabled: boolean;
  context?: SettingRowContext;
};

/** Зөвхөн унших горимын текст: туршилтын агентуудыг нэрээр нь. */
function readOnlyText(key: Crm2SettingKey, value: unknown, context: SettingRowContext | undefined): string {
  if (settingEditor(key).kind === "staffPicker" && Array.isArray(value) && value.length && context?.staff) {
    const ids = value.filter((x): x is string => typeof x === "string");
    return staffPickerView(context.staff, ids, "")
      .selected.map((r) => staffRowText(r.name, r.team))
      .join(", ");
  }
  return settingValueText(key, value);
}

function Editor(props: EditorProps) {
  switch (props.ed.kind) {
    case "boolean":
      return <BooleanEditor {...props} />;
    case "number":
      return <NumberEditor {...props} ed={props.ed} />;
    case "numberList":
      return <NumberListEditor {...props} ed={props.ed} />;
    case "choice":
      return <ChoiceEditor {...props} ed={props.ed} />;
    case "multi":
      return <MultiEditor {...props} ed={props.ed} />;
    case "stringList":
      return <StringListEditor {...props} ed={props.ed} />;
    case "codeLabel":
      return <CodeLabelEditor {...props} ed={props.ed} />;
    case "staffPicker":
      return (
        <StaffPickerEditor
          value={props.value}
          onChange={props.onChange}
          staff={props.context?.staff ?? []}
          maxItems={props.ed.maxItems}
          label={CRM2_SETTING_LABEL[props.settingKey]}
          disabled={props.disabled}
        />
      );
    case "commissionDefaults":
      return (
        <CommissionDefaultsEditor
          value={props.value}
          onChange={props.onChange}
          categoryLabels={props.context?.categoryLabels}
          disabled={props.disabled}
        />
      );
    case "categoryHints":
      return (
        <CategoryHintsEditor
          value={props.value}
          onChange={props.onChange}
          maxLabel={props.ed.maxLabel}
          categoryLabels={props.context?.categoryLabels}
          disabled={props.disabled}
        />
      );
  }
}

function BooleanEditor({ settingKey, value, onChange, disabled }: EditorProps) {
  const on = value === true;
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={CRM2_SETTING_LABEL[settingKey]}
      disabled={disabled}
      onClick={() => onChange(!on)}
      className="inline-flex min-h-11 items-center gap-3 rounded-xl py-1 pr-2 text-sm font-medium text-ink disabled:opacity-50"
    >
      <span className={cn("relative inline-flex h-6 w-11 shrink-0 rounded-full transition", on ? "bg-brand-500" : "bg-line-strong")}>
        <span
          className={cn(
            "absolute top-0.5 size-5 rounded-full bg-white shadow transition-all",
            on ? "left-[1.375rem]" : "left-0.5"
          )}
        />
      </span>
      {on ? "Тийм" : "Үгүй"}
    </button>
  );
}

function NumberEditor({ ed, settingKey, value, onChange, disabled }: EditorProps & { ed: Extract<SettingEditor, { kind: "number" }> }) {
  const id = React.useId();
  return (
    <div className="flex items-center gap-2">
      <Input
        id={id}
        type="number"
        inputMode="numeric"
        min={ed.min}
        max={ed.max}
        step={1}
        value={typeof value === "number" && Number.isFinite(value) ? String(value) : ""}
        onChange={(e) => onChange(e.target.value === "" ? Number.NaN : Number(e.target.value))}
        disabled={disabled}
        aria-label={CRM2_SETTING_LABEL[settingKey]}
        className="w-32 text-base sm:text-sm"
      />
      <span className="text-sm text-muted">
        {ed.unit} <span className="text-xs text-subtle">({ed.min}–{ed.max})</span>
      </span>
    </div>
  );
}

function NumberListEditor({ ed, value, onChange, disabled }: EditorProps & { ed: Extract<SettingEditor, { kind: "numberList" }> }) {
  const list = Array.isArray(value) ? (value as number[]) : [];
  const [text, setText] = React.useState("");
  const sorted = [...list].sort((a, b) => b - a);
  function add() {
    const n = Number(text.trim());
    if (text.trim() === "" || !Number.isFinite(n)) return;
    if (!list.includes(n)) onChange([...list, n]);
    setText("");
  }
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {sorted.length === 0 ? <span className="text-sm text-muted">Сануулахгүй</span> : null}
        {sorted.map((n) => (
          <span key={n} className="inline-flex items-center gap-1 rounded-full border border-line bg-surface-2 py-0.5 pl-3 pr-1 text-sm">
            {n} {ed.unit}
            <button
              type="button"
              aria-label={`${n} ${ed.unit} хасах`}
              disabled={disabled}
              onClick={() => onChange(list.filter((x) => x !== n))}
              className="-my-2 inline-flex size-10 items-center justify-center rounded-full text-muted hover:bg-surface hover:text-ink sm:my-0 sm:size-6"
            >
              <X className="size-3.5" aria-hidden />
            </button>
          </span>
        ))}
      </div>
      <div className="flex items-center gap-2">
        <Input
          type="number"
          inputMode="numeric"
          min={ed.min}
          max={ed.max}
          step={1}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
          placeholder={`${ed.min}–${ed.max}`}
          aria-label="Хоног нэмэх"
          disabled={disabled}
          className="w-28 text-base sm:text-sm"
        />
        <Button type="button" variant="outline" size="touch" onClick={add} disabled={disabled || text.trim() === ""}>
          <Plus className="size-4" aria-hidden />
          Нэмэх
        </Button>
      </div>
    </div>
  );
}

function ChoiceEditor({ ed, settingKey, value, onChange, disabled }: EditorProps & { ed: Extract<SettingEditor, { kind: "choice" }> }) {
  const name = React.useId();
  return (
    <div role="radiogroup" aria-label={CRM2_SETTING_LABEL[settingKey]} className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
      {ed.options.map((o) => (
        <label
          key={o.value}
          className={cn(
            "flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border px-3 py-2 text-sm transition",
            value === o.value ? "border-brand-500 bg-brand-50 text-brand-800" : "border-line bg-surface text-ink hover:bg-surface-2"
          )}
        >
          <input
            type="radio"
            name={name}
            value={o.value}
            checked={value === o.value}
            onChange={() => onChange(o.value)}
            disabled={disabled}
            className="size-4"
          />
          {o.label}
        </label>
      ))}
    </div>
  );
}

function MultiEditor({ ed, value, onChange, disabled }: EditorProps & { ed: Extract<SettingEditor, { kind: "multi" }> }) {
  const list = Array.isArray(value) ? (value as string[]) : [];
  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
      {ed.options.map((o) => {
        const checked = list.includes(o.value);
        const forbidden = ed.forbidden.includes(o.value);
        return (
          <label
            key={o.value}
            className={cn(
              "flex min-h-11 items-center gap-2 rounded-xl border px-3 py-2 text-sm transition",
              forbidden ? "cursor-not-allowed border-line bg-surface-2 text-subtle" : "cursor-pointer",
              !forbidden && checked ? "border-brand-500 bg-brand-50 text-brand-800" : "",
              !forbidden && !checked ? "border-line bg-surface text-ink hover:bg-surface-2" : ""
            )}
            title={forbidden ? "Энэ дүрд энэ эрхийг олгохгүй" : undefined}
          >
            <input
              type="checkbox"
              checked={checked}
              disabled={disabled || (forbidden && !checked)}
              onChange={(e) => onChange(e.target.checked ? [...list, o.value] : list.filter((x) => x !== o.value))}
              className="size-4 rounded border-line"
            />
            {o.label}
          </label>
        );
      })}
    </div>
  );
}

function StringListEditor({ ed, value, onChange, disabled }: EditorProps & { ed: Extract<SettingEditor, { kind: "stringList" }> }) {
  const list = Array.isArray(value) ? (value as string[]) : [];
  const [text, setText] = React.useState("");
  function add() {
    const t = text.trim();
    if (!t) return;
    onChange([...list, t]);
    setText("");
  }
  return (
    <div className="space-y-2">
      <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {list.map((item, i) => (
          <li key={i} className="flex items-center gap-1">
            <Input
              value={item}
              maxLength={ed.maxLength}
              onChange={(e) => onChange(list.map((x, j) => (j === i ? e.target.value : x)))}
              disabled={disabled}
              aria-label={`${i + 1}-р утга`}
              className="h-11 text-base sm:h-10 sm:text-sm"
            />
            <button
              type="button"
              aria-label={`«${item}» хасах`}
              disabled={disabled}
              onClick={() => onChange(list.filter((_, j) => j !== i))}
              className="inline-flex size-11 shrink-0 sm:size-10 items-center justify-center rounded-lg text-muted hover:bg-surface-2 hover:text-ink"
            >
              <X className="size-4" aria-hidden />
            </button>
          </li>
        ))}
      </ul>
      <div className="flex items-center gap-2">
        <Input
          value={text}
          maxLength={ed.maxLength}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
          placeholder="Шинэ утга"
          aria-label="Шинэ утга нэмэх"
          disabled={disabled || list.length >= ed.maxItems}
          className="h-11 text-base sm:h-10 sm:max-w-xs sm:text-sm"
        />
        <Button type="button" variant="outline" size="touch" onClick={add} disabled={disabled || !text.trim() || list.length >= ed.maxItems}>
          <Plus className="size-4" aria-hidden />
          Нэмэх
        </Button>
      </div>
    </div>
  );
}

function CodeLabelEditor({ ed, value, onChange, disabled }: EditorProps & { ed: Extract<SettingEditor, { kind: "codeLabel" }> }) {
  const map = value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, string>) : {};
  const entries = Object.entries(map);
  const [code, setCode] = React.useState("");
  const [name, setName] = React.useState("");
  const codeTrim = code.trim();
  const codeError =
    codeTrim && !SETTING_CODE_RE.test(codeTrim)
      ? "Код латин жижиг үсгээр эхэлж, жижиг үсэг, тоо, «_» агуулна."
      : codeTrim in map
        ? "Ийм код аль хэдийн байна."
        : null;
  function add() {
    if (!codeTrim || !name.trim() || codeError) return;
    onChange({ ...map, [codeTrim]: name });
    setCode("");
    setName("");
  }
  const canAdd = !ed.fixedCodes && entries.length < ed.maxItems;
  return (
    <div className="space-y-2">
      <ul className="space-y-2">
        {entries.map(([k, v]) => {
          const locked = !!ed.fixedCodes || ed.requiredCodes.includes(k);
          return (
            <li key={k} className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-2">
              <code className="w-full shrink-0 truncate rounded-lg bg-surface-2 px-2 py-1 font-mono text-xs text-muted sm:w-40">{k}</code>
              <div className="flex min-w-0 flex-1 items-center gap-1">
                <Input
                  value={v}
                  maxLength={ed.maxLabel}
                  onChange={(e) => onChange({ ...map, [k]: e.target.value })}
                  disabled={disabled}
                  aria-label={`«${k}»-ийн нэр`}
                  className="h-11 text-base sm:h-10 sm:text-sm"
                />
                {locked ? (
                  <span className="inline-flex size-11 shrink-0 sm:size-10 items-center justify-center text-subtle" title="Энэ мөрийг хасахгүй">
                    <Lock className="size-3.5" aria-hidden />
                  </span>
                ) : (
                  <button
                    type="button"
                    aria-label={`«${v || k}» хасах`}
                    disabled={disabled}
                    onClick={() => {
                      const next = { ...map };
                      delete next[k];
                      onChange(next);
                    }}
                    className="inline-flex size-11 shrink-0 sm:size-10 items-center justify-center rounded-lg text-muted hover:bg-surface-2 hover:text-ink"
                  >
                    <X className="size-4" aria-hidden />
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
      {canAdd ? (
        <div className="rounded-xl border border-dashed border-line p-2">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <Input
              value={code}
              onChange={(e) => setCode(e.target.value.toLowerCase())}
              placeholder="код (жишээ: duplex)"
              aria-label="Шинэ код"
              maxLength={40}
              disabled={disabled}
              className="h-11 font-mono text-base sm:h-10 sm:w-40 sm:text-sm"
            />
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  add();
                }
              }}
              placeholder="Нэр"
              aria-label="Шинэ нэр"
              maxLength={ed.maxLabel}
              disabled={disabled}
              className="h-11 text-base sm:h-10 sm:text-sm"
            />
            <Button
              type="button"
              variant="outline"
              size="touch"
              onClick={add}
              disabled={disabled || !codeTrim || !name.trim() || !!codeError}
              className="shrink-0"
            >
              <Plus className="size-4" aria-hidden />
              Нэмэх
            </Button>
          </div>
          {codeError ? <p className="mt-1 text-xs text-danger">{codeError}</p> : null}
          <p className="mt-1 text-xs text-muted">Кодыг нэг удаа өгнө; дараа нь зөвхөн нэрийг засна.</p>
        </div>
      ) : null}
    </div>
  );
}
