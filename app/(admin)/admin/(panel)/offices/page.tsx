import { Inbox } from "lucide-react";

import { createClient } from "@/lib/supabase/server";
import { Avatar } from "@/components/ui/avatar";
import { OfficeVerifyButton } from "@/components/admin/OfficeModRow";
import { OfficeRequestRow } from "@/components/admin/OfficeRequestRow";

export const metadata = { title: "Оффисууд — Backoffice" };

export default async function AdminOfficesPage() {
  const supabase = await createClient();

  const [{ data: officeData }, { data: reqData }] = await Promise.all([
    supabase
      .from("offices")
      .select("id, name, logo, color, verified, agents_count, listings_count")
      .order("name"),
    supabase
      .from("office_requests")
      .select("id, name, phone, note, status, created_at, requester:profiles!office_requests_requester_id_fkey(full_name, email)")
      .eq("status", "pending")
      .order("created_at", { ascending: false }),
  ]);

  const offices = (officeData ?? []) as Array<{
    id: string; name: string; logo: string | null; color: string | null;
    verified: boolean; agents_count: number; listings_count: number;
  }>;
  const requests = (reqData ?? []) as unknown as Array<{
    id: string; name: string; phone: string | null; note: string | null;
    status: "pending" | "approved" | "rejected"; created_at: string;
    requester: { full_name: string | null; email: string | null } | null;
  }>;

  return (
    <div className="p-8">
      <h1 className="text-2xl font-extrabold text-ink">Оффисууд</h1>
      <p className="text-sm text-muted">{offices.length} оффис · {requests.length} шинэ хүсэлт</p>

      {/* Шинээр ирсэн хүсэлтүүд */}
      <div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50/50 p-5">
        <h2 className="mb-3 flex items-center gap-2 font-bold text-ink">
          <Inbox className="size-4" /> Шинээр ирсэн хүсэлтүүд
          {requests.length > 0 && (
            <span className="rounded-full bg-amber-500 px-2 py-0.5 text-xs font-bold text-white">{requests.length}</span>
          )}
        </h2>
        {requests.length === 0 ? (
          <p className="text-sm text-muted">Шинэ хүсэлт алга.</p>
        ) : (
          <div className="space-y-3">
            {requests.map((r) => (
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
        )}
      </div>

      {/* Бүртгэлтэй оффисууд */}
      <h2 className="mt-8 text-lg font-bold text-ink">Бүртгэлтэй оффисууд</h2>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        {offices.map((o) => (
          <div key={o.id} className="flex items-center gap-3 rounded-2xl border border-line bg-surface p-4">
            <Avatar initials={o.logo ?? "OF"} color={o.color ?? "#C2410C"} size="md" />
            <div className="min-w-0 flex-1">
              <div className="truncate font-bold text-ink">{o.name}</div>
              <div className="text-xs text-muted">{o.agents_count} агент · {o.listings_count} зар</div>
            </div>
            <OfficeVerifyButton id={o.id} verified={o.verified} />
          </div>
        ))}
      </div>
    </div>
  );
}
