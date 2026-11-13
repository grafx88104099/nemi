"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, CalendarPlus, CheckCircle2, Info, Phone, Plus, Search, TriangleAlert, UserPlus, X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { Select } from "@/components/ui/select";
import { toast } from "@/components/ui/toast";
import { CodeChip } from "@/components/crm2/ui/code-chip";
import { DealStageBadge } from "@/components/crm2/ui/badges";
import { MaskedName } from "@/components/crm2/ui/masked-name";
import { ShowingScheduleForm } from "@/components/crm2/deals/ShowingScheduleForm";
import { dealTaskAssignee, type DealUiSettings, type StaffOption } from "@/components/crm2/deals/types";
import { loadCallContext } from "@/lib/crm2/actions/card-call";
import { createContact, findContactsByPhone } from "@/lib/crm2/actions/contacts";
import { logCall, requestTransferWithCall } from "@/lib/crm2/actions/deals";
import { completeTask } from "@/lib/crm2/actions/tasks";
import { isoToUbInput } from "@/lib/crm2/datetime";
import {
  CALL_NEXT_ACTIONS,
  CONTACT_MAX_PHONES,
  DEAL_STAGE_LABEL,
  PROPERTY_STATUS_LABEL,
  SEPARATE_PERSON_LABEL,
  TASK_KIND_LABEL,
} from "@/lib/crm2/labels";
import { crm2Paths, type Crm2Panel } from "@/lib/crm2/paths";
import { formatPhone, isFullPhone } from "@/lib/crm2/phone";
import type {
  Crm2ContactDuplicate,
  Crm2DealStage,
  Crm2LogCallResult,
  Crm2PhoneMatch,
  Crm2PropertyStatus,
  Crm2TaskKind,
} from "@/lib/crm2/types";
import { cn } from "@/lib/utils";

import { canLogWith, classifyPhoneMatch, requirementSummary, type PhoneMatchAction } from "../logic";

const TEXTAREA =
  "w-full rounded-xl border border-line bg-surface px-3.5 py-2.5 text-sm text-ink placeholder:text-subtle focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20";

export type CallPrefill = {
  contact: { id: string; code: string; full_name: string; phones: { phone: string; is_primary: boolean }[] };
  /** Цуцлагдсан эх хэлцэл (өөр хөрөнгө) — «Өөр Staff санал болгох»-оос. */
  origin: { id: string; code: string } | null;
  /** Хэлцлийн хуудаснаас: энэ хэлцэлд нэмнэ. */
  deal?: { id: string; code: string; stage: Crm2DealStage | null } | null;
};

type CallContext = Extract<Awaited<ReturnType<typeof loadCallContext>>, { ok: true }>["data"];

type Picked = {
  contactId: string;
  code: string | null;
  name: string;
  phone: string | null;
  visible: boolean;
  deal: { id: string; code: string; stage: Crm2DealStage | null } | null;
};

type Logged = {
  dealId: string;
  dealCode: string;
  created: boolean;
  activityId: string;
  taskKind: Crm2TaskKind | null;
  taskCreated: boolean;
  /** Дуудлагын дараагийн алхмын ажил (үзүүлэлт товлоход «Үзүүлэх» ажлыг хаана). */
  taskId: string | null;
  /** Хэлцлийн хариуцагч — дараагийн алхмын ажил түүн дээр (crm2_log_call). */
  dealAgentId: string | null;
  dealAgentName: string | null;
  /** Дуудлагыг хийсэн агент — хэлцлийн хариуцагч тодорхойгүй үеийн үзүүлэлтийн анхны гүйцэтгэгч. */
  callAgentId: string | null;
};

/** Дуудлагын дараагийн алхам үзүүлэлт байсан бол товлосны дараа тэр ажлыг хаана. */
function showingTaskToClose(l: Logged): string | null {
  return l.taskId && (l.taskKind === "showing" || l.taskKind === "reshow") ? l.taskId : null;
}

function loggedFrom(
  res: Pick<Crm2LogCallResult, "deal_id" | "code" | "created" | "activity_id" | "task_id" | "agent_id" | "agent_name">,
  taskKind: Crm2TaskKind | null,
  callAgentId: string | null
): Logged {
  return {
    dealId: res.deal_id,
    dealCode: res.code,
    created: res.created,
    activityId: res.activity_id,
    taskKind,
    taskCreated: !!res.task_id,
    taskId: res.task_id ?? null,
    dealAgentId: res.agent_id ?? null,
    dealAgentName: res.agent_name || null,
    callAgentId,
  };
}

/** Хөрөнгийн төлөв шинэ хэлцэл нээхийг зөвшөөрөхгүй үеийн анхааруулга. */
function NoNewDealNote({ status, children }: { status: Crm2PropertyStatus; children: React.ReactNode }) {
  return (
    <p className="flex items-start gap-1.5 rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-800">
      <TriangleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden />
      <span>
        Хөрөнгө «{PROPERTY_STATUS_LABEL[status]}» төлөвтэй тул шинэ хэлцэл нээгдэхгүй — {children}
      </span>
    </p>
  );
}

type Step = "phone" | "matches" | "create" | "form" | "done";

export type CallDialogProps = {
  open: boolean;
  onClose: () => void;
  panel: Crm2Panel;
  propertyId: string;
  propertyCode: string;
  propertyStatus: Crm2PropertyStatus;
  me: string | null;
  /** Ажлын эрхтэн (өөрийн нэрийг харуулахад). */
  staff: StaffOption[];
  /** Дуудлага/үзүүлэлтийн «гүйцэтгэсэн агент» сонгогч — менежер/ахлагчид; бусдад null. */
  agentOptions: StaffOption[] | null;
  settings: DealUiSettings;
  prefill?: CallPrefill | null;
  /** Харилцагчийг солихгүй (хэлцлийн хуудас). */
  lockContact?: boolean;
};

/**
 * S04 «Дуудлага бүртгэх» (кадр 01–02): утасны дугаараар харилцагч хайх → байгаа
 * карт/хэлцлийг ашиглах эсвэл шинэ харилцагч бүртгэх → дуудлага (цаг, тэмдэглэл,
 * үр дүн, дараагийн алхам) → «Үзүүлэлт товлох» (S05). Дуудлага ≠ үзүүлэлт.
 */
export function CallDialog(props: CallDialogProps) {
  if (!props.open) return null;
  return <CallFlow {...props} />;
}

function initialPicked(prefill: CallPrefill | null | undefined): Picked | null {
  if (!prefill) return null;
  const phone = prefill.contact.phones[0]?.phone ?? null;
  return {
    contactId: prefill.contact.id,
    code: prefill.contact.code,
    name: prefill.contact.full_name,
    phone,
    visible: true,
    deal: prefill.deal ?? null,
  };
}

function CallFlow({
  onClose,
  panel,
  propertyId,
  propertyCode,
  propertyStatus,
  me,
  staff,
  agentOptions,
  settings,
  prefill,
  lockContact = false,
}: CallDialogProps) {
  const router = useRouter();
  const paths = crm2Paths(panel);
  const [picked, setPicked] = React.useState<Picked | null>(() => initialPicked(prefill));
  const [step, setStep] = React.useState<Step>(() => (prefill ? "form" : "phone"));
  const [phone, setPhone] = React.useState(() => initialPicked(prefill)?.phone ?? "");
  const [matches, setMatches] = React.useState<Crm2PhoneMatch[]>([]);
  const [logged, setLogged] = React.useState<Logged | null>(null);
  const [busy, setBusy] = React.useState(false);
  const meName = staff.find((s) => s.id === me)?.name ?? null;
  const openForNew = settings.openPropertyStatuses.includes(propertyStatus);

  // Урьдчилан бөглөсөн харилцагч (хэлцэлгүй): энэ хөрөнгө дээр өөр агентын хэлцэл байгаа эсэхийг
  // дугаараар шалгана — байвал §5а «дуудлагыг хүсэлтэд хадгалах» замыг санал болгоно.
  const prefillContactId = prefill && !prefill.deal ? prefill.contact.id : null;
  const prefillPhone = prefillContactId ? (initialPicked(prefill)?.phone ?? "") : "";
  const [checking, setChecking] = React.useState(() => !!prefillContactId && isFullPhone(prefillPhone));
  const foreignDeal = settings.foreignDeal;
  React.useEffect(() => {
    if (!prefillContactId || !isFullPhone(prefillPhone)) return;
    let cancelled = false;
    findContactsByPhone(prefillPhone, propertyId)
      .then((res) => {
        if (cancelled || !res.ok) return;
        const m = res.data.find((x) => x.contact_id === prefillContactId);
        if (!m) return;
        const action = classifyPhoneMatch(m, { foreignDeal });
        if (action.kind === "use_deal") {
          setPicked((p) => (p ? { ...p, deal: { id: action.dealId, code: action.dealCode, stage: action.stage } } : p));
        } else if (action.kind === "deal_transfer" || action.kind === "contact_transfer") {
          setMatches([m]);
          setStep("matches");
        }
      })
      .catch((err) => console.error("CallFlow prefill check:", err))
      .finally(() => {
        if (!cancelled) setChecking(false);
      });
    return () => {
      cancelled = true;
    };
  }, [prefillContactId, prefillPhone, propertyId, foreignDeal]);

  const title = step === "done" ? "Дуудлага бүртгэгдлээ" : `Дуудлага бүртгэх · ${propertyCode}`;

  async function search(e?: React.FormEvent) {
    e?.preventDefault();
    if (!isFullPhone(phone)) {
      toast.error("Утасны дугаарыг бүтнээр (8 оронтой) оруулна уу.");
      return;
    }
    setBusy(true);
    try {
      const res = await findContactsByPhone(phone, propertyId);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      setMatches(res.data);
      setStep(res.data.length ? "matches" : "create");
    } finally {
      setBusy(false);
    }
  }

  function pick(m: Crm2PhoneMatch, action: PhoneMatchAction) {
    setPicked({
      contactId: m.contact_id,
      code: m.code,
      name: m.display_name,
      phone,
      visible: m.can_open,
      deal: action.kind === "use_deal" ? { id: action.dealId, code: action.dealCode, stage: action.stage } : null,
    });
    setStep("form");
  }

  return (
    <Modal open onClose={() => !busy && onClose()} title={title} closeOnBackdrop={false}>
      <div className="space-y-4 p-4">
        {step === "phone" ? (
          <form onSubmit={search} className="space-y-3">
            {!openForNew ? (
              <NoNewDealNote status={propertyStatus}>зөвхөн байгаа нээлттэй хэлцэлд дуудлага нэмнэ.</NoNewDealNote>
            ) : null}
            <Field
              label="Харилцагчийн утасны дугаар"
              htmlFor="crm2-call-phone"
              hint="Бүтэн дугаараар хайна. Ижил дугаартай өөр хүмүүсийг автоматаар нэгтгэхгүй."
            >
              <Input
                id="crm2-call-phone"
                type="tel"
                inputMode="tel"
                autoComplete="off"
                autoFocus
                data-autofocus
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="9911 2233"
              />
            </Field>
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              {picked && prefill ? (
                <Button type="button" variant="ghost" onClick={() => setStep("form")}>
                  <ArrowLeft className="size-4" aria-hidden /> Буцах
                </Button>
              ) : (
                <Button type="button" variant="ghost" onClick={onClose}>
                  Болих
                </Button>
              )}
              <Button type="submit" disabled={busy || !phone.trim()}>
                <Search className="size-4" aria-hidden /> {busy ? "Хайж байна…" : "Хайх"}
              </Button>
            </div>
          </form>
        ) : null}

        {step === "matches" ? (
          <MatchesStep
            phone={phone}
            matches={matches}
            me={me}
            propertyId={propertyId}
            propertyStatus={propertyStatus}
            openForNew={openForNew}
            foreignDeal={settings.foreignDeal}
            onPick={pick}
            onBack={() => setStep("phone")}
            onCreate={() => setStep("create")}
            onLogged={(m, l) => {
              setPicked({ contactId: m.contact_id, code: m.code, name: m.display_name, phone, visible: m.can_open, deal: null });
              setLogged(l);
              setStep("done");
              router.refresh();
            }}
            onFinished={() => {
              router.refresh();
              onClose();
            }}
            setBusy={setBusy}
          />
        ) : null}

        {step === "create" ? (
          <CreateStep
            phone={phone}
            hadMatches={matches.length > 0}
            propertyStatus={propertyStatus}
            openForNew={openForNew}
            onBack={() => setStep(matches.length ? "matches" : "phone")}
            onCreated={(c) => {
              setPicked({ contactId: c.id, code: c.code, name: c.name, phone: c.phone, visible: true, deal: null });
              setStep("form");
            }}
          />
        ) : null}

        {step === "form" && picked && checking ? (
          <p role="status" className="rounded-xl bg-surface-2 px-3 py-2 text-sm text-muted">
            Энэ хөрөнгө дээрх хэлцлийг шалгаж байна…
          </p>
        ) : null}

        {step === "form" && picked && !checking ? (
          <CallForm
            panel={panel}
            propertyId={propertyId}
            propertyStatus={propertyStatus}
            picked={picked}
            me={me}
            meName={meName}
            agentOptions={agentOptions}
            settings={settings}
            prefillOrigin={prefill?.origin ?? null}
            canChangeContact={!lockContact}
            onChangeContact={() => {
              setPicked(null);
              setStep("phone");
            }}
            onClose={onClose}
            onLogged={(l) => {
              setLogged(l);
              setStep("done");
              router.refresh();
            }}
            setBusy={setBusy}
          />
        ) : null}

        {step === "done" && logged && picked ? (
          <div className="space-y-4">
            <div className="flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
              <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-emerald-600" aria-hidden />
              <div className="min-w-0 space-y-1">
                <p className="font-semibold">Дуудлага хадгалагдлаа.</p>
                <p className="flex flex-wrap items-center gap-1.5">
                  {logged.created ? "Шинэ хэлцэл нээгдлээ:" : "Одоо байгаа хэлцэлд нэмэгдлээ:"}
                  <CodeChip code={logged.dealCode} href={paths.deal(propertyId, logged.dealId)} />
                  <Link
                    href={paths.deal(propertyId, logged.dealId)}
                    onClick={onClose}
                    className="inline-flex min-h-11 items-center px-1 text-xs font-semibold underline sm:min-h-0"
                  >
                    Хэлцэл нээх
                  </Link>
                </p>
                {logged.taskCreated && logged.taskKind ? (
                  logged.dealAgentId && logged.dealAgentId !== me ? (
                    <p>
                      Дараагийн ажил: {TASK_KIND_LABEL[logged.taskKind]} — {logged.dealAgentName || "хэлцлийн хариуцагч"} агентын
                      «Миний ажил»-д харагдана.
                    </p>
                  ) : (
                    <p>Дараагийн ажил: {TASK_KIND_LABEL[logged.taskKind]} — «Миний ажил»-д харагдана.</p>
                  )
                ) : null}
              </div>
            </div>
            <div>
              <h3 className="flex items-center gap-1.5 text-sm font-bold text-ink">
                <CalendarPlus className="size-4 text-brand-600" aria-hidden /> Үзүүлэх цаг товлох
              </h3>
              <p className="mt-0.5 text-xs text-muted">
                Дуудлага хадгалсан нь «үзүүлсэн» гэсэн үг биш. Үзүүлэх бол цагаа товлоно; бодитоор үзүүлсний дараа үр дүнг бүртгэнэ.
              </p>
            </div>
            <ShowingScheduleForm
              dealId={logged.dealId}
              dealCode={logged.dealCode}
              contactName={picked.name}
              contactPhone={picked.phone}
              agentOptions={agentOptions}
              me={me}
              meName={meName}
              sourceActivityId={logged.activityId}
              // Үзүүлэх агентын анхдагч — хэлцлийн хариуцагч (сонгогчид байхгүй бол өөрөө).
              defaultAgentId={logged.dealAgentId ?? logged.callAgentId}
              taskAssigneeId={dealTaskAssignee(logged.dealAgentId, me, agentOptions)}
              cancelLabel="Одоо товлохгүй"
              onCancel={onClose}
              onDone={async ({ taskError }) => {
                // Дуудлагын «Үзүүлэх» алхам товлосон үзүүлэлтээр биелсэн — давхар ажил үлдээхгүй.
                const closeId = showingTaskToClose(logged);
                if (closeId) {
                  const closed = await completeTask(closeId).catch(() => null);
                  if (!closed?.ok) toast.error("«Үзүүлэх» ажлыг хааж чадсангүй — «Миний ажил»-аас хаана уу.");
                }
                toast.success("Үзүүлэх цаг товлогдлоо", {
                  description: closeId
                    ? "Төлөв: Товлосон. «Үзүүлэх» ажил биелсэн гэж хаагдлаа."
                    : "Төлөв: Товлосон. Бодитоор үзүүлсний дараа үр дүнг бүртгэнэ.",
                });
                if (taskError) toast.error(`Дараагийн ажлыг хадгалж чадсангүй: ${taskError}`);
                router.refresh();
                onClose();
              }}
            />
          </div>
        ) : null}
      </div>
    </Modal>
  );
}

// ── Олдсон харилцагчид ─────────────────────────────────────────────────────

function MatchesStep({
  phone,
  matches,
  me,
  propertyId,
  propertyStatus,
  openForNew,
  foreignDeal,
  onPick,
  onBack,
  onCreate,
  onLogged,
  onFinished,
  setBusy,
}: {
  phone: string;
  matches: Crm2PhoneMatch[];
  me: string | null;
  propertyId: string;
  propertyStatus: Crm2PropertyStatus;
  /** Хөрөнгийн төлөв шинэ хэлцэл нээхийг зөвшөөрнө (deal.open_property_statuses). */
  openForNew: boolean;
  foreignDeal: "deny" | "allow";
  onPick: (m: Crm2PhoneMatch, action: PhoneMatchAction) => void;
  onBack: () => void;
  onCreate: () => void;
  /** DB шууд бүртгэх боломжтой гэж үзсэн (hint crm2_log_call) — дуудлага бүртгэгдсэн. */
  onLogged: (m: Crm2PhoneMatch, l: Logged) => void;
  /** Шилжүүлэлт шууд хэрэгжиж, дуудлага бүртгэгдсэн — цонхыг хаана. */
  onFinished: () => void;
  setBusy: (b: boolean) => void;
}) {
  const classified = matches.map((m) => ({ m, action: classifyPhoneMatch(m, { foreignDeal }) }));
  const anyBlocked = classified.some((c) => !canLogWith(c.action));

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted">
        <span className="font-medium text-ink tabular-nums">{formatPhone(phone)}</span> дугаартай {matches.length} харилцагч олдлоо.
      </p>
      <ul className="space-y-2">
        {classified.map(({ m, action }) => (
          <li key={m.contact_id} className="space-y-2 rounded-xl border border-line p-3">
            <div className="flex flex-wrap items-center gap-2">
              <MaskedName name={m.display_name} visible={m.can_open} />
              <CodeChip code={m.code} />
              {m.status === "archived" ? <Badge>Архивласан</Badge> : null}
            </div>
            <p className="text-xs text-muted">
              Хариуцагч: {m.responsible_agent_name || "—"} · Нээлттэй хэлцэл: {m.open_deals}
            </p>
            {action.kind === "use_deal" ? (
              <div className="space-y-2">
                <p className="flex flex-wrap items-center gap-1.5 text-sm text-ink">
                  Энэ хөрөнгө дээр <span className="font-mono text-xs font-semibold">{action.dealCode}</span>
                  {action.stage ? <DealStageBadge stage={action.stage} /> : null} хэлцэл байна — дуудлага түүнд нэмэгдэнэ.
                </p>
                <Button type="button" size="touch" onClick={() => onPick(m, action)}>
                  Энэ хэлцэлд бүртгэх
                </Button>
              </div>
            ) : action.kind === "deal_transfer" ? (
              <TransferWithCall
                match={m}
                propertyId={propertyId}
                me={me}
                text={`Энэ хөрөнгө дээрх ${action.dealCode} хэлцлийг ${action.agentName ?? "өөр агент"} хариуцдаг. Дуудлагаа шилжүүлэх хүсэлтэд хадгална уу.`}
                onLogged={(l) => onLogged(m, l)}
                onFinished={onFinished}
                setBusy={setBusy}
              />
            ) : !openForNew ? (
              // Нээлттэй хэлцэлгүй — дуудлага шинэ хэлцэл нээх ёстой, төлөв зөвшөөрөхгүй (DB татгалзана).
              <NoNewDealNote status={propertyStatus}>
                {action.kind === "contact_transfer"
                  ? "энэ харилцагчийн дуудлагыг хүсэлтэд хадгалах боломжгүй."
                  : "энэ харилцагчтай дуудлага бүртгэх боломжгүй."}
              </NoNewDealNote>
            ) : action.kind === "use_contact" ? (
              <div className="space-y-2">
                <p className="text-sm text-muted">Дуудлага хадгалахад энэ хөрөнгө дээр шинэ хэлцэл нээгдэнэ.</p>
                <Button type="button" size="touch" onClick={() => onPick(m, action)}>
                  Энэ харилцагчийг сонгох
                </Button>
              </div>
            ) : action.kind === "use_foreign" ? (
              <div className="space-y-2">
                <p className="text-sm text-muted">Өөр агентын харилцагч. Тохиргооны дагуу хэлцэл таны нэр дээр нээгдэнэ.</p>
                <Button type="button" size="touch" onClick={() => onPick(m, action)}>
                  Сонгох
                </Button>
              </div>
            ) : (
              <TransferWithCall
                match={m}
                propertyId={propertyId}
                me={me}
                text={`Энэ харилцагчийг ${m.responsible_agent_name || "өөр агент"} хариуцдаг. Дуудлагаа харилцагч шилжүүлэх хүсэлтэд хадгална уу.`}
                onLogged={(l) => onLogged(m, l)}
                onFinished={onFinished}
                setBusy={setBusy}
              />
            )}
          </li>
        ))}
      </ul>
      {anyBlocked ? (
        <p className="flex items-start gap-1.5 rounded-xl bg-surface-2 px-3 py-2 text-xs text-muted">
          <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          Өөр агентын харилцагч/хэлцэлтэй холбоотой дуудлага шилжүүлэх хүсэлтэд хадгалагдана. Хүсэлт батлагдвал дуудлага анхны цагаар нь
          таны нэр дээр бүртгэгдэнэ; татгалзвал бүртгэгдэхгүй.
        </p>
      ) : null}
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
        <Button type="button" variant="ghost" onClick={onBack}>
          <ArrowLeft className="size-4" aria-hidden /> Өөр дугаар
        </Button>
        <Button type="button" variant="outline" onClick={onCreate}>
          <UserPlus className="size-4" aria-hidden /> {SEPARATE_PERSON_LABEL}
        </Button>
      </div>
    </div>
  );
}

/**
 * Өөр агентын харилцагч/хэлцэлтэй дуудлага: дуудлагын талбаруудыг шилжүүлэх хүсэлтэд
 * хадгална (crm2_request_transfer_with_call). Батлагдвал анхны цагаар, хүсэгчийн нэр дээр
 * бүртгэгдэнэ.
 */
function TransferWithCall({
  match,
  propertyId,
  me,
  text,
  onLogged,
  onFinished,
  setBusy,
}: {
  match: Crm2PhoneMatch;
  propertyId: string;
  me: string | null;
  text: string;
  onLogged: (l: Logged) => void;
  onFinished: () => void;
  setBusy: (b: boolean) => void;
}) {
  const ids = React.useId();
  const [open, setOpen] = React.useState(false);
  const [minAt] = React.useState(() => isoToUbInput(Date.now() - 7 * 86_400_000));
  const [occurredAt, setOccurredAt] = React.useState(() => isoToUbInput(Date.now()));
  const [atTouched, setAtTouched] = React.useState(false);
  const [note, setNote] = React.useState("");
  const [result, setResult] = React.useState("");
  const [nextAction, setNextAction] = React.useState<Crm2TaskKind | "">("");
  const [nextDue, setNextDue] = React.useState("");
  const [nextNote, setNextNote] = React.useState("");
  const [reason, setReason] = React.useState("");
  const [pending, setPending] = React.useState(false);
  const [sent, setSent] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (!me || pending) return;
    setPending(true);
    setBusy(true);
    setError(null);
    try {
      const res = await requestTransferWithCall({
        property_id: propertyId,
        contact_id: match.contact_id,
        occurred_at: occurredAt,
        note,
        result,
        next_action: nextAction || null,
        next_action_due: nextAction ? nextDue : null,
        next_action_note: nextAction ? nextNote : null,
        reason,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      const r = res.data;
      if (r.status === "logged") {
        toast.success("Дуудлага бүртгэгдлээ", { description: "Энэ дуудлагыг шууд бүртгэх боломжтой байсан." });
        // RPC-ийн crm2_log_call-ийн гүйцэтгэгч үргэлж хүсэгч өөрөө.
        onLogged(loggedFrom(r.log, nextAction || null, me));
      } else if (r.status === "retry") {
        // Маягтыг хадгална — дахин илгээхэд RPC шинээр ангилна.
        setError(`${r.message} Дахин илгээнэ үү.`);
      } else if (r.status === "applied") {
        toast.success(r.kind === "deal_transfer" ? "Хэлцэл танд шилжлээ" : "Харилцагч танд шилжлээ", {
          description: r.skipped ? "Зарим дуудлагыг бүртгэж чадсангүй — мэдэгдлээ шалгана уу." : "Дуудлага анхны цагаараа бүртгэгдлээ.",
        });
        onFinished();
      } else {
        const msg = r.duplicate
          ? "Энэ дуудлага таны хүсэлтэд аль хэдийн хадгалагдсан байна."
          : r.appended
            ? "Дуудлага таны хүлээгдэж буй хүсэлтэд нэмэгдлээ. Батлагдвал анхны цагаар нь бүртгэгдэнэ."
            : "Хүсэлт илгээгдлээ. Батлагдвал дуудлага анхны цагаар нь таны нэр дээр бүртгэгдэнэ.";
        setSent(msg);
        toast.success(r.appended || r.duplicate ? "Дуудлага хүсэлтэд хадгалагдлаа" : "Шилжүүлэх хүсэлт илгээгдлээ");
      }
    } catch (err) {
      console.error("TransferWithCall:", err);
      setError("Алдаа гарлаа. Дахин оролдоно уу.");
    } finally {
      setPending(false);
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
      <p className="flex items-start gap-1.5">
        <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
        {text}
      </p>
      {sent ? (
        <p className="font-medium">{sent}</p>
      ) : open ? (
        // noValidate: min нь зөвхөн сонгогчийг хязгаарлана; 7 хоногийн хязгаарын алдааг DB монголоор буцаана
        // (браузерын хэлээрх анхааруулга гаргахгүй). Хоосон цагийг илгээх товч хориглоно.
        <form onSubmit={send} noValidate className="space-y-3 rounded-xl bg-surface p-3 text-ink">
          <Field label="Дуудлагын огноо, цаг" htmlFor={`${ids}-at`} hint="7 хоногоос хуучин дуудлагыг хүсэлтэд хадгалахгүй.">
            <Input
              id={`${ids}-at`}
              type="datetime-local"
              value={occurredAt}
              min={minAt}
              onChange={(e) => {
                setAtTouched(true);
                setOccurredAt(e.target.value);
              }}
              required
            />
          </Field>
          <Field label="Тэмдэглэл" htmlFor={`${ids}-note`}>
            <textarea
              id={`${ids}-note`}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
              maxLength={4000}
              placeholder="Юу ярилцсан, харилцагч юу сонирхсон…"
              className={TEXTAREA}
            />
          </Field>
          <Field label="Үр дүн (заавал биш)" htmlFor={`${ids}-res`}>
            <Input id={`${ids}-res`} value={result} onChange={(e) => setResult(e.target.value)} maxLength={2000} />
          </Field>
          <Field label="Дараагийн алхам" htmlFor={`${ids}-next`}>
            <Select
              id={`${ids}-next`}
              value={nextAction}
              onChange={(e) => {
                const v = e.target.value as Crm2TaskKind | "";
                setNextAction(v);
                if (!v) {
                  setNextDue("");
                  setNextNote("");
                }
              }}
            >
              <option value="">Байхгүй</option>
              {CALL_NEXT_ACTIONS.map((k) => (
                <option key={k} value={k}>
                  {TASK_KIND_LABEL[k]}
                </option>
              ))}
            </Select>
          </Field>
          {nextAction ? (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Хугацаа" htmlFor={`${ids}-due`}>
                <Input id={`${ids}-due`} type="datetime-local" value={nextDue} onChange={(e) => setNextDue(e.target.value)} />
              </Field>
              <Field label="Ажлын тэмдэглэл" htmlFor={`${ids}-nnote`}>
                <Input id={`${ids}-nnote`} value={nextNote} onChange={(e) => setNextNote(e.target.value)} maxLength={1000} />
              </Field>
            </div>
          ) : null}
          <Field label="Шилжүүлэх шалтгаан (заавал биш)" htmlFor={`${ids}-why`}>
            <textarea
              id={`${ids}-why`}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={2}
              maxLength={2000}
              placeholder="Харилцагч надтай шууд холбогдсон…"
              className={TEXTAREA}
            />
          </Field>
          {error ? (
            <p role="alert" className="text-xs text-rose-700">
              {error}
            </p>
          ) : null}
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button type="button" size="touch" variant="ghost" onClick={() => setOpen(false)} disabled={pending}>
              Болих
            </Button>
            <Button type="submit" size="touch" disabled={pending || !me || !occurredAt}>
              {pending ? "Илгээж байна…" : "Дуудлагыг хүсэлтэд хадгалах"}
            </Button>
          </div>
        </form>
      ) : (
        <Button
          type="button"
          size="touch"
          variant="outline"
          onClick={() => {
            // Анхны утга нь маягт нээгдсэн цаг (жагсаалт харагдсан цаг биш).
            if (!atTouched) setOccurredAt(isoToUbInput(Date.now()));
            setOpen(true);
          }}
          disabled={!me}
        >
          Дуудлага бүртгээд шилжүүлэх хүсэлт гаргах
        </Button>
      )}
    </div>
  );
}

// ── Шинэ харилцагч ─────────────────────────────────────────────────────────

function CreateStep({
  phone,
  hadMatches,
  propertyStatus,
  openForNew,
  onBack,
  onCreated,
}: {
  phone: string;
  hadMatches: boolean;
  propertyStatus: Crm2PropertyStatus;
  openForNew: boolean;
  onBack: () => void;
  onCreated: (c: { id: string; code: string | null; name: string; phone: string }) => void;
}) {
  const [name, setName] = React.useState("");
  const [phones, setPhones] = React.useState<string[]>([phone]);
  const [note, setNote] = React.useState("");
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [duplicates, setDuplicates] = React.useState<Crm2ContactDuplicate[]>([]);

  async function submit(allowDuplicate: boolean) {
    if (pending) return;
    const list = phones.map((p) => p.trim()).filter(Boolean);
    if (!name.trim()) {
      setError("Нэрийг оруулна уу.");
      return;
    }
    if (list.length === 0) {
      setError("Дор хаяж нэг утасны дугаар оруулна уу.");
      return;
    }
    setPending(true);
    setError(null);
    try {
      const res = await createContact({
        full_name: name,
        phones: list.map((p) => ({ phone: p })),
        note,
        allow_duplicate: allowDuplicate || hadMatches,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      if (!res.data.contact_id) {
        setDuplicates(res.data.duplicates);
        return;
      }
      toast.success("Харилцагч бүртгэгдлээ", { description: res.data.code ?? undefined });
      onCreated({ id: res.data.contact_id, code: res.data.code, name: name.trim(), phone: list[0] });
    } catch (err) {
      console.error("CreateStep:", err);
      setError("Алдаа гарлаа. Дахин оролдоно уу.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        void submit(false);
      }}
    >
      <p className="text-sm text-muted">
        {hadMatches
          ? "Ижил дугаартай боловч өөр хүнийг тусад нь бүртгэнэ (автоматаар нэгтгэхгүй)."
          : "Энэ дугаартай харилцагч олдсонгүй — шинээр бүртгэнэ."}
      </p>
      {!openForNew ? (
        <NoNewDealNote status={propertyStatus}>
          харилцагчийг бүртгэж болох ч энэ хөрөнгө дээр түүнтэй дуудлага бүртгэх боломжгүй.
        </NoNewDealNote>
      ) : null}
      <Field label="Нэр" htmlFor="crm2-call-name">
        <Input id="crm2-call-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={160} required autoFocus />
      </Field>
      <fieldset className="space-y-2">
        <legend className="mb-1.5 block text-sm font-medium text-ink">Утасны дугаар</legend>
        {phones.map((p, i) => (
          <div key={i} className="flex items-center gap-2">
            <Input
              type="tel"
              inputMode="tel"
              value={p}
              onChange={(e) => setPhones((list) => list.map((x, j) => (j === i ? e.target.value : x)))}
              aria-label={`Дугаар ${i + 1}`}
              maxLength={40}
            />
            {i > 0 ? (
              <button
                type="button"
                onClick={() => setPhones((list) => list.filter((_, j) => j !== i))}
                aria-label="Дугаар хасах"
                className="flex size-11 shrink-0 items-center justify-center rounded-xl text-muted hover:bg-surface-2 hover:text-ink"
              >
                <X className="size-4" aria-hidden />
              </button>
            ) : null}
          </div>
        ))}
        {phones.length < CONTACT_MAX_PHONES ? (
          <Button type="button" size="touch" variant="ghost" onClick={() => setPhones((l) => [...l, ""])}>
            <Plus className="size-4" aria-hidden /> Дугаар нэмэх
          </Button>
        ) : null}
      </fieldset>
      <Field label="Тэмдэглэл (заавал биш)" htmlFor="crm2-call-cnote">
        <textarea id="crm2-call-cnote" value={note} onChange={(e) => setNote(e.target.value)} rows={2} maxLength={4000} className={TEXTAREA} />
      </Field>

      {duplicates.length ? (
        <div className="space-y-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          <p className="font-medium">Эдгээр дугаартай харилцагч бүртгэлтэй байна:</p>
          <ul className="space-y-1">
            {duplicates.map((d) => (
              <li key={d.contact_id} className="flex flex-wrap items-center gap-1.5">
                <MaskedName name={d.display_name} visible={d.can_open} />
                <CodeChip code={d.code} />
                <span className="text-xs">· {d.responsible_agent_name}</span>
              </li>
            ))}
          </ul>
          <p className="text-xs">Тэр хүн мөн бол буцаж сонгоно уу. Өөр хүн бол тусад нь бүртгэнэ.</p>
          <Button type="button" size="touch" variant="outline" onClick={() => void submit(true)} disabled={pending}>
            {SEPARATE_PERSON_LABEL}
          </Button>
        </div>
      ) : null}

      {error ? (
        <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {error}
        </p>
      ) : null}
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button type="button" variant="ghost" onClick={onBack} disabled={pending}>
          <ArrowLeft className="size-4" aria-hidden /> Буцах
        </Button>
        <Button type="submit" disabled={pending || !name.trim()}>
          {pending ? "Түр хүлээнэ үү…" : "Бүртгээд үргэлжлүүлэх"}
        </Button>
      </div>
    </form>
  );
}

// ── Дуудлагын маягт ────────────────────────────────────────────────────────

function CallForm({
  panel,
  propertyId,
  propertyStatus,
  picked,
  me,
  meName,
  agentOptions,
  settings,
  prefillOrigin,
  canChangeContact,
  onChangeContact,
  onClose,
  onLogged,
  setBusy,
}: {
  panel: Crm2Panel;
  propertyId: string;
  propertyStatus: Crm2PropertyStatus;
  picked: Picked;
  me: string | null;
  meName: string | null;
  agentOptions: StaffOption[] | null;
  settings: DealUiSettings;
  prefillOrigin: { id: string; code: string } | null;
  canChangeContact: boolean;
  onChangeContact: () => void;
  onClose: () => void;
  onLogged: (l: Logged) => void;
  setBusy: (b: boolean) => void;
}) {
  const ids = React.useId();
  const paths = crm2Paths(panel);
  const [occurredAt, setOccurredAt] = React.useState(() => isoToUbInput(Date.now()));
  const [agentId, setAgentId] = React.useState(me ?? "");
  const [note, setNote] = React.useState("");
  const [result, setResult] = React.useState("");
  const [requirementId, setRequirementId] = React.useState("");
  const [originId, setOriginId] = React.useState(prefillOrigin?.id ?? "");
  const [nextAction, setNextAction] = React.useState<Crm2TaskKind | "">("");
  const [nextDue, setNextDue] = React.useState("");
  const [nextNote, setNextNote] = React.useState("");
  const [ctx, setCtx] = React.useState<CallContext | null>(null);
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!picked.visible) return;
    let cancelled = false;
    loadCallContext(picked.contactId, propertyId)
      .then((res) => {
        if (!cancelled && res.ok) setCtx(res.data);
      })
      .catch((err) => console.error("loadCallContext:", err));
    return () => {
      cancelled = true;
    };
  }, [picked.contactId, picked.visible, propertyId]);

  const originOptions = React.useMemo(() => {
    const list = (ctx?.originOptions ?? []).map((o) => ({
      id: o.deal_id,
      label: `${o.code} · ${o.property_code} · ${DEAL_STAGE_LABEL[o.stage]}`,
    }));
    if (prefillOrigin && !list.some((o) => o.id === prefillOrigin.id)) {
      list.unshift({ id: prefillOrigin.id, label: `${prefillOrigin.code} (цуцлагдсан хэлцэл)` });
    }
    return list;
  }, [ctx, prefillOrigin]);

  const openForNew = settings.openPropertyStatuses.includes(propertyStatus);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (pending) return;
    setPending(true);
    setBusy(true);
    setError(null);
    const callAgent = agentOptions && agentId ? agentId : null;
    try {
      const res = await logCall({
        property_id: propertyId,
        contact_id: picked.contactId,
        occurred_at: occurredAt,
        note,
        result,
        next_action: nextAction || null,
        next_action_due: nextAction ? nextDue : null,
        next_action_note: nextAction ? nextNote : null,
        requirement_id: requirementId || null,
        agent_id: callAgent,
        origin_deal_id: picked.deal ? null : originId || null,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      onLogged(loggedFrom(res.data, nextAction || null, callAgent ?? me));
    } catch (err) {
      console.error("CallForm:", err);
      setError("Алдаа гарлаа. Дахин оролдоно уу.");
    } finally {
      setPending(false);
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="space-y-1 rounded-xl border border-line bg-surface-2 px-3 py-2 text-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex min-w-0 flex-wrap items-center gap-1.5">
            <MaskedName
              name={picked.name}
              visible={picked.visible}
              href={picked.visible ? paths.contact(picked.contactId) : null}
            />
            <CodeChip code={picked.code} />
          </div>
          {canChangeContact ? (
            <button
              type="button"
              onClick={onChangeContact}
              className="-mr-2 inline-flex min-h-11 items-center px-2 text-xs font-semibold text-brand-700 hover:underline"
            >
              Өөр харилцагч
            </button>
          ) : null}
        </div>
        {picked.phone ? (
          <p className="flex items-center gap-1 text-xs text-muted tabular-nums">
            <Phone className="size-3" aria-hidden /> {formatPhone(picked.phone)}
          </p>
        ) : null}
        <p className="text-xs text-muted">
          {picked.deal ? (
            <>
              Хэлцэл: <span className="font-mono font-semibold text-ink">{picked.deal.code}</span>
              {picked.deal.stage ? ` · ${DEAL_STAGE_LABEL[picked.deal.stage]}` : ""} — дуудлага энэ хэлцэлд нэмэгдэнэ.
            </>
          ) : (
            "Энэ хөрөнгө дээр нээлттэй хэлцэл байвал түүнд нэмэгдэнэ, эс бөгөөс шинэ хэлцэл нээгдэнэ."
          )}
        </p>
      </div>
      {!picked.deal && !openForNew ? (
        <NoNewDealNote status={propertyStatus}>зөвхөн байгаа нээлттэй хэлцэлд дуудлага нэмнэ.</NoNewDealNote>
      ) : null}

      <div className={cn("grid grid-cols-1 gap-3", agentOptions ? "sm:grid-cols-2" : "")}>
        <Field label="Дуудлагын огноо, цаг" htmlFor={`${ids}-at`}>
          <Input
            id={`${ids}-at`}
            type="datetime-local"
            value={occurredAt}
            onChange={(e) => setOccurredAt(e.target.value)}
            required
          />
        </Field>
        {agentOptions ? (
          <Field label="Агент" htmlFor={`${ids}-agent`} hint="Шинэ хэлцэл энэ агент дээр нээгдэнэ.">
            <Select id={`${ids}-agent`} value={agentId} onChange={(e) => setAgentId(e.target.value)}>
              {agentOptions.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.id === me ? `${s.name} (би)` : s.name}
                </option>
              ))}
            </Select>
          </Field>
        ) : (
          <p className="text-sm text-muted">
            Агент: <span className="font-medium text-ink">{meName ? `${meName} (би)` : "Би"}</span>
          </p>
        )}
      </div>

      <Field label="Тэмдэглэл" htmlFor={`${ids}-note`}>
        <textarea
          id={`${ids}-note`}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={3}
          maxLength={4000}
          placeholder="Юу ярилцсан, харилцагч юу сонирхсон…"
          className={TEXTAREA}
        />
      </Field>
      <Field label="Үр дүн (заавал биш)" htmlFor={`${ids}-res`}>
        <Input
          id={`${ids}-res`}
          value={result}
          onChange={(e) => setResult(e.target.value)}
          maxLength={2000}
          placeholder="Үзэх сонирхолтой, үнэ асуусан…"
        />
      </Field>

      {ctx?.requirements.length ? (
        <Field label="Шаардлага (заавал биш)" htmlFor={`${ids}-req`}>
          <Select id={`${ids}-req`} value={requirementId} onChange={(e) => setRequirementId(e.target.value)}>
            <option value="">Холбохгүй</option>
            {ctx.requirements.map((r) => (
              <option key={r.id} value={r.id}>
                {requirementSummary(r, settings.categoryLabels)}
              </option>
            ))}
          </Select>
        </Field>
      ) : null}

      {!picked.deal && originOptions.length ? (
        <Field
          label="Эх хэлцэл (заавал биш)"
          htmlFor={`${ids}-origin`}
          hint="Өөр хөрөнгийн хэлцэл цуцлагдсаны дараах санал бол холбоно."
        >
          <Select id={`${ids}-origin`} value={originId} onChange={(e) => setOriginId(e.target.value)}>
            <option value="">Холбохгүй</option>
            {originOptions.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </Select>
        </Field>
      ) : null}

      <fieldset className="space-y-3 rounded-xl border border-line p-3">
        <legend className="px-1 text-sm font-medium text-ink">Дараагийн алхам</legend>
        <Field label="Ажил" htmlFor={`${ids}-next`}>
          <Select
            id={`${ids}-next`}
            value={nextAction}
            onChange={(e) => {
              const v = e.target.value as Crm2TaskKind | "";
              setNextAction(v);
              if (!v) {
                setNextDue("");
                setNextNote("");
              }
            }}
          >
            <option value="">Байхгүй</option>
            {CALL_NEXT_ACTIONS.map((k) => (
              <option key={k} value={k}>
                {TASK_KIND_LABEL[k]}
              </option>
            ))}
          </Select>
        </Field>
        {nextAction ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Хугацаа" htmlFor={`${ids}-due`}>
              <Input id={`${ids}-due`} type="datetime-local" value={nextDue} onChange={(e) => setNextDue(e.target.value)} />
            </Field>
            <Field label="Ажлын тэмдэглэл" htmlFor={`${ids}-nnote`}>
              <Input id={`${ids}-nnote`} value={nextNote} onChange={(e) => setNextNote(e.target.value)} maxLength={1000} />
            </Field>
          </div>
        ) : null}
        {nextAction === "showing" || nextAction === "reshow" ? (
          <p className="text-xs text-muted">
            Хадгалсны дараа үзүүлэх цагийг шууд товлож болно — товловол энэ ажил биелсэн гэж хаагдана.
          </p>
        ) : null}
      </fieldset>

      <p className="flex items-start gap-1.5 text-xs text-muted">
        <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
        Дуудлага хадгалсан нь «үзүүлсэн» гэсэн үг биш. Хадгалсны дараа үзүүлэх цаг товлох маягт нээгдэнэ.
      </p>

      {error ? (
        <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {error}
        </p>
      ) : null}
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button type="button" variant="ghost" onClick={onClose} disabled={pending}>
          Болих
        </Button>
        <Button type="submit" disabled={pending || !occurredAt}>
          {pending ? "Хадгалж байна…" : "Дуудлага хадгалах"}
        </Button>
      </div>
    </form>
  );
}
