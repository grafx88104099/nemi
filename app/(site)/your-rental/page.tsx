import Link from "next/link";
import { Calendar, Heart } from "lucide-react";

import { createClient } from "@/lib/supabase/server";
import { getMyViewings, getFavoriteListings } from "@/lib/queries-user";
import { ListingCard } from "@/components/listings/ListingCard";
import { Card, CardBody } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { LoginPrompt } from "@/components/auth/LoginPrompt";
import { BackLink } from "@/components/ui/back-link";

export default async function YourRentalPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return <LoginPrompt desc="Түрээсийн хэсгээ харахын тулд нэвтэрнэ үү." next="/your-rental" />;

  const [viewings, saved] = await Promise.all([getMyViewings(), getFavoriteListings()]);

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <BackLink />
      <h1 className="text-2xl font-extrabold text-ink">Миний түрээс</h1>
      <p className="mt-1 text-sm text-muted">Үзлэгийн товлолт болон сонирхсон обьектууд</p>

      <h2 className="mt-6 flex items-center gap-2 text-lg font-bold text-ink"><Calendar className="size-5" /> Үзлэгүүд</h2>
      <div className="mt-3 space-y-2">
        {viewings.length === 0 && <p className="text-sm text-muted">Товлосон үзлэг алга.</p>}
        {viewings.map((v) => (
          <Card key={v.id}>
            <CardBody className="flex items-center justify-between">
              <Link href={`/listings/${v.listing?.id}`} className="font-semibold text-ink hover:underline">{v.listing?.title}</Link>
              <div className="flex items-center gap-3 text-sm text-muted">
                <span>{v.scheduled_at ? new Date(v.scheduled_at).toLocaleString("mn-MN") : "—"}</span>
                <Badge tone="neutral">{v.status}</Badge>
              </div>
            </CardBody>
          </Card>
        ))}
      </div>

      <h2 className="mt-8 flex items-center gap-2 text-lg font-bold text-ink"><Heart className="size-5" /> Сонирхсон</h2>
      {saved.length === 0 ? (
        <p className="mt-3 text-sm text-muted">Хадгалсан зар алга.</p>
      ) : (
        <div className="mt-3 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {saved.map((l) => <ListingCard key={l.id} l={l} />)}
        </div>
      )}
    </div>
  );
}
