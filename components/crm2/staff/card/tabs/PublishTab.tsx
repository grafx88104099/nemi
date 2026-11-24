import { Share2 } from "lucide-react";

import { NoAccessState } from "@/components/crm2/ui/empty";
import { ShareKit } from "@/components/distribute/ShareKit";
import { getPublishPreview } from "@/lib/crm2/actions/publish";
import { getCrm2Settings } from "@/lib/crm2/context";
import { categoryLabel } from "@/lib/crm2/labels";
import type { Crm2Panel } from "@/lib/crm2/paths";
import { buildCardChecklist } from "@/lib/crm2/queries/checklist";
import { getProperty, type PropertyDetail } from "@/lib/crm2/queries/properties";
import { getPublishState } from "@/lib/crm2/queries/publish";
import { featureLabel, propertyTypeLabel, type Crm2Settings } from "@/lib/crm2/settings";
import type { Crm2PublishPreview } from "@/lib/crm2/types";
import { getShareKitData } from "@/lib/distribute/share-kit";

import { Section } from "../parts";
import { PublishPanel } from "../publish/PublishPanel";
import { buildPublishReadiness, type PublishReadiness } from "../publish/readiness";

/**
 * «Зар» таб — Staff хөрөнгийг nemi.mn дээр нийтийн зар болгох.
 * Төлөвийг crm2_publish_state RPC нэгэн зэрэг өгнө (эрх, саад, зарын текст,
 * зургийн тоо, тамганы тохиргоо). Харах эрхгүй бол RPC null буцаана.
 * Нийтлээгүй бол «Нийтлэхэд бэлэн» бүлэг (шалгах жагсаалт) ба crm2_publish_preview (эх зартай холбох
 * горим, нийтийн талбарын ялгаа). detail/settings-ийг картын хуудас дамжуулж болно — эс бөгөөс
 * request-cache-тэй уншилтаас (getProperty, getCrm2Settings) авна.
 * Нийтэлсэн бол доор нь «Түгээх» (R10) хэрэгсэл — эрхийг listing_can_distribute шалгана.
 */
export async function PublishTab({
  panel,
  propertyId,
  detail: detailProp,
  settings: settingsProp,
}: {
  panel: Crm2Panel;
  propertyId: string;
  detail?: PropertyDetail | null;
  settings?: Crm2Settings;
}) {
  const state = await getPublishState(propertyId);
  if (!state) {
    return (
      <NoAccessState
        title="Зарын мэдээлэл харах эрхгүй"
        description="Энэ хөрөнгийн зарыг зөвхөн харах эрхтэй ажилтан нээнэ."
      />
    );
  }

  const needsPrep = !state.published;
  const [detail, settings, preview, kit] = await Promise.all([
    needsPrep ? (detailProp !== undefined ? detailProp : getProperty(propertyId).catch(() => null)) : null,
    needsPrep ? (settingsProp ?? getCrm2Settings()) : null,
    needsPrep && state.canPublish && !state.listingId ? loadPreview(propertyId) : null,
    state.published && state.listingId ? getShareKitData(state.listingId).catch(() => null) : null,
  ]);

  const readiness = detail && settings ? readinessOf(detail, settings) : null;

  return (
    <>
      <PublishPanel panel={panel} propertyId={propertyId} state={state} preview={preview} readiness={readiness} />
      {kit ? (
        <div className="mt-4">
          <Section title="Түгээх" icon={Share2}>
            <ShareKit data={kit} />
          </Section>
        </div>
      ) : null}
    </>
  );
}

/** crm2_publish_preview — миграц хэрэгжээгүй / эрхгүй / алдаа бол null (хуучин урсгал: шинэ зар). */
async function loadPreview(propertyId: string): Promise<Crm2PublishPreview | null> {
  try {
    const res = await getPublishPreview(propertyId);
    return res.ok ? res.data : null;
  } catch (e) {
    console.error("crm2 PublishTab preview:", e);
    return null;
  }
}

function readinessOf(detail: PropertyDetail, settings: Crm2Settings): PublishReadiness | null {
  try {
    const { checklist, input } = buildCardChecklist(detail, settings);
    const p = detail.property;
    return buildPublishReadiness({
      checklist,
      input,
      property: {
        unconfirmed: p.unconfirmed ?? [],
        category: p.category,
        property_type: p.property_type,
        district: p.district,
        location_text: p.location_text,
        lat: p.lat,
        area_m2: p.area_m2,
        rooms: p.rooms,
        floor: p.floor,
        building_floors: p.building_floors,
        price: p.price,
        currency: p.currency,
        price_period: p.price_period,
        price_basis: p.price_basis,
        year_in_use: p.year_in_use,
        features: p.features ?? [],
        parking_spaces: p.parking_spaces ?? null,
        rent_advance_months: p.rent_advance_months ?? null,
        rent_deposit_months: p.rent_deposit_months ?? null,
        advantages: p.advantages,
        available_from: p.available_from,
        condition: p.condition,
        view_note: p.view_note,
        availability_note: p.availability_note,
      },
      canEdit: detail.can.edit,
      labelers: {
        category: (c) => categoryLabel(c as Parameters<typeof categoryLabel>[0], settings["property.category_labels"]),
        propertyType: (t) => propertyTypeLabel(settings, t),
        feature: (f) => featureLabel(settings, f),
        projectName: p.project?.name ?? null,
      },
    });
  } catch (e) {
    // Шалгах жагсаалт бүтэлгүйтвэл нийтлэх хэсэг өөрөө ажилласаар (DB саад хэвээр харагдана).
    console.error("crm2 PublishTab readiness:", e);
    return null;
  }
}
