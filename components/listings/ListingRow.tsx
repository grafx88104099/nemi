import { ListingCard, type ListingCardData } from "@/components/listings/ListingCard";

/**
 * Хэвтээ гүйлгэдэг зарын мөр (нүүрний «Саяхан үзсэн», «Миний Нэми»).
 * Гар утсанд scrollbar нуугдана (хуруугаар гүйлгэнэ); md-ээс дээш нимгэн scrollbar
 * харагдана — энгийн хулганы дугуйтай хэрэглэгч ч чирж хүрнэ.
 */
export function ListingRow({ listings }: { listings: ListingCardData[] }) {
  return (
    <div className="-mx-4 flex snap-x snap-mandatory gap-4 overflow-x-auto px-4 pb-2 [scrollbar-width:none] md:[scrollbar-width:thin]">
      {listings.map((l) => (
        <div key={l.id} className="w-64 shrink-0 snap-start sm:w-72">
          <ListingCard l={l} />
        </div>
      ))}
    </div>
  );
}
