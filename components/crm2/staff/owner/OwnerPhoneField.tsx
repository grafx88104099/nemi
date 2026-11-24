"use client";

import * as React from "react";
import { Check, ClipboardPaste, Contact, Loader2, UserRound } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { findContactsByPhone } from "@/lib/crm2/actions/contacts";
import { logUiEvent } from "@/lib/crm2/actions/events";
import { setPropertyOwner } from "@/lib/crm2/actions/quick-add";
import { canPickContact, pasteFromClipboard, pickContact } from "@/lib/crm2/device/contact-pick";
import { PRIVATE_LOST_TEXT } from "@/lib/crm2/device/draft-store";
import { useOnline } from "@/lib/crm2/device/network";
import type { UiFlow } from "@/lib/crm2/feature-flags";
import { formatPhone } from "@/lib/crm2/phone";
import type { Crm2OwnerInput, Crm2OwnerResolveResult, Crm2OwnerStatus } from "@/lib/crm2/types";

import { ForeignOwnerNotice } from "./ForeignOwnerNotice";
import { OwnerSourceChips } from "./OwnerSourceChips";
import {
  OWNER_LOOKUP_DEBOUNCE_MS,
  OWNER_NAME_MAX,
  OWNER_NAME_UNVERIFIED,
  OWNER_STATUS_TEXT,
  applyPhoneEdit,
  isFinal,
  matchFromPhoneRow,
  modelFromDraft,
  ownerReducer,
  phoneForField,
  readLastOwnerSource,
  toOwnerDraft,
  toOwnerInput,
  validateOwner,
  type OwnerDraft,
  type OwnerMatch,
  type OwnerModel,
  type OwnerValidation,
} from "./owner-model";

export type OwnerFieldChange = {
  /** Ноорогт битүүмжлэх хэсэг (утас бүр товшилтоор шинэчлэгдэнэ). */
  draft: OwnerDraft;
  /** RPC-ийн p_owner; хоосон эсвэл буруу дугаартай бол null. */
  input: Crm2OwnerInput | null;
  validation: OwnerValidation;
};

const noopSubscribe = () => () => {};

/** logUiEvent fire-and-forget: сүлжээгүй үед ч алдаа гаргахгүй. */
function track(e: Parameters<typeof logUiEvent>[0]): void {
  try {
    const p: unknown = logUiEvent(e);
    if (p instanceof Promise) p.catch(() => {});
  } catch {
    /* хэмжилт — алгасна */
  }
}

type Msg = { tone: "info" | "warn" | "error"; text: string };

/**
 * «Эзэн» — утас эхэлсэн нэг бүрэлдэхүүн (шуурхай бүртгэл, картын эзний цонх, гэрээний гарын үсэг зурагч).
 *
 * - mode='draft': өөрчлөлт бүрийг onChange-ээр эцэгт өгнө (эцэг vault-д битүүмжилнэ). Хадгалах сантай ажиллахгүй.
 * - mode='live': «Эзнийг хадгалах» → setPropertyOwner(propertyId, input); хариуг onSaved-ээр өгнө.
 *
 * Бүтэн дугаар болмогц 400 мс дараа findContactsByPhone. Харах эрхтэй давхцалд «Энэ хүн үү?» — зөвхөн «Тийм»
 * холбоно; харах эрхгүй бол зөвхөн ForeignOwnerNotice (сервер нууцалсан нэр). Сүлжээгүй үед хайхгүй —
 * илгээхэд сервер шийдэж owner_pending-д хадгална.
 */
export function OwnerPhoneField({
  idPrefix,
  mode,
  meId,
  sources,
  propertyId,
  initial,
  pendingStatus,
  lastSource,
  flow,
  label = "Эзний утас",
  optional = true,
  disabled,
  privateLost,
  autoFocus,
  onChange,
  onSaved,
  onCancel,
}: {
  idPrefix: string;
  mode: "draft" | "live";
  /** Одоогийн хэрэглэгчийн profile id (шилжүүлэх хүсэлт, сүүлийн эх сурвалж). */
  meId: string;
  /** contact.sources (код → нэр). */
  sources: Record<string, string>;
  /** live горимд заавал; draft горимд картын хөрөнгө байвал хайлтад дамжуулна. */
  propertyId?: string | null;
  /** Ноорог сэргээх эсвэл owner_pending-ээс урьдчилан бөглөх (draftFromPending). */
  initial?: Partial<OwnerDraft> | null;
  /** owner_pending-ийн төлөв (картаас «Шийдвэрлэх»). */
  pendingStatus?: Crm2OwnerStatus | null;
  /** Сүүлд ашигласан эх сурвалж; өгөөгүй бол localStorage-оос уншина. */
  lastSource?: string | null;
  flow?: UiFlow;
  label?: string;
  optional?: boolean;
  disabled?: boolean;
  /** Ноорогт хувийн хэсэг байсан ч тайлж чадсангүй. */
  privateLost?: boolean;
  autoFocus?: boolean;
  onChange?: (change: OwnerFieldChange) => void;
  /** live: серверийн хариу (эцсийн эсэхийг isFinal-аар шалгана) ба илгээсэн оролт. */
  onSaved?: (result: Crm2OwnerResolveResult, input: Crm2OwnerInput) => void;
  onCancel?: () => void;
}) {
  const [m, dispatch] = React.useReducer(ownerReducer, null, (): OwnerModel => {
    const base = modelFromDraft(initial ?? null, lastSource ?? null);
    return pendingStatus ? { ...base, serverStatus: pendingStatus } : base;
  });
  const v = validateOwner(m);
  const online = useOnline();

  const phoneId = `${idPrefix}-owner-phone`;
  const nameId = `${idPrefix}-owner-name`;
  const errId = `${phoneId}-err`;
  const statusId = `${phoneId}-status`;

  const inputRef = React.useRef<HTMLInputElement>(null);
  const caretRef = React.useRef<number | null>(null);
  const [touched, setTouched] = React.useState(false);
  const canPick = React.useSyncExternalStore(noopSubscribe, canPickContact, () => false);
  const [choices, setChoices] = React.useState<string[] | null>(null);
  const [hint, setHint] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [msg, setMsg] = React.useState<Msg | null>(null);
  const busy = Boolean(disabled) || saving;

  // ── Эцэгт мэдэгдэх (draft горимд утас бүр товшилтоор) ──
  const onChangeRef = React.useRef(onChange);
  React.useEffect(() => {
    onChangeRef.current = onChange;
  });
  const firstRef = React.useRef(true);
  React.useEffect(() => {
    if (firstRef.current) {
      firstRef.current = false;
      return;
    }
    onChangeRef.current?.({ draft: toOwnerDraft(m), input: toOwnerInput(m), validation: validateOwner(m) });
  }, [m]);

  // ── Төхөөрөмжийн боломж, сүүлийн эх сурвалж (зөвхөн уншина) ──
  React.useEffect(() => {
    if (lastSource === undefined && initial?.source === undefined) {
      dispatch({ type: "guess_source", code: readLastOwnerSource(meId, sources) });
    }
    // Зөвхөн анх ачаалахад.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Курсорын байрлал (хэлбэржүүлэлтийн дараа) ──
  React.useLayoutEffect(() => {
    const el = inputRef.current;
    const pos = caretRef.current;
    caretRef.current = null;
    if (el && pos !== null && document.activeElement === el) el.setSelectionRange(pos, pos);
  }, [m.phone]);

  // ── Дугаараар хайх ──
  const kind = m.matchState.kind;
  const norm = m.matchState.kind === "idle" ? null : m.matchState.norm;
  React.useEffect(() => {
    if (kind !== "checking" || !norm) return;
    if (!online) {
      dispatch({ type: "lookup_failed", norm, reason: "offline" });
      return;
    }
    let cancelled = false;
    const t = window.setTimeout(async () => {
      try {
        const res = await findContactsByPhone(norm, propertyId ?? null);
        if (cancelled) return;
        if (res.ok) dispatch({ type: "lookup_done", norm, matches: res.data.map(matchFromPhoneRow) });
        else dispatch({ type: "lookup_failed", norm, reason: "error" });
      } catch {
        if (!cancelled) dispatch({ type: "lookup_failed", norm, reason: navigator.onLine === false ? "offline" : "error" });
      }
    }, OWNER_LOOKUP_DEBOUNCE_MS);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [kind, norm, online, propertyId]);

  // Сүлжээ сэргэвэл дахин шалгана.
  const uncheckedOffline = m.matchState.kind === "unchecked" && m.matchState.reason === "offline";
  React.useEffect(() => {
    if (online && uncheckedOffline) dispatch({ type: "recheck" });
  }, [online, uncheckedOffline]);

  function setPhone(value: string) {
    setChoices(null);
    setHint(null);
    setMsg(null);
    dispatch({ type: "phone", value });
  }

  function onPhoneInput(e: React.ChangeEvent<HTMLInputElement>) {
    const native = e.nativeEvent as InputEvent;
    const r = applyPhoneEdit(m.phone, e.target.value, e.target.selectionStart, native?.inputType ?? null);
    caretRef.current = r.caret;
    setTouched(false);
    setPhone(r.value);
  }

  function applyPhones(phones: string[]) {
    if (phones.length === 1) {
      setPhone(phoneForField(phones[0]!));
      setTouched(true);
    } else if (phones.length > 1) {
      setChoices(phones);
    }
  }

  async function onPick() {
    setHint(null);
    const c = await pickContact();
    track({ event: "owner_contact_picked", flow, property_id: propertyId ?? null, meta: { phones: c?.phones.length ?? 0, ok: Boolean(c) } });
    if (!c) return;
    if (!c.phones.length) {
      setHint("Сонгосон харилцагчид бүтэн дугаар алга — гараар оруулна уу");
      return;
    }
    if (c.name && !m.name.trim()) dispatch({ type: "name", value: c.name.slice(0, OWNER_NAME_MAX) });
    applyPhones(c.phones);
  }

  async function onPaste() {
    setHint(null);
    const r = await pasteFromClipboard();
    track({ event: "owner_pasted", flow, property_id: propertyId ?? null, meta: { phones: r.ok ? r.phones.length : 0, ok: r.ok } });
    if (!r.ok) {
      setHint(r.error);
      return;
    }
    applyPhones(r.phones);
  }

  async function save() {
    const input = toOwnerInput(m);
    if (!propertyId || !input || !v.sendable) {
      setTouched(true);
      return;
    }
    setSaving(true);
    setMsg(null);
    try {
      const res = await setPropertyOwner(propertyId, input);
      if (!res.ok) {
        setMsg({ tone: "error", text: res.error });
        return;
      }
      dispatch({ type: "server", result: res.data });
      if (isFinal(res.data.status)) {
        setMsg({ tone: "info", text: "Эзэн хадгалагдлаа" });
      } else {
        track({ event: "owner_pending", flow, property_id: propertyId, meta: { saved: Boolean(res.data.pending_saved) } });
        const text = OWNER_STATUS_TEXT[res.data.status];
        setMsg({ tone: "warn", text: res.data.pending_saved ? `Утсыг хадгаллаа — ${text.toLowerCase()}` : text });
      }
      onSaved?.(res.data, input);
    } catch {
      setMsg({ tone: "error", text: "Хадгалж чадсангүй. Сүлжээгээ шалгаад дахин оролдоно уу." });
    } finally {
      setSaving(false);
    }
  }

  const showPhoneError = (touched && v.phoneError) || (m.serverStatus === "invalid_phone" && v.phoneError);
  const chosen: OwnerMatch | null =
    m.matchState.kind === "visible" && m.chosenContactId
      ? m.matchState.matches.find((x) => x.contactId === m.chosenContactId) ?? null
      : null;
  const showNewPerson =
    !m.chosenContactId &&
    !v.phoneError &&
    (kind === "none" ||
      kind === "unchecked" ||
      kind === "foreign" ||
      (kind === "visible" && m.allowDuplicate));

  let statusLine: string | null = null;
  if (kind === "checking") statusLine = online ? "Дугаарыг шалгаж байна…" : null;
  else if (kind === "unchecked")
    statusLine =
      m.matchState.kind === "unchecked" && m.matchState.reason === "offline"
        ? "Сүлжээгүй — хадгалахад сервер шалгана"
        : "Шалгаж чадсангүй — хадгалахад сервер шалгана";
  else if (kind === "none") statusLine = "Шинэ хүн — оффист энэ дугаар бүртгэлгүй";

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <label htmlFor={phoneId} className="block text-sm font-medium text-ink">
          {label}
          {optional ? <span className="ml-1 font-normal text-muted">(дараа нэмж болно)</span> : null}
        </label>
        <div className="relative">
          <input
            ref={inputRef}
            id={phoneId}
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            enterKeyHint="next"
            autoFocus={autoFocus}
            placeholder="9911 2233"
            value={m.phone}
            disabled={busy}
            aria-invalid={showPhoneError ? true : undefined}
            aria-describedby={[showPhoneError ? errId : null, statusLine && !showPhoneError ? statusId : null].filter(Boolean).join(" ") || undefined}
            onChange={onPhoneInput}
            onBlur={() => setTouched(true)}
            className={cn(
              "h-12 w-full rounded-xl border bg-surface px-3.5 pr-10 text-base tabular-nums tracking-wide text-ink",
              "placeholder:text-subtle focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20 disabled:opacity-50",
              showPhoneError ? "border-rose-300" : "border-line"
            )}
          />
          {kind === "checking" && online ? (
            <Loader2 className="absolute right-3 top-1/2 size-4 -translate-y-1/2 animate-spin text-muted" aria-hidden />
          ) : null}
        </div>
        <div className={cn("grid gap-2", canPick ? "grid-cols-2" : "grid-cols-1")}>
          {canPick ? (
            <Button type="button" variant="outline" size="md" className="px-3" disabled={busy} onClick={onPick}>
              <Contact className="size-4" aria-hidden />
              Харилцагчаас
            </Button>
          ) : null}
          <Button type="button" variant="outline" size="md" className="px-3" disabled={busy} onClick={onPaste}>
            <ClipboardPaste className="size-4" aria-hidden />
            Наах
          </Button>
        </div>
        <div aria-live="polite" className="space-y-1">
          {showPhoneError ? (
            <p id={errId} className="text-sm text-rose-700">
              {v.phoneError}
            </p>
          ) : null}
          {statusLine && !showPhoneError ? (
            <p id={statusId} className="text-xs text-muted">
              {statusLine}
            </p>
          ) : null}
          {hint ? <p className="text-sm text-amber-900">{hint}</p> : null}
        </div>
      </div>

      {privateLost && !m.phone ? (
        <p role="status" className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          {PRIVATE_LOST_TEXT}
        </p>
      ) : null}

      {choices ? (
        <div role="group" aria-label="Дугаар сонгох" className="space-y-1.5">
          <p className="text-sm font-medium text-ink">Аль дугаар нь эзнийх вэ?</p>
          <div className="flex flex-wrap gap-2">
            {choices.map((p) => (
              <Button key={p} type="button" variant="secondary" size="md" onClick={() => applyPhones([p])}>
                {formatPhone(p)}
              </Button>
            ))}
          </div>
        </div>
      ) : null}

      {m.matchState.kind === "visible" ? (
        <MatchQuestion
          matches={m.matchState.matches}
          chosen={chosen}
          otherChosen={m.allowDuplicate}
          disabled={busy}
          onYes={(id) => dispatch({ type: "choose", contactId: id })}
          onOther={() => dispatch({ type: "separate" })}
          onUndo={() => dispatch({ type: "undo_choice" })}
        />
      ) : null}

      {m.matchState.kind === "foreign" ? (
        <ForeignOwnerNotice
          idPrefix={idPrefix}
          matches={m.matchState.matches}
          meId={meId}
          separateChosen={m.allowDuplicate}
          transferRequested={m.transferRequested}
          disabled={busy}
          onSeparate={() => dispatch({ type: "separate" })}
          onUndo={() => dispatch({ type: "undo_choice" })}
          onTransferred={(outcome) => dispatch(outcome === "applied" ? { type: "recheck" } : { type: "transfer_requested" })}
        />
      ) : null}

      {showNewPerson ? (
        <div className="space-y-3 rounded-xl border border-dashed border-line-strong p-3">
          <div className="space-y-1.5">
            <label htmlFor={nameId} className="flex items-center gap-2 text-sm font-medium text-ink">
              Эзний нэр
              {!m.name.trim() ? (
                <span className="rounded-md bg-surface-2 px-1.5 py-0.5 text-xs font-semibold text-muted">
                  {OWNER_NAME_UNVERIFIED}
                </span>
              ) : null}
            </label>
            <input
              id={nameId}
              type="text"
              value={m.name}
              maxLength={OWNER_NAME_MAX}
              disabled={busy}
              autoComplete="off"
              autoCapitalize="words"
              enterKeyHint="next"
              placeholder="Мэдэхгүй бол хоосон үлдээнэ"
              onChange={(e) => dispatch({ type: "name", value: e.target.value })}
              className="h-11 w-full rounded-xl border border-line bg-surface px-3.5 text-base text-ink placeholder:text-subtle focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20 disabled:opacity-50 sm:text-sm"
            />
          </div>
          <OwnerSourceChips
            idPrefix={idPrefix}
            sources={sources}
            value={m.source}
            guessed={m.sourceGuessed}
            note={m.sourceNote}
            noteError={v.noteError}
            disabled={busy}
            onChange={(code) => dispatch({ type: "source", code })}
            onConfirm={() => dispatch({ type: "confirm_source" })}
            onNoteChange={(value) => dispatch({ type: "source_note", value })}
          />
        </div>
      ) : null}

      {mode === "live" ? (
        <div className="space-y-2">
          {msg ? (
            <p
              role="status"
              aria-live="polite"
              className={cn(
                "rounded-xl border px-3 py-2 text-sm",
                msg.tone === "error" && "border-rose-200 bg-rose-50 text-rose-800",
                msg.tone === "warn" && "border-amber-200 bg-amber-50 text-amber-900",
                msg.tone === "info" && "border-emerald-200 bg-emerald-50 text-emerald-800"
              )}
            >
              {msg.text}
            </p>
          ) : null}
          <div className="flex flex-col gap-2 sm:flex-row-reverse">
            <Button
              type="button"
              size="lg"
              className="w-full sm:w-auto"
              disabled={busy || !propertyId || !v.sendable}
              onClick={save}
            >
              {saving ? "Хадгалж байна…" : "Эзнийг хадгалах"}
            </Button>
            {onCancel ? (
              <Button type="button" variant="ghost" size="md" className="w-full sm:w-auto" disabled={saving} onClick={onCancel}>
                Болих
              </Button>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function MatchQuestion({
  matches,
  chosen,
  otherChosen,
  disabled,
  onYes,
  onOther,
  onUndo,
}: {
  matches: OwnerMatch[];
  chosen: OwnerMatch | null;
  otherChosen: boolean;
  disabled?: boolean;
  onYes: (contactId: string) => void;
  onOther: () => void;
  onUndo: () => void;
}) {
  if (chosen) {
    return (
      <div
        role="status"
        aria-live="polite"
        className="flex min-w-0 items-center justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2.5"
      >
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="grid size-9 shrink-0 place-items-center rounded-full bg-emerald-100 text-emerald-700">
            <Check className="size-4" aria-hidden />
          </span>
          <p className="min-w-0 truncate text-sm">
            <span className="font-semibold text-ink">{chosen.name}</span>
            <span className="text-muted"> · {chosen.code}</span>
          </p>
        </div>
        <Button type="button" variant="outline" size="md" disabled={disabled} onClick={onUndo}>
          Солих
        </Button>
      </div>
    );
  }
  if (otherChosen) {
    return (
      <div role="status" aria-live="polite" className="flex items-center justify-between gap-3 rounded-xl bg-surface-2 px-3 py-2">
        <p className="text-sm text-ink">Өөр хүн — шинэ харилцагч бүртгэнэ.</p>
        <Button type="button" variant="ghost" size="md" disabled={disabled} onClick={onUndo}>
          Буцаах
        </Button>
      </div>
    );
  }
  return (
    <div role="status" aria-live="polite" className="space-y-2 rounded-xl border border-sky-200 bg-sky-50 p-3">
      <p className="text-sm font-semibold text-sky-900">Энэ хүн үү?</p>
      <ul className="space-y-2">
        {matches.map((x) => (
          <li key={x.contactId} className="flex items-center justify-between gap-3 rounded-lg bg-surface px-3 py-2">
            <span className="flex min-w-0 items-center gap-2">
              <UserRound className="size-4 shrink-0 text-muted" aria-hidden />
              <span className="min-w-0 text-sm leading-tight">
                <span className="block truncate font-semibold text-ink">{x.name}</span>
                <span className="block truncate text-xs text-muted">
                  {[x.code, x.agentName ? `Хариуцагч: ${x.agentName}` : null].filter(Boolean).join(" · ")}
                </span>
              </span>
            </span>
            <Button type="button" size="md" className="shrink-0 px-4" disabled={disabled} onClick={() => onYes(x.contactId)}>
              Тийм
            </Button>
          </li>
        ))}
      </ul>
      <Button type="button" variant="outline" size="md" className="w-full" disabled={disabled} onClick={onOther}>
        Өөр хүн
      </Button>
    </div>
  );
}
