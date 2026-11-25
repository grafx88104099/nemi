import { ListingGridSkeleton, LoadingStatus, skeletonBar } from "../../_components/skeletons";

/**
 * Зарын жагсаалт ачаалж байх үед (шүүлт солих, нүүрээс орох).
 * (grid) бүлэгт ЗОРИУД: listings/loading.tsx нь listings/[id]-г ч Suspense-д ороож урсгал (streaming)
 * эхлүүлдэг тул зарын дэлгэрэнгүй үргэлж 200 болж, 404/500 (notFound, DB алдаа) алдагдана.
 * Мэдэж хүлээн авсан: энэ skeleton-ы улмаас ухаалаг хайлтын redirect (?q=… → каноник шүүлт) 307 биш
 * 200 + клиентийн redirect (meta refresh / router.replace) болно — параметртэй /listings бүгд
 * noindex,follow тул индекст нөлөөгүй, хэрэглэгчид ижил хаяг руу шилжинэ.
 */
export default function ListingsLoading() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-8" aria-busy="true">
      <LoadingStatus />
      <div className={`h-8 w-48 rounded ${skeletonBar}`} />
      <div className={`mt-5 h-11 w-full rounded-xl ${skeletonBar}`} />
      <div className={`mt-4 h-4 w-28 rounded ${skeletonBar}`} />
      <div className="mt-4">
        <ListingGridSkeleton count={8} />
      </div>
    </div>
  );
}
