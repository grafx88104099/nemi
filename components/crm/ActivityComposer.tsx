"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, Plus, Search, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { Input, Field } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { toast } from "@/components/ui/toast";
import { logActivity, type LogActivityInput } from "@/lib/actions/crm-activities";
import { searchOpportunityProperties } from "@/lib/actions/crm-opportunities";
import {
  ACTIVITY_CHANNEL_LABEL,
  ACTIVITY_OUTCOMES,
  ACTIVITY_OUTCOME_LABEL,
  type CrmActivityChannel,
  type ActivityOutcome,
} from "@/lib/constants-crm";
import {
  INTERESTED_NEXT_STEPS,
  MEETING_PARTIES,
  MEETING_PARTY_LABEL,
  NEXT_STEP_CODES,
  NEXT_STEP_LABEL,
  SHOWING_INTERESTS,
  SHOWING_INTEREST_LABEL,
  UI_ACTIVITY_CHANNELS,
  UI_ACTIVITY_PURPOSES,
  ubToday,
  type MeetingParty,
  type NextStepCode,
  type ShowingInterest,
} from "@/lib/crm/agent-core";
import { cn } from "@/lib/utils";

/**
 * Үйл ажиллагааны бүртгэл (§6.11 стандартын 11 талбар, §6.12, §6.15):
 * богино горимд суваг, холбогдсон эсэх, хураангуй, хандлага, дараагийн
 * үйлдэл + огноо; бусад талбар «Дэлгэрэнгүй»-д. Амжилттай/алдсанаас бусад
 * бүх бүртгэлд дараагийн үйлдэл, огноо заавал (DB давхар хамгаална).
 */

// DB CHECK-тэй ЯГ таарна (lib/actions/crm-activities.ts-тэй ижил).
export const ACTIVITY_PURPOSES = ["screening", "follow_up", "offer", "negotiation", "service", "other"] as const;
export type ActivityPurpose = (typeof ACTIVITY_PURPOSES)[number];
export const ACTIVITY_PURPOSE_LABEL: Record<ActivityPurpose, string> = {
  screening: "Шалгаруулалт",
  follow_up: "Эргэн холбогдолт",
  offer: "Үнийн санал",
  negotiation: "Хэлэлцээр",
  service: "Үйлчилгээ",
  other: "Бусад",
};

export const ACTIVITY_ATTITUDES = ["positive", "neutral", "objection", "not_ready"] as const;
export type ActivityAttitude = (typeof ACTIVITY_ATTITUDES)[number];
export const ACTIVITY_ATTITUDE_LABEL: Record<ActivityAttitude, string> = {
  positive: "Эерэг",
  neutral: "Төвийг сахисан",
  objection: "Эсэргүүцэлтэй",
  not_ready: "Бэлэн биш",
};

export const FEEDBACK_CATEGORIES = ["price", "location", "layout", "condition", "financing", "other"] as const;
export type FeedbackCategory = (typeof FEEDBACK_CATEGORIES)[number];
export const FEEDBACK_CATEGORY_LABEL: Record<FeedbackCategory, string> = {
  price: "Үнэ",
  location: "Байршил",
  layout: "Зохион байгуулалт",
  condition: "Нөхцөл байдал",
  financing: "Санхүүжилт",
  other: "Бусад",
};

const NEW_INFO_KINDS = [
  ["budget", "Төсөв"],
  ["timeline", "Хугацаа"],
  ["needs", "Хэрэгцээ"],
] as const;

const SUMMARY_CHIPS = [
  "Хэрэгцээ, төсвийг тодруулсан.",
  "Шинэ сонголтын талаар ярилцсан.",
  "Шийдвэрт саад болж буй зүйлийг асуусан.",
  "Дараагийн уулзалтын цагийг тохирсон.",
];

function localNowValue(): string {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}

function Chip({ active, onClick, children, tone }: { active: boolean; onClick: () => void; children: React.ReactNode; tone?: "amber" }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "rounded-full px-3 py-1.5 text-xs font-semibold transition",
        active
          ? tone === "amber"
            ? "bg-amber-500 text-white"
            : "bg-brand-600 text-white"
          : "border border-line bg-surface text-muted hover:text-ink"
      )}
    >
      {children}
    </button>
  );
}

type PropOption = { id: string; number: string; name: string };

export function ActivityComposer({
  contactId,
  opportunityId,
  leadId,
  propertyId,
  leadActive = false,
  objections,
  onSaved,
  defaultChannel = "call",
  title = "Үйл ажиллагаа бүртгэх",
}: {
  contactId: string;
  opportunityId?: string | null;
  leadId?: string | null;
  propertyId?: string | null;
  /** Идэвхтэй сэжимтэй холбоотой (дараагийн үйлдэл аль ч үр дүнд заавал). */
  leadActive?: boolean;
  objections: { id: string; label: string }[];
  onSaved?: (res: { profileHint?: boolean }) => void;
  defaultChannel?: CrmActivityChannel;
  title?: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [searching, startSearch] = useTransition();
  const [more, setMore] = useState(false);
  const [guide, setGuide] = useState(false);

  const [channel, setChannel] = useState<CrmActivityChannel>(defaultChannel);
  const [reached, setReached] = useState(true);
  const [purpose, setPurpose] = useState<ActivityPurpose>("follow_up");
  const [summary, setSummary] = useState("");
  const [attitude, setAttitude] = useState<ActivityAttitude | "">("");
  const [objectionId, setObjectionId] = useState("");
  const [outcome, setOutcome] = useState<ActivityOutcome>("open");
  const [newInfoKinds, setNewInfoKinds] = useState<string[]>([]);
  const [newInfo, setNewInfo] = useState("");
  const [nextCode, setNextCode] = useState<NextStepCode | "">("");
  const [nextDetail, setNextDetail] = useState("");
  const [nextDate, setNextDate] = useState("");
  const [nextTime, setNextTime] = useState("");
  const [occurredAt, setOccurredAt] = useState(localNowValue());
  const [feedback, setFeedback] = useState<FeedbackCategory | "">("");
  const [interest, setInterest] = useState<ShowingInterest | "">("");
  const [party, setParty] = useState<MeetingParty | "">("");
  const [propQ, setPropQ] = useState("");
  const [propHits, setPropHits] = useState<PropOption[]>([]);
  const [props, setProps] = useState<PropOption[]>([]);
  const [error, setError] = useState<string | null>(null);

  const closing = outcome === "won" || outcome === "lost";
  const nextRequired = !closing || leadActive;
  const nextOptions: readonly NextStepCode[] =
    channel === "showing" && interest === "interested" ? INTERESTED_NEXT_STEPS : NEXT_STEP_CODES;

  function searchProps() {
    if (propQ.trim().length < 2) return;
    startSearch(async () => {
      const rows = await searchOpportunityProperties(propQ.trim());
      setPropHits(rows.map((r) => ({ id: r.id, number: r.number, name: r.name })));
    });
  }

  function reset() {
    setSummary("");
    setNewInfo("");
    setNewInfoKinds([]);
    setNextCode("");
    setNextDetail("");
    setNextDate("");
    setNextTime("");
    setAttitude("");
    setObjectionId("");
    setFeedback("");
    setInterest("");
    setParty("");
    setProps([]);
    setOutcome("open");
    setReached(true);
    setOccurredAt(localNowValue());
  }

  function submit() {
    setError(null);
    if (nextRequired && (!nextCode || !nextDate)) {
      setError("Дараагийн үйлдэл ба огноог сонгоно уу.");
      return;
    }
    if (reached && !attitude) {
      setError("Харилцагчийн хандлагыг сонгоно уу.");
      return;
    }
    const input: LogActivityInput = {
      contactId,
      opportunityId: opportunityId ?? null,
      leadId: leadId ?? null,
      propertyId: propertyId ?? null,
      propertyIds: props.map((p) => p.id),
      channel,
      purpose,
      summary: summary.trim(),
      attitude: reached ? attitude || null : null,
      newInfo: newInfo.trim() || null,
      newInfoKinds: newInfoKinds as ("budget" | "timeline" | "needs")[],
      objectionId: objectionId || null,
      outcome,
      reached,
      nextStepCode: nextCode || null,
      nextStep: nextCode ? (nextDetail.trim() ? `${NEXT_STEP_LABEL[nextCode]}: ${nextDetail.trim()}` : NEXT_STEP_LABEL[nextCode]) : null,
      nextStepDate: nextDate || null,
      nextStepTime: nextTime || null,
      occurredAt: occurredAt ? new Date(occurredAt).toISOString() : null,
      feedbackCategory: channel === "showing" && feedback ? feedback : null,
      showingInterest: channel === "showing" && interest ? interest : null,
      meetingParty: (channel === "meeting" || channel === "showing") && party ? party : null,
    };
    startTransition(async () => {
      const res = await logActivity(input);
      if (res.error) {
        setError(res.error);
        return;
      }
      reset();
      toast.success("Бүртгэгдлээ");
      if (res.profileHint) {
        toast.info("Хэрэгцээний профайлыг өнөөдөр шинэчилнэ үү", {
          description: "Шинэ мэдээлэл тэмдэглэгдсэн тул «Профайл шинэчлэх» даалгавар үүслээ.",
        });
      }
      onSaved?.({ profileHint: res.profileHint });
      router.refresh();
    });
  }

  return (
    <Card>
      <CardBody className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-ink">{title}</h3>
          <button type="button" className="text-xs font-semibold text-brand-700 hover:underline" onClick={() => setGuide((v) => !v)}>
            Эргэн холбогдох 5 алхам
          </button>
        </div>
        {guide ? (
          <ol className="list-inside list-decimal space-y-0.5 rounded-xl bg-surface-2 p-3 text-xs text-muted">
            <li>Өмнөх яриа, үзсэн үл хөдлөхийг дурдаж эхэл.</li>
            <li>Юу өөрчлөгдсөн, шийдвэрт юу саад болж буйг асуу.</li>
            <li>Шинэ сонголт, зах зээлийн мэдээлэл, харьцуулалт санал болго.</li>
            <li>Дараагийн тодорхой алхмыг санал болго.</li>
            <li>Огноо, цагтай тохиролцож доор бүртгэ.</li>
          </ol>
        ) : null}

        <Field label="Суваг">
          <div className="flex flex-wrap gap-1.5">
            {UI_ACTIVITY_CHANNELS.map((ch) => (
              <Chip key={ch} active={channel === ch} onClick={() => setChannel(ch)}>
                {ACTIVITY_CHANNEL_LABEL[ch]}
              </Chip>
            ))}
          </div>
        </Field>

        {channel === "call" || channel === "chat" || channel === "email" ? (
          <div className="flex flex-wrap gap-1.5">
            <Chip active={reached} onClick={() => setReached(true)}>
              Холбогдсон
            </Chip>
            <Chip active={!reached} tone="amber" onClick={() => setReached(false)}>
              Холбогдож чадаагүй
            </Chip>
          </div>
        ) : null}
        {!reached ? (
          <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
            Холбогдож чадаагүй бүртгэл эхний холболтын хугацааг зогсоохгүй — хоёр дахь оролдлогоо доор товлоно уу.
          </p>
        ) : null}

        <Field label="Хураангуй" htmlFor="act-summary" hint="2–5 өгүүлбэрээр бодит тэмдэглэл">
          <textarea
            id="act-summary"
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
            rows={3}
            placeholder="Юу ярилцсан, харилцагч юу хэлсэн…"
            className="w-full rounded-xl border border-line bg-surface px-3.5 py-2.5 text-sm text-ink placeholder:text-subtle focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
          />
          <div className="mt-1.5 flex flex-wrap gap-1">
            {SUMMARY_CHIPS.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setSummary((s) => (s.trim() ? `${s.trim()} ${t}` : t))}
                className="rounded-full border border-line px-2 py-0.5 text-[11px] text-muted hover:text-ink"
              >
                + {t}
              </button>
            ))}
          </div>
        </Field>

        {reached ? (
          <Field label="Харилцагчийн хандлага">
            <div className="flex flex-wrap gap-1.5">
              {ACTIVITY_ATTITUDES.map((a) => (
                <Chip key={a} active={attitude === a} onClick={() => setAttitude(a)}>
                  {ACTIVITY_ATTITUDE_LABEL[a]}
                </Chip>
              ))}
            </div>
          </Field>
        ) : null}

        {channel === "showing" ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Үзлэгийн дүн" htmlFor="act-interest">
              <Select id="act-interest" value={interest} onChange={(e) => setInterest(e.target.value as ShowingInterest | "")}>
                <option value="">— Дараа бүртгэнэ —</option>
                {SHOWING_INTERESTS.map((i) => (
                  <option key={i} value={i}>
                    {SHOWING_INTEREST_LABEL[i]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Эргэх холбоо" htmlFor="act-feedback" hint="Хоосон бол эргэх холбоо авах даалгавар үүснэ">
              <Select id="act-feedback" value={feedback} onChange={(e) => setFeedback(e.target.value as FeedbackCategory | "")}>
                <option value="">— Дараа бүртгэнэ —</option>
                {FEEDBACK_CATEGORIES.map((f) => (
                  <option key={f} value={f}>
                    {FEEDBACK_CATEGORY_LABEL[f]}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
        ) : null}

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1.2fr_1fr_0.8fr]">
          <Field label={nextRequired ? "Дараагийн үйлдэл (заавал)" : "Дараагийн үйлдэл"} htmlFor="act-next">
            <Select id="act-next" value={nextCode} onChange={(e) => setNextCode(e.target.value as NextStepCode | "")}>
              <option value="">— Сонгох —</option>
              {nextOptions.map((c) => (
                <option key={c} value={c}>
                  {NEXT_STEP_LABEL[c]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={nextRequired ? "Огноо (заавал)" : "Огноо"} htmlFor="act-next-date">
            <Input id="act-next-date" type="date" min={ubToday()} value={nextDate} onChange={(e) => setNextDate(e.target.value)} />
          </Field>
          <Field label="Цаг" htmlFor="act-next-time">
            <Input id="act-next-time" type="time" value={nextTime} onChange={(e) => setNextTime(e.target.value)} />
          </Field>
        </div>
        {nextCode ? (
          <Input value={nextDetail} onChange={(e) => setNextDetail(e.target.value)} placeholder="Тодруулга (заавал биш): ямар сонголт, хаана…" />
        ) : null}

        <button
          type="button"
          onClick={() => setMore((v) => !v)}
          className="inline-flex items-center gap-1 text-xs font-semibold text-muted hover:text-ink"
          aria-expanded={more}
        >
          <ChevronDown className={cn("size-4 transition", more && "rotate-180")} /> Дэлгэрэнгүй (зорилго, огноо, шинэ мэдээлэл, үл хөдлөх)
        </button>

        {more ? (
          <div className="space-y-3 rounded-xl border border-line p-3">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <Field label="Зорилго" htmlFor="act-purpose">
                <Select id="act-purpose" value={purpose} onChange={(e) => setPurpose(e.target.value as ActivityPurpose)}>
                  {UI_ACTIVITY_PURPOSES.map((p) => (
                    <option key={p} value={p}>
                      {ACTIVITY_PURPOSE_LABEL[p]}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Болсон огноо, цаг" htmlFor="act-occurred" hint="Ирээдүйн огноо оруулахгүй">
                <Input
                  id="act-occurred"
                  type="datetime-local"
                  value={occurredAt}
                  max={localNowValue()}
                  onChange={(e) => setOccurredAt(e.target.value)}
                />
              </Field>
              <Field label="Үр дүн" htmlFor="act-outcome">
                <Select id="act-outcome" value={outcome} onChange={(e) => setOutcome(e.target.value as ActivityOutcome)}>
                  {ACTIVITY_OUTCOMES.map((o) => (
                    <option key={o} value={o}>
                      {ACTIVITY_OUTCOME_LABEL[o].label}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>

            <Field label="Шинэ мэдээлэл" hint="Өөрчлөгдсөн бол тухайн өдөрт профайл шинэчлэх даалгавар үүснэ">
              <div className="mb-1.5 flex flex-wrap gap-1.5">
                {NEW_INFO_KINDS.map(([k, label]) => (
                  <Chip
                    key={k}
                    active={newInfoKinds.includes(k)}
                    onClick={() => setNewInfoKinds((prev) => (prev.includes(k) ? prev.filter((x) => x !== k) : [...prev, k]))}
                  >
                    {label} өөрчлөгдсөн
                  </Chip>
                ))}
              </div>
              <Input value={newInfo} onChange={(e) => setNewInfo(e.target.value)} placeholder="Жишээ: төсөв 250 сая болж өссөн" />
            </Field>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Эсэргүүцэл" htmlFor="act-objection">
                <Select id="act-objection" value={objectionId} onChange={(e) => setObjectionId(e.target.value)}>
                  <option value="">— Үгүй —</option>
                  {objections.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.label}
                    </option>
                  ))}
                </Select>
              </Field>
              {channel === "meeting" || channel === "showing" ? (
                <Field label="Хэнтэй уулзсан" htmlFor="act-party">
                  <Select id="act-party" value={party} onChange={(e) => setParty(e.target.value as MeetingParty | "")}>
                    <option value="">— Сонгох —</option>
                    {MEETING_PARTIES.map((m) => (
                      <option key={m} value={m}>
                        {MEETING_PARTY_LABEL[m]}
                      </option>
                    ))}
                  </Select>
                </Field>
              ) : null}
            </div>

            <Field label="Ярилцсан үл хөдлөх" hint="Листингийн дугаар эсвэл нэрээр хайна">
              <div className="flex gap-1.5">
                <Input
                  value={propQ}
                  onChange={(e) => setPropQ(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      searchProps();
                    }
                  }}
                  placeholder="Жишээ: P-0012"
                  className="flex-1"
                />
                <Button type="button" size="sm" variant="outline" onClick={searchProps} disabled={searching}>
                  <Search className="size-4" />
                </Button>
              </div>
              {propHits.length ? (
                <ul className="mt-1 max-h-40 overflow-auto rounded-xl border border-line">
                  {propHits.map((h) => (
                    <li key={h.id}>
                      <button
                        type="button"
                        className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-surface-2"
                        onClick={() => {
                          setProps((p) => (p.some((x) => x.id === h.id) ? p : [...p, h]));
                          setPropHits([]);
                          setPropQ("");
                        }}
                      >
                        <span className="font-mono text-xs text-muted">{h.number}</span> {h.name}
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
              {props.length ? (
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {props.map((p) => (
                    <span key={p.id} className="inline-flex items-center gap-1 rounded-full border border-line bg-surface-2 px-2.5 py-1 text-xs">
                      <span className="font-mono">{p.number}</span>
                      <button type="button" aria-label="Хасах" onClick={() => setProps((x) => x.filter((y) => y.id !== p.id))}>
                        <X className="size-3" />
                      </button>
                    </span>
                  ))}
                </div>
              ) : null}
            </Field>
          </div>
        ) : null}

        {error ? <p className="text-sm text-danger" role="alert">{error}</p> : null}

        <div className="flex justify-end">
          <Button onClick={submit} disabled={pending} size="sm">
            <Plus className="size-4" /> {pending ? "Хадгалж байна…" : "Бүртгэх"}
          </Button>
        </div>
      </CardBody>
    </Card>
  );
}
