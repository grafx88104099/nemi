import { createClient } from "@/lib/supabase/server";
import { SavedSearchRow } from "@/components/listings/SavedSearchRow";
import { LoginPrompt } from "@/components/auth/LoginPrompt";
import { BackLink } from "@/components/ui/back-link";

export default async function SavedSearchesPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return <LoginPrompt desc="Хадгалсан хайлтаа харахын тулд нэвтэрнэ үү." next="/saved-searches" />;

  const { data } = await supabase
    .from("saved_searches")
    .select("id, name, filters, alert_enabled")
    .order("created_at", { ascending: false });

  const rows = (data ?? []) as Array<{ id: string; name: string | null; filters: Record<string, string>; alert_enabled: boolean }>;

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <BackLink />
      <h1 className="text-2xl font-extrabold text-ink">Хадгалсан хайлт</h1>
      <p className="mt-1 text-sm text-muted">Сэрэмжлүүлэг асаавал тохирох шинэ зар гарахад мэдэгдэнэ.</p>
      <div className="mt-6 space-y-2">
        {rows.length === 0 && <p className="py-16 text-center text-muted">Хадгалсан хайлт алга. Зар хайхдаа «Хайлтаа хадгалах» дарна уу.</p>}
        {rows.map((r) => (
          <SavedSearchRow
            key={r.id}
            id={r.id}
            name={r.name ?? "Хайлт"}
            filters={r.filters ?? {}}
            alertEnabled={r.alert_enabled}
          />
        ))}
      </div>
    </div>
  );
}
