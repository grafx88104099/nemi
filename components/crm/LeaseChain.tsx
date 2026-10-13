"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { LEASE_STATUS_LABEL } from "@/lib/constants-crm";
import type { LeaseChainLink } from "@/lib/queries-crm-rentals";

/**
 * Сунгалтын гинжин холбоос (F-504) — гинжийг нэг дэлгэцээс бүрэн харна:
 * өмнөх гэрээнүүд → одоогийн → залгамжилсан гэрээнүүд.
 */
export function LeaseChain({ chain, currentId }: { chain: LeaseChainLink[]; currentId: string }) {
  if (chain.length <= 1) {
    return <p className="text-sm text-muted">Сунгалтын гинж алга — энэ нь анхны гэрээ.</p>;
  }
  return (
    <div className="flex flex-wrap items-center gap-2">
      {chain.map((link, i) => {
        const label = LEASE_STATUS_LABEL[link.status];
        const isCurrent = link.id === currentId;
        return (
          <span key={link.id} className="flex items-center gap-2">
            {i > 0 && <ArrowRight className="size-4 text-subtle" />}
            <span
              className={
                "flex flex-col rounded-xl border px-3 py-2 " +
                (isCurrent ? "border-brand-500 bg-brand-50" : "border-line bg-surface")
              }
            >
              {isCurrent ? (
                <span className="text-sm font-semibold text-ink">{link.number}</span>
              ) : (
                <Link
                  href={`/office/crm/rentals/leases/${link.id}`}
                  className="text-sm font-semibold text-brand-700 hover:underline"
                >
                  {link.number}
                </Link>
              )}
              <span className="text-xs text-muted">
                {link.start_on} → {link.end_on} · {link.monthly_rent.toLocaleString()}₮
              </span>
              <span className="mt-1">
                <Badge tone={label.tone}>{label.label}</Badge>
              </span>
            </span>
          </span>
        );
      })}
    </div>
  );
}
