"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Hourglass } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";
import { ConfirmDialog } from "@/components/crm2/ui/confirm-dialog";
import { ReasonDialog } from "@/components/crm2/ui/reason-dialog";
import { cancelRequest, decideRequest } from "@/lib/crm2/actions/requests";
import { approvedToast, storedCallsNotice } from "@/lib/crm2/approvals-view";
import { PROPERTY_STATUS_LABEL, REQUEST_KIND_LABEL } from "@/lib/crm2/labels";
import { fmtDateTime } from "@/lib/format";
import type { Crm2PropertyStatus, Crm2RequestKind } from "@/lib/crm2/types";

export type PendingRequestView = {
  id: string;
  kind: Crm2RequestKind;
  from: string | null;
  to: string | null;
  reason: string | null;
  requestedAt: string;
  requestedBy: string;
  requestedByName: string | null;
  canDecide: boolean;
  /** Тайлбар мөр (жишээ: «Бат → Саруул»); өгөөгүй бол төрлөөр. */
  summary?: string | null;
  /** Хүсэлтэд хадгалсан дуудлагын тоо (дуудлагатай шилжүүлэх хүсэлт). */
  calls?: number;
  /** Дуудлагуудыг бүтнээр нь харах «Батлах» хуудас. */
  approvalsHref?: string;
};

/**
 * Хөрөнгийн хүлээгдэж буй хүсэлт (төлөв өөрчлөх г.м.): батлагч батлах/татгалзах,
 * хүсэлт гаргагч цуцлах. Өөрийгөө батлах дүрмийг DB шалгана.
 */
export function PendingRequests({ requests, me }: { requests: PendingRequestView[]; me: string | null }) {
  if (requests.length === 0) return null;
  return (
    <ul className="space-y-2">
      {requests.map((r) => (
        <RequestRow key={r.id} r={r} mine={!!me && r.requestedBy === me} />
      ))}
    </ul>
  );
}

function statusLabel(v: string | null): string {
  return v ? (PROPERTY_STATUS_LABEL[v as Crm2PropertyStatus] ?? v) : "—";
}

function RequestRow({ r, mine }: { r: PendingRequestView; mine: boolean }) {
  const router = useRouter();
  const [approveOpen, setApproveOpen] = React.useState(false);
  const [rejectOpen, setRejectOpen] = React.useState(false);
  const [cancelOpen, setCancelOpen] = React.useState(false);
  const [note, setNote] = React.useState("");

  const what =
    r.summary ??
    (r.kind === "property_status" ? `${statusLabel(r.from)} → ${statusLabel(r.to)}` : REQUEST_KIND_LABEL[r.kind] ?? r.kind);

  return (
    <li className="flex flex-col gap-2 rounded-2xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <p className="flex flex-wrap items-center gap-1.5 font-semibold">
          <Hourglass className="size-4 shrink-0" aria-hidden />
          {REQUEST_KIND_LABEL[r.kind]}: {what}
        </p>
        <p className="mt-0.5 text-xs">
          {r.requestedByName ?? "Ажилтан"} · {fmtDateTime(r.requestedAt)}
          {r.reason ? ` · ${r.reason}` : ""}
        </p>
        {r.calls ? (
          <p className="mt-0.5 text-xs">
            Хадгалсан {r.calls} дуудлага — батлавал хүсэгчийн нэр дээр анхны цагаар нь бүртгэгдэнэ.
          </p>
        ) : null}
        {r.calls && r.approvalsHref ? (
          <Link href={r.approvalsHref} className="inline-flex min-h-11 items-center text-xs font-semibold underline sm:min-h-0">
            Дуудлагуудыг харах
          </Link>
        ) : null}
        {!r.canDecide && !mine ? <p className="mt-0.5 text-xs">Батлах эрхтэй хүн шийднэ.</p> : null}
      </div>
      <div className="flex shrink-0 flex-wrap gap-2">
        {r.canDecide ? (
          <>
            <Button
              type="button"
              size="touch"
              onClick={() => {
                setNote("");
                setApproveOpen(true);
              }}
            >
              Батлах
            </Button>
            <Button type="button" size="touch" variant="outline" onClick={() => setRejectOpen(true)}>
              Татгалзах
            </Button>
          </>
        ) : null}
        {mine ? (
          <Button type="button" size="touch" variant="ghost" onClick={() => setCancelOpen(true)}>
            Хүсэлт цуцлах
          </Button>
        ) : null}
      </div>

      <ConfirmDialog
        open={approveOpen}
        onClose={() => setApproveOpen(false)}
        title="Хүсэлт батлах"
        description={storedCallsNotice("approve", r.calls) ? `${what}. ${storedCallsNotice("approve", r.calls)}` : what}
        confirmLabel="Батлах"
        onConfirm={async () => {
          const res = await decideRequest({ request_id: r.id, approve: true, note });
          if (!res.ok) return res.error;
          approvedToast(res.data.skipped, toast);
          router.refresh();
          return null;
        }}
      >
        <Field label="Тэмдэглэл (заавал биш)" htmlFor={`req-${r.id}-note`}>
          <textarea
            id={`req-${r.id}-note`}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            maxLength={2000}
            className="w-full rounded-xl border border-line bg-surface px-3.5 py-2.5 text-sm text-ink focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
          />
        </Field>
      </ConfirmDialog>
      <ReasonDialog
        open={rejectOpen}
        onClose={() => setRejectOpen(false)}
        title="Хүсэлтээс татгалзах"
        description={storedCallsNotice("reject", r.calls) ? `${what}. ${storedCallsNotice("reject", r.calls)}` : what}
        label="Татгалзсан шалтгаан"
        confirmLabel="Татгалзах"
        tone="danger"
        onSubmit={async ({ text }) => {
          const res = await decideRequest({ request_id: r.id, approve: false, note: text });
          if (!res.ok) return res.error;
          toast.success("Хүсэлтээс татгалзлаа");
          router.refresh();
          return null;
        }}
      />
      <ConfirmDialog
        open={cancelOpen}
        onClose={() => setCancelOpen(false)}
        title="Хүсэлтээ цуцлах уу?"
        description={storedCallsNotice("cancel", r.calls, what) ?? what}
        confirmLabel="Цуцлах"
        tone="danger"
        onConfirm={async () => {
          const res = await cancelRequest(r.id);
          if (!res.ok) return res.error;
          toast.success("Хүсэлт цуцлагдлаа");
          router.refresh();
          return null;
        }}
      />
    </li>
  );
}
