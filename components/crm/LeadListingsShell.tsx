"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Home, Search } from "lucide-react";

import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { EmptyState } from "@/components/ui/empty-state";
import { DEAL_TYPE_LABEL } from "@/lib/constants";
import { CRM_LIFECYCLE_LABEL } from "@/lib/constants-crm";
import { fmtDateNum } from "@/lib/format";
import {
  listingInactiveLabel,
  listingPriceLabel,
  listingSpecLabel,
  type LeadListingGroup,
} from "@/lib/crm/lead-listing";
import type { AgentOption } from "@/lib/queries-crm-leads";

/**
 * Сэжимтэй зарууд: зар бүрийн карт, дор нь тухайн зарын сэжим. Хэн юуг харахыг
 * RLS шийднэ; эзэмшигчийн шүүлтийг (agents) зөвхөн оффисын панель дамжуулна.
 */
export function LeadListingsShell({
  groups,
  agents,
  basePath,
}: {
  groups: LeadListingGroup[];
  agents?: AgentOption[];
  basePath: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const urlQ = sp.get("q") ?? "";
  const [q, setQ] = useState(urlQ);

  const owner = agents ? (sp.get("owner") ?? "") : "";
  const filtered = Boolean(urlQ || owner);
  const leadTotal = groups.reduce((sum, g) => sum + g.lead_count, 0);

  function setParam(key: string, value: string) {
    const next = new URLSearchParams(sp.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    const query = next.toString();
    router.replace(query ? `${pathname}?${query}` : pathname);
  }

  function applySearch() {
    const value = q.trim();
    if (value !== urlQ) setParam("q", value);
  }

  // Input-ийн төлөвийг хамт цэвэрлэхгүй бол дараагийн blur хуучин хайлтыг сэргээнэ.
  function clearFilters() {
    setQ("");
    router.replace(pathname);
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-extrabold text-ink">Сэжимтэй зар</h1>
        <p className="text-sm text-muted">
          Нийт {groups.length} зар · {leadTotal} сэжим
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-2">
        <div className="relative w-full sm:w-auto">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-subtle" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && applySearch()}
            onBlur={applySearch}
            placeholder="Зарын гарчгаар хайх…"
            aria-label="Зарын гарчгаар хайх"
            className="w-full pl-9 sm:w-64"
          />
        </div>
        {agents && agents.length > 1 ? (
          <Select
            value={owner}
            onChange={(e) => setParam("owner", e.target.value)}
            aria-label="Эзэмшигчээр шүүх"
            className="w-full sm:w-56"
          >
            <option value="">Бүх эзэмшигч</option>
            {agents.map((a) => (
              <option key={a.profileId} value={a.profileId}>
                {a.name}
              </option>
            ))}
          </Select>
        ) : null}
      </div>

      {groups.length === 0 ? (
        <EmptyState
          icon={Home}
          title={filtered ? "Шүүлтэд тохирох зар алга" : "Сэжимтэй зар алга"}
          description={
            filtered
              ? "Шүүлтээ өөрчилж үзнэ үү."
              : basePath.startsWith("/office")
                ? "Сэжим бүртгэхдээ зар сонгоход тухайн зар энд, бүртгэгдсэн сэжимтэйгээ хамт харагдана."
                : "Та зар дээр сэжим бүртгэсний дараа тухайн зар энд харагдана."
          }
          action={
            filtered
              ? { label: "Шүүлт цэвэрлэх", onClick: clearFilters }
              : { label: "Сэжим бүртгэх", href: `${basePath}/leads?new=1` }
          }
        />
      ) : (
        <div className="grid grid-cols-1 items-start gap-3 lg:grid-cols-2">
          {groups.map((group) => (
            <LeadListingCard key={group.key} group={group} basePath={basePath} />
          ))}
        </div>
      )}
    </div>
  );
}

function LeadListingCard({ group, basePath }: { group: LeadListingGroup; basePath: string }) {
  const { listing } = group;
  const title = listing?.title ?? "Зарын мэдээлэл алга";
  const spec = listing ? listingSpecLabel(listing) : "";
  const inactive = listingInactiveLabel(group.live_status);

  return (
    <Card className="overflow-hidden">
      <div className="flex gap-3 p-3 sm:p-4">
        <div className="relative size-20 shrink-0 overflow-hidden rounded-xl bg-surface-2 sm:size-24">
          {listing?.photo ? (
            <Image src={listing.photo} alt={title} fill sizes="96px" className="object-cover" />
          ) : (
            <Home className="absolute left-1/2 top-1/2 size-6 -translate-x-1/2 -translate-y-1/2 text-subtle" aria-hidden />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="line-clamp-2 break-words font-semibold text-ink">{title}</h2>
          {listing ? (
            <p className="mt-0.5 text-sm">
              <span className="font-bold text-ink">{listingPriceLabel(listing)}</span>
              <span className="text-muted"> · {DEAL_TYPE_LABEL[listing.deal_type]}</span>
            </p>
          ) : null}
          {spec ? <p className="mt-0.5 break-words text-xs text-muted">{spec}</p> : null}
          {inactive ? (
            <Badge tone="amber" className="mt-1.5">
              {inactive}
            </Badge>
          ) : null}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 border-t border-line px-3 py-1.5 sm:px-4">
        <Badge tone="brand">{group.lead_count} сэжим</Badge>
        <Badge tone={group.open_lead_count > 0 ? "green" : "neutral"}>{group.open_lead_count} нээлттэй</Badge>
        <span className="text-xs text-subtle">Сүүлд {fmtDateNum(group.latest_lead_at)}</span>
        {group.listing_id ? (
          <Link
            href={`${basePath}/leads?listing=${group.listing_id}`}
            className="ml-auto inline-flex h-9 items-center text-xs font-semibold text-brand-700 hover:underline"
          >
            Жагсаалтаар харах
          </Link>
        ) : null}
      </div>

      <ul className="divide-y divide-line border-t border-line">
        {group.leads.map((lead) => {
          const status = CRM_LIFECYCLE_LABEL[lead.status];
          return (
            <li key={lead.id}>
              <Link
                href={`${basePath}/leads/${lead.id}`}
                className="flex items-center justify-between gap-2 px-3 py-2.5 transition hover:bg-surface-2/50 sm:px-4"
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold text-ink">{lead.contact_name}</span>
                  <span className="block truncate text-xs text-subtle">
                    {lead.owner_name ?? "Оноогдоогүй"} · {fmtDateNum(lead.created_at)}
                  </span>
                </span>
                <Badge tone={status.tone} className="shrink-0">
                  {status.label}
                </Badge>
              </Link>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
