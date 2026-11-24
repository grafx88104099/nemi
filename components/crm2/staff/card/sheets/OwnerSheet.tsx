"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Lock, Phone, RefreshCw } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";
import { ChoiceChips, FormField, Textarea } from "@/components/crm2/staff/form/fields";
import { trackUi } from "@/components/crm2/staff/form/useCreateDraft";
import { OwnerPendingNotice } from "@/components/crm2/staff/owner/OwnerPendingNotice";
import { OwnerPhoneField, type OwnerFieldChange } from "@/components/crm2/staff/owner/OwnerPhoneField";
import { OwnerSourceChips } from "@/components/crm2/staff/owner/OwnerSourceChips";
import {
  OTHER_SOURCE,
  OWNER_NAME_UNVERIFIED,
  draftFromPending,
  isFinal,
  type OwnerDraft,
} from "@/components/crm2/staff/owner/owner-model";
import { updateContact } from "@/lib/crm2/actions/contacts";
import { updatePropertyPrivate } from "@/lib/crm2/actions/properties";
import { PRIVATE_LOST_TEXT } from "@/lib/crm2/device/draft-store";
import { CONTACT_CONSENTS, CONTACT_CONSENT_LABEL, type Crm2ContactConsent } from "@/lib/crm2/labels";
import { crm2Paths, type Crm2Panel } from "@/lib/crm2/paths";
import { formatPhone, telHref } from "@/lib/crm2/phone";
import type { PropertyPrivate } from "@/lib/crm2/queries/properties";
import { dbErrorField } from "@/lib/crm2/result";
import type { Crm2Settings } from "@/lib/crm2/settings";

import { changedKeys, mergeTextDraft, sheetFieldId as fid, sheetFieldKey, type SheetDraftPart } from "./sheet-model";
import { OFFLINE_SAVE_TEXT, SheetShell, focusSheetField } from "./SheetShell";
import { useSheetDraft } from "./use-sheet-draft";

type TextState = {
  owner_note: string;
  showing_instructions: string;
  c_full_name: string;
  c_source: string;
  c_source_note: string;
  c_consent: string;
};

/** Vault-д битүүмжлэх хэсэг: эзний утас/нэр (OwnerPhoneField-ийн ноорог) ба бичвэрүүд. */
type OwnerSheetPrivate = { owner: OwnerDraft | null; text: SheetDraftPart };

function textFromPrivate(priv: PropertyPrivate | null): TextState {
  const o = priv?.owner ?? null;
  return {
    owner_note: priv?.owner_note ?? "",
    showing_instructions: priv?.showing_instructions ?? "",
    c_full_name: o && !o.name_unverified ? o.full_name : "",
    c_source: o?.source ?? "",
    c_source_note: "",
    c_consent: o?.consent ?? "unknown",
  };
}

const PRIVATE_TEXT_KEYS = ["owner_note", "showing_instructions"] as const;
const CONTACT_KEYS = ["c_full_name", "c_source", "c_source_note", "c_consent"] as const;

/**
 * «Эзэн» цонх: эзэнгүй эсвэл хүлээгдэж буй (owner_pending) бол утас эхэлсэн OwnerPhoneField (live —
 * setPropertyOwner). Холбогдсон эзний нэр, эх сурвалж, зөвшөөрөл (updateContact) ба эзний тэмдэглэл,
 * үзүүлэх заавар (updatePropertyPrivate). Бичсэн бүхэн vault-аар битүүмжлэгдэж утсан дээр үлдэнэ.
 */
export function OwnerSheet({
  panel,
  propertyId,
  priv,
  canViewPrivate,
  settings,
  me,
  focusField,
  onClose,
}: {
  panel: Crm2Panel;
  propertyId: string;
  priv: PropertyPrivate | null;
  canViewPrivate: boolean;
  settings: Crm2Settings;
  me: string | null;
  focusField: string | null;
  onClose: () => void;
}) {
  const router = useRouter();
  const paths = crm2Paths(panel);
  const owner = priv?.owner ?? null;
  const pending = priv?.owner_pending ?? null;
  const sources = settings["contact.sources"];

  const [base] = React.useState<TextState>(() => textFromPrivate(priv));
  const [text, setText] = React.useState<TextState>(base);
  const [ownerDraft, setOwnerDraft] = React.useState<OwnerDraft | null>(null);
  const [initialOwner, setInitialOwner] = React.useState<OwnerDraft | null>(null);
  const [privateLost, setPrivateLost] = React.useState(false);
  const [changing, setChanging] = React.useState(!owner);
  const [restoredAt, setRestoredAt] = React.useState<number | null>(null);
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [error, setError] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [fieldKey, setFieldKey] = React.useState(0);

  const textPart: SheetDraftPart = { base, values: text };
  const draft = useSheetDraft<OwnerSheetPrivate>({
    profileId: me,
    propertyId,
    sheet: "owner",
    part: null,
    priv: canViewPrivate ? { owner: ownerDraft, text: textPart } : null,
    onLoaded: (loaded) => {
      if (loaded.privateLost) setPrivateLost(true);
      const p = loaded.priv;
      if (p?.owner && p.owner.phone) {
        setInitialOwner(p.owner);
        setOwnerDraft(p.owner);
        setChanging(true);
      }
      const merged = mergeTextDraft(base, p?.text ?? null);
      if (merged.restored.length) setText(merged.values);
      if (merged.restored.length || p?.owner?.phone) setRestoredAt(loaded.savedAt);
    },
  });

  const textChanged = changedKeys(textPart, Object.keys(base));
  const dirty = textChanged.length > 0 || !!ownerDraft?.phone;

  function set<K extends keyof TextState>(key: K, value: TextState[K]) {
    setText((s) => ({ ...s, [key]: value }));
    setErrors((e) => {
      if (!(key in e)) return e;
      const next = { ...e };
      delete next[key];
      return next;
    });
  }

  function showError(text: string, field: string | null) {
    setError(text);
    if (!field) return;
    const key = field === "owner.source" || field === "source" ? "owner-source" : field === "source_note" ? "c_source_note" : sheetFieldKey(field);
    setErrors((e) => ({ ...e, [key]: text }));
    focusSheetField(key);
  }

  async function dropRestored() {
    setText(base);
    setOwnerDraft(null);
    setInitialOwner(pending ? draftFromPending(pending) : null);
    setRestoredAt(null);
    setFieldKey((k) => k + 1);
    await draft.discard();
  }

  async function save() {
    setError(null);
    const contactChanged = owner ? textChanged.filter((k) => (CONTACT_KEYS as readonly string[]).includes(k)) : [];
    const privChanged = textChanged.filter((k) => (PRIVATE_TEXT_KEYS as readonly string[]).includes(k));
    if (!contactChanged.length && !privChanged.length) {
      if (ownerDraft?.phone) {
        setError("Эзний дугаарыг «Эзнийг хадгалах» товчоор хадгална уу.");
        focusSheetField("owner");
        return;
      }
      await draft.discard();
      onClose();
      return;
    }
    if (contactChanged.length && text.c_source === OTHER_SOURCE && !text.c_source_note.trim() && !owner?.source) {
      showError("«Бусад» эх сурвалжийн тайлбарыг бичнэ үү.", "source_note");
      return;
    }
    setSaving(true);
    try {
      if (owner && contactChanged.length) {
        const input: Parameters<typeof updateContact>[0] = { contact_id: owner.id };
        if (contactChanged.includes("c_full_name") && text.c_full_name.trim()) input.full_name = text.c_full_name.trim();
        if (contactChanged.includes("c_source") || contactChanged.includes("c_source_note")) {
          input.source = text.c_source || null;
          input.source_note = text.c_source_note.trim() || null;
        }
        if (contactChanged.includes("c_consent")) input.consent = text.c_consent as Crm2ContactConsent;
        const res = await updateContact(input);
        if (!res.ok) {
          showError(res.error, res.field ?? dbErrorField({ message: res.error }).field);
          return;
        }
      }
      if (privChanged.length) {
        const res = await updatePropertyPrivate(propertyId, {
          ...(privChanged.includes("owner_note") ? { owner_note: text.owner_note.trim() || null } : {}),
          ...(privChanged.includes("showing_instructions") ? { showing_instructions: text.showing_instructions.trim() || null } : {}),
        });
        if (!res.ok) {
          showError(res.error, res.field ?? dbErrorField({ message: res.error }).field);
          return;
        }
      }
      if (!ownerDraft?.phone) await draft.discard();
      trackUi({ event: "sheet_saved", flow: "card", property_id: propertyId, meta: { fields: textChanged.length } });
      toast.success("Хадгалагдлаа");
      router.refresh();
      if (!ownerDraft?.phone) onClose();
    } catch {
      await draft.flush();
      setError(OFFLINE_SAVE_TEXT);
    } finally {
      setSaving(false);
    }
  }

  function onOwnerChange(change: OwnerFieldChange) {
    setOwnerDraft(change.draft.phone || change.draft.name ? change.draft : null);
  }

  function onOwnerSaved(result: { status: Parameters<typeof isFinal>[0] }) {
    if (isFinal(result.status)) {
      setOwnerDraft(null);
      setChanging(false);
      toast.success("Эзэн хадгалагдлаа");
      // Бичвэрийн өөрчлөлтгүй бол ноорог шаардлагагүй.
      if (!textChanged.length) void draft.discard();
    }
    router.refresh();
  }

  if (!canViewPrivate) {
    return (
      <SheetShell title="Эзэн" onClose={onClose}>
        <p className="flex items-start gap-2 rounded-xl bg-surface-2 p-3 text-sm text-muted">
          <Lock className="mt-0.5 size-4 shrink-0" aria-hidden />
          Эзний мэдээлэл зөвхөн хувийн талбар харах эрхтэй ажилтанд нээлттэй.
        </p>
      </SheetShell>
    );
  }

  return (
    <SheetShell
      title="Эзэн"
      onClose={onClose}
      onSave={() => void save()}
      saving={saving}
      ready={draft.ready}
      dirty={dirty}
      error={error}
      savedAt={draft.savedAt}
      draftError={draft.error}
      restoredAt={restoredAt}
      onDropRestored={() => void dropRestored()}
      focusField={focusField}
    >
      {privateLost ? (
        <p role="status" className="rounded-xl bg-amber-50 px-3 py-2 text-sm font-medium text-amber-900">
          {PRIVATE_LOST_TEXT}
        </p>
      ) : null}

      {pending && changing ? <OwnerPendingNotice pending={pending} canResolve={false} /> : null}

      {owner && !changing ? (
        <section aria-label="Одоогийн эзэн" className="space-y-3 rounded-xl border border-line p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="flex flex-wrap items-center gap-1.5 font-semibold text-ink">
                <Link href={paths.contact(owner.id)} className="break-words hover:underline">
                  {owner.name_unverified ? OWNER_NAME_UNVERIFIED : owner.full_name}
                </Link>
                <span className="text-xs font-normal text-muted">{owner.code}</span>
                {owner.name_unverified ? <Badge tone="amber">Нэр баталгаажаагүй</Badge> : null}
              </p>
              <ul className="mt-1 space-y-1">
                {owner.phones.map((ph) => {
                  const href = telHref(ph.phone);
                  return (
                    <li key={ph.id} className="flex items-center gap-1.5 text-sm">
                      <Phone className="size-3.5 shrink-0 text-muted" aria-hidden />
                      {href ? (
                        <a href={href} className="inline-flex min-h-11 items-center font-medium text-brand-700 tabular-nums">
                          {formatPhone(ph.phone)}
                        </a>
                      ) : (
                        <span className="tabular-nums">{ph.phone}</span>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
            <Button type="button" variant="outline" size="touch" disabled={saving} onClick={() => setChanging(true)}>
              <RefreshCw className="size-4" aria-hidden /> Эзэн солих
            </Button>
          </div>

          <FormField
            label="Эзний нэр"
            htmlFor={fid("owner")}
            error={errors.owner ?? errors.c_full_name}
            hint={owner.name_unverified ? "Нэрийг асууж бичвэл гэрээнд саад арилна." : undefined}
          >
            <Input
              id={fid("owner")}
              autoComplete="off"
              maxLength={160}
              enterKeyHint="next"
              value={text.c_full_name}
              disabled={saving || !draft.ready}
              placeholder={owner.name_unverified ? "Нэр, овог" : undefined}
              onChange={(e) => set("c_full_name", e.target.value)}
            />
          </FormField>

          <div id={fid("owner-source")} tabIndex={-1} className="space-y-1 outline-none">
            <OwnerSourceChips
              idPrefix="cs-owner"
              sources={sources}
              value={text.c_source || null}
              guessed={false}
              note={text.c_source_note}
              noteError={errors.c_source_note ?? null}
              disabled={saving || !draft.ready}
              onChange={(code) => set("c_source", code ?? "")}
              onConfirm={() => undefined}
              onNoteChange={(note) => set("c_source_note", note)}
            />
            {errors["owner-source"] ? <p className="text-xs text-danger">{errors["owner-source"]}</p> : null}
          </div>

          <FormField label="Эзний зөвшөөрөл" error={errors.c_consent}>
            <ChoiceChips
              label="Эзний зөвшөөрөл"
              value={text.c_consent as Crm2ContactConsent}
              disabled={saving || !draft.ready}
              options={CONTACT_CONSENTS.map((c) => ({ value: c, label: CONTACT_CONSENT_LABEL[c] }))}
              onChange={(c) => set("c_consent", c)}
            />
          </FormField>
        </section>
      ) : null}

      {changing && draft.ready ? (
        <section id={fid("owner")} aria-label="Эзний утас" className="space-y-2">
          <OwnerPhoneField
            key={fieldKey}
            idPrefix="cs"
            mode="live"
            meId={me ?? ""}
            sources={sources}
            propertyId={propertyId}
            initial={initialOwner ?? (pending ? draftFromPending(pending) : null)}
            pendingStatus={pending?.status ?? null}
            flow="card"
            privateLost={privateLost}
            onChange={onOwnerChange}
            onSaved={(result) => onOwnerSaved(result)}
            onCancel={owner ? () => setChanging(false) : undefined}
          />
          {owner ? (
            <Button type="button" variant="ghost" size="touch" onClick={() => setChanging(false)}>
              Одоогийн эзнийг үлдээх
            </Button>
          ) : null}
        </section>
      ) : null}

      <section aria-label="Дотоод мэдээлэл" className="space-y-4">
        <FormField
          label="Эзний тэмдэглэл"
          htmlFor={fid("owner_note")}
          error={errors.owner_note}
          hint="Мөр бүрт нэг зүйл — эзэнтэй ярьсан, тохирсон зүйл. Зөвхөн үүрэгт агентад харагдана."
        >
          <Textarea
            id={fid("owner_note")}
            rows={3}
            maxLength={4000}
            value={text.owner_note}
            disabled={saving || !draft.ready}
            onChange={(e) => set("owner_note", e.target.value)}
          />
        </FormField>
        <FormField
          label="Яаж үзүүлэх"
          htmlFor={fid("showing_instructions")}
          error={errors.showing_instructions}
          hint="Түлхүүр, цаг товлох, орцны код г.м."
        >
          <Textarea
            id={fid("showing_instructions")}
            rows={3}
            maxLength={4000}
            value={text.showing_instructions}
            disabled={saving || !draft.ready}
            onChange={(e) => set("showing_instructions", e.target.value)}
          />
        </FormField>
      </section>
    </SheetShell>
  );
}
