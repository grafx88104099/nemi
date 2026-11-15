import { NoAccessState } from "@/components/crm2/ui/empty";
import type { Crm2Panel } from "@/lib/crm2/paths";
import { getPublishState } from "@/lib/crm2/queries/publish";

import { PublishPanel } from "../publish/PublishPanel";

/**
 * «Зар» таб — Staff хөрөнгийг nemi.mn дээр нийтийн зар болгох.
 * Төлөвийг crm2_publish_state RPC нэгэн зэрэг өгнө (эрх, саад, зарын текст,
 * зургийн тоо, тамганы тохиргоо). Харах эрхгүй бол RPC null буцаана.
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
  return <PublishPanel panel={panel} propertyId={propertyId} state={state} />;
}
