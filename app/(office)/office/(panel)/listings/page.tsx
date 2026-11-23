import { getMyOffice } from "@/lib/queries-office";
import { ListingCard } from "@/components/listings/ListingCard";
import { VerifyToggle } from "@/components/office/VerifyToggle";
import { DistributeListingButton } from "@/components/distribute/DistributeListingButton";
import { Badge } from "@/components/ui/badge";
import { listingStatusMeta } from "@/lib/constants";

export const metadata = { title: "Зарууд — Оффис" };

/**
 * Оффисын зарууд. Нийтэд харагддагтай ИЖИЛ картаар (зураг, үнэ, өрөө/талбай,
 * агент) харуулна — админ зараа нийтийн сайт дээр харагдахаар нь хянана.
 * Картын доор зөвхөн самбарт хэрэгтэй хоёр зүйл: төлөв ба баталгааны сэлгүүр.
 */
export default async function OfficeListingsPage() {
  const data = await getMyOffice();
  if (!data) return null;
  const { listings } = data;
  const verified = listings.filter((l) => l.verified).length;

  return (
    <div className="p-4 sm:p-8">
      <h1 className="text-2xl font-extrabold text-ink">Оффисын зарууд</h1>
      <p className="text-sm text-muted">
        {listings.length} зар · {verified} баталгаатай
      </p>

      {listings.length > 0 ? (
        <div className="mt-6 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {listings.map((l) => {
            const st = listingStatusMeta(l.status);
            return (
              <div key={l.id} className="flex flex-col">
                <ListingCard l={l} saveable={false} />
                <div className="mt-2 flex min-h-11 flex-wrap items-center justify-between gap-2 px-1 py-1">
                  <Badge tone={st.tone}>{st.label}</Badge>
                  <div className="flex items-center gap-1">
                    {l.status === "active" ? <DistributeListingButton listingId={l.id} title={l.title} /> : null}
                    <VerifyToggle kind="listing" id={l.id} initial={l.verified} />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <p className="py-16 text-center text-muted">Зар алга.</p>
      )}
    </div>
  );
}
