import type { Metadata } from "next";
import { BedDouble, CalendarDays, MapPin, Ruler } from "lucide-react";

import { getPublicOpenHouse } from "@/lib/queries-crm-links";
import { OpenHouseVisitForm } from "@/components/crm/links/OpenHouseVisitForm";
import { fmtMNT, fmtShortDateTime } from "@/lib/format";

export const metadata: Metadata = {
  title: "Нээлттэй үзлэгийн бүртгэл",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

function fmt(iso: string) {
  return fmtShortDateTime(iso);
}

/** R9: QR уншуулсан зочны бүртгэл → листингийн агентын сэжим (давхардлын шалгалттай). */
export default async function OpenHousePage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const oh = await getPublicOpenHouse(code);

  if (!oh || oh.state === "revoked" || oh.state === "closed") {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center">
        <h1 className="text-xl font-bold text-ink">Бүртгэл хаагдсан байна</h1>
        <p className="mt-2 text-sm text-muted">Энэ QR-ын бүртгэлийн хугацаа дууссан эсвэл цуцлагдсан байна.</p>
      </div>
    );
  }
  const p = oh.property;

  return (
    <div className="mx-auto max-w-md px-4 py-6">
      <p className="text-xs text-muted">{oh.agent.office ?? ""}</p>
      <h1 className="text-xl font-bold text-ink">{oh.title || (oh.kind === "open_house" ? "Нээлттэй үзлэг" : "Үл хөдлөхийн мэдээлэл авах")}</h1>
      {p ? (
        <div className="mt-2 space-y-1 text-sm text-muted">
          <p className="font-medium text-ink">
            {p.typeLabel} · {p.isRental ? (p.rentPrice ? `${fmtMNT(p.rentPrice)} / сар` : "") : p.price ? fmtMNT(p.price) : ""}
          </p>
          <p className="flex flex-wrap gap-3">
            {p.location ? (
              <span className="inline-flex items-center gap-1">
                <MapPin className="size-4" /> {p.location}
              </span>
            ) : null}
            {p.rooms ? (
              <span className="inline-flex items-center gap-1">
                <BedDouble className="size-4" /> {p.rooms} өрөө
              </span>
            ) : null}
            {p.area ? (
              <span className="inline-flex items-center gap-1">
                <Ruler className="size-4" /> {p.area} м²
              </span>
            ) : null}
          </p>
        </div>
      ) : null}
      {oh.kind === "open_house" && oh.startsAt && oh.endsAt ? (
        <p className="mt-2 inline-flex items-center gap-1 rounded-full bg-brand-50 px-3 py-1 text-sm text-brand-700">
          <CalendarDays className="size-4" /> {fmt(oh.startsAt)} – {fmt(oh.endsAt)}
        </p>
      ) : null}

      {oh.state === "upcoming" ? (
        <p className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          Бүртгэл арга хэмжээ эхлэхээс өмнөхөн нээгдэнэ. Түр хүлээгээд дахин уншуулна уу.
        </p>
      ) : (
        <div className="mt-5">
          <p className="mb-3 text-sm text-muted">Бүртгүүлбэл {oh.agent.name} танд дэлгэрэнгүй мэдээлэл, ижил төстэй сонголтуудыг хүргэнэ.</p>
          <OpenHouseVisitForm code={code} office={oh.agent.office} />
        </div>
      )}
    </div>
  );
}
