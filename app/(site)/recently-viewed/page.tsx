import { createClient } from "@/lib/supabase/server";
import { getRecentlyViewed } from "@/lib/queries-user";
import { ListingCard } from "@/components/listings/ListingCard";
import { LoginPrompt } from "@/components/auth/LoginPrompt";
import { BackLink } from "@/components/ui/back-link";

export default async function RecentlyViewedPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return <LoginPrompt desc="Сүүлд үзсэн зараа харахын тулд нэвтэрнэ үү." next="/recently-viewed" />;

  const listings = await getRecentlyViewed();

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <BackLink />
      <h1 className="text-2xl font-extrabold text-ink">Сүүлд үзсэн</h1>
      {listings.length === 0 ? (
        <p className="py-20 text-center text-muted">Одоогоор үзсэн зар алга.</p>
      ) : (
        <div className="mt-6 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {listings.map((l) => <ListingCard key={l.id} l={l} />)}
        </div>
      )}
    </div>
  );
}
