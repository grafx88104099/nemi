"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRightLeft, Check, Clock, History, RotateCcw, Scale, ShieldAlert, UserRound } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Modal } from "@/components/ui/modal";
import { toast } from "@/components/ui/toast";
import { ReassignModal } from "@/components/crm/ReassignModal";
import { RecycleModal } from "@/components/crm/RecycleModal";
import { acceptLead, declareCoi, revokeCoi } from "@/lib/actions/crm-ownership";
import {
  COI_RELATIONS,
  COI_RELATION_LABEL,
  DISPUTE_STATUS_LABEL,
  RECYCLE_REASON_LABEL,
  acceptMinutesLeft,
  canReassign,
  canRecycle,
  ownershipReasonLabel,
  type CoiRelation,
  type RecycleReason,
} from "@/lib/validation/crm-ownership";
import type { CrmRole } from "@/lib/constants-crm";
import { fmtDate, fmtDateTime } from "@/lib/format";
import type { CoiRow, LeadOwnership } from "@/lib/queries-crm-ownership";

/**
 * Сэжмийн «Эзэмшил» таб (§6.26, §6.27, UX-2): эзэмшигч, анх бүртгэсэн хүн,
 * хүлээн авах хугацаа, эзэмшлийн түүх (шошготой), маргаан, шилжүүлэх /
 * эргэлтэд оруулах үйлдэл. Сэжмийн картад (агент, оффис) залгана.
 */
export function OwnershipPanel({
  ownership,
  me,
  roles,
  agents,
  basePath,
}: {
  ownership: LeadOwnership;
  me: string;
  roles: CrmRole[];
  agents: { profileId: string; name: string; onLeave?: boolean }[];
  basePath: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [reassignOpen, setReassignOpen] = useState(false);
  const [recycleOpen, setRecycleOpen] = useState(false);
  const [coiOpen, setCoiOpen] = useState(false);
  const { lead, history, disputes } = ownership;

  const isOwner = lead.owner_id === me;
  const left = acceptMinutesLeft(lead.accept_due_at);
  const pendingAccept = isOwner && !lead.accepted_at && !!lead.accept_due_at;
  const open = lead.status === "new" || lead.status === "active";
  const activeDisputes = disputes.filter((d) => ["open", "under_review", "escalated", "appealed"].includes(d.status));

  function accept() {
    startTransition(async () => {
      const res = await acceptLead(lead.id);
      if (!res.ok) toast.error(res.error ?? "Хүлээн авч чадсангүй.");
      else toast.success("Сэжмийг хүлээн авлаа");
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      {pendingAccept ? (
        <div className="flex flex-col gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 sm:flex-row sm:items-center">
          <Clock className="size-5 shrink-0 text-amber-700" />
          <p className="flex-1 text-sm text-amber-800">
            {left != null && left >= 0
              ? `Энэ сэжим танд оноогдлоо — ${left} минутын дотор хүлээн авна уу. Эс бөгөөс дараагийн агентад шилжинэ.`
              : "Хүлээн авах хугацаа дууссан — дахин хуваарилагдана."}
          </p>
          <Button size="sm" onClick={accept} disabled={pending || (left != null && left < 0)}>
            <Check className="size-4" /> Хүлээн авах
          </Button>
        </div>
      ) : null}

      <Card>
        <CardBody className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <UserRound className="size-4 text-brand-600" />
            <h3 className="text-sm font-bold text-ink">Эзэмшил</h3>
            {lead.unprotected ? <Badge tone="rose">Хамгаалалтгүй бүртгэл</Badge> : null}
            {lead.status === "recycled" ? (
              <Badge tone="amber">{lead.owner_id ? "Эргэлтэд (эзэмшигчтэй)" : "Эргэлтийн санд"}</Badge>
            ) : null}
          </div>
          <dl className="grid grid-cols-1 gap-x-4 gap-y-2 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-xs text-subtle">Эзэмшигч агент</dt>
              <dd className="font-medium text-ink">{lead.owner_name ?? "Эзэмшигчгүй"}</dd>
            </div>
            <div>
              <dt className="text-xs text-subtle">Анх бүртгэсэн</dt>
              <dd className="text-ink">
                {lead.created_by_name ?? "—"} · {fmtDateTime(lead.created_at)}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-subtle">Эзэмшигч оноогдсон</dt>
              <dd className="text-ink">{lead.owner_assigned_at ? fmtDateTime(lead.owner_assigned_at) : "—"}</dd>
            </div>
            <div>
              <dt className="text-xs text-subtle">Хүлээн авсан</dt>
              <dd className="text-ink">
                {lead.accepted_at ? fmtDateTime(lead.accepted_at) : lead.accept_due_at ? "Хүлээгдэж байна" : "—"}
              </dd>
            </div>
            {lead.recycled_at ? (
              <div className="sm:col-span-2">
                <dt className="text-xs text-subtle">Эргэлтэд орсон</dt>
                <dd className="text-ink">
                  {fmtDate(lead.recycled_at)}
                  {lead.recycle_reason ? ` · ${RECYCLE_REASON_LABEL[lead.recycle_reason as RecycleReason] ?? ""}` : ""}
                </dd>
              </div>
            ) : null}
          </dl>
          <div className="flex flex-wrap gap-2">
            {canReassign(roles) && (open || lead.status === "recycled") ? (
              <Button size="sm" variant="outline" onClick={() => setReassignOpen(true)}>
                <ArrowRightLeft className="size-4" /> Дахин хуваарилах
              </Button>
            ) : null}
            {canRecycle(roles) && open ? (
              <Button size="sm" variant="outline" onClick={() => setRecycleOpen(true)}>
                <RotateCcw className="size-4" /> Эргэлтэд оруулах
              </Button>
            ) : null}
            <Button size="sm" variant="ghost" onClick={() => setCoiOpen(true)}>
              <ShieldAlert className="size-4" /> Ашиг сонирхол мэдүүлэх
            </Button>
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardBody className="space-y-2">
          <h3 className="flex items-center gap-2 text-sm font-bold text-ink">
            <Scale className="size-4" /> Эзэмшлийн маргаан
          </h3>
          {disputes.length === 0 ? (
            <p className="text-sm text-subtle">Маргаан гараагүй.</p>
          ) : (
            <ul className="space-y-1.5">
              {disputes.map((d) => {
                const st = DISPUTE_STATUS_LABEL[d.status] ?? DISPUTE_STATUS_LABEL.open;
                return (
                  <li key={d.id}>
                    <Link
                      href={`${basePath}/pool?tab=disputes&id=${d.id}`}
                      className="flex flex-wrap items-center gap-2 rounded-lg border border-line px-3 py-2 text-sm hover:bg-surface-2"
                    >
                      <span className="text-ink">
                        {d.claimant_name ?? "—"} ↔ {d.respondent_name ?? "эзэмшигчгүй"}
                      </span>
                      <Badge tone={st.tone}>{st.label}</Badge>
                      <span className="ml-auto text-xs text-subtle">{fmtDate(d.created_at)}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
          {activeDisputes.length > 0 ? (
            <p className="text-xs text-amber-700">Нээлттэй маргаантай үед шилжүүлэхээс өмнө шийдвэрийг хүлээнэ үү.</p>
          ) : null}
        </CardBody>
      </Card>

      <Card>
        <CardBody className="space-y-2">
          <h3 className="flex items-center gap-2 text-sm font-bold text-ink">
            <History className="size-4" /> Эзэмшлийн түүх
          </h3>
          {history.length === 0 ? (
            <EmptyState compact icon={History} title="Түүх хоосон" description="Эзэмшигч солигдох бүрд шалтгаантай бүртгэгдэнэ." />
          ) : (
            <ol className="space-y-2">
              {history.map((h) => (
                <li key={h.id} className="rounded-lg border border-line px-3 py-2 text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-ink">{ownershipReasonLabel(h.reason_code)}</span>
                    <span className="ml-auto text-xs text-subtle">{fmtDateTime(h.created_at)}</span>
                  </div>
                  <p className="text-xs text-muted">
                    {h.old_owner_name ?? "—"} → {h.new_owner_name ?? "Эргэлтийн сан"}
                    {h.decided_by_name ? ` · Шийдсэн: ${h.decided_by_name}` : " · Систем"}
                  </p>
                  {h.note ? <p className="text-xs text-ink">{h.note}</p> : null}
                </li>
              ))}
            </ol>
          )}
        </CardBody>
      </Card>

      <ReassignModal
        open={reassignOpen}
        onClose={() => setReassignOpen(false)}
        leadId={lead.id}
        roles={roles}
        agents={agents}
        currentOwnerId={lead.owner_id}
      />
      <RecycleModal open={recycleOpen} onClose={() => setRecycleOpen(false)} leadId={lead.id} />
      <CoiDeclareModal open={coiOpen} onClose={() => setCoiOpen(false)} contactId={lead.contact_id} agents={agents} me={me} />
    </div>
  );
}

// ════════════════════════════════════════════════════════════
// Ашиг сонирхлын мэдүүлэг (§5, PMC-SAL-COI-001)
// ════════════════════════════════════════════════════════════

export function CoiDeclareModal({
  open,
  onClose,
  contactId,
  agents,
  me,
}: {
  open: boolean;
  onClose: () => void;
  /** Харилцагчийн картаас нээвэл тухайн харилцагч. */
  contactId: string | null;
  agents: { profileId: string; name: string }[];
  me: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [subject, setSubject] = useState<"contact" | "agent" | "">(contactId ? "" : "agent");
  const [related, setRelated] = useState("");
  const [relation, setRelation] = useState<CoiRelation | "">("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  function close() {
    setSubject(contactId ? "" : "agent");
    setRelated("");
    setRelation("");
    setNote("");
    setError(null);
    onClose();
  }

  function submit() {
    setError(null);
    startTransition(async () => {
      const res = await declareCoi({
        contactId: subject === "contact" ? contactId : null,
        relatedProfileId: subject === "agent" ? related || null : null,
        relation,
        note: note || undefined,
      });
      if (!res.ok) {
        setError(res.error ?? "Хадгалж чадсангүй.");
        return;
      }
      toast.success("Мэдүүлэг бүртгэгдлээ", { description: "Хамаарал бүхий маргаанд та шийдвэрлэгч болохгүй." });
      close();
      router.refresh();
    });
  }

  return (
    <Modal
      open={open}
      onClose={close}
      title="Ашиг сонирхол мэдүүлэх"
      footer={
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="ghost" onClick={close}>
            Болих
          </Button>
          <Button
            onClick={submit}
            disabled={pending || !relation || !subject || (subject === "agent" && !related)}
          >
            Мэдүүлэх
          </Button>
        </div>
      }
    >
      <div className="space-y-3">
        <p className="text-sm text-muted">
          Харилцагч эсвэл өөр ажилтантай гэр бүл, бизнесийн болон бусад хамааралтай бол мэдүүлнэ. Мэдүүлсэн
          хамаарал бүхий эзэмшлийн маргааныг та шийдвэрлэхгүй.
        </p>
        <Field label="Хэнтэй хамааралтай">
          <Select value={subject} onChange={(e) => setSubject(e.target.value as "contact" | "agent" | "")}>
            <option value="">Сонгоно уу</option>
            {contactId ? <option value="contact">Энэ харилцагчтай</option> : null}
            <option value="agent">Ажилтантай</option>
          </Select>
        </Field>
        {subject === "agent" ? (
          <Field label="Ажилтан">
            <Select value={related} onChange={(e) => setRelated(e.target.value)}>
              <option value="">Сонгоно уу</option>
              {agents
                .filter((a) => a.profileId !== me)
                .map((a) => (
                  <option key={a.profileId} value={a.profileId}>
                    {a.name}
                  </option>
                ))}
            </Select>
          </Field>
        ) : null}
        <Field label="Хамаарал">
          <Select value={relation} onChange={(e) => setRelation(e.target.value as CoiRelation | "")}>
            <option value="">Сонгоно уу</option>
            {COI_RELATIONS.map((r) => (
              <option key={r} value={r}>
                {COI_RELATION_LABEL[r]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Тайлбар" hint={relation === "other" ? "«Бусад» бол заавал тайлбарлана." : undefined}>
          <Input value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} />
        </Field>
        {error ? (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        ) : null}
      </div>
    </Modal>
  );
}

/** Өөрийн мэдүүлгийн жагсаалт (+ шинэ мэдүүлэг, цуцлах). */
export function CoiPanel({
  rows,
  me,
  agents,
  showOwner,
}: {
  rows: CoiRow[];
  me: string;
  agents: { profileId: string; name: string }[];
  /** Удирдлага бүх мэдүүлгийг харна. */
  showOwner: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  function revoke(id: string) {
    const note = window.prompt("Цуцлах шалтгаан");
    if (!note) return;
    startTransition(async () => {
      const res = await revokeCoi(id, note);
      if (!res.ok) toast.error(res.error ?? "Цуцалж чадсангүй.");
      else toast.info("Мэдүүлгийг цуцаллаа");
      router.refresh();
    });
  }

  return (
    <div className="space-y-3">
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        <ShieldAlert className="size-4" /> Ажилтантай хамаарал мэдүүлэх
      </Button>
      {rows.length === 0 ? (
        <EmptyState
          compact
          icon={ShieldAlert}
          title="Мэдүүлэг алга"
          description="Харилцагчтай хамаарлыг сэжмийн картын «Эзэмшил» хэсгээс мэдүүлнэ."
        />
      ) : (
        <ul className="space-y-2">
          {rows.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center gap-2 rounded-xl border border-line bg-surface p-3 text-sm">
              {showOwner ? <span className="font-semibold text-ink">{r.profile_name ?? "—"}</span> : null}
              <span className="text-ink">
                {r.contact_name ? `Харилцагч: ${r.contact_name}` : r.contact_id ? "Харилцагч" : `Ажилтан: ${r.related_name ?? "—"}`}
              </span>
              <Badge tone="neutral">{COI_RELATION_LABEL[r.relation as CoiRelation] ?? "Хамаарал"}</Badge>
              {r.revoked_at ? <Badge tone="neutral">Цуцалсан</Badge> : <Badge tone="amber">Хүчинтэй</Badge>}
              <span className="ml-auto text-xs text-subtle">{fmtDate(r.declared_at)}</span>
              {!r.revoked_at && r.profile_id === me ? (
                <Button size="sm" variant="ghost" onClick={() => revoke(r.id)} disabled={pending}>
                  Цуцлах
                </Button>
              ) : null}
              {r.note ? <p className="w-full text-xs text-muted">{r.note}</p> : null}
            </li>
          ))}
        </ul>
      )}
      <CoiDeclareModal open={open} onClose={() => setOpen(false)} contactId={null} agents={agents} me={me} />
    </div>
  );
}
