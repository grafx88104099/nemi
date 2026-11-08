import type { Metadata } from "next";
import { headers } from "next/headers";
import { CalendarDays, Eye, FileText, Handshake, QrCode, Send } from "lucide-react";

import { getPublicOwnerReport } from "@/lib/queries-crm-links";
import { fmtDateNum, fmtDateTime, fmtMNT } from "@/lib/format";

export const metadata: Metadata = {
  title: "Листингийн явцын тайлан",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

function Stat({ icon: Icon, value, label }: { icon: typeof Eye; value: number | string; label: string }) {
  return (
    <div className="rounded-2xl border border-line bg-surface p-3">
      <Icon className="size-4 text-brand-600" />
      <p className="mt-1 text-2xl font-bold tabular-nums text-ink">{value}</p>
      <p className="text-xs text-muted">{label}</p>
    </div>
  );
}

/** R10: өмчлөгчид листингийн явц. Худалдан авагчийн хувийн мэдээлэл, саналын дүн гарахгүй. */
export default async function OwnerReportPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const ua = (await headers()).get("user-agent");
  const r = await getPublicOwnerReport(token, ua);

  if (!r || r.state !== "active" || !r.property) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center">
        <h1 className="text-xl font-bold text-ink">Тайлан харах боломжгүй</h1>
        <p className="mt-2 text-sm text-muted">
          {r?.state === "expired" ? "Тайлангийн холбоосын хугацаа дууссан байна." : "Холбоос буруу эсвэл цуцлагдсан байна."} Агентаасаа шинэ
          холбоос хүсээрэй.
        </p>
      </div>
    );
  }
  const p = r.property;
  const price = p.isRental ? (p.rentPrice ? `${fmtMNT(p.rentPrice)} / сар` : "—") : p.price ? fmtMNT(p.price) : "—";

  return (
    <div className="mx-auto max-w-2xl px-4 py-6">
      <p className="text-xs text-muted">{r.agent.office ?? ""}</p>
      <h1 className="text-xl font-bold text-ink">Листингийн явцын тайлан</h1>
      <p className="mt-1 text-sm text-muted">
        {p.typeLabel} · {p.number}
        {p.location ? ` · ${p.location}` : ""}
      </p>
      <div className="mt-3 flex flex-wrap gap-2 text-sm">
        <span className="rounded-full bg-brand-50 px-3 py-1 font-medium text-brand-700">{p.statusLabel}</span>
        <span className="rounded-full bg-surface-2 px-3 py-1 text-ink">{price}</span>
        {p.daysOnMarket != null ? <span className="rounded-full bg-surface-2 px-3 py-1 text-ink">{p.daysOnMarket} хоног зах зээлд</span> : null}
      </div>

      {r.nextStep ? (
        <div className="mt-4 rounded-2xl border border-brand-200 bg-brand-50 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-brand-700">Дараагийн алхам</p>
          <p className="mt-1 text-sm text-ink">{r.nextStep}</p>
        </div>
      ) : null}

      <h2 className="mb-2 mt-5 text-sm font-semibold text-ink">Сонирхол</h2>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat icon={Send} value={r.funnel.suggested} label="Санал болгосон харилцагч" />
        <Stat icon={Handshake} value={r.funnel.interested} label="Сонирхсон" />
        <Stat icon={Eye} value={r.showings.done} label="Хийгдсэн үзлэг" />
        <Stat icon={CalendarDays} value={r.showings.upcoming} label="Товлосон үзлэг" />
        <Stat icon={FileText} value={r.offers.count} label="Ирсэн үнийн санал" />
        <Stat icon={QrCode} value={r.visits} label="Нээлттэй үзлэгийн бүртгэл" />
      </div>

      <h2 className="mb-2 mt-5 text-sm font-semibold text-ink">Үзлэгийн эргэх холбоо</h2>
      {r.showings.feedback.length ? (
        <ul className="space-y-1.5 rounded-2xl border border-line bg-surface p-3">
          {r.showings.feedback.map((f) => {
            const total = r.showings.feedback.reduce((s, x) => s + x.count, 0);
            const pct = total ? Math.round((f.count / total) * 100) : 0;
            return (
              <li key={f.label} className="text-sm">
                <div className="flex justify-between">
                  <span className="text-ink">{f.label}</span>
                  <span className="tabular-nums text-muted">{f.count}</span>
                </div>
                <div className="mt-0.5 h-1.5 rounded-full bg-surface-2">
                  <div className="h-1.5 rounded-full bg-brand-500" style={{ width: `${pct}%` }} />
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="text-sm text-muted">Ангилсан эргэх холбоо одоогоор алга.</p>
      )}
      <p className="mt-1 text-xs text-muted">
        Магадгүй: {r.funnel.maybe} · Тохироогүй: {r.funnel.notFit} · Үзлэгийн дараа сонирхсон: {r.showings.interested}
      </p>

      <h2 className="mb-2 mt-5 text-sm font-semibold text-ink">Үнийн түүх</h2>
      {r.priceHistory.length ? (
        <ul className="divide-y divide-line rounded-2xl border border-line bg-surface">
          {r.priceHistory.map((h, i) => (
            <li key={i} className="flex justify-between gap-2 px-3 py-2 text-sm">
              <span className="text-muted">{fmtDateNum(h.date)}</span>
              <span className="text-ink">
                {h.field === "rent_price" ? "Түрээс: " : ""}
                {h.from != null ? `${fmtMNT(h.from)} → ` : ""}
                {h.to != null ? fmtMNT(h.to) : "—"}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted">Үнэ өөрчлөгдөөгүй.</p>
      )}

      <div className="mt-6 rounded-2xl border border-line bg-surface p-4 text-sm">
        <p className="font-medium text-ink">{r.agent.name}</p>
        {r.agent.phone ? (
          <a href={`tel:${r.agent.phone}`} className="mt-2 inline-block rounded-xl bg-brand-500 px-4 py-2 font-medium text-white">
            Агенттай холбогдох
          </a>
        ) : null}
        <p className="mt-3 text-xs text-subtle">
          Тайлан {fmtDateTime(r.generatedAt)}-ны байдлаар. Худалдан авагчийн хувийн мэдээлэл
          нууцлалын журмын дагуу харагдахгүй.
        </p>
      </div>
    </div>
  );
}
