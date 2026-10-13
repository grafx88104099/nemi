import Link from "next/link";
import { CalendarX2 } from "lucide-react";

import { Card, CardBody } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { fmtDate } from "@/lib/format";

export type OverdueItem = {
  id: string;
  title: string;
  sub?: string | null;
  date?: string | null;
  href?: string;
};

/** Хоцорсон эргэн холбогдолт/даалгаврын жагсаалт (R-01/R-04). */
export function OverdueList({ title, items, emptyText }: { title: string; items: OverdueItem[]; emptyText: string }) {
  return (
    <Card>
      <CardBody>
        <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-ink">
          <CalendarX2 className="size-4 text-brand-600" /> {title}
          <Badge tone={items.length ? "rose" : "green"}>{items.length}</Badge>
        </h2>
        {items.length === 0 ? (
          <p className="text-sm text-muted">{emptyText}</p>
        ) : (
          <div className="space-y-2">
            {items.slice(0, 10).map((it) => {
              const row = (
                <>
                  <span className="truncate font-medium text-ink">{it.title}</span>
                  {it.sub ? <span className="truncate text-xs text-muted">{it.sub}</span> : null}
                  {it.date ? (
                    <span className="ml-auto shrink-0 text-xs text-danger">{fmtDate(it.date)}</span>
                  ) : null}
                </>
              );
              return it.href ? (
                <Link key={it.id} href={it.href} className="flex items-center gap-2 text-sm hover:text-brand-700">
                  {row}
                </Link>
              ) : (
                <div key={it.id} className="flex items-center gap-2 text-sm">
                  {row}
                </div>
              );
            })}
          </div>
        )}
      </CardBody>
    </Card>
  );
}
