import { Share2 } from "lucide-react";

import { NoAccessState } from "@/components/crm2/ui/empty";
import { ShareKit } from "@/components/distribute/ShareKit";
import type { Crm2Panel } from "@/lib/crm2/paths";
import { getPublishState } from "@/lib/crm2/queries/publish";
import { getShareKitData } from "@/lib/distribute/share-kit";

import { Section } from "../parts";
import { PublishPanel } from "../publish/PublishPanel";

/**
 * «Зар» таб — Staff хөрөнгийг nemi.mn дээр нийтийн зар болгох.
 * Төлөвийг crm2_publish_state RPC нэгэн зэрэг өгнө (эрх, саад, зарын текст,
 * зургийн тоо, тамганы тохиргоо). Харах эрхгүй бол RPC null буцаана.
 * Нийтэлсэн бол доор нь «Түгээх» (R10) хэрэгсэл — эрхийг listing_can_distribute шалгана.
 */
export async function PublishTab({ panel, propertyId }: { panel: Crm2Panel; propertyId: string }) {
  const state = await getPublishState(propertyId);
  if (!state) {
    return (
      <NoAccessState
        title="Зарын мэдээлэл харах эрхгүй"
        description="Энэ хөрөнгийн зарыг зөвхөн харах эрхтэй ажилтан нээнэ."
      />
    );
  }
  const kit = state.published && state.listingId ? await getShareKitData(state.listingId).catch(() => null) : null;
  return (
    <>
      <PublishPanel panel={panel} propertyId={propertyId} state={state} />
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
