import Link from "next/link";
import { ShieldCheck } from "lucide-react";

/**
 * «Баталгаажсан тэмдэг гэж юу вэ?» — статик, өгөгдөлгүй. Тэмдэг нь АГЕНТЫН
 * бүртгэлийн баталгаажуулалт; байрыг биечлэн үзсэн гэсэн үг биш (listing_verifications
 * байхгүй — тоо, огноо харуулахгүй). Текстийг эзэн merge-ээс өмнө батална.
 */
export function VerifiedExplainer() {
  return (
    <section className="mx-auto max-w-7xl px-4 pb-14" aria-labelledby="verified-heading">
      <div className="flex flex-col gap-4 rounded-card bg-surface-2 p-5 sm:flex-row sm:items-start sm:p-6">
        <ShieldCheck className="size-8 shrink-0 text-verified" aria-hidden />
        <div className="space-y-2">
          <h2 id="verified-heading" className="text-xl font-bold text-ink">
            Баталгаажсан тэмдэг гэж юу вэ?
          </h2>
          <p className="max-w-3xl text-sm text-muted sm:text-base">
            Ногоон тэмдэгтэй зарыг Нэми бүртгэлийг нь шалгаж баталгаажуулсан агент оруулсан. Тэмдэг нь байрыг
            биечлэн үзсэн гэсэн үг биш — үзлэгээ өөрөө товлоорой.
          </p>
          <Link
            href="/contact"
            className="inline-flex min-h-11 items-center text-sm font-semibold text-brand-ink underline-offset-4 hover:underline"
          >
            Асуудалтай зар мэдэгдэх
          </Link>
        </div>
      </div>
    </section>
  );
}
