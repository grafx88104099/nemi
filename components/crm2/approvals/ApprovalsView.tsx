import Link from "next/link";
import { ArrowRight, CheckCheck, FileSignature, Inbox, Send } from "lucide-react";

import { fmtDateTime } from "@/lib/format";
import { getCrm2Context, getCrm2Settings } from "@/lib/crm2/context";
import { fmtIsoDate } from "@/lib/crm2/datetime";
import { HIDDEN_PROPERTY_LABEL, REQUEST_KIND_LABEL, TASK_KIND_LABEL } from "@/lib/crm2/labels";
import { formatCommission } from "@/lib/crm2/money";
import { crm2Paths, type Crm2Panel, type Crm2Paths } from "@/lib/crm2/paths";
import { listPendingApprovals, type PendingBrokerage, type PendingRequest } from "@/lib/crm2/queries/approvals";
import { listMyDecidedRequests, type MyDecidedRequest } from "@/lib/crm2/approvals-queries";
import { requestCallCounts, requestTargetHref, splitPending, type RequestCallView } from "@/lib/crm2/approvals-view";
import type { Crm2Settings } from "@/lib/crm2/settings";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody } from "@/components/ui/card";
import {
  CategoryBadge,
  CodeChip,
  Crm2Empty,
  LoadErrorState,
  NoAccessState,
  PropertyStatusBadge,
  RequestStatusBadge,
} from "@/components/crm2/ui";

import { BrokerageDecision, CancelRequestButton, RequestDecision } from "./ApprovalActions";

/**
 * Батлах (/…/crm/approvals): илгээсэн зуучлалын гэрээ, агентын хүсэлт (хөрөнгийн
 * төлөв, хэлцэл/харилцагч шилжүүлэх) ба «Миний хүсэлтүүд». Хэн юуг батлахыг DB-ийн
 * эрхийн функц шийднэ (canDecide); энд зөвхөн харуулж, товч өгнө.
 */

function SectionTitle({ icon: Icon, title, count, hint }: { icon: typeof Inbox; title: string; count?: number; hint?: string }) {
  return (
    <div className="mb-3">
      <h2 className="flex items-center gap-2 text-base font-bold text-ink">
        <Icon className="size-4 text-brand-600" aria-hidden />
        {title}
        {count !== undefined ? <span className="text-sm font-normal tabular-nums text-muted">({count})</span> : null}
      </h2>
      {hint ? <p className="mt-0.5 text-sm text-muted">{hint}</p> : null}
    </div>
  );
}

function BrokerageItem({
  c,
  paths,
  settings,
  decide,
}: {
  c: PendingBrokerage;
  paths: Crm2Paths;
  settings: Crm2Settings;
  decide: boolean;
}) {
  const p = c.property;
  const href = paths.property(c.property_id, "agreement");
  const place = p ? [p.district, p.location_text].filter(Boolean).join(", ") : "";
  return (
    <li className="flex flex-col gap-3 rounded-xl border border-line bg-surface p-3 sm:p-4 lg:flex-row lg:items-center">
      <div className="min-w-0 flex-1 space-y-1.5">
        <div className="flex flex-wrap items-center gap-1.5">
          <CodeChip code={c.number} href={href} />
          {p ? <CodeChip code={p.code} href={paths.property(p.id)} /> : null}
          {p ? <CategoryBadge category={p.category} labels={settings["property.category_labels"]} /> : null}
          {p ? <PropertyStatusBadge status={p.status} /> : null}
          {c.version > 1 ? <Badge tone="blue">Сунгалт · {c.version}-р хувилбар</Badge> : null}
        </div>
        {place ? <p className="truncate text-sm text-ink">{place}</p> : null}
        <dl className="grid grid-cols-1 gap-x-4 gap-y-0.5 text-sm sm:grid-cols-2">
          <div className="flex gap-1.5">
            <dt className="text-muted">Хариуцагч:</dt>
            <dd className="truncate text-ink">{c.responsible?.full_name ?? "—"}</dd>
          </div>
          <div className="flex gap-1.5">
            <dt className="text-muted">Илгээсэн:</dt>
            <dd className="truncate tabular-nums text-ink">
              {c.submitted_at ? fmtDateTime(c.submitted_at) : "—"}
              {c.submittedByName ? ` · ${c.submittedByName}` : ""}
            </dd>
          </div>
          <div className="flex gap-1.5">
            <dt className="text-muted">Хугацаа:</dt>
            <dd className="tabular-nums text-ink">
              {c.start_date ? fmtIsoDate(c.start_date) : "—"} – {c.end_date ? fmtIsoDate(c.end_date) : "—"}
            </dd>
          </div>
          <div className="flex gap-1.5">
            <dt className="text-muted">Шимтгэл:</dt>
            <dd className="text-ink">
              {formatCommission(c.commission_type, c.commission_value, c.commission_currency) || "—"}
            </dd>
          </div>
        </dl>
        {!decide ? (
          <p className="text-xs text-muted">Энэ гэрээг та батлах боломжгүй (өөрийн гэрээ эсвэл таны хүрээнд биш).</p>
        ) : null}
      </div>
      <div className="flex flex-wrap items-center gap-2 lg:shrink-0 lg:justify-end">
        <Link
          href={href}
          className="inline-flex min-h-11 items-center gap-1 rounded-xl px-3 text-sm font-semibold text-brand-700 hover:bg-brand-50 sm:min-h-9"
        >
          Гэрээ нээх
          <ArrowRight className="size-4" aria-hidden />
        </Link>
        {decide ? (
          <BrokerageDecision contractId={c.id} number={c.number} propertyCode={p?.code ?? null} updatedAt={c.updated_at} />
        ) : null}
      </div>
    </li>
  );
}

/** Хүсэлтийн объектын нэр (холбоостой бол Link). */
function TargetLink({ href, label, className }: { href: string | null; label: string; className: string }) {
  return href ? (
    <Link href={href} className={`${className} hover:text-brand-700 hover:underline`}>
      {label}
    </Link>
  ) : (
    <span className={className}>{label}</span>
  );
}

/** Хүсэлтэд хадгалсан нэг дуудлага: цаг, хөрөнгө, тэмдэглэл, үр дүн, дараагийн алхам. */
function StoredCall({ c, paths, showOutcome }: { c: RequestCallView; paths: Crm2Paths; showOutcome: boolean }) {
  return (
    <li className="space-y-0.5 rounded-xl border border-line bg-surface-2 px-3 py-2 text-sm">
      <p className="flex flex-wrap items-center gap-1.5">
        <span className="font-medium tabular-nums text-ink">{fmtDateTime(c.occurredAt)}</span>
        {c.propertyCode && c.propertyId ? (
          <CodeChip code={c.propertyCode} href={paths.property(c.propertyId)} />
        ) : (
          <span className="text-xs text-muted">{HIDDEN_PROPERTY_LABEL}</span>
        )}
        {c.loggedByName ? <span className="text-xs text-muted">· {c.loggedByName}</span> : null}
      </p>
      {c.note ? <p className="whitespace-pre-line break-words text-ink">{c.note}</p> : null}
      {c.result ? <p className="break-words text-muted">Үр дүн: {c.result}</p> : null}
      {c.nextAction ? (
        <p className="break-words text-muted">
          Дараагийн алхам: {TASK_KIND_LABEL[c.nextAction]}
          {c.nextActionDue ? ` · ${fmtDateTime(c.nextActionDue)}` : ""}
          {c.nextActionNote ? ` · ${c.nextActionNote}` : ""}
        </p>
      ) : null}
      {showOutcome && c.outcome ? (
        c.outcome.kind === "recorded" ? (
          <p className="flex flex-wrap items-center gap-1.5 text-xs text-emerald-800">
            Бүртгэгдсэн{c.outcome.dealCreated ? " (шинэ хэлцэл)" : ""}
            {c.outcome.dealId && c.propertyId ? (
              <Link
                href={paths.deal(c.propertyId, c.outcome.dealId)}
                className="inline-flex min-h-11 items-center px-1 font-semibold underline sm:min-h-0"
              >
                Хэлцэл нээх
              </Link>
            ) : null}
          </p>
        ) : (
          <p className="break-words text-xs text-amber-800">Алгассан: {c.outcome.reason}</p>
        )
      ) : null}
    </li>
  );
}

/** Хадгалсан дуудлагуудын жагсаалт (3-аас олон бол эвхэгдэнэ). */
function StoredCalls({ calls, paths, showOutcome = false }: { calls: RequestCallView[]; paths: Crm2Paths; showOutcome?: boolean }) {
  if (calls.length === 0) return null;
  const list = (
    <ol className="space-y-2">
      {calls.map((c, i) => (
        <StoredCall key={`${c.occurredAt}-${i}`} c={c} paths={paths} showOutcome={showOutcome} />
      ))}
    </ol>
  );
  if (calls.length <= 3) {
    return (
      <div className="space-y-1.5">
        <p className="text-xs font-semibold text-ink">Хадгалсан дуудлага ({calls.length})</p>
        {list}
      </div>
    );
  }
  return (
    <details className="group">
      <summary className="flex min-h-11 cursor-pointer items-center text-xs font-semibold text-brand-700 hover:underline">
        Хадгалсан дуудлага ({calls.length})
      </summary>
      {list}
    </details>
  );
}

function RequestBody({
  r,
  paths,
}: {
  r: Pick<PendingRequest, "kind" | "target" | "statusChange" | "fromAgentName" | "toAgentName" | "withDeals" | "reason"> & {
    calls?: RequestCallView[];
  };
  paths: Crm2Paths;
}) {
  return (
    <div className="min-w-0 flex-1 space-y-1.5">
      <div className="flex flex-wrap items-center gap-1.5">
        <Badge tone="brand">{REQUEST_KIND_LABEL[r.kind]}</Badge>
        <TargetLink href={requestTargetHref(r, paths)} label={r.target.label} className="font-semibold text-ink" />
      </div>
      {r.statusChange ? (
        <p className="flex flex-wrap items-center gap-1.5 text-sm">
          <PropertyStatusBadge status={r.statusChange.from} />
          <ArrowRight className="size-3.5 text-subtle" aria-label="→" />
          <PropertyStatusBadge status={r.statusChange.to} />
        </p>
      ) : null}
      {r.kind !== "property_status" ? (
        <p className="flex flex-wrap items-center gap-1.5 text-sm text-ink">
          <span>{r.fromAgentName ?? "Ажилтан"}</span>
          <ArrowRight className="size-3.5 text-subtle" aria-label="→" />
          <span className="font-semibold">{r.toAgentName ?? "Ажилтан"}</span>
          {r.kind === "contact_transfer" && r.withDeals ? (
            <span className="text-xs text-muted">(нээлттэй хэлцлүүдийн хамт)</span>
          ) : null}
        </p>
      ) : null}
      {r.reason ? <p className="whitespace-pre-line break-words text-sm text-muted">Шалтгаан: {r.reason}</p> : null}
      {r.calls?.length ? (
        <>
          <StoredCalls calls={r.calls} paths={paths} />
          <p className="text-xs text-muted">Батлавал эдгээр дуудлага хүсэгчийн нэр дээр анхны цагаар нь бүртгэгдэнэ.</p>
        </>
      ) : null}
    </div>
  );
}

function RequestItem({ r, paths, decide }: { r: PendingRequest; paths: Crm2Paths; decide: boolean }) {
  return (
    <li className="flex flex-col gap-3 rounded-xl border border-line bg-surface p-3 sm:p-4 lg:flex-row lg:items-center">
      <div className="min-w-0 flex-1 space-y-1">
        <RequestBody r={r} paths={paths} />
        <p className="text-xs text-muted">
          {r.mine ? "Таны хүсэлт" : (r.requestedByName ?? "Ажилтан")} · {fmtDateTime(r.requested_at)}
        </p>
        {!decide && !r.mine ? <p className="text-xs text-muted">Энэ хүсэлтийг та шийдвэрлэх боломжгүй.</p> : null}
      </div>
      <div className="flex flex-wrap items-center gap-2 lg:shrink-0 lg:justify-end">
        {r.mine ? <CancelRequestButton requestId={r.id} label={r.target.label} calls={r.savedCalls} /> : null}
        {decide ? <RequestDecision requestId={r.id} label={r.target.label} calls={r.savedCalls} /> : null}
      </div>
    </li>
  );
}

function DecidedItem({ d, paths }: { d: MyDecidedRequest; paths: Crm2Paths }) {
  const counts = requestCallCounts(d.calls);
  return (
    <li className="flex flex-col gap-1 py-3">
      <div className="flex flex-wrap items-center gap-1.5">
        <RequestStatusBadge status={d.status} />
        <span className="text-sm text-muted">{REQUEST_KIND_LABEL[d.kind]}</span>
        <TargetLink href={requestTargetHref(d, paths)} label={d.label} className="text-sm font-semibold text-ink" />
        {d.statusChange ? (
          <span className="inline-flex items-center gap-1">
            <PropertyStatusBadge status={d.statusChange.from} />
            <ArrowRight className="size-3 text-subtle" aria-label="→" />
            <PropertyStatusBadge status={d.statusChange.to} />
          </span>
        ) : null}
        {d.toAgentName ? <span className="text-sm text-muted">→ {d.toAgentName}</span> : null}
      </div>
      <p className="text-xs text-muted">
        Гаргасан {fmtDateTime(d.requestedAt)}
        {d.decidedAt ? ` · шийдвэрлэсэн ${fmtDateTime(d.decidedAt)}` : ""}
        {d.decidedByName ? ` · ${d.decidedByName}` : ""}
      </p>
      {d.decisionNote ? <p className="break-words text-sm text-ink">{d.decisionNote}</p> : null}
      {d.calls.length && d.status === "approved" ? (
        <>
          <p className="text-xs text-muted">
            Хадгалсан {d.calls.length} дуудлагаас бүртгэгдсэн: {counts.recorded}
            {counts.skipped ? ` · алгассан: ${counts.skipped}` : ""}
          </p>
          <StoredCalls calls={d.calls} paths={paths} showOutcome />
        </>
      ) : d.calls.length ? (
        <p className="text-xs text-amber-800">{d.calls.length} дуудлага бүртгэгдээгүй.</p>
      ) : null}
    </li>
  );
}

export async function ApprovalsView({ panel }: { panel: Crm2Panel }) {
  const ctx = await getCrm2Context();
  if (!ctx?.isMember) {
    return (
      <div className="mx-auto w-full max-w-7xl px-4 py-4 sm:py-6 md:px-6">
        <NoAccessState description="CRM-ийн эрхтэй ажилтанд харагдана." />
      </div>
    );
  }
  const paths = crm2Paths(panel);
  const [pending, decidedRes, settings] = await Promise.all([listPendingApprovals(), listMyDecidedRequests(), getCrm2Settings()]);
  const decided = decidedRes.rows;
  const retryHref = paths.approvals();

  const me = ctx.profileId;
  const contracts = splitPending(
    pending.brokerage.map((c) => ({ ...c, mine: c.submitted_by === me || c.responsible_agent_id === me || c.created_by === me }))
  );
  const requests = splitPending(pending.requests);
  const showDecide = ctx.canApprove || contracts.toDecide.length + requests.toDecide.length > 0;
  const brokerageList = [...contracts.toDecide, ...(ctx.isManager ? contracts.others : [])];
  const requestList = [...requests.toDecide, ...(ctx.isManager ? requests.others : [])];
  const myCount = requests.mine.length + contracts.mine.length;

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-4 sm:py-6 md:px-6">
      <div className="min-w-0">
        <h1 className="text-xl font-extrabold text-ink sm:text-2xl">{showDecide ? "Батлах" : "Миний хүсэлт"}</h1>
        <p className="text-sm text-muted">
          {showDecide
            ? "Илгээсэн зуучлалын гэрээ, агентуудын хүсэлтийг шийдвэрлэнэ. Шийдвэр бүр хэн, хэзээ гэдэгтэйгээ хадгалагдана."
            : "Таны гаргасан хүсэлт, батлуулахаар илгээсэн гэрээний явц."}
        </p>
      </div>

      {showDecide ? (
        <div className="mt-4 grid grid-cols-2 gap-2 sm:max-w-md">
          <div className="rounded-xl border border-line bg-surface px-3 py-2">
            <span className="block text-xs text-muted">Батлах гэрээ</span>
            <span className="text-lg font-bold tabular-nums text-ink">{pending.error ? "—" : contracts.toDecide.length}</span>
          </div>
          <div className="rounded-xl border border-line bg-surface px-3 py-2">
            <span className="block text-xs text-muted">Шийдвэрлэх хүсэлт</span>
            <span className="text-lg font-bold tabular-nums text-ink">{pending.error ? "—" : requests.toDecide.length}</span>
          </div>
        </div>
      ) : null}

      <div className="mt-6 space-y-8">
        {showDecide ? (
          <section aria-label="Зуучлалын гэрээ">
            <SectionTitle
              icon={FileSignature}
              title="Батлуулахаар илгээсэн гэрээ"
              count={pending.error ? undefined : brokerageList.length}
              hint="Гэрээг нээж файл, нөхцөлийг шалгаад батална. Батлагдсан гэрээг засахгүй — өөрчлөлт нь шинэ хувилбар болно."
            />
            {pending.error ? (
              <LoadErrorState compact retryHref={retryHref} />
            ) : brokerageList.length === 0 ? (
              <Crm2Empty icon={CheckCheck} title="Батлах гэрээ алга" compact />
            ) : (
              <ul className="space-y-2">
                {brokerageList.map((c) => (
                  <BrokerageItem key={c.id} c={c} paths={paths} settings={settings} decide={c.canDecide} />
                ))}
              </ul>
            )}
          </section>
        ) : null}

        {showDecide ? (
          <section aria-label="Хүсэлт">
            <SectionTitle
              icon={Inbox}
              title="Шийдвэрлэх хүсэлт"
              count={pending.error ? undefined : requestList.length}
              hint="Хөрөнгийн төлөв өөрчлөх, хэлцэл эсвэл харилцагч шилжүүлэх хүсэлт. Татгалзахад шалтгаан заавал."
            />
            {pending.error ? (
              <LoadErrorState compact retryHref={retryHref} />
            ) : requestList.length === 0 ? (
              <Crm2Empty icon={CheckCheck} title="Шийдвэрлэх хүсэлт алга" compact />
            ) : (
              <ul className="space-y-2">
                {requestList.map((r) => (
                  <RequestItem key={r.id} r={r} paths={paths} decide={r.canDecide} />
                ))}
              </ul>
            )}
          </section>
        ) : null}

        <section aria-label="Миний хүсэлтүүд">
          <SectionTitle icon={Send} title="Миний хүсэлтүүд" count={pending.error ? undefined : myCount} hint="Хүлээгдэж буйг цуцалж болно." />
          {pending.error ? (
            <LoadErrorState compact retryHref={retryHref} />
          ) : myCount === 0 ? (
            <Crm2Empty
              icon={Send}
              title="Хүлээгдэж буй хүсэлт алга"
              description="Хөрөнгийн төлөв өөрчлөх эсвэл шилжүүлэх хүсэлт гаргавал энд харагдана."
              compact
            />
          ) : (
            <ul className="space-y-2">
              {requests.mine.map((r) => (
                <RequestItem key={r.id} r={r} paths={paths} decide={false} />
              ))}
              {contracts.mine.map((c) => (
                <li
                  key={c.id}
                  className="flex flex-col gap-2 rounded-xl border border-line bg-surface p-3 sm:flex-row sm:items-center sm:p-4"
                >
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Badge tone="amber">Гэрээ батлуулахаар</Badge>
                      <CodeChip code={c.number} href={paths.property(c.property_id, "agreement")} />
                      {c.property ? <CodeChip code={c.property.code} href={paths.property(c.property.id)} /> : null}
                    </div>
                    <p className="text-xs text-muted">
                      Илгээсэн {c.submitted_at ? fmtDateTime(c.submitted_at) : "—"} · батлагчийн шийдвэр хүлээж байна
                    </p>
                  </div>
                  <Link
                    href={paths.property(c.property_id, "agreement")}
                    className="inline-flex min-h-11 items-center gap-1 self-start rounded-xl px-3 text-sm font-semibold text-brand-700 hover:bg-brand-50 sm:min-h-9 sm:self-auto"
                  >
                    Нээх
                    <ArrowRight className="size-4" aria-hidden />
                  </Link>
                </li>
              ))}
            </ul>
          )}

          {decidedRes.error ? (
            <LoadErrorState
              compact
              className="mt-4"
              title="Шийдвэрлэгдсэн хүсэлтийг ачаалж чадсангүй"
              retryHref={retryHref}
            />
          ) : decided.length > 0 ? (
            <Card className="mt-4">
              <CardBody className="p-4">
                <h3 className="text-sm font-bold text-ink">Сүүлийн 30 хоногт шийдвэрлэгдсэн</h3>
                <ul className="divide-y divide-line">
                  {decided.map((d) => (
                    <DecidedItem key={d.id} d={d} paths={paths} />
                  ))}
                </ul>
              </CardBody>
            </Card>
          ) : null}
        </section>
      </div>
    </div>
  );
}
