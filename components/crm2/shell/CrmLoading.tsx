/**
 * CRM-ийн хэсгүүдийн хооронд шилжих үеийн ачааллын дүр (агентын панелийн
 * DashboardLoading-тай ижил хэв маяг). crm/loading.tsx хоёр панелд ашиглана —
 * CRM-ийн цэс (layout) хэвээр, зөвхөн агуулга солигдоно.
 */
export function CrmLoading() {
  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-4 sm:py-6 md:px-6" aria-busy="true" aria-label="Ачаалж байна">
      <span className="sr-only" role="status">
        Ачаалж байна…
      </span>
      <div className="h-7 w-48 animate-pulse rounded-lg bg-surface-2" />
      <div className="mt-2 h-4 w-72 max-w-full animate-pulse rounded bg-surface-2" />
      <div className="mt-6 h-11 w-full animate-pulse rounded-xl bg-surface-2" />
      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-40 animate-pulse rounded-2xl bg-surface-2" />
        ))}
      </div>
    </div>
  );
}
