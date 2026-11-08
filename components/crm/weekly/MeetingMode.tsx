"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, CheckCircle2, ChevronLeft, ChevronRight, Play, Square, Timer } from "lucide-react";

import { Card, CardBody } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Field } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import {
  AGENDA_SECTION_LABEL,
  ANOMALY_LABEL,
  DECISION_KIND_LABEL,
  PRESENTATION_STEPS,
  weeklyStatusLabel,
  type AnomalyKind,
  type DecisionKind,
} from "@/lib/constants-crm-weekly";
import { finishSalesMeeting, recordMeetingDecision, setMeetingDecisionStatus, startSalesMeeting } from "@/lib/actions/crm-weekly";

export type MeetingNumber = { label: string; actual?: string; target?: string; met?: boolean | null };

export type MeetingAgent = {
  agentId: string;
  name: string;
  planId: string | null;
  planStatus: string | null;
  planHref: string | null;
  anomalies: AnomalyKind[];
  lastWeek: MeetingNumber[];
  pipeline: MeetingNumber[];
  targets: MeetingNumber[];
  topDeals: string[];
  priorities: string[];
  obstacles: string[];
  commitment: string | null;
};

export type MeetingDecision = {
  id: string;
  kind: DecisionKind;
  text: string;
  agent_id: string | null;
  owner_name: string | null;
  due_on: string | null;
  status: "open" | "done";
};

type Agenda = { key: string; minutes: number }[];

function mmss(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

/**
 * §6.30, §9.5 Долоо хоногийн борлуулалтын хурлын горим: 4 хэсэгт хөтөлбөр,
 * цаг хэмжигч, агент тус бүрийн 3–5 минутын танилцуулга (тоо CRM-ээс),
 * «Анхаарах» дохио, шийдвэр/амлалт/дадлагажуулалтыг картад хадгална.
 */
export function MeetingMode({
  kind,
  week,
  teamId,
  meeting,
  agents,
  agenda,
  slotMin,
  slotMax,
  canFacilitate,
  ownerOptions,
  teamNumbers,
}: {
  kind: "monday" | "friday";
  week: string;
  teamId: string | null;
  meeting: { id: string; status: "in_progress" | "done"; started_at: string; decisions: MeetingDecision[] } | null;
  agents: MeetingAgent[];
  agenda: Agenda;
  slotMin: number;
  slotMax: number;
  canFacilitate: boolean;
  ownerOptions: { id: string; name: string }[];
  teamNumbers: MeetingNumber[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [section, setSection] = useState(0);
  const [agentIdx, setAgentIdx] = useState(0);
  const [running, setRunning] = useState(false);
  const [sectionSec, setSectionSec] = useState<Record<string, number>>({});
  const [agentSec, setAgentSec] = useState<Record<string, number>>({});
  const [form, setForm] = useState({ kind: "decision" as DecisionKind, text: "", ownerId: "", dueOn: "", linkAgent: true });

  const current = agenda[section];
  const currentAgent = agents[agentIdx] ?? null;
  const live = meeting?.status === "in_progress";

  useEffect(() => {
    if (!running || !live || !current) return;
    const t = setInterval(() => {
      setSectionSec((s) => ({ ...s, [current.key]: (s[current.key] ?? 0) + 1 }));
      if (current.key === "agents" && currentAgent) {
        setAgentSec((s) => ({ ...s, [currentAgent.agentId]: (s[currentAgent.agentId] ?? 0) + 1 }));
      }
    }, 1000);
    return () => clearInterval(t);
  }, [running, live, current, currentAgent]);

  const decisionsByAgent = useMemo(() => {
    const m = new Map<string, MeetingDecision[]>();
    for (const d of meeting?.decisions ?? []) {
      const k = d.agent_id ?? "";
      m.set(k, [...(m.get(k) ?? []), d]);
    }
    return m;
  }, [meeting?.decisions]);

  function begin() {
    start(async () => {
      const r = await startSalesMeeting({ kind, week, teamId });
      if (!r.ok) {
        toast.error(r.error ?? "Хурал эхлүүлж чадсангүй.");
        return;
      }
      setRunning(true);
      router.refresh();
    });
  }

  function finish() {
    if (!meeting) return;
    start(async () => {
      const r = await finishSalesMeeting(
        meeting.id,
        agenda.map((a) => ({ key: a.key, seconds: sectionSec[a.key] ?? 0 }))
      );
      if (!r.ok) {
        toast.error(r.error ?? "Хурлыг дуусгаж чадсангүй.");
        return;
      }
      setRunning(false);
      toast.success("Хурал дууслаа. Шийдвэр, амлалтууд картад хадгалагдсан.");
      router.refresh();
    });
  }

  function addDecision() {
    if (!meeting) return;
    const text = form.text.trim();
    if (text.length < 3) {
      toast.error("Шийдвэрийг тодорхой бичнэ үү.");
      return;
    }
    const planId = form.linkAgent && current?.key === "agents" ? (currentAgent?.planId ?? null) : null;
    if (form.kind === "commitment" && !planId) {
      toast.error("Амлалтыг агентын танилцуулгын үеэр, карттай нь холбож бүртгэнэ.");
      return;
    }
    start(async () => {
      const r = await recordMeetingDecision({
        meetingId: meeting.id,
        planId,
        kind: form.kind,
        text,
        ownerId: form.ownerId || null,
        dueOn: form.dueOn || null,
      });
      if (!r.ok) {
        toast.error(r.error ?? "Хадгалж чадсангүй.");
        return;
      }
      setForm((f) => ({ ...f, text: "", dueOn: "" }));
      toast.success("Тэмдэглэлээ.");
      router.refresh();
    });
  }

  function toggleDecision(d: MeetingDecision) {
    start(async () => {
      const r = await setMeetingDecisionStatus(d.id, d.status === "done" ? "open" : "done");
      if (!r.ok) toast.error(r.error ?? "Алдаа гарлаа.");
      router.refresh();
    });
  }

  if (!meeting) {
    return (
      <EmptyState
        icon={Timer}
        title="Хурал эхлээгүй"
        description={
          canFacilitate
            ? "Хурлыг эхлүүлбэл хөтөлбөрийн цаг хэмжигч, агентын ээлж, шийдвэрийн бүртгэл нээгдэнэ."
            : "Хурлыг багийн ахлагч эсвэл Борлуулалт хариуцсан захирал эхлүүлнэ."
        }
        action={canFacilitate ? { label: "Хурал эхлүүлэх", onClick: begin } : undefined}
      />
    );
  }

  const agentOver = currentAgent ? (agentSec[currentAgent.agentId] ?? 0) > slotMax * 60 : false;
  const sectionLimit = (current?.minutes ?? 0) * 60;
  const sectionUsed = current ? (sectionSec[current.key] ?? 0) : 0;

  return (
    <div className="space-y-4">
      {/* Хөтөлбөр */}
      <Card>
        <CardBody className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-sm font-semibold text-ink">Хурлын хөтөлбөр</h2>
            {live ? <Badge tone="green">Явагдаж байна</Badge> : <Badge tone="neutral">Дууссан</Badge>}
            {live && canFacilitate ? (
              <div className="ml-auto flex gap-2">
                <Button type="button" size="sm" variant="outline" onClick={() => setRunning((r) => !r)}>
                  {running ? <Square className="size-4" /> : <Play className="size-4" />}
                  {running ? "Түр зогсоох" : "Цаг эхлүүлэх"}
                </Button>
                <Button type="button" size="sm" disabled={pending} onClick={finish}>
                  <CheckCircle2 className="size-4" /> Хурал дуусгах
                </Button>
              </div>
            ) : null}
          </div>
          <ol className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {agenda.map((a, i) => {
              const used = sectionSec[a.key] ?? 0;
              const over = used > a.minutes * 60;
              return (
                <li key={a.key}>
                  <button
                    type="button"
                    onClick={() => setSection(i)}
                    className={cn(
                      "w-full rounded-xl border p-3 text-left transition",
                      i === section ? "border-brand-500 bg-brand-50" : "border-line bg-surface hover:bg-surface-2"
                    )}
                  >
                    <span className="text-xs font-semibold text-muted">
                      {i + 1}. {a.minutes} минут
                    </span>
                    <span className="mt-0.5 block text-sm text-ink">{AGENDA_SECTION_LABEL[a.key] ?? a.key}</span>
                    <span className={cn("mt-1 block text-xs tabular-nums", over ? "text-rose-700" : "text-muted")}>
                      {mmss(used)}
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>
          {current ? (
            <p className={cn("text-xs", sectionUsed > sectionLimit ? "text-rose-700" : "text-subtle")}>
              Энэ хэсэгт {mmss(sectionUsed)} / {current.minutes}:00
            </p>
          ) : null}
        </CardBody>
      </Card>

      {/* Хэсгийн агуулга */}
      {current?.key === "agents" ? (
        <Card>
          <CardBody className="space-y-3">
            {agents.length === 0 ? (
              <p className="text-sm text-muted">Танилцуулах агент алга.</p>
            ) : currentAgent ? (
              <>
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    aria-label="Өмнөх агент"
                    disabled={agentIdx === 0}
                    onClick={() => setAgentIdx((i) => Math.max(0, i - 1))}
                  >
                    <ChevronLeft className="size-4" />
                  </Button>
                  <span className="text-base font-semibold text-ink">
                    {agentIdx + 1}/{agents.length}. {currentAgent.name}
                  </span>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    aria-label="Дараагийн агент"
                    disabled={agentIdx >= agents.length - 1}
                    onClick={() => setAgentIdx((i) => Math.min(agents.length - 1, i + 1))}
                  >
                    <ChevronRight className="size-4" />
                  </Button>
                  {currentAgent.planStatus ? (
                    <Badge tone={weeklyStatusLabel(currentAgent.planStatus).tone}>
                      Карт: {weeklyStatusLabel(currentAgent.planStatus).label}
                    </Badge>
                  ) : (
                    <Badge tone="rose">Карт бөглөөгүй</Badge>
                  )}
                  <span
                    className={cn(
                      "ml-auto rounded-lg px-2 py-1 text-sm font-semibold tabular-nums",
                      agentOver ? "bg-rose-50 text-rose-700" : "bg-surface-2 text-ink"
                    )}
                  >
                    <Timer className="mr-1 inline size-4" />
                    {mmss(agentSec[currentAgent.agentId] ?? 0)} / {slotMin}–{slotMax} мин
                  </span>
                </div>
                {currentAgent.anomalies.length ? (
                  <div className="flex flex-wrap gap-1.5">
                    {currentAgent.anomalies.map((a) => (
                      <Badge key={a} tone="rose">
                        <AlertTriangle className="size-3" />
                        {ANOMALY_LABEL[a]}
                      </Badge>
                    ))}
                  </div>
                ) : null}
                <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
                  <NumberBlock title={`1. ${PRESENTATION_STEPS[0]}`} rows={currentAgent.lastWeek} />
                  <NumberBlock title={`2. ${PRESENTATION_STEPS[1]}`} rows={currentAgent.pipeline} />
                  <NumberBlock title={`3. ${PRESENTATION_STEPS[2]}`} rows={currentAgent.targets} />
                </div>
                <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
                  <ListBlock title={`4. ${PRESENTATION_STEPS[3]}`} items={[...currentAgent.topDeals, ...currentAgent.priorities]} />
                  <ListBlock title={`5. ${PRESENTATION_STEPS[4]}`} items={currentAgent.obstacles} />
                  <ListBlock title={`6. ${PRESENTATION_STEPS[5]}`} items={currentAgent.commitment ? [currentAgent.commitment] : []} />
                </div>
                {currentAgent.planHref ? (
                  <Link href={currentAgent.planHref} className="text-xs font-medium text-brand-700 hover:underline">
                    Картыг бүтнээр нь нээх →
                  </Link>
                ) : null}
                <DecisionList
                  items={decisionsByAgent.get(currentAgent.agentId) ?? []}
                  onToggle={canFacilitate ? toggleDecision : undefined}
                />
              </>
            ) : null}
          </CardBody>
        </Card>
      ) : (
        <Card>
          <CardBody className="space-y-3">
            <h3 className="text-sm font-semibold text-ink">{current ? (AGENDA_SECTION_LABEL[current.key] ?? current.key) : ""}</h3>
            {current?.key === "dashboard" || current?.key === "pipeline" ? (
              <NumberBlock title="Багийн тоо (CRM-ээс)" rows={teamNumbers} />
            ) : null}
            {current?.key === "pipeline" ? (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {agents.map((a) => (
                  <ListBlock key={a.agentId} title={a.name} items={[...a.topDeals, ...a.obstacles.map((o) => `Саад: ${o}`)]} />
                ))}
              </div>
            ) : null}
            <DecisionList items={decisionsByAgent.get("") ?? []} onToggle={canFacilitate ? toggleDecision : undefined} />
            <p className="text-xs text-subtle">CRM-д байхгүй тоог хурал дээр таамаглан мэдээлэхгүй — бүх тоо системээс.</p>
          </CardBody>
        </Card>
      )}

      {/* Шийдвэр бүртгэх */}
      {live && canFacilitate ? (
        <Card>
          <CardBody className="space-y-3">
            <h3 className="text-sm font-semibold text-ink">Шийдвэр, амлалт, дадлагажуулалт</h3>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-[12rem_1fr]">
              <Field label="Төрөл" htmlFor="dec-kind">
                <Select
                  id="dec-kind"
                  value={form.kind}
                  onChange={(e) => setForm((f) => ({ ...f, kind: e.target.value as DecisionKind }))}
                >
                  {(Object.keys(DECISION_KIND_LABEL) as DecisionKind[]).map((k) => (
                    <option key={k} value={k}>
                      {DECISION_KIND_LABEL[k]}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Агуулга" htmlFor="dec-text">
                <Input id="dec-text" value={form.text} onChange={(e) => setForm((f) => ({ ...f, text: e.target.value }))} />
              </Field>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <Field label="Хариуцагч" htmlFor="dec-owner">
                <Select id="dec-owner" value={form.ownerId} onChange={(e) => setForm((f) => ({ ...f, ownerId: e.target.value }))}>
                  <option value="">Сонгоогүй</option>
                  {ownerOptions.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Хугацаа" htmlFor="dec-due">
                <Input id="dec-due" type="date" value={form.dueOn} onChange={(e) => setForm((f) => ({ ...f, dueOn: e.target.value }))} />
              </Field>
              {current?.key === "agents" && currentAgent ? (
                <label className="flex items-center gap-2 pt-7 text-sm text-ink">
                  <input
                    type="checkbox"
                    checked={form.linkAgent}
                    onChange={(e) => setForm((f) => ({ ...f, linkAgent: e.target.checked }))}
                  />
                  {currentAgent.name}-ийн карттай холбох
                </label>
              ) : null}
            </div>
            <Button type="button" disabled={pending} onClick={addDecision}>
              Тэмдэглэх
            </Button>
          </CardBody>
        </Card>
      ) : null}
    </div>
  );
}

function NumberBlock({ title, rows }: { title: string; rows: MeetingNumber[] }) {
  return (
    <div className="rounded-xl border border-line p-3">
      <p className="mb-1.5 text-xs font-semibold text-muted">{title}</p>
      {rows.length === 0 ? (
        <p className="text-sm text-subtle">—</p>
      ) : (
        <ul className="space-y-1 text-sm">
          {rows.map((r) => (
            <li key={r.label} className="flex items-center gap-2">
              <span className="text-ink">{r.label}</span>
              <span
                className={cn(
                  "ml-auto tabular-nums font-semibold",
                  r.met === true ? "text-emerald-700" : r.met === false ? "text-rose-700" : "text-ink"
                )}
              >
                {r.actual ?? ""}
                {r.target != null ? <span className="font-normal text-subtle"> / {r.target}</span> : null}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ListBlock({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="rounded-xl border border-line p-3">
      <p className="mb-1.5 text-xs font-semibold text-muted">{title}</p>
      {items.length === 0 ? (
        <p className="text-sm text-subtle">Бичээгүй</p>
      ) : (
        <ul className="list-inside list-decimal space-y-0.5 text-sm text-ink">
          {items.map((t, i) => (
            <li key={`${i}-${t}`}>{t}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

function DecisionList({ items, onToggle }: { items: MeetingDecision[]; onToggle?: (d: MeetingDecision) => void }) {
  if (!items.length) return null;
  return (
    <ul className="space-y-1.5">
      {items.map((d) => (
        <li key={d.id} className="flex items-start gap-2 rounded-lg bg-surface-2 px-3 py-2 text-sm">
          <Badge tone={d.kind === "commitment" ? "brand" : d.kind === "coaching" ? "blue" : "neutral"}>{DECISION_KIND_LABEL[d.kind]}</Badge>
          <span className={cn("text-ink", d.status === "done" && "line-through opacity-60")}>{d.text}</span>
          <span className="ml-auto shrink-0 text-xs text-muted">
            {[d.owner_name, d.due_on].filter(Boolean).join(" · ")}
          </span>
          {onToggle ? (
            <button type="button" className="shrink-0 text-xs font-medium text-brand-700" onClick={() => onToggle(d)}>
              {d.status === "done" ? "Нээх" : "Хийгдсэн"}
            </button>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
