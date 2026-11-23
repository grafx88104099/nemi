import { notFound } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { getListingPoint } from "@/lib/queries";
import type { DealType, ListingStatus } from "@/lib/constants";
import { normalizeFeatures } from "@/lib/listing-features";
import { LoginPrompt } from "@/components/auth/LoginPrompt";
import { Card, CardBody } from "@/components/ui/card";
import { BackLink } from "@/components/ui/back-link";
import { ListingForm } from "@/components/dashboard/ListingForm";

export const metadata = { title: "Зар засах — Нэми" };

export default async function OwnerEditListingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return <LoginPrompt desc="Зараа засахын тулд нэвтэрнэ үү." next={`/sell/edit/${id}`} />;

  const { data: l } = await supabase
    .from("listings")
    .select("*, photos:listing_photos(url, sort_order)")
    .eq("id", id)
    .eq("owner_id", user.id)
    .is("agent_id", null)
    .maybeSingle();
  if (!l) notFound();
  const point = await getListingPoint(id);
  // Гараар бичсэн DB төрөлд Relationships хоосон тул embed-ийн төрлийг тодорхой заана.
  const photos = (((l as unknown as { photos?: { url: string; sort_order: number }[] }).photos ?? []))
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((p) => p.url);

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <BackLink href="/my-listings" label="Миний зарууд руу буцах" />
      <h1 className="text-2xl font-extrabold text-ink">Зар засах</h1>
      <Card className="mt-5">
        <CardBody>
          <ListingForm
            id={id}
            owner={{ uid: user.id, name: l.owner_name ?? "", phone: l.owner_phone ?? "", reviewNote: l.review_note }}
            initial={{
              title: l.title,
              type: l.type ?? "",
              district: l.district ?? "",
              rooms: l.rooms ?? 0,
              area: Number(l.area ?? 0),
              floor: l.floor ?? "",
              price: Number(l.price ?? 0),
              year: l.year ?? 0,
              parking: l.parking ?? 0,
              description: l.description ?? "",
              amenities: l.amenities ?? [],
              features: normalizeFeatures(l.features ?? []),
              photos,
              status: l.status as ListingStatus,
              deal_type: l.deal_type as DealType,
              rent_advance_months: l.rent_advance_months ?? null,
              rent_deposit_months: l.rent_deposit_months ?? null,
              lat: point?.lat ?? null,
              lng: point?.lng ?? null,
            }}
          />
        </CardBody>
      </Card>
    </div>
  );
}
