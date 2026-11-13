import { Card } from "@/components/ui/card";
import { HistoryList } from "@/components/crm2/ui/history-list";
import { LoadErrorState } from "@/components/crm2/ui/empty";
import { crm2Paths, type Crm2Panel } from "@/lib/crm2/paths";
import { loadPropertyHistory } from "@/lib/crm2/queries/history";
import type { PropertyDetail } from "@/lib/crm2/queries/properties";
import type { Crm2Settings } from "@/lib/crm2/settings";

import { buildHistoryLookup } from "../logic";
import { CursorPager, Note } from "../parts";

const PAGE = 100;

/**
 * «Өөрчлөлтийн түүх» таб: хөрөнгө, хувийн талбар, медиа, зуучлалын гэрээ, гэрээний
 * файлын өөрчлөлт (хэн, хэзээ, хуучин → шинэ). Эрхгүй хэсгийн түүхийг RLS нууна.
 */
export async function HistoryTab({
  panel,
  detail,
  settings,
  names,
  beforeId,
}: {
  panel: Crm2Panel;
  detail: PropertyDetail;
  settings: Crm2Settings;
  names: Record<string, string>;
  beforeId: number | null;
}) {
  const p = detail.property;
  const paths = crm2Paths(panel);
  const { rows, error } = await loadPropertyHistory(p.id, { beforeId, limit: PAGE });
  if (error) {
    return (
      <LoadErrorState
        compact
        retryHref={paths.property(p.id, "history", beforeId ? { before: beforeId } : undefined)}
      />
    );
  }
  const refs: Record<string, string> = {};
  if (p.project) refs[p.project.id] = p.project.name;
  if (detail.private?.owner) refs[detail.private.owner.id] = detail.private.owner.full_name;
  for (const b of detail.brokerage) if (b.owner) refs[b.owner.id] = b.owner.full_name;
  const lookup = buildHistoryLookup(settings, names, refs);
  const last = rows[rows.length - 1];

  return (
    <div className="space-y-3">
      <Note>Үнэ, төлөв, агент, гэрээ, медиагийн өөрчлөлт бүр хэн, хэзээ, юу өөрчилснөөрөө хадгалагдана.</Note>
      <Card className="px-4">
        <HistoryList rows={rows} lookup={lookup} showEntity />
      </Card>
      <CursorPager
        firstHref={beforeId ? paths.property(p.id, "history") : null}
        nextHref={rows.length === PAGE && last ? paths.property(p.id, "history", { before: last.id }) : null}
      />
    </div>
  );
}
