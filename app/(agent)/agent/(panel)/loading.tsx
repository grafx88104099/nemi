export default function DashboardLoading() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-6" aria-busy="true" aria-label="Ачаалж байна">
      <div className="h-8 w-56 animate-pulse rounded-lg bg-surface-2" />
      <div className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-24 animate-pulse rounded-2xl bg-surface-2" />
        ))}
      </div>
      <div className="mt-6 h-64 animate-pulse rounded-2xl bg-surface-2" />
    </div>
  );
}
