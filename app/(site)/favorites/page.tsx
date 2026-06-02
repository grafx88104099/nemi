import { createClient } from "@/lib/supabase/server";
import { getFavoriteListings } from "@/lib/queries-user";
import { ListingCard } from "@/components/listings/ListingCard";
import { LoginPrompt } from "@/components/auth/LoginPrompt";
import { BackLink } from "@/components/ui/back-link";

export default async function FavoritesPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return <LoginPrompt desc="Хадгалсан зараа харахын тулд нэвтэрнэ үү." next="/favorites" />;

  const listings = await getFavoriteListings();

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <BackLink />
      <h1 className="text-2xl font-extrabold text-ink">Хадгалсан зар</h1>
      <p className="mt-1 text-sm text-muted">{listings.length} зар</p>
      {listings.length === 0 ? (
        <p className="py-20 text-center text-muted">Одоогоор хадгалсан зар алга. Зар үзээд ❤ дарж хадгална уу.</p>
      ) : (
        <div className="mt-6 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {listings.map((l) => <ListingCard key={l.id} l={l} />)}
        </div>
      )}
    </div>
  );
}
