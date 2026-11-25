/**
 * Нийтийн сайтын loading.tsx-ийн ачааллын дүр (Topbar, доод цэс layout-д хэвээр).
 * Утсанд товшсоны дараа шууд хариу өгнө — сүлжээ удаан үед «юу ч болсонгүй» гэж харагдахгүй.
 * Хөдөлгөөн багасгах тохиргоотой үед animate-pulse-ийг motion-reduce унтраана.
 */

const bar = "animate-pulse bg-surface-2 motion-reduce:animate-none";

export function LoadingStatus() {
  return (
    <span className="sr-only" role="status">
      Ачаалж байна…
    </span>
  );
}

export function ListingCardSkeleton() {
  return (
    <div className="overflow-hidden rounded-2xl border border-line bg-surface">
      <div className={`aspect-[4/3] w-full ${bar}`} />
      <div className="space-y-2 p-4">
        <div className={`h-5 w-1/2 rounded ${bar}`} />
        <div className={`h-4 w-3/4 rounded ${bar}`} />
        <div className={`h-4 w-1/3 rounded ${bar}`} />
      </div>
    </div>
  );
}

export function ListingGridSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {Array.from({ length: count }).map((_, i) => (
        <ListingCardSkeleton key={i} />
      ))}
    </div>
  );
}

export { bar as skeletonBar };
