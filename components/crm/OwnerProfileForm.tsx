"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Search, X } from "lucide-react";

import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Input, Field } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { toast } from "@/components/ui/toast";
import { createOwnerProfile, updateOwnerProfile } from "@/lib/actions/crm-profiles";
import { searchOpportunityProperties } from "@/lib/actions/crm-opportunities";
import type { OwnerProfileRow } from "@/lib/queries-crm-contacts";
import { OWNER_URGENCIES, OWNER_URGENCY_LABEL } from "@/lib/crm/agent-core";
import {
  OWNER_GOALS,
  OWNER_GOAL_LABEL,
  DECISION_AUTHORITIES,
  DECISION_AUTHORITY_LABEL,
  LISTING_STATES,
  LISTING_STATE_LABEL,
} from "@/lib/validation/crm";

/**
 * Өмчлөгчийн профайл (§6.2): үл хөдлөх (бүртгэлээс сонгоно), хүсэж буй
 * нөхцөл, яаралтай эсэх (хаалттай сонголт), шалтгаан, шийдвэрлэх эрх,
 * листингийн төлөв. Урьдчилсан хариулт байхгүй.
 */
export function OwnerProfileForm(props: {
  open: boolean;
  onClose: () => void;
  contactId: string;
  initial?: OwnerProfileRow | null;
  /** Профайлд холбогдсон үл хөдлөхийн нэр (засах үед). */
  initialPropertyLabel?: string | null;
}) {
  if (!props.open) return null;
  return <OwnerProfileFormInner key={props.initial?.id ?? "new"} {...props} />;
}

type Goal = (typeof OWNER_GOALS)[number];
type Authority = (typeof DECISION_AUTHORITIES)[number];
type ListingState = (typeof LISTING_STATES)[number];

function OwnerProfileFormInner({
  open,
  onClose,
  contactId,
  initial,
  initialPropertyLabel,
}: {
  open: boolean;
  onClose: () => void;
  contactId: string;
  initial?: OwnerProfileRow | null;
  initialPropertyLabel?: string | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [searching, startSearch] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [goal, setGoal] = useState<Goal | "">((initial?.goal as Goal) ?? "");
  const [askingPrice, setAskingPrice] = useState(initial?.asking_price != null ? String(initial.asking_price) : "");
  const [terms, setTerms] = useState(initial?.terms ?? "");
  const known = (OWNER_URGENCIES as readonly string[]).includes(initial?.urgency ?? "");
  const [urgency, setUrgency] = useState<string>(known ? (initial?.urgency ?? "") : "");
  const [urgencyNote, setUrgencyNote] = useState(
    initial?.urgency_note ?? (!known && initial?.urgency ? initial.urgency : "")
  );
  const [authority, setAuthority] = useState<Authority | "">((initial?.decision_authority as Authority) ?? "");
  const [listingState, setListingState] = useState<ListingState>((initial?.listing_state as ListingState) ?? "none");
  const [propertyId, setPropertyId] = useState<string | null>(initial?.property_id ?? null);
  const [propertyLabel, setPropertyLabel] = useState<string | null>(initialPropertyLabel ?? null);
  const [propQ, setPropQ] = useState("");
  const [hits, setHits] = useState<{ id: string; number: string; name: string }[]>([]);

  function search() {
    if (propQ.trim().length < 2) return;
    startSearch(async () => {
      const rows = await searchOpportunityProperties(propQ.trim());
      setHits(rows.map((r) => ({ id: r.id, number: r.number, name: r.name })));
    });
  }

  function submit() {
    setError(null);
    if (!goal) return setError("Зорилгыг сонгоно уу.");
    if (!askingPrice) return setError("Хүсэж буй үнийг оруулна уу.");
    if (!urgency) return setError("Яаралтай эсэхийг сонгоно уу.");
    if (!authority) return setError("Шийдвэрлэх эрхийг сонгоно уу.");
    const payload = {
      id: initial?.id,
      contactId,
      propertyId,
      goal,
      askingPrice: Number(askingPrice),
      terms: terms.trim() || null,
      urgency,
      urgencyNote: urgencyNote.trim() || null,
      decisionAuthority: authority,
      listingState,
    };
    startTransition(async () => {
      const res = initial?.id ? await updateOwnerProfile(payload) : await createOwnerProfile(payload);
      if ("error" in res && res.error) {
        setError(res.error);
        return;
      }
      toast.success("Өмчлөгчийн профайл хадгалагдлаа");
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
          <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700" role="alert">
            {error}
          </p>
        ) : null}

        <Field label="Үл хөдлөх" hint="Бүртгэлтэй бол сонгоно; хараахан бүртгээгүй бол хоосон үлдээнэ">
          {propertyId ? (
            <div className="flex items-center justify-between gap-2 rounded-xl border border-line bg-surface-2 px-3 py-2 text-sm">
              <span className="truncate">{propertyLabel ?? "Сонгогдсон үл хөдлөх"}</span>
              <button
                type="button"
                aria-label="Хасах"
                onClick={() => {
                  setPropertyId(null);
                  setPropertyLabel(null);
                }}
              >
                <X className="size-4" />
              </button>
            </div>
          ) : (
            <>
              <div className="flex gap-1.5">
                <Input
                  value={propQ}
                  onChange={(e) => setPropQ(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      search();
                    }
                  }}
                  placeholder="Дугаар эсвэл нэрээр хайх"
                  className="flex-1"
                />
                <Button type="button" size="sm" variant="outline" onClick={search} disabled={searching} aria-label="Хайх">
                  <Search className="size-4" />
                </Button>
              </div>
              {hits.length ? (
                <ul className="mt-1 max-h-40 overflow-auto rounded-xl border border-line">
                  {hits.map((h) => (
                    <li key={h.id}>
                      <button
                        type="button"
                        className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-surface-2"
                        onClick={() => {
                          setPropertyId(h.id);
                          setPropertyLabel(`${h.number} · ${h.name}`);
                          setHits([]);
                        }}
                      >
                        <span className="font-mono text-xs text-muted">{h.number}</span> {h.name}
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
            </>
          )}
        </Field>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Зорилго (заавал)">
            <Select value={goal} onChange={(e) => setGoal(e.target.value as Goal | "")}>
              <option value="">— Сонгох —</option>
              {OWNER_GOALS.map((g) => (
                <option key={g} value={g}>
                  {OWNER_GOAL_LABEL[g]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Хүсэж буй үнэ (₮, заавал)">
            <Input type="number" inputMode="numeric" value={askingPrice} onChange={(e) => setAskingPrice(e.target.value)} min={0} />
          </Field>
        </div>

        <Field label="Хүсэж буй нөхцөл">
          <Input value={terms} onChange={(e) => setTerms(e.target.value)} placeholder="Төлбөрийн нөхцөл, хүлээлцэх хугацаа, тавилга г.м." />
        </Field>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Яаралтай эсэх (заавал)">
            <Select value={urgency} onChange={(e) => setUrgency(e.target.value)}>
              <option value="">— Сонгох —</option>
              {OWNER_URGENCIES.map((u) => (
                <option key={u} value={u}>
                  {OWNER_URGENCY_LABEL[u]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Шалтгаан">
            <Input value={urgencyNote} onChange={(e) => setUrgencyNote(e.target.value)} placeholder="Яагаад худалдах / түрээслүүлэх вэ" />
          </Field>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Шийдвэрлэх эрх (заавал)">
            <Select value={authority} onChange={(e) => setAuthority(e.target.value as Authority | "")}>
              <option value="">— Сонгох —</option>
              {DECISION_AUTHORITIES.map((d) => (
                <option key={d} value={d}>
                  {DECISION_AUTHORITY_LABEL[d]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Листингийн төлөв">
            <Select value={listingState} onChange={(e) => setListingState(e.target.value as ListingState)}>
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
