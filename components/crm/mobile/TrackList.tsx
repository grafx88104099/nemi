"use client";

import { useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { toast } from "@/components/ui/toast";
import { stopTrack } from "@/lib/actions/crm-worklists";
import type { EnrollmentRow } from "@/lib/queries-crm-worklists";

const STATUS: Record<string, { label: string; tone: "green" | "neutral" | "amber" }> = {
  active: { label: "Идэвхтэй", tone: "green" },
  stopped: { label: "Зогссон", tone: "amber" },
  completed: { label: "Дууссан", tone: "neutral" },
};

const REASON: Record<string, string> = {
  reply: "Харилцагч хариу өгсөн",
  stage_change: "Шат солигдсон",
  closed: "Бүртгэл хаагдсан эсвэл эзэмшигч солигдсон",
  manual: "Гараар зогсоосон",
  completed: "Бүх алхам дууссан",
};

export function TrackList({ rows }: { rows: EnrollmentRow[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  if (!rows.length) {
    return (
      <EmptyState
        compact
        title="Ажлын цуваа эхлүүлээгүй байна"
        description="Ажлын жагсаалтын мөр бүрийн «Цуваа» товчоор сэжим эсвэл боломжид бэлэн алхмуудыг товлоно."
        action={{ label: "Ажлын жагсаалт", href: "/agent/crm/worklists" }}
      />
    );
  }
  return (
    <ul className="divide-y divide-line rounded-2xl border border-line bg-surface">
      {rows.map((r) => {
        const st = STATUS[r.status] ?? STATUS.completed;
        const href = r.lead_id ? `/agent/crm/leads/${r.lead_id}` : `/agent/crm/pipeline/${r.opportunity_id}`;
        return (
          <li key={r.id} className="flex flex-wrap items-center gap-2 px-3 py-2.5">
            <Link href={href} className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold text-ink">{r.contact_name}</span>
              <span className="block truncate text-xs text-muted">
                {r.template_name} · {r.done}/{r.total} алхам
                {r.stop_reason && r.status !== "active" ? ` · ${REASON[r.stop_reason] ?? ""}` : ""}
              </span>
            </Link>
            <Badge tone={st.tone}>{st.label}</Badge>
            {r.status === "active" ? (
              <Button
                size="sm"
                variant="ghost"
                disabled={pending}
                onClick={() =>
                  start(async () => {
                    const res = await stopTrack(r.id);
                    if (!res.ok) toast.error(res.error ?? "Зогсоож чадсангүй.");
                    else {
                      toast.success("Цуваа зогслоо", { description: "Үлдсэн алхмын даалгавар хойшлогдлоо." });
                      router.refresh();
                    }
                  })
                }
              >
                Зогсоох
              </Button>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
