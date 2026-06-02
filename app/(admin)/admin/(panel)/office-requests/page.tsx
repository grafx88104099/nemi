import { createClient } from "@/lib/supabase/server";
import { OfficeRequestRow } from "@/components/admin/OfficeRequestRow";

export const metadata = { title: "Оффис хүсэлт — Backoffice" };

export default async function OfficeRequestsPage() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("office_requests")
    .select("id, name, phone, note, status, created_at, requester:profiles!office_requests_requester_id_fkey(full_name, email)")
    .order("status", { ascending: true })
    .order("created_at", { ascending: false });

  const rows = (data ?? []) as unknown as Array<{
    id: string; name: string; phone: string | null; note: string | null;
    status: "pending" | "approved" | "rejected"; created_at: string;
    requester: { full_name: string | null; email: string | null } | null;
  }>;
  const pending = rows.filter((r) => r.status === "pending");

  return (
    <div className="p-8">
      <h1 className="text-2xl font-extrabold text-ink">Оффис нээх хүсэлт</h1>
      <p className="text-sm text-muted">{pending.length} хүлээгдэж буй</p>
      <div className="mt-6 space-y-3">
        {rows.length === 0 && <p className="py-16 text-center text-muted">Хүсэлт алга.</p>}
        {rows.map((r) => (
          <OfficeRequestRow
            key={r.id}
            id={r.id}
            name={r.name}
            phone={r.phone}
            note={r.note}
            status={r.status}
            requester={r.requester?.full_name || r.requester?.email || "Хэрэглэгч"}
            date={new Date(r.created_at).toLocaleDateString("mn-MN")}
          />
        ))}
      </div>
    </div>
  );
}
