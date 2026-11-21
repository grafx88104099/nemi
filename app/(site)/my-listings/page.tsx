import Link from "next/link";
import Image from "next/image";
import { Building2, Pencil, Plus } from "lucide-react";

import { createClient } from "@/lib/supabase/server";
import { fmtMNT, relativeDate } from "@/lib/format";
import { listingStatusMeta } from "@/lib/constants";
import { LoginPrompt } from "@/components/auth/LoginPrompt";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { OwnerListingDelete } from "@/components/sell/OwnerListingDelete";

export const metadata = { title: "Миний зарууд — Нэми" };

/** Эзний өөрөө оруулсан зарууд ба зуучлуулах хүсэлтүүд. */
export default async function MyListingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return <LoginPrompt desc="Өөрийн зараа харахын тулд нэвтэрнэ үү." next="/my-listings" />;

  const [{ data: listings }, { data: requests }] = await Promise.all([
    supabase
      .from("listings")
      .select("id, title, price, deal_type, district, status, photo, review_note, updated_at")
      .eq("owner_id", user.id)
      .is("agent_id", null)
      .order("updated_at", { ascending: false }),
    supabase
      .from("owner_requests")
      .select("id, deal_type, property_type, district, status, created_at, office:offices(name)")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false }),
  ]);
  const rows = listings ?? [];
  const reqs = (requests ?? []) as unknown as {
    id: string; deal_type: string; property_type: string | null; district: string | null;
    status: "new" | "contacted" | "closed"; created_at: string; office: { name: string } | null;
  }[];
  const REQ_STATUS = { new: "Илгээсэн", contacted: "Холбогдсон", closed: "Хаагдсан" } as const;

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-extrabold text-ink">Миний зарууд</h1>
        <ButtonLink href="/sell" size="sm">
          <Plus className="size-4" aria-hidden /> Хөрөнгө зарлах
        </ButtonLink>
      </div>

      {rows.length === 0 ? (
        <div className="mt-8 rounded-2xl border border-dashed border-line p-10 text-center">
          <Building2 className="mx-auto size-8 text-muted" aria-hidden />
          <p className="mt-3 text-muted">Та одоогоор зар оруулаагүй байна.</p>
          <Link href="/sell" className="mt-2 inline-flex min-h-11 items-center font-semibold text-brand-600 hover:underline">
            Хөрөнгөө зарлах →
          </Link>
        </div>
      ) : (
        <ul className="mt-6 space-y-3">
          {rows.map((l) => {
            const st = listingStatusMeta(l.status);
            return (
              <li key={l.id} className="flex flex-col gap-3 rounded-2xl border border-line bg-surface p-3 sm:flex-row sm:items-center">
                <div className="relative aspect-[4/3] w-full shrink-0 overflow-hidden rounded-xl bg-surface-2 sm:w-36">
                  {l.photo ? <Image src={l.photo} alt="" fill sizes="144px" className="object-cover" /> : null}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone={st.tone}>{l.status === "review" ? "Хянагдаж буй" : st.label}</Badge>
                    <span className="text-xs text-muted">{relativeDate(l.updated_at)} шинэчилсэн</span>
                  </div>
                  <p className="mt-1 truncate font-semibold text-ink">{l.title}</p>
                  <p className="text-sm text-muted">
                    {fmtMNT(Number(l.price))}
                    {l.deal_type === "rent" ? "/сар" : ""} · {l.district}
                  </p>
                  {l.status === "draft" && l.review_note ? (
                    <p className="mt-1 text-sm text-amber-800">Засах шаардлагатай: {l.review_note}</p>
                  ) : null}
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  {l.status === "active" ? (
                    <Link href={`/listings/${l.id}`} className="inline-flex min-h-11 items-center px-3 text-sm font-semibold text-brand-600 hover:underline">
                      Үзэх
                    </Link>
                  ) : null}
                  <Link
                    href={`/sell/edit/${l.id}`}
                    aria-label={`${l.title} засах`}
                    className="flex size-11 items-center justify-center rounded-lg text-muted hover:bg-surface-2 hover:text-ink"
                  >
                    <Pencil className="size-4" aria-hidden />
                  </Link>
                  <OwnerListingDelete id={l.id} title={l.title} />
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {reqs.length > 0 ? (
        <section className="mt-10">
          <h2 className="text-lg font-bold text-ink">Зуучлуулах хүсэлтүүд</h2>
          <ul className="mt-3 divide-y divide-line rounded-2xl border border-line bg-surface">
            {reqs.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm">
                <span className="text-ink">
                  {r.deal_type === "rent" ? "Түрээслүүлэх" : "Худалдах"}
                  {r.property_type ? ` · ${r.property_type}` : ""}
                  {r.district ? ` · ${r.district}` : ""}
                  <span className="text-muted"> — {r.office?.name ?? "Оффис"}, {relativeDate(r.created_at)}</span>
                </span>
                <Badge tone={r.status === "new" ? "neutral" : r.status === "contacted" ? "blue" : "green"}>
                  {REQ_STATUS[r.status]}
                </Badge>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
