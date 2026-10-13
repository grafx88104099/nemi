"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Input, Field } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { createOwnerProfile, updateOwnerProfile } from "@/lib/actions/crm-profiles";
import type { OwnerProfileRow } from "@/lib/queries-crm-contacts";
import {
  OWNER_GOALS,
  OWNER_GOAL_LABEL,
  DECISION_AUTHORITIES,
  DECISION_AUTHORITY_LABEL,
  LISTING_STATES,
  LISTING_STATE_LABEL,
} from "@/lib/validation/crm";

/**
 * Өмчлөгчийн профайлын маягт (F-153, ToR 4.2.2): зорилго, хүсэж буй үнэ,
 * шийдвэрлэх эрх, листингийн төлөв. Объектын холбоос U3-ийн properties
 * бүртгэгдсэний дараа сонгогдоно (одоогоор ID гараар).
 */
export function OwnerProfileForm(props: {
  open: boolean;
  onClose: () => void;
  contactId: string;
  initial?: OwnerProfileRow | null;
}) {
  // Хаалттай үед mount хийхгүй — нээх бүрд шинээр mount болж төлөв
  // useState initializer-ээр цэвэрхэн эхэлнэ (effect-ээр reset хийхгүй).
  if (!props.open) return null;
  return <OwnerProfileFormInner key={props.initial?.id ?? "new"} {...props} />;
}

function OwnerProfileFormInner({
  open,
  onClose,
  contactId,
  initial,
}: {
  open: boolean;
  onClose: () => void;
  contactId: string;
  initial?: OwnerProfileRow | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [goal, setGoal] = useState<(typeof OWNER_GOALS)[number]>(
    (initial?.goal as (typeof OWNER_GOALS)[number]) ?? "sell"
  );
  const [askingPrice, setAskingPrice] = useState(initial?.asking_price != null ? String(initial.asking_price) : "");
  const [terms, setTerms] = useState(initial?.terms ?? "");
  const [urgency, setUrgency] = useState(initial?.urgency ?? "");
  const [urgencyNote, setUrgencyNote] = useState(initial?.urgency_note ?? "");
  const [decisionAuthority, setDecisionAuthority] = useState<(typeof DECISION_AUTHORITIES)[number]>(
    (initial?.decision_authority as (typeof DECISION_AUTHORITIES)[number]) ?? "sole"
  );
  const [listingState, setListingState] = useState<(typeof LISTING_STATES)[number]>(
    (initial?.listing_state as (typeof LISTING_STATES)[number]) ?? "none"
  );

  function submit() {
    setError(null);
    const payload = {
      id: initial?.id,
      contactId,
      propertyId: initial?.property_id ?? null,
      goal,
      askingPrice: Number(askingPrice || 0),
      terms: terms.trim() || null,
      urgency: urgency.trim() || null,
      urgencyNote: urgencyNote.trim() || null,
      decisionAuthority,
      listingState,
    };
    startTransition(async () => {
      const res = initial?.id ? await updateOwnerProfile(payload) : await createOwnerProfile(payload);
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
      title={initial ? "Өмчлөгчийн профайл засах" : "Өмчлөгчийн профайл нэмэх"}
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
          <Field label="Зорилго">
            <Select value={goal} onChange={(e) => setGoal(e.target.value as (typeof OWNER_GOALS)[number])}>
              {OWNER_GOALS.map((g) => (
                <option key={g} value={g}>
                  {OWNER_GOAL_LABEL[g]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Хүсэж буй үнэ (₮)" hint="Зах зээлийн үнэлгээтэй харьцуулагдана">
            <Input type="number" value={askingPrice} onChange={(e) => setAskingPrice(e.target.value)} min={0} required />
          </Field>
        </div>

        <Field label="Нөхцөл">
          <Input value={terms} onChange={(e) => setTerms(e.target.value)} placeholder="Төлбөрийн нөхцөл, тавилга г.м." />
        </Field>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Яаралтай эсэх">
            <Input value={urgency} onChange={(e) => setUrgency(e.target.value)} placeholder="Яаралтай / хэвийн" />
          </Field>
          <Field label="Шалтгаан">
            <Input value={urgencyNote} onChange={(e) => setUrgencyNote(e.target.value)} />
          </Field>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Шийдвэрлэх эрх">
            <Select
              value={decisionAuthority}
              onChange={(e) => setDecisionAuthority(e.target.value as (typeof DECISION_AUTHORITIES)[number])}
            >
              {DECISION_AUTHORITIES.map((d) => (
                <option key={d} value={d}>
                  {DECISION_AUTHORITY_LABEL[d]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Листингийн төлөв">
            <Select value={listingState} onChange={(e) => setListingState(e.target.value as (typeof LISTING_STATES)[number])}>
              {LISTING_STATES.map((s) => (
                <option key={s} value={s}>
                  {LISTING_STATE_LABEL[s]}
                </option>
              ))}
            </Select>
          </Field>
        </div>
      </div>
    </Modal>
  );
}
