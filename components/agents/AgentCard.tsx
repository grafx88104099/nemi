import Link from "next/link";
import { ShieldCheck, Star, Sparkles } from "lucide-react";

import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { LinkPendingOverlay } from "@/components/ui/link-pending";
import type { AgentListItem } from "@/lib/queries";
import { agentStats } from "@/lib/agent-stats";

export function AgentCard({ a }: { a: AgentListItem }) {
  const stats = agentStats(a);
  return (
    <Link
      href={`/agents/${a.id}`}
      className="relative block rounded-2xl border border-line bg-surface p-5 shadow-sm transition hover:shadow-md"
    >
      <div className="flex items-start gap-3">
        <Avatar initials={a.avatar ?? "NA"} src={a.avatar_url} color={a.office?.color ?? "#C2410C"} size="lg" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1 font-bold text-ink">
            <span className="truncate">{a.display_name}</span>
            {a.verified && <ShieldCheck className="size-4 shrink-0 text-emerald-600" />}
          </div>
          <div className="truncate text-sm text-muted">{a.office?.name}</div>
          {/* Хоосон/0 статистикийг харуулахгүй (lib/agent-stats). */}
          <div className="mt-1 flex items-center gap-1 text-sm">
            {stats.rating ? (
              <>
                <Star className="size-3.5 fill-amber-400 text-amber-400" aria-hidden />
                <span className="font-semibold text-ink">{stats.rating.value}</span>
                <span className="text-muted">({stats.rating.reviews})</span>
              </>
            ) : (
              <span className="text-muted">Сэтгэгдэл алга</span>
            )}
            {stats.sold ? <span className="text-muted">· {stats.sold} зарсан</span> : null}
          </div>
        </div>
        {a.premier && (
          <Badge tone="brand">
            <Sparkles /> Premier
          </Badge>
        )}
      </div>
      {a.specialty && <p className="mt-3 text-sm text-ink">{a.specialty}</p>}
      {a.areas?.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {a.areas.slice(0, 3).map((ar) => (
            <span key={ar} className="rounded-full bg-surface-2 px-2 py-0.5 text-xs text-muted">
              {ar}
            </span>
          ))}
        </div>
      )}
      <LinkPendingOverlay />
    </Link>
  );
}
