import { createClient } from "@/lib/supabase/server";
import { ListingModRow } from "@/components/admin/ListingModRow";

export const metadata = { title: "Зар — Backoffice" };

export default async function AdminListingsPage() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("listings")
    .select("id, title, price, district, status, verified, agent:agents(display_name)")
    .order("created_at", { ascending: false })
    .limit(200);

  const rows = (data ?? []) as unknown as Array<{
    id: string; title: string; price: number; district: string | null;
    status: string; verified: boolean; agent: { display_name: string } | null;
  }>;

  return (
    <div className="p-8">
      <h1 className="text-2xl font-extrabold text-ink">Зарын модерац</h1>
      <p className="text-sm text-muted">{rows.length} зар</p>
      <div className="mt-6 overflow-hidden rounded-2xl border border-line bg-surface">
        <table className="w-full text-sm">
          <thead className="border-b border-line bg-surface-2 text-left text-muted">
            <tr>
              <th className="p-3 font-medium">Зар</th>
              <th className="p-3 font-medium">Үнэ</th>
              <th className="p-3 font-medium">Төлөв</th>
              <th className="p-3 font-medium">Баталгаа</th>
              <th className="p-3"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((l) => (
              <ListingModRow
                key={l.id}
                id={l.id}
                title={l.title}
                price={l.price}
                district={l.district}
                status={l.status}
                verified={l.verified}
                agent={l.agent?.display_name ?? "—"}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
