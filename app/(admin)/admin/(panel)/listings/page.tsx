import Link from "next/link";

import { createClient } from "@/lib/supabase/server";
import { ListingModRow } from "@/components/admin/ListingModRow";
import { cn } from "@/lib/utils";

export const metadata = { title: "Зар — Backoffice" };

/**
 * Зарын модерац. «Хянах» таб — эзэн өөрөө нийтлэхээр илгээсэн зарууд
 * (эзний зар админ баталсны дараа л нийтэд гарна).
 */
export default async function AdminListingsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { status } = await searchParams;
  const reviewOnly = status === "review";
  const supabase = await createClient();
  let q = supabase
    .from("listings")
    .select("id, title, price, district, status, verified, owner_id, owner_name, owner_phone, review_note, agent:agents(display_name)")
    .order("created_at", { ascending: false })
    .limit(200);
  if (reviewOnly) q = q.eq("status", "review");
  const [{ data }, { count: reviewCount }] = await Promise.all([
    q,
    supabase.from("listings").select("id", { count: "exact", head: true }).eq("status", "review"),
  ]);

  const rows = (data ?? []) as unknown as Array<{
    id: string; title: string; price: number; district: string | null;
    status: string; verified: boolean; owner_id: string | null; owner_name: string | null;
    owner_phone: string | null; review_note: string | null; agent: { display_name: string } | null;
  }>;
  const tab = (on: boolean) =>
    cn("inline-flex min-h-11 items-center rounded-lg px-4 text-sm font-semibold", on ? "bg-ink text-white" : "text-muted hover:text-ink");

  return (
    <div className="p-4 sm:p-8">
      <h1 className="text-2xl font-extrabold text-ink">Зарын модерац</h1>
      <nav className="mt-4 flex gap-2" aria-label="Шүүлт">
        <Link href="/admin/listings" className={tab(!reviewOnly)} aria-current={!reviewOnly ? "page" : undefined}>
          Бүгд
        </Link>
        <Link href="/admin/listings?status=review" className={tab(reviewOnly)} aria-current={reviewOnly ? "page" : undefined}>
          Хянах {reviewCount ? <span className="ml-1.5 rounded-full bg-amber-500 px-1.5 text-xs text-white">{reviewCount}</span> : null}
        </Link>
      </nav>
      <p className="mt-3 text-sm text-muted">{rows.length} зар</p>
      <div className="mt-3 overflow-x-auto rounded-2xl border border-line bg-surface">
        <table className="w-full min-w-[640px] text-sm">
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
                agent={
                  l.agent?.display_name ??
                  (l.owner_id ? `Эзэн: ${l.owner_name ?? "—"}${l.owner_phone ? ` · ${l.owner_phone}` : ""}` : "—")
                }
                isOwner={!l.agent && !!l.owner_id}
                reviewNote={l.review_note}
              />
            ))}
            {rows.length === 0 ? (
              <tr>
                <td colSpan={5} className="p-8 text-center text-muted">
                  {reviewOnly ? "Хянах зар алга." : "Зар алга."}
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
