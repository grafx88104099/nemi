"use client";

import Link from "next/link";
import { AlertTriangle, X } from "lucide-react";

import { PendingUploads } from "@/components/crm2/staff/media/PendingUploads";
import { OWNER_STATUS_TEXT } from "@/components/crm2/staff/owner/owner-model";
import { OWNER_FINAL } from "@/lib/crm2/device/network";
import { useOutbox, type OutboxEntry } from "@/lib/crm2/device/outbox";
import { crm2Paths, type Crm2Panel } from "@/lib/crm2/paths";
import type { Crm2OwnerStatus } from "@/lib/crm2/types";
import { fmtShortDateTime } from "@/lib/format";

/**
 * Утсан дээрх хэсгүүд: «Илгээгдсэн — анхаарах» (ард илгээгдсэн шуурхай бүртгэлийн үр дүн — эзэн
 * эцсийн биш, давхардал эсвэл буцаагдсан) ба хуулагдаагүй/хүлээгдэж буй файлууд (PendingUploads).
 * Хувийн өгөгдөл (утас, нэр) байхгүй — зөвхөн код, төлөв, тоо.
 */
export function DeviceSections({ panel, profileId }: { panel: Crm2Panel; profileId: string }) {
  const p = crm2Paths(panel);
  const { items, dismiss } = useOutbox(profileId);

  return (
    <div className="space-y-3">
      {items.length ? (
        <section aria-label="Илгээгдсэн — анхаарах" className="rounded-2xl border border-rose-200 bg-rose-50/60 p-3">
          <h2 className="flex items-center gap-1.5 text-sm font-semibold text-rose-900">
            <AlertTriangle className="size-4 shrink-0" aria-hidden />
            Илгээгдсэн — анхаарах ({items.length})
          </h2>
          <ul className="mt-2 space-y-2">
            {items.map((e) => (
              <OutboxRow key={e.id} e={e} p={p} onDismiss={() => void dismiss(e.id)} />
            ))}
          </ul>
        </section>
      ) : null}
      <PendingUploads title="Утсан дээрх файл" />
    </div>
  );
}

function outboxText(e: OutboxEntry): string {
  if (e.error) return e.error;
  const parts: string[] = [];
  if (e.ownerStatus && !(OWNER_FINAL as readonly string[]).includes(e.ownerStatus)) {
    parts.push(OWNER_STATUS_TEXT[e.ownerStatus as Crm2OwnerStatus] ?? "Эзнийг шалгах шаардлагатай");
  }
  if (e.duplicateCount > 0) parts.push(`Ижил төстэй ${e.duplicateCount} хөрөнгө оффист бүртгэлтэй`);
  return parts.join(" · ") || "Шалгана уу";
}

function OutboxRow({ e, p, onDismiss }: { e: OutboxEntry; p: ReturnType<typeof crm2Paths>; onDismiss: () => void }) {
  const ownerOpen = !!e.ownerStatus && !(OWNER_FINAL as readonly string[]).includes(e.ownerStatus);
  const href = e.propertyId
    ? p.property(e.propertyId, undefined, { sheet: ownerOpen ? "owner" : "checklist" })
    : e.clientKey
      ? p.staffNew({ draft: e.clientKey })
      : null;
  return (
    <li className="flex items-start gap-2 rounded-xl bg-surface p-2">
      <div className="min-w-0 flex-1">
        {href ? (
          <Link href={href} className="flex min-h-11 flex-col justify-center rounded-lg px-1 hover:bg-surface-2">
            <span className="text-sm font-semibold text-ink">{e.code ?? (e.propertyId ? "Хөрөнгө" : "Буцаагдсан ноорог")}</span>
            <span className="text-sm text-rose-800">{outboxText(e)}</span>
          </Link>
        ) : (
          <p className="px-1 text-sm text-rose-800">{outboxText(e)}</p>
        )}
        <p className="px-1 text-xs text-muted">{fmtShortDateTime(e.at)}</p>
      </div>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Жагсаалтаас хасах"
        className="flex size-11 shrink-0 items-center justify-center rounded-lg text-muted hover:bg-surface-2 hover:text-ink"
      >
        <X className="size-4" aria-hidden />
      </button>
    </li>
  );
}
