"use client";

import Link from "next/link";
import { AlertTriangle } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { fmtDate } from "@/lib/format";
import type { DuplicateHit } from "@/lib/queries-crm-contacts";

/**
 * F-107: бодит цагийн давхардлын анхааруулга — магадлалтай давхардлыг
 * эзэмшигч, салбар, бүртгэсэн огнооны хамт үзүүлнэ. Үл хэрэгсэж үргэлжлүүлбэл
 * аудит логт бүртгэгдэнэ (createContact/createLead талд).
 */

const MATCH_LABEL: Record<DuplicateHit["match_kind"], { label: string; tone: "rose" | "amber" | "blue" }> = {
  phone: { label: "Утас таарсан", tone: "rose" },
  email: { label: "И-мэйл таарсан", tone: "amber" },
  name: { label: "Нэр ойролцоо", tone: "blue" },
};

export function DuplicateHint({
  hits,
  basePath = "/office/crm",
  linkable = true,
}: {
  hits: DuplicateHit[];
  basePath?: string;
  linkable?: boolean;
}) {
  if (hits.length === 0) return null;

  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
      <div className="flex items-center gap-2 text-sm font-semibold text-amber-800">
        <AlertTriangle className="size-4 shrink-0" />
        Ижил төстэй бүртгэл олдлоо ({hits.length})
      </div>
      <p className="mt-0.5 text-xs text-amber-700">
        Нэг этгээд системд НЭГ л удаа бүртгэгдэнэ (F-100). Давхардлыг шалгаад байгаа бүртгэл дээр
        сэжим нэмэх эсвэл нэгтгүүлэхээр Зохицуулагчид хандана уу.
      </p>
      <ul className="mt-2 space-y-1.5">
        {hits.map((h) => (
          <li
            key={`${h.contact_id}-${h.match_kind}`}
            className="flex flex-wrap items-center gap-2 rounded-lg bg-surface px-2.5 py-1.5 text-sm"
          >
            <Badge tone={MATCH_LABEL[h.match_kind].tone}>{MATCH_LABEL[h.match_kind].label}</Badge>
            {linkable ? (
              <Link
                href={`${basePath}/contacts/${h.contact_id}`}
                className="font-medium text-brand-700 hover:underline"
                target="_blank"
              >
                {h.display_name}
              </Link>
            ) : (
              <span className="font-medium text-ink">{h.display_name}</span>
            )}
            <span className="font-mono text-xs text-muted">{h.number}</span>
            {h.owner_name ? <span className="text-xs text-muted">Эзэмшигч: {h.owner_name}</span> : null}
            <span className="text-xs text-subtle">Бүртгэсэн: {fmtDate(h.created_at)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
