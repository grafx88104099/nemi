import type { Metadata } from "next";
import { headers } from "next/headers";
import { BedDouble, MapPin, Ruler } from "lucide-react";

import { getPublicCollection } from "@/lib/queries-crm-links";
import { CollectionResponder } from "@/components/crm/links/CollectionResponder";
import { fmtDateNum, fmtMNT } from "@/lib/format";

export const metadata: Metadata = {
  title: "Танд зориулсан сонголтууд",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

/** R11: агентын илгээсэн 3–7 листинг; харилцагч нэвтрэлгүйгээр хариу өгнө. */
export default async function CollectionPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const ua = (await headers()).get("user-agent");
  const data = await getPublicCollection(token, ua);

  if (!data || data.state !== "active") {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center">
        <h1 className="text-xl font-bold text-ink">Холбоос хүчингүй байна</h1>
        <p className="mt-2 text-sm text-muted">
          {data?.state === "expired" ? "Энэ жагсаалтын хугацаа дууссан байна." : "Холбоос буруу эсвэл цуцлагдсан байна."} Шинэ сонголт авахыг
          хүсвэл агенттайгаа холбогдоно уу.
        </p>
        {data?.agent.phone ? (
          <a href={`tel:${data.agent.phone}`} className="mt-4 inline-block rounded-xl bg-brand-500 px-4 py-2 text-sm font-medium text-white">
            {data.agent.name} — залгах
          </a>
        ) : null}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-6">
      <p className="text-xs text-muted">{data.agent.office ?? ""}</p>
      <h1 className="text-xl font-bold text-ink">{data.title || "Танд зориулсан сонголтууд"}</h1>
      <p className="mt-1 text-sm text-muted">
        {data.agent.name} бэлтгэв. Листинг бүрт «Сонирхсон», «Магадгүй», «Тохироогүй»-н аль нэгийг дарж хариу өгнө үү.
      </p>

      <ul className="mt-4 space-y-4">
        {data.items.map((it) => (
          <li key={it.propertyId} className="overflow-hidden rounded-2xl border border-line bg-surface">
            {it.photo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={it.photo} alt="" className="h-48 w-full object-cover" loading="lazy" referrerPolicy="no-referrer" />
            ) : null}
            <div className="space-y-2 p-4">
              <div className="flex flex-wrap items-baseline gap-2">
                <span className="text-base font-semibold text-ink">{it.typeLabel}</span>
                <span className="text-xs text-subtle">{it.number}</span>
                <span className="ml-auto text-base font-bold text-ink">
                  {it.isRental
                    ? it.rentPrice
                      ? `${fmtMNT(it.rentPrice)} / сар`
                      : "Үнэ тохиролцоно"
                    : it.price
                      ? fmtMNT(it.price)
                      : "Үнэ тохиролцоно"}
                </span>
              </div>
              <div className="flex flex-wrap gap-3 text-sm text-muted">
                {it.location ? (
                  <span className="inline-flex items-center gap-1">
                    <MapPin className="size-4" /> {it.location}
                  </span>
                ) : null}
                {it.rooms ? (
                  <span className="inline-flex items-center gap-1">
                    <BedDouble className="size-4" /> {it.rooms} өрөө
                  </span>
                ) : null}
                {it.area ? (
                  <span className="inline-flex items-center gap-1">
                    <Ruler className="size-4" /> {it.area} м²
                  </span>
                ) : null}
              </div>
              {it.features.length ? (
                <div className="flex flex-wrap gap-1.5">
                  {it.features.map((f) => (
                    <span key={f} className="rounded-full bg-surface-2 px-2 py-0.5 text-xs text-muted">
                      {f}
                    </span>
                  ))}
                </div>
              ) : null}
              <CollectionResponder token={token} propertyId={it.propertyId} initial={it.response} initialComment={it.comment} />
            </div>
          </li>
        ))}
      </ul>

      <div className="mt-6 rounded-2xl border border-line bg-surface p-4 text-sm">
        <p className="font-medium text-ink">Асуулт байна уу?</p>
        <p className="text-muted">Үзлэг товлох, нэмэлт мэдээлэл авахыг хүсвэл агенттайгаа холбогдоно уу.</p>
        {data.agent.phone ? (
          <a href={`tel:${data.agent.phone}`} className="mt-2 inline-block rounded-xl bg-brand-500 px-4 py-2 font-medium text-white">
            {data.agent.name} — залгах
          </a>
        ) : null}
        <p className="mt-3 text-xs text-subtle">Холбоосын хугацаа: {fmtDateNum(data.expiresAt)} хүртэл.</p>
      </div>
    </div>
  );
}
