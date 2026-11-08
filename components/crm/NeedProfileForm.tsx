"use client";

import { useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, X } from "lucide-react";

import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Input, Field } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { toast } from "@/components/ui/toast";
import { createNeedProfile, updateNeedProfile } from "@/lib/actions/crm-profiles";
import type { NeedProfileRow } from "@/lib/queries-crm-contacts";
import type { ProfileLookups } from "@/lib/queries-crm-lead-card";
import { CRM_PROPERTY_TYPES, CRM_PROPERTY_TYPE_LABEL } from "@/lib/constants-crm";
import { OCCUPANT_KINDS, OCCUPANT_KIND_LABEL, profileMissingFields, type OccupantKind } from "@/lib/crm/agent-core";
import {
  NEED_PROFILE_TYPES,
  NEED_PROFILE_TYPE_LABEL,
  FINANCING_OPTIONS,
  FINANCING_LABEL,
  TIMELINE_OPTIONS,
  TIMELINE_LABEL,
  type NeedProfileType,
} from "@/lib/validation/crm";

/**
 * Хэрэгцээний профайл (§6.2, §6.7): зорилго, байршил (бүсийн лавлахаас
 * санал болгоно), төрөл, төсөв ×3 (+харилцагчийн зөвшөөрсөн хэтрэлт),
 * санхүүжилт, өрөө/талбай (наад зах + сонирхсон), нөхцөл байдал, хугацаа,
 * 3–5 шийдвэрлэх шаардлага, байвал сайн, хэлцэл таслах нөхцөл, шийдвэр
 * гаргагч (оролцсон эсэх), одоогийн саад. Урьдчилсан хариулт байхгүй —
 * асуугаагүй утга бодит болж оноонд орохгүй.
 */

function StructuredList({
  label,
  hint,
  items,
  onChange,
  max = 10,
  placeholder,
  counter,
}: {
  label: string;
  hint?: string;
  items: string[];
  onChange: (items: string[]) => void;
  max?: number;
  placeholder?: string;
  counter?: { min: number };
}) {
  const [draft, setDraft] = useState("");
  function add() {
    const v = draft.trim();
    if (!v || items.length >= max) return;
    onChange([...items, v]);
    setDraft("");
  }
  const low = counter && items.length < counter.min;
  return (
    <Field
      label={counter ? `${label} (${items.length}/${max})` : label}
      hint={low ? `Дор хаяж ${counter!.min}-ыг бүртгэнэ` : hint}
    >
      <div className="space-y-1.5">
        <div className="flex flex-wrap gap-1.5">
          {items.map((it, i) => (
            <span
              key={`${it}-${i}`}
              className="inline-flex items-center gap-1 rounded-full border border-line bg-surface-2 px-2.5 py-1 text-xs font-medium text-ink"
            >
              {counter ? <span className="text-subtle">{i + 1}.</span> : null}
              {it}
              <button
                type="button"
                aria-label="Хасах"
                className="text-subtle hover:text-danger"
                onClick={() => onChange(items.filter((_, j) => j !== i))}
              >
                <X className="size-3" />
              </button>
            </span>
          ))}
        </div>
        <div className="flex gap-1.5">
          <Input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                add();
              }
            }}
            placeholder={placeholder ?? "Утга бичээд Enter"}
            className="flex-1"
          />
          <Button type="button" size="sm" variant="outline" onClick={add} disabled={items.length >= max} aria-label="Нэмэх">
            <Plus className="size-4" />
          </Button>
        </div>
      </div>
    </Field>
  );
}

function jsonToList(v: unknown): string[] {
  return Array.isArray(v) ? v.map((x) => String(x)) : [];
}

function numOrNull(v: string): number | null {
  if (!v.trim()) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export function NeedProfileForm(props: {
  open: boolean;
  onClose: () => void;
  contactId: string;
  initial?: NeedProfileRow | null;
  lookups: ProfileLookups;
  mustHavesMin?: number;
}) {
  // Хаалттай үед mount хийхгүй — нээх бүрд шинээр mount болж төлөв цэвэрхэн эхэлнэ.
  if (!props.open) return null;
  return <NeedProfileFormInner key={props.initial?.id ?? "new"} {...props} />;
}

function NeedProfileFormInner({
  open,
  onClose,
  contactId,
  initial,
  lookups,
  mustHavesMin = 3,
}: {
  open: boolean;
  onClose: () => void;
  contactId: string;
  initial?: NeedProfileRow | null;
  lookups: ProfileLookups;
  mustHavesMin?: number;
}) {
  const router = useRouter();
  const zonesId = useId();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [profileType, setProfileType] = useState<NeedProfileType>((initial?.profile_type as NeedProfileType) ?? "buyer");
  const [goalId, setGoalId] = useState(initial?.goal_id ?? "");
  const [locations, setLocations] = useState<string[]>(() => jsonToList(initial?.locations));
  const [propertyTypes, setPropertyTypes] = useState<string[]>(initial?.property_types ?? []);
  const [budgetMin, setBudgetMin] = useState(initial?.budget_min != null ? String(initial.budget_min) : "");
  const [budgetTarget, setBudgetTarget] = useState(initial?.budget_target != null ? String(initial.budget_target) : "");
  const [budgetMax, setBudgetMax] = useState(initial?.budget_max != null ? String(initial.budget_max) : "");
  const [overrun, setOverrun] = useState(initial?.budget_overrun_approved ?? false);
  const [overrunMax, setOverrunMax] = useState(initial?.budget_overrun_max != null ? String(initial.budget_overrun_max) : "");
  const [financing, setFinancing] = useState<(typeof FINANCING_OPTIONS)[number] | "">(
    (initial?.financing as (typeof FINANCING_OPTIONS)[number]) ?? ""
  );
  const [roomsMin, setRoomsMin] = useState(initial?.rooms_min != null ? String(initial.rooms_min) : "");
  const [roomsTarget, setRoomsTarget] = useState(initial?.rooms_target != null ? String(initial.rooms_target) : "");
  const [areaMin, setAreaMin] = useState(initial?.area_min != null ? String(initial.area_min) : "");
  const [areaTarget, setAreaTarget] = useState(initial?.area_target != null ? String(initial.area_target) : "");
  const [conditions, setConditions] = useState<string[]>(initial?.conditions ?? []);
  const [timeline, setTimeline] = useState<(typeof TIMELINE_OPTIONS)[number] | "">(
    (initial?.timeline as (typeof TIMELINE_OPTIONS)[number]) ?? ""
  );
  const [moveInDate, setMoveInDate] = useState(initial?.move_in_date ?? "");
  const [occupantKind, setOccupantKind] = useState<OccupantKind | "">((initial?.occupant_kind as OccupantKind) ?? "");
  const [occupantNote, setOccupantNote] = useState(initial?.occupant_note ?? "");
  const [mustHaves, setMustHaves] = useState<string[]>(() => jsonToList(initial?.must_haves));
  const [niceToHaves, setNiceToHaves] = useState<string[]>(() => jsonToList(initial?.nice_to_haves));
  const [dealBreakers, setDealBreakers] = useState<string[]>(() => jsonToList(initial?.deal_breakers));
  const [dmId, setDmId] = useState(initial?.decision_maker_id ?? "");
  const [dmName, setDmName] = useState(initial?.decision_maker ?? "");
  const [dmInvolved, setDmInvolved] = useState<"" | "yes" | "no">(
    initial?.decision_maker_involved == null ? "" : initial.decision_maker_involved ? "yes" : "no"
  );
  const [blockerId, setBlockerId] = useState(initial?.blocker_id ?? "");
  const [blockerNote, setBlockerNote] = useState(initial?.blocker_note ?? "");

  const tenant = profileType === "tenant";
  const blockerLookup = lookups.blockers.find((b) => b.id === blockerId);
  const dmLookup = lookups.decisionMakers.find((d) => d.id === dmId);
  const [locDraft, setLocDraft] = useState("");

  function toggle(list: string[], set: (v: string[]) => void, v: string) {
    set(list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
  }

  function addLocation() {
    const v = locDraft.trim();
    if (!v || locations.includes(v) || locations.length >= 20) return;
    setLocations([...locations, v]);
    setLocDraft("");
  }

  function submit() {
    setError(null);
    if (!goalId) return setError("Зорилгыг сонгоно уу.");
    if (!financing) return setError("Санхүүжилтийг сонгоно уу.");
    if (!timeline) return setError("Хугацааг сонгоно уу.");
    if (!budgetMax) return setError(tenant ? "Сарын төсвийг оруулна уу." : "Дээд төсвийг оруулна уу.");
    if (mustHaves.length < mustHavesMin) return setError(`Заавал байх шаардлагыг дор хаяж ${mustHavesMin}-ыг бүртгэнэ үү.`);
    if (!dmId && !dmName.trim()) return setError("Шийдвэр гаргагчийг сонгоно уу.");
    if (!blockerId) return setError("Одоогийн саадыг сонгоно уу (саад байхгүй бол «Саад байхгүй»).");
    if (blockerLookup?.requires_note && !blockerNote.trim()) return setError("Саадын тайлбарыг бичнэ үү.");
    if (dmLookup?.requires_note && !dmName.trim()) return setError("Шийдвэр гаргагчийг тодруулж бичнэ үү.");
    const payload = {
      id: initial?.id,
      contactId,
      profileType,
      goalId,
      locations,
      propertyTypes,
      budgetMin: numOrNull(budgetMin),
      budgetTarget: numOrNull(budgetTarget),
      budgetMax: Number(budgetMax),
      budgetOverrunApproved: overrun,
      budgetOverrunMax: overrun ? numOrNull(overrunMax) : null,
      financing,
      roomsMin: numOrNull(roomsMin),
      roomsTarget: numOrNull(roomsTarget),
      areaMin: numOrNull(areaMin),
      areaTarget: numOrNull(areaTarget),
      conditions,
      timeline,
      moveInDate: moveInDate || null,
      mustHaves,
      niceToHaves,
      dealBreakers,
      decisionMaker: dmName.trim() || (dmLookup?.label ?? null),
      decisionMakerId: dmId || null,
      decisionMakerInvolved: dmInvolved === "" ? null : dmInvolved === "yes",
      blocker: blockerNote.trim() ? `${blockerLookup?.label ?? ""}: ${blockerNote.trim()}` : (blockerLookup?.label ?? null),
      blockerId: blockerId || null,
      blockerNote: blockerNote.trim() || null,
      occupantKind: tenant ? occupantKind || null : null,
      occupantNote: tenant ? occupantNote.trim() || null : null,
    };
    startTransition(async () => {
      const res = initial?.id ? await updateNeedProfile(payload) : await createNeedProfile(payload);
      if ("error" in res && res.error) {
        setError(res.error);
        return;
      }
      toast.success("Хэрэгцээний профайл хадгалагдлаа", { description: "Оноо, тохируулга шинэчлэгдлээ." });
      onClose();
      router.refresh();
    });
  }

  const chip = (active: boolean) =>
    `rounded-full px-3 py-1.5 text-xs font-semibold transition ${
      active ? "bg-brand-600 text-white" : "border border-line bg-surface text-muted hover:text-ink"
    }`;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={initial ? "Хэрэгцээний профайл засах" : "Хэрэгцээний профайл нэмэх"}
      footer={
        <div className="flex w-full items-center justify-end gap-2">
          <Button variant="ghost" onClick={onClose} disabled={pending}>
            Болих
          </Button>
          <Button onClick={submit} disabled={pending}>
            {pending ? "Хадгалж байна…" : "Хадгалах"}
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        {error ? (
          <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700" role="alert">
            {error}
          </p>
        ) : null}

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Профайлын төрөл">
            <Select value={profileType} onChange={(e) => setProfileType(e.target.value as NeedProfileType)}>
              {NEED_PROFILE_TYPES.map((t) => (
                <option key={t} value={t}>
                  {NEED_PROFILE_TYPE_LABEL[t]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Зорилго (заавал)">
            <Select value={goalId} onChange={(e) => setGoalId(e.target.value)}>
              <option value="">— Сонгох —</option>
              {lookups.goals.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.label}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <Field label="Сонирхсон байршил" hint="Дүүрэг, хороо, төсөл — бүсийн лавлахаас сонгох эсвэл бичих">
          <div className="space-y-1.5">
            <div className="flex flex-wrap gap-1.5">
              {locations.map((l) => (
                <span key={l} className="inline-flex items-center gap-1 rounded-full border border-line bg-surface-2 px-2.5 py-1 text-xs font-medium text-ink">
                  {l}
                  <button type="button" aria-label="Хасах" onClick={() => setLocations(locations.filter((x) => x !== l))}>
                    <X className="size-3" />
                  </button>
                </span>
              ))}
            </div>
            <div className="flex gap-1.5">
              <Input
                list={zonesId}
                value={locDraft}
                onChange={(e) => setLocDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addLocation();
                  }
                }}
                placeholder="Жишээ: Хан-Уул"
                className="flex-1"
              />
              <Button type="button" size="sm" variant="outline" onClick={addLocation} aria-label="Байршил нэмэх">
                <Plus className="size-4" />
              </Button>
            </div>
            <datalist id={zonesId}>
              {lookups.zones.map((z) => (
                <option key={z} value={z} />
              ))}
            </datalist>
          </div>
        </Field>

        <Field label="Үл хөдлөхийн төрөл (олон сонголт)">
          <div className="flex flex-wrap gap-1.5">
            {CRM_PROPERTY_TYPES.map((t) => (
              <button key={t} type="button" onClick={() => toggle(propertyTypes, setPropertyTypes, t)} className={chip(propertyTypes.includes(t))}>
                {CRM_PROPERTY_TYPE_LABEL[t]}
              </button>
            ))}
          </div>
        </Field>

        {tenant ? (
          <Field label="Сарын төсөв (₮, заавал)">
            <Input type="number" inputMode="numeric" value={budgetMax} onChange={(e) => setBudgetMax(e.target.value)} min={0} />
          </Field>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Field label="Доод төсөв (₮)">
              <Input type="number" inputMode="numeric" value={budgetMin} onChange={(e) => setBudgetMin(e.target.value)} min={0} />
            </Field>
            <Field label="Зорилтот (₮)">
              <Input type="number" inputMode="numeric" value={budgetTarget} onChange={(e) => setBudgetTarget(e.target.value)} min={0} />
            </Field>
            <Field label="Дээд (₮)">
              <Input type="number" inputMode="numeric" value={budgetMax} onChange={(e) => setBudgetMax(e.target.value)} min={0} />
            </Field>
          </div>
        )}
        <label className="flex items-center gap-2 text-sm text-ink">
          <input type="checkbox" checked={overrun} onChange={(e) => setOverrun(e.target.checked)} className="size-4 rounded border-line" />
          Харилцагч дээд төсвөөс хэтрэхийг зөвшөөрсөн
        </label>
        {overrun ? (
          <Field label="Зөвшөөрсөн дээд хэмжээ (₮)" hint="Тохируулга энэ хэмжээ хүртэлх үл хөдлөхийг төсөвт багтсан гэж үзнэ">
            <Input type="number" inputMode="numeric" value={overrunMax} onChange={(e) => setOverrunMax(e.target.value)} min={0} />
          </Field>
        ) : null}

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Санхүүжилт (заавал)">
            <Select value={financing} onChange={(e) => setFinancing(e.target.value as (typeof FINANCING_OPTIONS)[number] | "")}>
              <option value="">— Асууж сонгоно —</option>
              {FINANCING_OPTIONS.map((f) => (
                <option key={f} value={f}>
                  {FINANCING_LABEL[f]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Хугацаа (заавал)">
            <Select value={timeline} onChange={(e) => setTimeline(e.target.value as (typeof TIMELINE_OPTIONS)[number] | "")}>
              <option value="">— Асууж сонгоно —</option>
              {TIMELINE_OPTIONS.map((t) => (
                <option key={t} value={t}>
                  {TIMELINE_LABEL[t]}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Field label="Өрөө — наад зах">
            <Input type="number" inputMode="numeric" value={roomsMin} onChange={(e) => setRoomsMin(e.target.value)} min={0} />
          </Field>
          <Field label="Өрөө — сонирхсон">
            <Input type="number" inputMode="numeric" value={roomsTarget} onChange={(e) => setRoomsTarget(e.target.value)} min={0} />
          </Field>
          <Field label="Талбай м² — наад зах">
            <Input type="number" inputMode="numeric" value={areaMin} onChange={(e) => setAreaMin(e.target.value)} min={0} />
          </Field>
          <Field label="Талбай м² — сонирхсон">
            <Input type="number" inputMode="numeric" value={areaTarget} onChange={(e) => setAreaTarget(e.target.value)} min={0} />
          </Field>
        </div>

        <Field label="Нөхцөл байдал">
          <div className="flex flex-wrap gap-1.5">
            {lookups.conditions.map((c) => (
              <button key={c.id} type="button" onClick={() => toggle(conditions, setConditions, c.label)} className={chip(conditions.includes(c.label))}>
                {c.label}
              </button>
            ))}
            {lookups.conditions.length === 0 ? <span className="text-xs text-subtle">Лавлах хоосон.</span> : null}
          </div>
        </Field>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label={tenant ? "Орох огноо (заавал)" : "Орох огноо"}>
            <Input type="date" value={moveInDate} onChange={(e) => setMoveInDate(e.target.value)} />
          </Field>
          {tenant ? (
            <Field label="Өрх буюу бизнесийн хэрэгцээ (заавал)">
              <Select value={occupantKind} onChange={(e) => setOccupantKind(e.target.value as OccupantKind | "")}>
                <option value="">— Сонгох —</option>
                {OCCUPANT_KINDS.map((k) => (
                  <option key={k} value={k}>
                    {OCCUPANT_KIND_LABEL[k]}
                  </option>
                ))}
              </Select>
            </Field>
          ) : null}
        </div>
        {tenant ? (
          <Input value={occupantNote} onChange={(e) => setOccupantNote(e.target.value)} placeholder="Өрхийн бүрэлдэхүүн / бизнесийн төрөл, ажилтны тоо…" />
        ) : null}

        <StructuredList
          label="Заавал байх шийдвэрлэх шаардлага"
          items={mustHaves}
          onChange={setMustHaves}
          max={5}
          placeholder="Жишээ: Лифттэй"
          counter={{ min: mustHavesMin }}
        />
        <StructuredList label="Байвал сайн нөхцөл" items={niceToHaves} onChange={setNiceToHaves} placeholder="Жишээ: Агуулахтай" />
        <StructuredList
          label="Хэлцэл таслах нөхцөл"
          hint="Эдгээрийг зөрчсөн үл хөдлөхийг хүчтэй тохироо гэж үзэхгүй"
          items={dealBreakers}
          onChange={setDealBreakers}
          placeholder="Жишээ: 1 давхарт биш"
        />

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Шийдвэр гаргагч (заавал)">
            <Select value={dmId} onChange={(e) => setDmId(e.target.value)}>
              <option value="">— Сонгох —</option>
              {lookups.decisionMakers.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Шийдвэр гаргагч оролцсон уу">
            <Select value={dmInvolved} onChange={(e) => setDmInvolved(e.target.value as "" | "yes" | "no")}>
              <option value="">— Тодорхойгүй —</option>
              <option value="yes">Тийм, ярилцлагад оролцсон</option>
              <option value="no">Үгүй</option>
            </Select>
          </Field>
        </div>
        <Input value={dmName} onChange={(e) => setDmName(e.target.value)} placeholder="Нэр, хамаарал (заавал биш)" />

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Одоогийн саад (заавал)">
            <Select value={blockerId} onChange={(e) => setBlockerId(e.target.value)}>
              <option value="">— Сонгох —</option>
              {lookups.blockers.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.label}
                </option>
              ))}
            </Select>
          </Field>
          {blockerLookup && blockerLookup.code !== "none" ? (
            <Field label={blockerLookup.requires_note ? "Саадын тайлбар (заавал)" : "Саадын тайлбар"}>
              <Input value={blockerNote} onChange={(e) => setBlockerNote(e.target.value)} />
            </Field>
          ) : null}
        </div>
      </div>
    </Modal>
  );
}

// ── Профайлын хураангуй (сэжим, харилцагчийн карт) ────────

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-3 py-1">
      <dt className="shrink-0 text-muted">{label}</dt>
      <dd className="text-right font-medium text-ink">{value ?? "—"}</dd>
    </div>
  );
}

function fmtMoney(v: number | null | undefined): string | null {
  if (v == null) return null;
  return `${Number(v).toLocaleString("mn-MN")}₮`;
}

/** §6.7 бүх талбар + дутуу талбарын жагсаалт — агент юуг нөхөхөө шууд харна. */
export function NeedProfileSummary({
  profile,
  lookups,
  mustHavesMin = 3,
  onEdit,
}: {
  profile: NeedProfileRow;
  lookups: ProfileLookups;
  mustHavesMin?: number;
  onEdit?: () => void;
}) {
  const p = profile;
  const tenant = p.profile_type === "tenant";
  const label = (rows: { id: string; label: string }[], id: string | null | undefined) =>
    rows.find((r) => r.id === id)?.label ?? null;
  const list = (v: unknown) => (Array.isArray(v) ? v.map(String) : []);
  const missing = profileMissingFields(
    {
      profileType: p.profile_type,
      goalId: p.goal_id,
      locations: list(p.locations),
      propertyTypes: p.property_types,
      budgetMin: p.budget_min,
      budgetTarget: p.budget_target,
      budgetMax: p.budget_max,
      financing: p.financing,
      roomsMin: p.rooms_min,
      areaMin: p.area_min,
      timeline: p.timeline,
      moveInDate: p.move_in_date,
      mustHaves: list(p.must_haves),
      dealBreakers: list(p.deal_breakers),
      decisionMakerId: p.decision_maker_id,
      decisionMaker: p.decision_maker,
      blockerId: p.blocker_id,
      blocker: p.blocker,
      occupantKind: p.occupant_kind,
    },
    mustHavesMin
  );
  const budget = tenant
    ? fmtMoney(p.budget_max)
    : [fmtMoney(p.budget_min), fmtMoney(p.budget_target), fmtMoney(p.budget_max)].map((x) => x ?? "—").join(" / ");

  return (
    <div className="space-y-2">
      {missing.length ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
          <div className="flex items-center justify-between gap-2">
            <span className="font-semibold">Дутуу талбар ({missing.length})</span>
            {onEdit ? (
              <button type="button" className="font-semibold underline" onClick={onEdit}>
                Нөхөх
              </button>
            ) : null}
          </div>
          <p className="mt-1">{missing.join(", ")}</p>
        </div>
      ) : null}
      <dl className="divide-y divide-line text-sm">
        <Row label="Зорилго" value={label(lookups.goals, p.goal_id)} />
        <Row label="Байршил" value={list(p.locations).join(", ") || null} />
        <Row
          label="Төрөл"
          value={(p.property_types ?? []).map((t) => CRM_PROPERTY_TYPE_LABEL[t as keyof typeof CRM_PROPERTY_TYPE_LABEL] ?? t).join(", ") || null}
        />
        <Row label={tenant ? "Сарын төсөв" : "Төсөв (доод / зорилтот / дээд)"} value={budget} />
        {p.budget_overrun_approved ? <Row label="Зөвшөөрсөн хэтрэлт" value={fmtMoney(p.budget_overrun_max)} /> : null}
        <Row label="Санхүүжилт" value={FINANCING_LABEL[p.financing as keyof typeof FINANCING_LABEL] ?? null} />
        <Row
          label="Өрөө / талбай"
          value={
            [
              p.rooms_min != null ? `${p.rooms_min}${p.rooms_target != null ? `–${p.rooms_target}` : "+"} өрөө` : null,
              p.area_min != null ? `${p.area_min}${p.area_target != null ? `–${p.area_target}` : "+"} м²` : null,
            ]
              .filter(Boolean)
              .join(", ") || null
          }
        />
        <Row label="Нөхцөл байдал" value={(p.conditions ?? []).join(", ") || null} />
        <Row label="Хугацаа" value={TIMELINE_LABEL[p.timeline as keyof typeof TIMELINE_LABEL] ?? null} />
        {p.move_in_date ? <Row label="Орох огноо" value={p.move_in_date} /> : null}
        {tenant ? (
          <Row
            label="Өрх / бизнес"
            value={[OCCUPANT_KIND_LABEL[p.occupant_kind as OccupantKind], p.occupant_note].filter(Boolean).join(" — ") || null}
          />
        ) : null}
        <Row label="Заавал байх шаардлага" value={list(p.must_haves).join("; ") || null} />
        <Row label="Байвал сайн" value={list(p.nice_to_haves).join("; ") || null} />
        <Row label="Хэлцэл таслах нөхцөл" value={list(p.deal_breakers).join("; ") || null} />
        <Row
          label="Шийдвэр гаргагч"
          value={
            [label(lookups.decisionMakers, p.decision_maker_id) ?? p.decision_maker, p.decision_maker_involved ? "оролцсон" : null]
              .filter(Boolean)
              .join(", ") || null
          }
        />
        <Row label="Одоогийн саад" value={[label(lookups.blockers, p.blocker_id), p.blocker_note].filter(Boolean).join(": ") || p.blocker} />
      </dl>
    </div>
  );
}
