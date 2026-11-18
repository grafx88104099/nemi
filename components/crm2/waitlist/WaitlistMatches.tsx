"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Building2, ChevronDown, Handshake, MapPin } from "lucide-react";

import { cn } from "@/lib/utils";
import { fmtIsoDate } from "@/lib/crm2/datetime";
import { crm2Paths, type Crm2Panel } from "@/lib/crm2/paths";
import { openDeal } from "@/lib/crm2/actions/deals";
import { loadRequirementMatches } from "@/lib/crm2/actions/waitlist";
import type { Crm2MatchRow } from "@/lib/crm2/queries/waitlist";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { AgentChip, CategoryBadge, CodeChip, Money } from "@/components/crm2/ui";
import { specsText } from "@/components/crm2/staff/list/StaffPropertyCard";

/**
 * T10: нэг хүлээж буй харилцагчийн «Тохирох хөрөнгө». Картыг дэлгэхэд л
 * server action-оор татна (жагсаалтад 200 хүртэл хүн байж болно).
 * Мөр бүрээс шууд хэлцэл эхлүүлнэ — хэлцэл нээгдмэгц тэр хүн жагсаалтаас гарна.
 * `children` — товчны хажуудах нэмэлт үйлдэл (сануулга).
 */
export function WaitlistMatches({
  panel,
  requirementId,
  contactId,
  contactName,
  exactCount,
  nearCount,
  categoryLabels,
  typeLabels,
  children,
}: {
  panel: Crm2Panel;
  requirementId: string;
  contactId: string;
  contactName: string;
  exactCount: number;
  nearCount: number;
  categoryLabels: Partial<Record<string, string>>;
  typeLabels: Record<string, string>;
  children?: React.ReactNode;
}) {
  const total = exactCount + nearCount;
  const [open, setOpen] = React.useState(false);
  const [rows, setRows] = React.useState<Crm2MatchRow[] | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const panelId = `${React.useId()}-matches`;

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await loadRequirementMatches(requirementId);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setRows(res.data);
    } catch (e) {
      console.error("WaitlistMatches:", e);
      setError("Ачаалахад алдаа гарлаа. Дахин оролдоно уу.");
    } finally {
      setLoading(false);
    }
  }

  function toggle() {
    const next = !open;
    setOpen(next);
    // Нэг л удаа татна; алдаа гарсан бол «Дахин оролдох»-оор.
    if (next && !rows && !loading) void load();
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        {total > 0 ? (
          <Button type="button" variant="outline" size="touch" aria-expanded={open} aria-controls={panelId} onClick={toggle}>
            <Building2 className="size-4" aria-hidden />
            Тохирох хөрөнгө
            <span className="tabular-nums">({total})</span>
            <ChevronDown className={cn("size-4 transition", open && "rotate-180")} aria-hidden />
          </Button>
        ) : (
          <p className="text-sm text-muted">Тохирох хөрөнгө гармагц хариуцсан агентад мэдэгдэнэ.</p>
        )}
        {children}
      </div>

      {open ? (
        <div id={panelId}>
          {loading ? (
            <p className="px-1 py-2 text-sm text-muted" aria-live="polite">
              Тохирох хөрөнгийг уншиж байна…
            </p>
          ) : error ? (
            <div className="rounded-xl border border-rose-200 bg-rose-50 p-3">
              <p role="alert" className="text-sm text-rose-700">
                {error}
              </p>
              <Button type="button" variant="outline" size="touch" className="mt-2" onClick={() => void load()}>
                Дахин оролдох
              </Button>
            </div>
          ) : rows && rows.length > 0 ? (
            <ul className="space-y-2">
              {rows.map((m) => (
                <MatchRow
                  key={m.propertyId}
                  m={m}
                  panel={panel}
                  contactId={contactId}
                  contactName={contactName}
                  requirementId={requirementId}
                  categoryLabels={categoryLabels}
                  typeLabels={typeLabels}
                />
              ))}
            </ul>
          ) : (
            <p className="px-1 py-2 text-sm text-muted">
              Тохирох хөрөнгө олдсонгүй. Хөрөнгийн төлөв эсвэл шаардлага өөрчлөгдвөл жагсаалт шинэчлэгдэнэ.
            </p>
          )}
        </div>
      ) : null}
    </div>
  );
}

function MatchRow({
  m,
  panel,
  contactId,
  contactName,
  requirementId,
  categoryLabels,
  typeLabels,
}: {
  m: Crm2MatchRow;
  panel: Crm2Panel;
  contactId: string;
  contactName: string;
  requirementId: string;
  categoryLabels: Partial<Record<string, string>>;
  typeLabels: Record<string, string>;
}) {
  const paths = crm2Paths(panel);
  const href = paths.property(m.propertyId);
  const typeLabel = m.propertyType ? (typeLabels[m.propertyType] ?? m.propertyType) : null;
  const place = [m.district, m.locationText].filter(Boolean).join(" · ");
  const specs = specsText({ rooms: m.rooms, area_m2: m.areaM2, floor: m.floor, building_floors: m.buildingFloors });

  return (
    <li className="space-y-1.5 rounded-xl border border-line bg-surface-2 p-3">
      <div className="flex flex-wrap items-center gap-1.5">
        <CodeChip code={m.code} href={href} />
        <CategoryBadge category={m.category} labels={categoryLabels} />
        {m.fit === "near" ? <Badge tone="neutral">ойрхон</Badge> : null}
        {typeLabel ? <span className="truncate text-xs text-muted">{typeLabel}</span> : null}
      </div>

      {place ? (
        <p className="flex min-w-0 items-center gap-1 text-sm text-ink">
          <MapPin className="size-3.5 shrink-0 text-subtle" aria-hidden />
          <span className="truncate">{place}</span>
        </p>
      ) : null}
      {specs ? <p className="truncate text-xs text-muted">{specs}</p> : null}

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <Money amount={m.priceTotal} currency={m.currency} period={m.pricePeriod} className="text-sm" empty="Үнэ оруулаагүй" />
        {m.availableFrom ? <span className="text-xs text-muted">Орох боломжтой: {fmtIsoDate(m.availableFrom)}</span> : null}
      </div>

      <div className="flex flex-col gap-2 pt-0.5 sm:flex-row sm:items-center sm:justify-between">
        <AgentChip name={m.listingAgentName} role="Листлэгч" />
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href={href}
            className="inline-flex min-h-11 items-center gap-1 rounded-xl px-3 text-sm font-semibold text-brand-700 hover:bg-brand-50 sm:min-h-9"
          >
            Хөрөнгө нээх
            <ArrowRight className="size-4" aria-hidden />
          </Link>
          <OpenDealButton
            panel={panel}
            propertyId={m.propertyId}
            propertyCode={m.code}
            contactId={contactId}
            contactName={contactName}
            requirementId={requirementId}
          />
        </div>
      </div>
    </li>
  );
}

/** «Хэлцэл эхлүүлэх» — crm2_open_deal; шинэ хэлцлийн карт руу шилжинэ. */
function OpenDealButton({
  panel,
  propertyId,
  propertyCode,
  contactId,
  contactName,
  requirementId,
}: {
  panel: Crm2Panel;
  propertyId: string;
  propertyCode: string;
  contactId: string;
  contactName: string;
  requirementId: string;
}) {
  const router = useRouter();
  const [pending, setPending] = React.useState(false);

  async function start() {
    if (pending) return;
    setPending(true);
    try {
      const res = await openDeal({ property_id: propertyId, contact_id: contactId, requirement_id: requirementId });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      const deal = res.data;
      // Өөр агентын хэлцэл (харах эрхгүй): шилжүүлэх хүсэлт нь харилцагчийн карт дээр.
      if (!deal.visible) {
        toast.info(`${contactName} дээр ${deal.agent_name} аль хэдийн хэлцэл нээсэн байна.`, {
          description: "Шилжүүлэх хүсэлтийг харилцагчийн картаас гаргана.",
        });
        router.refresh();
        return;
      }
      toast.success(deal.created ? `Хэлцэл эхэллээ — ${deal.code}` : `Нээлттэй хэлцэл олдлоо — ${deal.code}`, {
        description: `${propertyCode} · ${contactName}`,
      });
      router.push(crm2Paths(panel).deal(propertyId, deal.deal_id));
    } catch (e) {
      console.error("OpenDealButton:", e);
      toast.error("Хэлцэл эхлүүлэхэд алдаа гарлаа. Дахин оролдоно уу.");
    } finally {
      setPending(false);
    }
  }

  return (
    <Button type="button" size="touch" onClick={() => void start()} disabled={pending}>
      <Handshake className="size-4" aria-hidden />
      {pending ? "Эхлүүлж байна…" : "Хэлцэл эхлүүлэх"}
    </Button>
  );
}
