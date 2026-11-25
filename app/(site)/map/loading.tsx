import { LoadingStatus, skeletonBar } from "../_components/skeletons";

/**
 * Газрын зургийн хуудас ачаалж байх үед. Ухаалаг хайлтын redirect (?q=…) энэ skeleton-оос болж
 * 200 + клиентийн redirect болно (listings/(grid)/loading.tsx-тэй ижил, мэдэж хүлээн авсан).
 */
export default function MapLoading() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-6" aria-busy="true">
      <LoadingStatus />
      <div className={`h-8 w-44 rounded ${skeletonBar}`} />
      <div className={`mt-4 h-11 w-full rounded-xl ${skeletonBar}`} />
      <div className={`mt-4 h-[70vh] w-full rounded-2xl ${skeletonBar}`} />
    </div>
  );
}
