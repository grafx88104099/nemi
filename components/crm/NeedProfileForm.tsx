"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, X } from "lucide-react";

import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Input, Field } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { createNeedProfile, updateNeedProfile } from "@/lib/actions/crm-profiles";
import type { NeedProfileRow } from "@/lib/queries-crm-contacts";
import type { LookupRow } from "@/lib/queries-crm-core";
import { CRM_PROPERTY_TYPES, CRM_PROPERTY_TYPE_LABEL } from "@/lib/constants-crm";
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
 * Хэрэгцээний профайлын маягт (F-151/152/154, ToR 4.2.1): төсөв ×3,
 * бүтэцтэй заавал шаардлага (3–5), байвал сайн, ТАСЛАХ нөхЦӨл (F-158) —
 * бүгд бүтэцтэй жагсаалтаар. Түрээслэгчид орох огноо заавал (F-152).
 */

function StructuredList({
  label,
  hint,
  items,
  onChange,
  max = 10,
  placeholder,
}: {
  label: string;
  hint?: string;
  items: string[];
  onChange: (items: string[]) => void;
  max?: number;
  placeholder?: string;
}) {
  const [draft, setDraft] = useState("");
  function add() {
    const v = draft.trim();
    if (!v || items.length >= max) return;
    onChange([...items, v]);
    setDraft("");
  }
  return (
    <Field label={label} hint={hint}>
      <div className="space-y-1.5">
        <div className="flex flex-wrap gap-1.5">
          {items.map((it, i) => (
            <span key={`${it}-${i}`} className="inline-flex items-center gap-1 rounded-full border border-line bg-surface-2 px-2.5 py-1 text-xs font-medium text-ink">
              {it}
              <button type="button" aria-label="Хасах" className="text-subtle hover:text-danger" onClick={() => onChange(items.filter((_, j) => j !== i))}>
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
          <Button type="button" size="sm" variant="outline" onClick={add} disabled={items.length >= max}>
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

export function NeedProfileForm(props: {
  open: boolean;
  onClose: () => void;
  contactId: string;
  initial?: NeedProfileRow | null;
  goals: LookupRow[];
}) {
  // Хаалттай үед mount хийхгүй — нээх бүрд шинээр mount болж төлөв
  // useState initializer-ээр цэвэрхэн эхэлнэ (effect-ээр reset хийхгүй).
  if (!props.open) return null;
  return <NeedProfileFormInner key={props.initial?.id ?? "new"} {...props} />;
}

function NeedProfileFormInner({
  open,
  onClose,
  contactId,
  initial,
  goals,
}: {
  open: boolean;
  onClose: () => void;
  contactId: string;
  initial?: NeedProfileRow | null;
  goals: LookupRow[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [profileType, setProfileType] = useState<NeedProfileType>(
    (initial?.profile_type as NeedProfileType) ?? "buyer"
  );
  const [goalId, setGoalId] = useState(initial?.goal_id ?? "");
  const [locations, setLocations] = useState<string[]>(() => jsonToList(initial?.locations));
  const [propertyTypes, setPropertyTypes] = useState<string[]>(initial?.property_types ?? []);
  const [budgetMin, setBudgetMin] = useState(initial?.budget_min != null ? String(initial.budget_min) : "");
  const [budgetTarget, setBudgetTarget] = useState(initial?.budget_target != null ? String(initial.budget_target) : "");
  const [budgetMax, setBudgetMax] = useState(initial?.budget_max != null ? String(initial.budget_max) : "");
  const [financing, setFinancing] = useState<(typeof FINANCING_OPTIONS)[number]>(
    (initial?.financing as (typeof FINANCING_OPTIONS)[number]) ?? "loan"
  );
  const [roomsMin, setRoomsMin] = useState(initial?.rooms_min != null ? String(initial.rooms_min) : "");
  const [areaMin, setAreaMin] = useState(initial?.area_min != null ? String(initial.area_min) : "");
  const [conditions, setConditions] = useState<string[]>(initial?.conditions ?? []);
  const [timeline, setTimeline] = useState<(typeof TIMELINE_OPTIONS)[number]>(
    (initial?.timeline as (typeof TIMELINE_OPTIONS)[number]) ?? "1_3m"
  );
  const [moveInDate, setMoveInDate] = useState(initial?.move_in_date ?? "");
  const [mustHaves, setMustHaves] = useState<string[]>(() => jsonToList(initial?.must_haves));
  const [niceToHaves, setNiceToHaves] = useState<string[]>(() => jsonToList(initial?.nice_to_haves));
  const [dealBreakers, setDealBreakers] = useState<string[]>(() => jsonToList(initial?.deal_breakers));
  const [decisionMaker, setDecisionMaker] = useState(initial?.decision_maker ?? "");
  const [blocker, setBlocker] = useState(initial?.blocker ?? "");

  function togglePropertyType(t: string) {
    setPropertyTypes((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]));
  }

  function submit() {
    setError(null);
    const payload = {
      id: initial?.id,
      contactId,
      profileType,
      goalId: goalId || null,
      locations,
      propertyTypes,
      budgetMin: budgetMin ? Number(budgetMin) : null,
      budgetTarget: budgetTarget ? Number(budgetTarget) : null,
      budgetMax: Number(budgetMax || 0),
      financing,
      roomsMin: roomsMin ? Number(roomsMin) : null,
      areaMin: areaMin ? Number(areaMin) : null,
      conditions,
      timeline,
      moveInDate: moveInDate || null,
      mustHaves,
      niceToHaves,
      dealBreakers,
      decisionMaker: decisionMaker.trim() || null,
      blocker: blocker.trim() || null,
    };
    startTransition(async () => {
      const res = initial?.id ? await updateNeedProfile(payload) : await createNeedProfile(payload);
      if ("error" in res && res.error) {
        setError(res.error);
        return;
      }
      onClose();
      router.refresh();
    });
  }

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
          <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>
        ) : null}

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Профайлын төрөл">
            <Select value={profileType} onChange={(e) => setProfileType(e.target.value as NeedProfileType)}>
              {NEED_PROFILE_TYPES.map((t) => (
                <option key={t} value={t}>
                  {NEED_PROFILE_TYPE_LABEL[t]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Зорилго">
            <Select value={goalId} onChange={(e) => setGoalId(e.target.value)}>
              <option value="">— Сонгох —</option>
              {goals.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.label}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <StructuredList
          label="Сонирхсон байршил"
          hint="Дүүрэг, хороо, төсөл — тохируулгын үндсэн шалгуур"
          items={locations}
          onChange={setLocations}
          max={20}
          placeholder="Жишээ: Хан-Уул, Зайсан"
        />

        <Field label="Үл хөдлөхийн төрөл (олон сонголт)">
          <div className="flex flex-wrap gap-1.5">
            {CRM_PROPERTY_TYPES.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => togglePropertyType(t)}
                className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
                  propertyTypes.includes(t)
                    ? "bg-brand-600 text-white"
                    : "border border-line bg-surface text-muted hover:text-ink"
                }`}
              >
                {CRM_PROPERTY_TYPE_LABEL[t]}
              </button>
            ))}
          </div>
        </Field>

        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Төсөв — доод (₮)">
            <Input type="number" value={budgetMin} onChange={(e) => setBudgetMin(e.target.value)} min={0} />
          </Field>
          <Field label="Зорилтот (₮)">
            <Input type="number" value={budgetTarget} onChange={(e) => setBudgetTarget(e.target.value)} min={0} />
          </Field>
          <Field label="Дээд (₮) — заавал" hint={profileType === "tenant" ? "Түрээслэгчид сарын төсөв" : undefined}>
            <Input type="number" value={budgetMax} onChange={(e) => setBudgetMax(e.target.value)} min={0} required />
          </Field>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Санхүүжилт">
            <Select value={financing} onChange={(e) => setFinancing(e.target.value as (typeof FINANCING_OPTIONS)[number])}>
              {FINANCING_OPTIONS.map((f) => (
                <option key={f} value={f}>
                  {FINANCING_LABEL[f]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Өрөө (доод)">
            <Input type="number" value={roomsMin} onChange={(e) => setRoomsMin(e.target.value)} min={0} />
          </Field>
          <Field label="Талбай м² (доод)">
            <Input type="number" value={areaMin} onChange={(e) => setAreaMin(e.target.value)} min={0} />
          </Field>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Хугацаа">
            <Select value={timeline} onChange={(e) => setTimeline(e.target.value as (typeof TIMELINE_OPTIONS)[number])}>
              {TIMELINE_OPTIONS.map((t) => (
                <option key={t} value={t}>
                  {TIMELINE_LABEL[t]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Орох огноо" hint={profileType === "tenant" ? "Түрээслэгчид заавал (F-152)" : undefined}>
            <Input type="date" value={moveInDate} onChange={(e) => setMoveInDate(e.target.value)} />
          </Field>
        </div>

        <StructuredList
          label="Заавал байх шаардлага (3–5)"
          hint="Тохируулгын оноонд ашиглана"
          items={mustHaves}
          onChange={setMustHaves}
          max={5}
          placeholder="Жишээ: Лифттэй"
        />
        <StructuredList label="Байвал сайн нөхцөл" items={niceToHaves} onChange={setNiceToHaves} placeholder="Жишээ: Агуулахтай" />
        <StructuredList
          label="Хэлцэл таслах нөхцөл (F-158)"
          hint="Эдгээрийг зөрчсөн объект санал болгогдохгүй"
          items={dealBreakers}
          onChange={setDealBreakers}
          placeholder="Жишээ: 1 давхарт байх ёсгүй"
        />

        <StructuredList label="Нөхцөл байдал" items={conditions} onChange={setConditions} max={20} placeholder="Шинэ / тавилгатай…" />

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Шийдвэр гаргагч">
            <Input value={decisionMaker} onChange={(e) => setDecisionMaker(e.target.value)} placeholder="Өөрөө / гэр бүл / удирдлага" />
          </Field>
          <Field label="Одоогийн саад">
            <Input value={blocker} onChange={(e) => setBlocker(e.target.value)} placeholder="Үнэ / санхүүжилт / хугацаа…" />
          </Field>
        </div>
      </div>
    </Modal>
  );
}
