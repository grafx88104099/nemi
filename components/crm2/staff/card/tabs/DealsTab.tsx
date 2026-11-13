import { Eye, Handshake, Link2, Phone } from "lucide-react";

import { Card } from "@/components/ui/card";
import { Crm2Empty, LoadErrorState } from "@/components/crm2/ui/empty";
import { CodeChip } from "@/components/crm2/ui/code-chip";
import { DealStageBadge } from "@/components/crm2/ui/badges";
import { MaskedName } from "@/components/crm2/ui/masked-name";
import { fmtDateTime } from "@/lib/format";
import { crm2Paths, type Crm2Panel } from "@/lib/crm2/paths";
import { loadPropertyDeals } from "@/lib/crm2/queries/properties";
import { cancelReasonLabel, type Crm2Settings } from "@/lib/crm2/settings";
import { cn } from "@/lib/utils";

import { Note } from "../parts";

/**
 * «Хэлцлүүд» таб (crm2_property_deals): нэг хөрөнгө — олон харилцагчийн хэлцэл.
 * Харилцагчийн нэр эрхгүй бол далд. Дуудлага/үзүүлэлтийг үйл явдлаар тоолно.
 */
export async function DealsTab({
  panel,
  propertyId,
  settings,
}: {
  panel: Crm2Panel;
  propertyId: string;
  settings: Crm2Settings;
}) {
  const paths = crm2Paths(panel);
  const { rows: deals, error } = await loadPropertyDeals(propertyId);
  const open = deals.filter((d) => d.is_open).length;
  const codeById = Object.fromEntries(deals.map((d) => [d.deal_id, d.code]));

  if (error) return <LoadErrorState retryHref={paths.property(propertyId, "deals")} />;
  if (deals.length === 0) {
    return (
      <Crm2Empty
        icon={Handshake}
        title="Хэлцэл алга"
        description="«Дуудлага бүртгэх»-ээр харилцагчийг дугаараар нь сонгоход энэ хөрөнгө дээр хэлцэл нээгдэнэ."
      />
    );
  }

  return (
    <div className="space-y-3">
      <Note>
        Нээлттэй {open} · нийт {deals.length}. Нэг харилцагчийн хэлцэл цуцлагдахад хөрөнгийн төлөв, бусад хэлцэл өөрчлөгдөхгүй.
      </Note>
      <Card>
        <ul className="divide-y divide-line">
          {deals.map((d) => (
            <li key={d.deal_id} className={cn("space-y-1.5 px-4 py-3", !d.is_open && "bg-surface-2/40")}>
              <div className="flex flex-wrap items-center gap-2">
                <CodeChip code={d.code} href={paths.deal(propertyId, d.deal_id)} />
                <DealStageBadge stage={d.stage} />
                <MaskedName
                  name={d.contact_name}
                  visible={d.contact_visible}
                  href={d.contact_visible && d.contact_id ? paths.contact(d.contact_id) : null}
                />
              </div>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
                <span>Хариуцсан: {d.agent_name || "—"}</span>
                <span className="inline-flex items-center gap-1 tabular-nums">
                  <Phone className="size-3.5" aria-hidden /> {d.calls}
                </span>
                <span className="inline-flex items-center gap-1 tabular-nums">
                  <Eye className="size-3.5" aria-hidden /> {d.showings}
                  {d.showings ? ` (үзүүлсэн ${d.shown})` : ""}
                </span>
                <span>Сүүлд: {fmtDateTime(d.last_activity_at ?? d.created_at)}</span>
              </div>
              {d.stage === "cancelled" && d.cancel_reason_code ? (
                <p className="text-xs text-rose-700">Цуцалсан шалтгаан: {cancelReasonLabel(settings, d.cancel_reason_code)}</p>
              ) : null}
              {d.previous_deal_id || d.origin_deal_id ? (
                <p className="flex flex-wrap items-center gap-1.5 text-xs text-muted">
                  <Link2 className="size-3.5" aria-hidden />
                  {d.previous_deal_id ? <span>Өмнөх хэлцэл: {codeById[d.previous_deal_id] ?? "энэ хосын өмнөх хэлцэл"}</span> : null}
                  {d.origin_deal_id ? <span>Өөр хөрөнгийн цуцлагдсан хэлцлийн дараах санал</span> : null}
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
