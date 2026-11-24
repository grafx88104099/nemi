"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, Pencil } from "lucide-react";

import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { trackUi } from "@/components/crm2/staff/form/useCreateDraft";
import { confirmPropertyFields } from "@/lib/crm2/actions/quick-add";
import { fmtIsoDate } from "@/lib/crm2/datetime";
import { categoryLabel } from "@/lib/crm2/labels";
import { formatPrice } from "@/lib/crm2/money";
import type { PropertyDetail } from "@/lib/crm2/queries/properties";
import { featureLabel, propertyTypeLabel, type Crm2Settings } from "@/lib/crm2/settings";

import { unconfirmedRows, type CardSheetParam, type UnconfirmedRow } from "./sheet-model";
import { SheetShell } from "./SheetShell";

type Property = PropertyDetail["property"];

/** Баталгаажаагүй утгын одоогийн харагдах утга (агентад шалгуулах). */
function valueText(row: UnconfirmedRow, p: Property, settings: Crm2Settings): string {
  const k = row.id;
  const dash = "—";
  switch (k) {
    case "price":
      return p.price != null ? formatPrice({ amount: p.price, currency: p.currency, period: p.price_period, basis: p.price_basis }) : dash;
    case "category":
      return categoryLabel(p.category, settings["property.category_labels"]);
    case "property_type":
      return propertyTypeLabel(settings, p.property_type) || dash;
    case "project":
      return p.project?.name ?? dash;
    case "lat":
      return p.lat != null && p.lng != null ? (p.pin_address ?? `${p.lat.toFixed(5)}, ${p.lng.toFixed(5)}`) : dash;
    case "area_m2":
      return p.area_m2 != null ? `${p.area_m2} м²` : dash;
    case "floor":
    case "building_floors":
      return p.floor != null || p.building_floors != null ? `${p.floor ?? dash} / ${p.building_floors ?? dash}` : dash;
    case "features":
      return p.features.length ? p.features.map((f) => featureLabel(settings, f)).join(", ") : dash;
    case "available_from":
      return p.available_from ? fmtIsoDate(p.available_from) : dash;
    case "listing_agent_id":
      return p.listing_agent?.full_name ?? dash;
    case "contract_agent_id":
      return p.contract_agent?.full_name ?? dash;
    case "photo_agent_id":
      return p.photo_agent?.full_name ?? dash;
    default: {
      const v = (p as unknown as Record<string, unknown>)[k];
      if (v === null || v === undefined || v === "") return dash;
      const s = String(v);
      return s.length > 120 ? `${s.slice(0, 119)}…` : s;
    }
  }
}

/**
 * «Автомат утгыг шалгах»: crm2_properties.unconfirmed-ийн мөр бүр одоогийн утгатай; «Зөв» →
 * confirmPropertyFields (түүхэнд «Баталгаажуулсан»), «Засах» → тухайн талбарын цонх. Нийтлэхээс өмнө
 * бүгдийг баталгаажуулна (DB нийтлэхийг хаана).
 */
export function ConfirmSheet({
  property,
  settings,
  canEdit,
  onClose,
  onOpenSheet,
}: {
  property: Property;
  settings: Crm2Settings;
  canEdit: boolean;
  onClose: () => void;
  onOpenSheet: (sheet: CardSheetParam) => void;
}) {
  const router = useRouter();
  const [done, setDone] = React.useState<ReadonlySet<string>>(() => new Set());
  const [busy, setBusy] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const rows = unconfirmedRows(property.unconfirmed ?? []).filter((r) => !r.keys.every((k) => done.has(k)));

  async function confirm(keys: string[], id: string): Promise<boolean> {
    setBusy(id);
    setError(null);
    try {
      const res = await confirmPropertyFields(property.id, keys);
      if (!res.ok) {
        setError(res.error);
        return false;
      }
      setDone((d) => new Set([...d, ...keys]));
      trackUi({ event: "sheet_saved", flow: "card", property_id: property.id, meta: { confirmed: keys.length } });
      router.refresh();
      return true;
    } catch {
      setError("Сүлжээ алга — сүлжээ орвол дахин «Зөв» дарна уу.");
      return false;
    } finally {
      setBusy(null);
    }
  }

  const allKeys = rows.flatMap((r) => r.keys);

  return (
    <SheetShell
      title="Автомат утгыг шалгах"
      onClose={onClose}
      onSave={canEdit && rows.length > 1 ? () => void confirm(allKeys, "all").then((ok) => ok && toast.success("Бүгдийг баталгаажууллаа")) : undefined}
      saveLabel="Бүгд зөв"
      saving={busy === "all"}
      error={error}
    >
      {rows.length === 0 ? (
        <p role="status" className="flex items-center gap-2 rounded-xl bg-emerald-50 p-3 text-sm font-medium text-emerald-900">
          <Check className="size-4" aria-hidden /> Баталгаажуулах автомат утга алга.
        </p>
      ) : (
        <>
          <p className="text-sm text-muted">
            Эдгээр утгыг зарын текст, эх зар эсвэл төслөөс автоматаар бөглөсөн. Эзэнтэй тулгаад «Зөв» дарна уу — эс бөгөөс засна.
          </p>
          <ul className="divide-y divide-line rounded-xl border border-line">
            {rows.map((r) => (
              <li key={r.id} className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center">
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium text-muted">{r.label}</p>
                  <p className="break-words text-sm font-semibold text-ink">{valueText(r, property, settings)}</p>
                </div>
                {canEdit ? (
                  <div className="flex shrink-0 gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="touch"
                      className="flex-1 sm:flex-none"
                      disabled={!!busy}
                      onClick={() => onOpenSheet(r.sheet as CardSheetParam)}
                    >
                      <Pencil className="size-4" aria-hidden /> Засах
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      size="touch"
                      className="flex-1 sm:flex-none"
                      disabled={!!busy}
                      onClick={() => void confirm(r.keys, r.id)}
                    >
                      {busy === r.id ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Check className="size-4" aria-hidden />}
                      Зөв
                    </Button>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        </>
      )}
    </SheetShell>
  );
}
