import { Phone } from "lucide-react";

import { createClient } from "@/lib/supabase/server";
import { fmtDateTime, fmtMNT } from "@/lib/format";
import { channelLabel } from "@/lib/attribution";
import { Badge } from "@/components/ui/badge";
import { OwnerRequestStatus } from "@/components/office/OwnerRequestStatus";

export const metadata = { title: "Зуучлуулах хүсэлт — Оффис" };

const STATUS = {
  new: { label: "Шинэ", tone: "amber" },
  contacted: { label: "Холбогдсон", tone: "blue" },
  closed: { label: "Хаагдсан", tone: "neutral" },
} as const;

/**
 * Эзэд нийтийн сайтаас («Хөрөнгөө зарлах» → «Оффист зуучлуулах») үлдээсэн
 * хүсэлтүүд. RLS зөвхөн өөрийн оффисынхыг харуулна.
 */
export default async function OwnerRequestsPage() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("owner_requests")
    .select("*")
    .order("status", { ascending: true })
    .order("created_at", { ascending: false })
    .limit(300);
  const rows = data ?? [];
  // Шинэ → холбогдсон → хаагдсан дараалал.
  const order = { new: 0, contacted: 1, closed: 2 } as const;
  rows.sort((a, b) => order[a.status] - order[b.status] || b.created_at.localeCompare(a.created_at));
  const fresh = rows.filter((r) => r.status === "new").length;

  return (
    <div className="p-4 sm:p-8">
      <h1 className="text-2xl font-extrabold text-ink">Зуучлуулах хүсэлт</h1>
      <p className="text-sm text-muted">
        Эзэд хөрөнгөө оффист зуучлуулахаар үлдээсэн хүсэлт · {fresh} шинэ
      </p>

      {rows.length === 0 ? (
        <p className="mt-10 text-center text-muted">Хүсэлт алга.</p>
      ) : (
        <ul className="mt-6 grid grid-cols-1 gap-3 lg:grid-cols-2">
          {rows.map((r) => {
            const st = STATUS[r.status];
            const facts = [
              r.deal_type === "rent" ? "Түрээслүүлэх" : "Худалдах",
              r.property_type,
              r.district,
              r.area ? `${r.area} м²` : null,
              r.rooms ? `${r.rooms} өрөө` : null,
              r.price ? fmtMNT(Number(r.price)) + (r.deal_type === "rent" ? "/сар" : "") : null,
            ].filter(Boolean);
            return (
              <li key={r.id} className="rounded-2xl border border-line bg-surface p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-semibold text-ink">{r.contact_name}</p>
                    <a
                      href={`tel:${r.contact_phone}`}
                      className="inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-brand-600 hover:underline"
                    >
                      <Phone className="size-4" aria-hidden /> {r.contact_phone}
                    </a>
                  </div>
                  <Badge tone={st.tone}>{st.label}</Badge>
                </div>
                <p className="mt-1 text-sm text-ink">{facts.join(" · ")}</p>
                {r.location_text ? <p className="text-sm text-muted">{r.location_text}</p> : null}
                {r.note ? <p className="mt-2 whitespace-pre-line rounded-xl bg-surface-2 p-3 text-sm text-ink">{r.note}</p> : null}
                <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                  <span className="flex flex-wrap items-center gap-2 text-xs text-muted">
                    {fmtDateTime(r.created_at)}
                    {r.utm_source ? <Badge tone="neutral">{channelLabel(r.utm_source)}</Badge> : null}
                  </span>
                  <OwnerRequestStatus id={r.id} status={r.status} />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
