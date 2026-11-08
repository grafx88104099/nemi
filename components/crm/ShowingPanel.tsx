"use client";

import { useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CalendarClock, CheckCircle2, Eye, MessageSquareText, Search, XCircle } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Input, Field } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { Select } from "@/components/ui/select";
import { toast } from "@/components/ui/toast";
import { scheduleShowing, completeShowing, cancelShowing, recordShowingFeedback } from "@/lib/actions/crm-showings";
import { searchOpportunitySources, searchOpportunityProperties } from "@/lib/actions/crm-opportunities";
import type { MatchOption, ShowingRow } from "@/lib/queries-crm-pipeline";
import type { DealSourceOption, PropertyOption } from "@/lib/queries-crm-pipeline";
import {
  FEEDBACK_CATEGORIES,
  FEEDBACK_CATEGORY_LABEL,
  MATCH_STRENGTH_TEXT,
  SHOWING_INTEREST_LABEL,
  SHOWING_NEXT_ACTION_LABEL,
  SHOWING_STATUS_LABEL,
  showingFeedbackError,
  showingFeedbackOverdue,
  showingNeedsReason,
  type FeedbackCategory,
  type MatchStrength,
  type ShowingInterest,
  type ShowingNextAction,
} from "@/lib/crm/deal-flow";
import { fmtDateTime } from "@/lib/format";
import { toIsoDate } from "@/lib/crm/calendar";

/**
 * Үзлэг (§6.15): товлох (огноо, цаг, үл хөдлөх, оролцогч; тохирол сул бол
 * үндэслэл), хийгдсэн, цуцалсан / ирээгүй, эргэх холбоо (ангилал,
 * сонирхол, сонирхсон бол дараагийн үйлдэл + огноо). Тохироогүй бол
 * хэрэгцээний профайлыг шинэчлэх холбоос.
 */

function today(): string {
  return toIsoDate(new Date());
}

function localNowPlusHour(): string {
  const d = new Date(Date.now() + 3600000);
  d.setMinutes(0, 0, 0);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:00`;
}

export function ShowingPanel({
  opportunityId,
  contactId,
  contactName,
  listing,
  property,
  showings,
  matchOptions,
  isOpen,
  feedbackHours,
  basePath,
  id,
}: {
  opportunityId: string;
  contactId: string;
  contactName: string;
  /** PL-2: листингийн карт — үзэгчийг (худалдан авагч) сонгоно. */
  listing: boolean;
  property: { id: string; name: string; number: string } | null;
  showings: ShowingRow[];
  matchOptions: MatchOption[];
  isOpen: boolean;
  /** Эргэх холбооны хугацаа (цаг) — automation_thresholds.showing_feedback_hours. */
  feedbackHours: number;
  basePath: string;
  id?: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [, startSearch] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // Товлох
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [propertyId, setPropertyId] = useState(property?.id ?? matchOptions[0]?.property_id ?? "");
  const [otherProperty, setOtherProperty] = useState<PropertyOption | null>(null);
  const [propertyQ, setPropertyQ] = useState("");
  const [propertyResults, setPropertyResults] = useState<PropertyOption[]>([]);
  const [visitor, setVisitor] = useState<DealSourceOption | null>(null);
  const [visitorQ, setVisitorQ] = useState("");
  const [visitorResults, setVisitorResults] = useState<DealSourceOption[]>([]);
  const [scheduledAt, setScheduledAt] = useState(localNowPlusHour());
  const [duration, setDuration] = useState("30");
  const [meetingPoint, setMeetingPoint] = useState("");
  const [participants, setParticipants] = useState("");
  const [weakReason, setWeakReason] = useState("");
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Цуцлах
  const [cancelFor, setCancelFor] = useState<ShowingRow | null>(null);
  const [cancelStatus, setCancelStatus] = useState<"cancelled" | "no_show">("cancelled");
  const [cancelReason, setCancelReason] = useState("");

  // Эргэх холбоо
  const [feedbackFor, setFeedbackFor] = useState<ShowingRow | null>(null);
  const [fbCategory, setFbCategory] = useState<FeedbackCategory | "">("");
  const [fbNote, setFbNote] = useState("");
  const [fbInterest, setFbInterest] = useState<ShowingInterest | "">("");
  const [fbNext, setFbNext] = useState<ShowingNextAction | "">("");
  const [fbDate, setFbDate] = useState("");

  const selectedPropertyId = otherProperty?.id ?? propertyId;
  const match = matchOptions.find((m) => m.property_id === selectedPropertyId);
  const strength: MatchStrength = listing ? "possible" : ((match?.strength as MatchStrength | undefined) ?? "none");
  const needsReason = !listing && showingNeedsReason(strength);

  function debounced(fn: () => void) {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(fn, 250);
  }

  function submitSchedule() {
    setError(null);
    const pid = listing ? property?.id : selectedPropertyId;
    const cid = listing ? visitor?.contact_id : contactId;
    if (!pid) {
      setError(listing ? "Листингийн карт дээр үл хөдлөхөө эхлээд холбоно уу." : "Үл хөдлөхийг сонгоно уу.");
      return;
    }
    if (!cid) {
      setError("Үзэх худалдан авагчийг сонгоно уу.");
      return;
    }
    if (needsReason && !weakReason.trim()) {
      setError("Тохирол сул эсвэл тооцоогүй тул үзүүлэх үндэслэлээ бичнэ үү.");
      return;
    }
    startTransition(async () => {
      const res = await scheduleShowing({
        opportunityId: listing ? null : opportunityId,
        contactId: cid,
        propertyId: pid,
        scheduledAt: new Date(scheduledAt).toISOString(),
        durationMin: duration ? Number(duration) : null,
        meetingPoint: meetingPoint.trim() || null,
        participants: participants.trim(),
        weakMatchReason: weakReason.trim() || null,
      });
      if (res.error) {
        setError(res.error);
        return;
      }
      toast.success("Үзлэг товлогдлоо");
      setScheduleOpen(false);
      setWeakReason("");
      setParticipants("");
      setMeetingPoint("");
      setVisitor(null);
      router.refresh();
    });
  }

  function markDone(s: ShowingRow) {
    setError(null);
    startTransition(async () => {
      const res = await completeShowing(s.id);
      if (!res.ok) {
        setError(res.error ?? "Алдаа гарлаа.");
        return;
      }
      toast.success("Үзлэг хийгдсэн гэж тэмдэглэлээ", {
        description: `${feedbackHours} цагийн дотор эргэх холбоо бүртгэнэ үү.`,
      });
      setFeedbackFor({ ...s, status: "done", done_at: new Date().toISOString() });
      router.refresh();
    });
  }

  function submitCancel() {
    if (!cancelFor) return;
    setError(null);
    startTransition(async () => {
      const res = await cancelShowing(cancelFor.id, cancelStatus, cancelReason);
      if (!res.ok) {
        setError(res.error ?? "Алдаа гарлаа.");
        return;
      }
      setCancelFor(null);
      setCancelReason("");
      router.refresh();
    });
  }

  function submitFeedback() {
    if (!feedbackFor) return;
    const err = showingFeedbackError(
      {
        feedbackCategory: fbCategory || null,
        interest: fbInterest || null,
        nextAction: fbNext || null,
        nextStepDate: fbDate || null,
      },
      today()
    );
    if (err) {
      setError(err);
      return;
    }
    if (fbNote.trim().length < 2) {
      setError("Харилцагчийн санал, сэтгэгдлийг бичнэ үү.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const res = await recordShowingFeedback({
        showingId: feedbackFor.id,
        feedbackCategory: fbCategory as FeedbackCategory,
        feedbackNote: fbNote.trim(),
        interest: fbInterest as ShowingInterest,
        nextAction: fbNext || null,
        nextStepDate: fbDate || null,
      });
      if (!res.ok) {
        setError(res.error ?? "Алдаа гарлаа.");
        return;
      }
      toast.success("Эргэх холбоо бүртгэгдлээ");
      setFeedbackFor(null);
      setFbCategory("");
      setFbNote("");
      setFbInterest("");
      setFbNext("");
      setFbDate("");
      router.refresh();
    });
  }

  const now = new Date();

  return (
    <Card id={id}>
      <CardBody>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-ink">
            <Eye className="size-4 text-brand-600" /> Үзлэг ({showings.length})
          </h3>
          {isOpen ? (
            <Button size="sm" variant="outline" onClick={() => setScheduleOpen(true)}>
              <CalendarClock className="size-4" /> Үзлэг товлох
            </Button>
          ) : null}
        </div>

        {showings.length === 0 ? (
          <EmptyState
            compact
            icon={Eye}
            title="Үзлэг бүртгэгдээгүй"
            description={
              listing
                ? "Шалгуур хангасан худалдан авагчдад үзүүлж, үзлэг бүрийг бүртгэнэ."
                : "Тохирох үл хөдлөхөөр үзлэг товлож, хийгдсэний дараа 24 цагт эргэх холбоо авна."
            }
            action={isOpen ? { label: "Үзлэг товлох", onClick: () => setScheduleOpen(true) } : undefined}
          />
        ) : (
          <ul className="space-y-2">
            {showings.map((s) => {
              const st = SHOWING_STATUS_LABEL[s.status];
              const overdue = showingFeedbackOverdue(s.done_at, s.feedback_at, now, feedbackHours);
              return (
                <li key={s.id} className="rounded-xl border border-line p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone={st.tone}>{st.label}</Badge>
                    <span className="text-sm font-medium text-ink">{fmtDateTime(s.scheduled_at)}</span>
                    {s.interest ? (
                      <Badge tone={SHOWING_INTEREST_LABEL[s.interest as ShowingInterest].tone}>
                        {SHOWING_INTEREST_LABEL[s.interest as ShowingInterest].label}
                      </Badge>
                    ) : null}
                    {overdue ? <Badge tone="rose">Эргэх холбоо хоцорсон</Badge> : null}
                  </div>
                  <p className="mt-1 text-xs text-muted">
                    {s.property_name ? (
                      <Link href={`${basePath}/properties/${s.property_id}`} className="hover:text-brand-700">
                        {s.property_name} <span className="font-mono">{s.property_number}</span>
                      </Link>
                    ) : null}
                    {listing && s.contact_name ? ` · Үзэгч: ${s.contact_name}` : ""}
                    {s.agent_name ? ` · ${s.agent_name}` : ""}
                    {s.participants ? ` · Оролцогч: ${s.participants}` : ""}
                  </p>
                  {s.match_strength && s.match_strength !== "strong" ? (
                    <p className="mt-0.5 text-xs text-amber-700">
                      {MATCH_STRENGTH_TEXT[s.match_strength as MatchStrength]}
                      {s.weak_match_reason ? ` — ${s.weak_match_reason}` : ""}
                    </p>
                  ) : null}
                  {s.feedback_category ? (
                    <p className="mt-1 text-xs text-ink">
                      {FEEDBACK_CATEGORY_LABEL[s.feedback_category as FeedbackCategory]}: {s.feedback_note}
                      {s.next_action
                        ? ` → ${SHOWING_NEXT_ACTION_LABEL[s.next_action as ShowingNextAction]}${s.next_step_date ? ` (${s.next_step_date})` : ""}`
                        : ""}
                    </p>
                  ) : null}
                  {s.cancel_reason ? <p className="mt-1 text-xs text-muted">Шалтгаан: {s.cancel_reason}</p> : null}
                  {s.status === "done" && s.interest === "not_interested" && !listing ? (
                    <Link
                      href={`${basePath}/contacts/${contactId}`}
                      className="mt-1 inline-block text-xs font-medium text-brand-700 hover:underline"
                    >
                      Хэрэгцээний профайлыг шинэчлэх →
                    </Link>
                  ) : null}
                  <div className="mt-2 flex flex-wrap gap-2">
                    {s.status === "scheduled" ? (
                      <>
                        <Button size="sm" disabled={pending} onClick={() => markDone(s)}>
                          <CheckCircle2 className="size-4" /> Хийгдсэн
                        </Button>
                        <Button size="sm" variant="ghost" disabled={pending} onClick={() => setCancelFor(s)}>
                          <XCircle className="size-4" /> Цуцлах / ирээгүй
                        </Button>
                      </>
                    ) : null}
                    {s.status === "done" && !s.feedback_at ? (
                      <Button
                        size="sm"
                        variant={overdue ? "danger" : "outline"}
                        disabled={pending}
                        onClick={() => setFeedbackFor(s)}
                      >
                        <MessageSquareText className="size-4" /> Эргэх холбоо бүртгэх
                      </Button>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        {error && !scheduleOpen && !feedbackFor && !cancelFor ? (
          <p className="mt-2 text-sm text-danger">{error}</p>
        ) : null}
      </CardBody>

      {/* Товлох */}
      <Modal
        open={scheduleOpen}
        onClose={() => setScheduleOpen(false)}
        title="Үзлэг товлох"
        footer={
          <>
            <Button variant="outline" onClick={() => setScheduleOpen(false)}>
              Болих
            </Button>
            <Button disabled={pending} onClick={submitSchedule}>
              Товлох
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          {listing ? (
            <>
              <p className="text-sm text-muted">
                Үл хөдлөх:{" "}
                <span className="font-medium text-ink">
                  {property ? `${property.name} ${property.number}` : "холбогдоогүй"}
                </span>
              </p>
              <div>
                <p className="mb-1.5 text-sm font-medium text-ink">Үзэх худалдан авагч</p>
                {visitor ? (
                  <div className="flex items-center justify-between rounded-xl border border-line bg-surface-2 px-3 py-2 text-sm">
                    <span className="font-medium text-ink">{visitor.label}</span>
                    <button type="button" className="text-xs text-muted hover:text-ink" onClick={() => setVisitor(null)}>
                      Солих
                    </button>
                  </div>
                ) : (
                  <>
                    <div className="relative">
                      <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-subtle" />
                      <Input
                        className="pl-9"
                        value={visitorQ}
                        placeholder="Нэр эсвэл дугаараар…"
                        aria-label="Худалдан авагч хайх"
                        onChange={(e) => {
                          const q = e.target.value;
                          setVisitorQ(q);
                          debounced(() => startSearch(async () => setVisitorResults(await searchOpportunitySources(q))));
                        }}
                      />
                    </div>
                    {visitorResults.length > 0 ? (
                      <ul className="mt-1 max-h-44 overflow-y-auto rounded-xl border border-line bg-surface">
                        {visitorResults
                          .filter((v, i, arr) => arr.findIndex((x) => x.contact_id === v.contact_id) === i)
                          .map((v) => (
                            <li key={`${v.kind}-${v.id}`}>
                              <button
                                type="button"
                                className="w-full px-3 py-2 text-left text-sm hover:bg-surface-2"
                                onClick={() => {
                                  setVisitor(v);
                                  setVisitorResults([]);
                                }}
                              >
                                {v.label} <span className="text-xs text-muted">{v.sub}</span>
                              </button>
                            </li>
                          ))}
                      </ul>
                    ) : null}
                  </>
                )}
              </div>
            </>
          ) : (
            <>
              <p className="text-sm text-muted">
                Харилцагч: <span className="font-medium text-ink">{contactName}</span>
              </p>
              <Field label="Үл хөдлөх" htmlFor="showing-property">
                <Select
                  id="showing-property"
                  value={otherProperty ? "__other" : propertyId}
                  onChange={(e) => {
                    if (e.target.value !== "__other") {
                      setOtherProperty(null);
                      setPropertyId(e.target.value);
                    }
                  }}
                >
                  <option value="">— Сонгоно уу —</option>
                  {property && !matchOptions.some((m) => m.property_id === property.id) ? (
                    <option value={property.id}>
                      {property.name} {property.number} · картад холбогдсон
                    </option>
                  ) : null}
                  {matchOptions.map((m) => (
                    <option key={m.property_id} value={m.property_id}>
                      {m.property_name} {m.property_number} · {MATCH_STRENGTH_TEXT[m.strength as MatchStrength] ?? ""} (
                      {Math.round(m.score)})
                    </option>
                  ))}
                  {otherProperty ? (
                    <option value="__other">
                      {otherProperty.name} {otherProperty.number}
                    </option>
                  ) : null}
                </Select>
              </Field>
              <div>
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-subtle" />
                  <Input
                    className="pl-9"
                    value={propertyQ}
                    placeholder="Өөр үл хөдлөх хайх…"
                    aria-label="Өөр үл хөдлөх хайх"
                    onChange={(e) => {
                      const q = e.target.value;
                      setPropertyQ(q);
                      debounced(() =>
                        startSearch(async () => setPropertyResults(await searchOpportunityProperties(q)))
                      );
                    }}
                  />
                </div>
                {propertyResults.length > 0 ? (
                  <ul className="mt-1 max-h-40 overflow-y-auto rounded-xl border border-line bg-surface">
                    {propertyResults.map((p) => (
                      <li key={p.id}>
                        <button
                          type="button"
                          className="w-full px-3 py-2 text-left text-sm hover:bg-surface-2"
                          onClick={() => {
                            setOtherProperty(p);
                            setPropertyResults([]);
                            setPropertyQ("");
                          }}
                        >
                          <span className="font-mono text-xs text-subtle">{p.number}</span> {p.name}
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
              {selectedPropertyId ? (
                <p className={needsReason ? "text-xs font-medium text-amber-700" : "text-xs text-emerald-700"}>
                  Тохирол: {MATCH_STRENGTH_TEXT[strength]}
                  {match ? ` (${Math.round(match.score)} оноо)` : ""}
                </p>
              ) : null}
            </>
          )}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_8rem]">
            <Field label="Огноо, цаг" htmlFor="showing-at">
              <Input
                id="showing-at"
                type="datetime-local"
                value={scheduledAt}
                onChange={(e) => setScheduledAt(e.target.value)}
              />
            </Field>
            <Field label="Үргэлжлэх (мин)" htmlFor="showing-dur">
              <Input
                id="showing-dur"
                type="number"
                inputMode="numeric"
                min="5"
                value={duration}
                onChange={(e) => setDuration(e.target.value)}
              />
            </Field>
          </div>
          <Field label="Уулзах цэг" htmlFor="showing-point">
            <Input id="showing-point" value={meetingPoint} onChange={(e) => setMeetingPoint(e.target.value)} />
          </Field>
          <Field label="Оролцогчид" htmlFor="showing-people" hint="Харилцагч, хамт ирэх хүмүүс, өмчлөгч эсвэл бусад агент">
            <Input id="showing-people" value={participants} onChange={(e) => setParticipants(e.target.value)} />
          </Field>
          {needsReason ? (
            <Field label="Үзүүлэх үндэслэл (заавал)" htmlFor="showing-reason">
              <Input id="showing-reason" value={weakReason} onChange={(e) => setWeakReason(e.target.value)} />
            </Field>
          ) : null}
          {error ? <p className="text-sm text-danger">{error}</p> : null}
        </div>
      </Modal>

      {/* Цуцлах / ирээгүй */}
      <Modal
        open={cancelFor !== null}
        onClose={() => setCancelFor(null)}
        title="Үзлэг цуцлах"
        footer={
          <>
            <Button variant="outline" onClick={() => setCancelFor(null)}>
              Болих
            </Button>
            <Button variant="danger" disabled={pending || !cancelReason.trim()} onClick={submitCancel}>
              Хадгалах
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <Field label="Төлөв" htmlFor="showing-cancel-st">
            <Select
              id="showing-cancel-st"
              value={cancelStatus}
              onChange={(e) => setCancelStatus(e.target.value as "cancelled" | "no_show")}
            >
              <option value="cancelled">Цуцалсан</option>
              <option value="no_show">Харилцагч ирээгүй</option>
            </Select>
          </Field>
          <Field label="Шалтгаан" htmlFor="showing-cancel-reason">
            <Input id="showing-cancel-reason" value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} />
          </Field>
          {error ? <p className="text-sm text-danger">{error}</p> : null}
        </div>
      </Modal>

      {/* Эргэх холбоо */}
      <Modal
        open={feedbackFor !== null}
        onClose={() => setFeedbackFor(null)}
        title="Үзлэгийн эргэх холбоо"
        footer={
          <>
            <Button variant="outline" onClick={() => setFeedbackFor(null)}>
              Дараа бүртгэх
            </Button>
            <Button disabled={pending} onClick={submitFeedback}>
              Хадгалах
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <Field label="Гол санал, сэтгэгдлийн ангилал" htmlFor="fb-cat">
            <Select id="fb-cat" value={fbCategory} onChange={(e) => setFbCategory(e.target.value as FeedbackCategory)}>
              <option value="">— Сонгоно уу —</option>
              {FEEDBACK_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {FEEDBACK_CATEGORY_LABEL[c]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Харилцагчийн санал, сэтгэгдэл" htmlFor="fb-note">
            <Input id="fb-note" value={fbNote} onChange={(e) => setFbNote(e.target.value)} />
          </Field>
          <fieldset>
            <legend className="mb-1.5 text-sm font-medium text-ink">Сонирхол</legend>
            <div className="grid grid-cols-3 gap-2">
              {(Object.keys(SHOWING_INTEREST_LABEL) as ShowingInterest[]).map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setFbInterest(k)}
                  className={
                    fbInterest === k
                      ? "min-h-11 rounded-xl border border-brand-500 bg-brand-50 px-2 text-sm font-medium text-brand-700"
                      : "min-h-11 rounded-xl border border-line bg-surface px-2 text-sm text-ink hover:bg-surface-2"
                  }
                  aria-pressed={fbInterest === k}
                >
                  {SHOWING_INTEREST_LABEL[k].label}
                </button>
              ))}
            </div>
          </fieldset>
          {fbInterest === "interested" ? (
            <Field label="Дараагийн үйлдэл" htmlFor="fb-next">
              <Select id="fb-next" value={fbNext} onChange={(e) => setFbNext(e.target.value as ShowingNextAction)}>
                <option value="">— Сонгоно уу —</option>
                {(Object.keys(SHOWING_NEXT_ACTION_LABEL) as ShowingNextAction[]).map((k) => (
                  <option key={k} value={k}>
                    {SHOWING_NEXT_ACTION_LABEL[k]}
                  </option>
                ))}
              </Select>
            </Field>
          ) : null}
          <Field
            label={fbInterest === "interested" ? "Дараагийн үйлдлийн огноо (заавал)" : "Дараагийн холболтын огноо"}
            htmlFor="fb-date"
          >
            <Input id="fb-date" type="date" min={today()} value={fbDate} onChange={(e) => setFbDate(e.target.value)} />
          </Field>
          {fbInterest === "not_interested" && !listing ? (
            <p className="text-xs text-muted">
              Тохироогүй бол хэрэгцээний профайлыг шинэчилж дараагийн тохируулгыг сайжруулна.
            </p>
          ) : null}
          {error ? <p className="text-sm text-danger">{error}</p> : null}
        </div>
      </Modal>
    </Card>
  );
}
