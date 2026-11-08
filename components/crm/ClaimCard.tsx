"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, Flag, Hand, Plus, Search, ShieldAlert, Trash2, Undo2, UserCheck, X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { toast } from "@/components/ui/toast";
import {
  acceptLead,
  cancelPoolClaim,
  decidePoolClaim,
  findDuplicatesMasked,
  openLeadDispute,
  requestPoolClaim,
  type MaskedDuplicate,
} from "@/lib/actions/crm-ownership";
import {
  DISPUTE_KINDS,
  DISPUTE_KIND_LABEL,
  DUPLICATE_MATCH_LABEL,
  EVIDENCE_KINDS,
  EVIDENCE_KIND_LABEL,
  POOL_CLAIM_STATUS_LABEL,
  RECYCLE_REASON_LABEL,
  acceptMinutesLeft,
  type DisputeKind,
  type EvidenceKind,
  type RecycleReason,
} from "@/lib/validation/crm-ownership";
import { CONTACT_TYPE_LABEL, LEAD_GRADE_LABEL, type ContactType, type LeadGrade } from "@/lib/constants-crm";
import { fmtDate, fmtDateTime } from "@/lib/format";
import type { AcceptPendingRow, PoolClaimRow, PoolLeadRow } from "@/lib/queries-crm-ownership";

const TEXTAREA =
  "w-full rounded-xl border border-line bg-surface p-3 text-sm text-ink focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20";

// ════════════════════════════════════════════════════════════
// Харилцагч шалгах (§6.26): агентуудын хооронд масктай давхардал
// ════════════════════════════════════════════════════════════

export function DuplicateCheck({ basePath }: { basePath: string }) {
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [hits, setHits] = useState<MaskedDuplicate[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function search(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const res = await findDuplicatesMasked({ phone, email, name });
      if (res.error) {
        setError(res.error);
        setHits(null);
        return;
      }
      setHits(res.hits ?? []);
    });
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardBody>
          <form onSubmit={search} className="space-y-3">
            <p className="text-sm text-muted">
              Харилцагч CRM-д өөр агентын нэр дээр бүртгэлтэй эсэхийг шалгана. Өөрийн хариуцаагүй бүртгэлийг нэр,
              утсыг нь нуусан хэлбэрээр харуулна; хайлт бүр бүртгэгдэнэ.
            </p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <Field label="Утас">
                <Input value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" placeholder="9911 2233" />
              </Field>
              <Field label="И-мэйл">
                <Input value={email} onChange={(e) => setEmail(e.target.value)} type="email" inputMode="email" />
              </Field>
              <Field label="Нэр">
                <Input value={name} onChange={(e) => setName(e.target.value)} />
              </Field>
            </div>
            <Button type="submit" size="sm" disabled={pending}>
              <Search className="size-4" /> {pending ? "Шалгаж байна…" : "Шалгах"}
            </Button>
            {error ? (
              <p role="alert" className="text-sm text-danger">
                {error}
              </p>
            ) : null}
          </form>
        </CardBody>
      </Card>

      {hits === null ? null : hits.length === 0 ? (
        <EmptyState
          icon={UserCheck}
          title="Давхардал олдсонгүй"
          description="Энэ харилцагч CRM-д бүртгэлгүй байна — шинэ сэжмээр бүртгэж болно."
          action={{ label: "Сэжим бүртгэх", href: `${basePath}/leads?new=1` }}
        />
      ) : (
        <div className="space-y-3">
          {hits.map((h) => (
            <ClaimCard key={h.contact_id} hit={h} basePath={basePath} />
          ))}
        </div>
      )}
    </div>
  );
}

type EvidenceDraft = { kind: EvidenceKind | ""; text: string; at: string };

/** Нэг давхардлын карт + эзэмшлийн маргаан нээх маягт. */
export function ClaimCard({ hit, basePath }: { hit: MaskedDuplicate; basePath: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<DisputeKind | "">("");
  const [claim, setClaim] = useState("");
  const [evidence, setEvidence] = useState<EvidenceDraft[]>([{ kind: "", text: "", at: "" }]);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const canDispute = !!hit.open_lead_id && hit.has_owner && !hit.owner_is_me;

  function submit() {
    setError(null);
    startTransition(async () => {
      const res = await openLeadDispute({
        contactId: hit.contact_id,
        kind,
        claim,
        evidence: evidence
          .filter((e) => e.kind || e.text.trim())
          .map((e) => ({ kind: e.kind, text: e.text, ...(e.at ? { at: e.at } : {}) })),
      });
      if (res.error) {
        setError(res.error);
        return;
      }
      toast.success("Маргаан нээгдлээ", {
        description: "Эзэмшигч, Багийн ахлагч, Үйл ажиллагаа-ЧМТ-д мэдэгдэл очлоо.",
      });
      setOpen(false);
      router.push(`${basePath}/pool?tab=disputes&id=${res.id}`);
    });
  }

  return (
    <Card>
      <CardBody className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={hit.match_kind === "phone" ? "rose" : hit.match_kind === "email" ? "amber" : "blue"}>
            {DUPLICATE_MATCH_LABEL[hit.match_kind] ?? "Таарсан"}
          </Badge>
          {hit.can_view ? (
            <Link href={`${basePath}/contacts/${hit.contact_id}`} className="font-semibold text-brand-700 hover:underline">
              {hit.display_name}
            </Link>
          ) : (
            <span className="font-semibold text-ink">{hit.display_name}</span>
          )}
          {hit.masked_phone ? <span className="text-sm text-subtle">{hit.masked_phone}</span> : null}
        </div>
        <dl className="grid grid-cols-1 gap-x-4 gap-y-1 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-xs text-subtle">Анх бүртгэсэн</dt>
            <dd className="text-ink">{fmtDate(hit.created_at)}</dd>
          </div>
          <div>
            <dt className="text-xs text-subtle">Салбар</dt>
            <dd className="text-ink">{hit.branch_name ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-xs text-subtle">Нээлттэй сэжмийн эзэмшигч</dt>
            <dd className="text-ink">
              {hit.owner_is_me ? "Та" : hit.open_lead_id ? (hit.owner_name ?? "Эзэмшигчгүй") : "Нээлттэй сэжимгүй"}
            </dd>
          </div>
        </dl>

        {hit.owner_is_me ? (
          <p className="text-sm text-muted">Энэ харилцагчийн нээлттэй сэжим таных.</p>
        ) : !hit.open_lead_id ? (
          <p className="text-sm text-muted">
            Нээлттэй сэжим алга — харилцагчийн бүртгэл дээр шинэ сэжим нэмж болно. Бүртгэлийг харах эрхгүй бол
            Үйл ажиллагаа-ЧМТ-д хандана уу.
          </p>
        ) : !hit.has_owner ? (
          <p className="text-sm text-muted">Сэжим одоогоор эзэмшигчгүй — хуваарилалтын дараалалд байна.</p>
        ) : null}

        {canDispute && !open ? (
          <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
            <Flag className="size-4" /> Эзэмшлийн маргаан нээх
          </Button>
        ) : null}

        {canDispute && open ? (
          <div className="space-y-3 rounded-xl border border-line bg-surface-2/50 p-3">
            <p className="text-xs text-muted">
              Эзэмшил нь хамгийн түрүүнд хийсэн хүчинтэй бүртгэл ба бодит үйл ажиллагааны нотолгоонд тулгуурлана.
              Хоёр талын нотолгоог Багийн ахлагч, Үйл ажиллагаа-ЧМТ хянаж, Борлуулалт хариуцсан захирал шийднэ.
            </p>
            <Field label="Маргааны төрөл">
              <Select value={kind} onChange={(e) => setKind(e.target.value as DisputeKind | "")}>
                <option value="">Сонгоно уу</option>
                {DISPUTE_KINDS.map((k) => (
                  <option key={k} value={k}>
                    {DISPUTE_KIND_LABEL[k]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Үндэслэл" hint="Хэзээ, ямар сувгаар холбогдсон, юу тохирсныг бичнэ үү (10+ тэмдэгт).">
              <textarea value={claim} onChange={(e) => setClaim(e.target.value)} rows={3} maxLength={2000} className={TEXTAREA} />
            </Field>
            <EvidenceEditor value={evidence} onChange={setEvidence} />
            {error ? (
              <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                {error}
              </p>
            ) : null}
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
                Болих
              </Button>
              <Button size="sm" onClick={submit} disabled={pending || !kind || claim.trim().length < 10}>
                {pending ? "Илгээж байна…" : "Маргаан нээх"}
              </Button>
            </div>
          </div>
        ) : null}
      </CardBody>
    </Card>
  );
}

/** Нотолгооны мөрүүд (төрөл, тайлбар, огноо). DisputePanel ч ашиглана. */
export function EvidenceEditor({
  value,
  onChange,
}: {
  value: EvidenceDraft[];
  onChange: (v: EvidenceDraft[]) => void;
}) {
  const set = (i: number, patch: Partial<EvidenceDraft>) =>
    onChange(value.map((e, idx) => (idx === i ? { ...e, ...patch } : e)));
  return (
    <div className="space-y-2">
      <p className="text-sm font-medium text-ink">Нотолгоо</p>
      {value.map((e, i) => (
        <div key={i} className="grid grid-cols-1 gap-2 rounded-xl border border-line bg-surface p-2 sm:grid-cols-[180px_1fr_150px_auto]">
          <Select value={e.kind} onChange={(ev) => set(i, { kind: ev.target.value as EvidenceKind | "" })} aria-label="Нотолгооны төрөл">
            <option value="">Төрөл</option>
            {EVIDENCE_KINDS.map((k) => (
              <option key={k} value={k}>
                {EVIDENCE_KIND_LABEL[k]}
              </option>
            ))}
          </Select>
          <Input value={e.text} onChange={(ev) => set(i, { text: ev.target.value })} placeholder="Тайлбар" aria-label="Нотолгооны тайлбар" />
          <Input type="date" value={e.at} onChange={(ev) => set(i, { at: ev.target.value })} aria-label="Огноо" />
          <Button
            type="button"
            size="sm"
            variant="ghost"
            aria-label="Мөр хасах"
            onClick={() => onChange(value.length > 1 ? value.filter((_, idx) => idx !== i) : [{ kind: "", text: "", at: "" }])}
          >
            <Trash2 className="size-4" />
          </Button>
        </div>
      ))}
      {value.length < 20 ? (
        <Button type="button" size="sm" variant="ghost" onClick={() => onChange([...value, { kind: "", text: "", at: "" }])}>
          <Plus className="size-4" /> Нотолгоо нэмэх
        </Button>
      ) : null}
    </div>
  );
}

export type { EvidenceDraft };

// ════════════════════════════════════════════════════════════
// Хүлээн авах (R2)
// ════════════════════════════════════════════════════════════

export function AcceptList({ rows, basePath }: { rows: AcceptPendingRow[]; basePath: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function accept(id: string) {
    startTransition(async () => {
      const res = await acceptLead(id);
      if (!res.ok) {
        toast.error(res.error ?? "Хүлээн авч чадсангүй.");
        router.refresh();
        return;
      }
      toast.success("Сэжмийг хүлээн авлаа", { description: "Эхний холболтоо хугацаандаа хийнэ үү." });
      router.push(`${basePath}/leads/${id}`);
    });
  }

  if (rows.length === 0) {
    return (
      <EmptyState
        icon={Hand}
        title="Хүлээн авах сэжим алга"
        description="Танд шинээр оноогдсон сэжим энд харагдана. Хугацаандаа хүлээн аваагүй бол дараагийн агентад шилжинэ."
        compact
      />
    );
  }
  return (
    <ul className="space-y-2">
      {rows.map((r) => {
        const left = acceptMinutesLeft(r.accept_due_at);
        return (
          <li key={r.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-line bg-surface p-3">
            <div className="min-w-0 flex-1">
              <p className="truncate font-semibold text-ink">{r.contact_name ?? "Шинэ сэжим"}</p>
              <p className="text-xs text-muted">
                {left == null ? "" : left >= 0 ? `${left} минутын дотор хүлээн авна` : "Хугацаа дууссан — дахин хуваарилагдана"}
              </p>
            </div>
            {r.grade ? (
              <Badge tone={LEAD_GRADE_LABEL[r.grade as LeadGrade]?.tone ?? "neutral"}>
                {LEAD_GRADE_LABEL[r.grade as LeadGrade]?.label ?? "—"}
              </Badge>
            ) : null}
            <Button size="sm" onClick={() => accept(r.id)} disabled={pending || (left != null && left < 0)}>
              <Check className="size-4" /> Хүлээн авах
            </Button>
          </li>
        );
      })}
    </ul>
  );
}

// ════════════════════════════════════════════════════════════
// Эргэлтийн сан (R3): авах хүсэлт ба шийдвэр
// ════════════════════════════════════════════════════════════

export function PoolLeadList({ rows, canClaim }: { rows: PoolLeadRow[]; canClaim: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [claimFor, setClaimFor] = useState<string | null>(null);
  const [note, setNote] = useState("");

  function request(leadId: string) {
    startTransition(async () => {
      const res = await requestPoolClaim({ leadId, note });
      if (!res.ok) {
        toast.error(res.error ?? "Хүсэлт илгээж чадсангүй.");
        return;
      }
      toast.success("Хүсэлт илгээгдлээ", { description: "Багийн ахлагч эсвэл Борлуулалт хариуцсан захирал шийднэ." });
      setClaimFor(null);
      setNote("");
      router.refresh();
    });
  }

  function cancel(claimId: string) {
    startTransition(async () => {
      const res = await cancelPoolClaim(claimId);
      if (!res.ok) toast.error(res.error ?? "Цуцалж чадсангүй.");
      else toast.info("Хүсэлтийг цуцаллаа");
      router.refresh();
    });
  }

  if (rows.length === 0) {
    return (
      <EmptyState
        icon={Undo2}
        title="Эргэлтийн сан хоосон"
        description="Хянан үзээд санд буцаасан сэжим энд харагдана. Сангаас зөвхөн зөвшөөрлөөр авна."
      />
    );
  }

  return (
    <ul className="space-y-2">
      {rows.map((r) => (
        <li key={r.lead_id} className="space-y-2 rounded-xl border border-line bg-surface p-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold text-ink">{r.masked_name}</span>
            {r.grade ? (
              <Badge tone={LEAD_GRADE_LABEL[r.grade as LeadGrade]?.tone ?? "neutral"}>
                {LEAD_GRADE_LABEL[r.grade as LeadGrade]?.label ?? "—"}
              </Badge>
            ) : null}
            {r.contact_types.map((t) => (
              <Badge key={t} tone="neutral">
                {CONTACT_TYPE_LABEL[t as ContactType] ?? t}
              </Badge>
            ))}
            {r.pending_claims > 0 ? <Badge tone="amber">Хүсэлт: {r.pending_claims}</Badge> : null}
          </div>
          <p className="text-xs text-muted">
            {r.recycle_reason ? `${RECYCLE_REASON_LABEL[r.recycle_reason as RecycleReason] ?? "Эргэлтэд орсон"} · ` : ""}
            Санд орсон: {r.recycled_at ? fmtDate(r.recycled_at) : "—"} · Сүүлийн холболт:{" "}
            {r.last_contact_at ? fmtDate(r.last_contact_at) : "байхгүй"}
            {r.source_label ? ` · ${r.source_label}` : ""}
            {r.branch_name ? ` · ${r.branch_name}` : ""}
          </p>
          {!canClaim ? null : r.my_claim_id ? (
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone="amber">Таны хүсэлт хүлээгдэж байна</Badge>
              <Button size="sm" variant="ghost" onClick={() => cancel(r.my_claim_id!)} disabled={pending}>
                <X className="size-4" /> Цуцлах
              </Button>
            </div>
          ) : claimFor === r.lead_id ? (
            <div className="flex flex-col gap-2 sm:flex-row">
              <Input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Юу хийх вэ? (ж: маргааш залгаж хэрэгцээг шинэчилнэ)"
                aria-label="Хүсэлтийн тайлбар"
              />
              <div className="flex gap-2">
                <Button size="sm" onClick={() => request(r.lead_id)} disabled={pending || note.trim().length < 5}>
                  Илгээх
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setClaimFor(null)}>
                  Болих
                </Button>
              </div>
            </div>
          ) : (
            <Button size="sm" variant="outline" onClick={() => setClaimFor(r.lead_id)}>
              <Hand className="size-4" /> Авах хүсэлт
            </Button>
          )}
        </li>
      ))}
    </ul>
  );
}

export function PoolClaimQueue({
  claims,
  leads,
  canDecide,
  me,
}: {
  claims: PoolClaimRow[];
  leads: PoolLeadRow[];
  canDecide: boolean;
  me: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [rejectFor, setRejectFor] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const leadById = new Map(leads.map((l) => [l.lead_id, l]));

  function decide(claimId: string, approve: boolean) {
    startTransition(async () => {
      const res = await decidePoolClaim({ claimId, approve, note: approve ? undefined : note });
      if (!res.ok) {
        toast.error(res.error ?? "Шийдвэрлэж чадсангүй.");
        return;
      }
      toast.success(approve ? "Зөвшөөрлөө — сэжим агентад оноогдлоо" : "Татгалзлаа");
      setRejectFor(null);
      setNote("");
      router.refresh();
    });
  }

  if (claims.length === 0) {
    return (
      <EmptyState
        icon={ShieldAlert}
        title="Шийдвэрлэх хүсэлт алга"
        description="Агентууд эргэлтийн сангаас сэжим авах хүсэлт илгээхэд энд харагдана."
        compact
      />
    );
  }

  return (
    <ul className="space-y-2">
      {claims.map((c) => {
        const lead = leadById.get(c.lead_id);
        const st = POOL_CLAIM_STATUS_LABEL[c.status] ?? POOL_CLAIM_STATUS_LABEL.requested;
        return (
          <li key={c.id} className="space-y-2 rounded-xl border border-line bg-surface p-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-semibold text-ink">{c.requester_name ?? "Агент"}</span>
              <span className="text-sm text-muted">→ {lead?.masked_name ?? "Сэжим"}</span>
              <Badge tone={st.tone}>{st.label}</Badge>
              <span className="ml-auto text-xs text-subtle">{fmtDateTime(c.created_at)}</span>
            </div>
            <p className="text-sm text-ink">{c.note}</p>
            {c.decision_note ? <p className="text-xs text-muted">Шийдвэрийн тайлбар: {c.decision_note}</p> : null}
            {canDecide && c.status === "requested" && c.requester_id !== me ? (
              rejectFor === c.id ? (
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Татгалзсан шалтгаан" aria-label="Татгалзсан шалтгаан" />
                  <div className="flex gap-2">
                    <Button size="sm" variant="danger" onClick={() => decide(c.id, false)} disabled={pending || note.trim().length < 5}>
                      Татгалзах
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setRejectFor(null)}>
                      Болих
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" onClick={() => decide(c.id, true)} disabled={pending}>
                    <Check className="size-4" /> Зөвшөөрөх
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setRejectFor(c.id)} disabled={pending}>
                    <X className="size-4" /> Татгалзах
                  </Button>
                </div>
              )
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
