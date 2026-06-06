import { notFound } from "next/navigation";

import { getMyListing } from "@/lib/queries-agent";
import { Card, CardBody } from "@/components/ui/card";
import { ListingForm } from "@/components/dashboard/ListingForm";
import { AiValuateButton } from "@/components/dashboard/AiValuateButton";
import type { ListingStatus } from "@/lib/constants";

export default async function EditListingPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const l = await getMyListing(id);
  if (!l) notFound();

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-extrabold text-ink">Зар засах</h1>
        <AiValuateButton listingId={id} />
      </div>
      <Card className="mt-5">
        <CardBody>
          <ListingForm
            id={id}
            initial={{
              title: l.title as string,
              type: (l.type as string) ?? "",
              district: (l.district as string) ?? "",
              rooms: (l.rooms as number) ?? 0,
              area: (l.area as number) ?? 0,
              floor: (l.floor as string) ?? "",
              price: (l.price as number) ?? 0,
              year: (l.year as number) ?? 0,
              parking: (l.parking as number) ?? 0,
              description: (l.description as string) ?? "",
              amenities: (l.amenities as string[]) ?? [],
              photos: (l.photos ?? [])
                .sort((a, b) => a.sort_order - b.sort_order)
                .map((p) => p.url),
              status: (l.status as ListingStatus) ?? "active",
            }}
          />
        </CardBody>
      </Card>
    </div>
  );
}
