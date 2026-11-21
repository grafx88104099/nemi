import Link from "next/link";
import { redirect } from "next/navigation";
import { BadgeCheck, Building2, CheckCircle2, Home, ListChecks } from "lucide-react";

import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Хөрөнгөө зарлах — Нэми" };

/**
 * Эзэн (энгийн хэрэглэгч) хөрөнгөө зарлах эхлэл. Хоёр зам:
 *  1) Мэргэжлийн оффист зуучлуулах — агент зураг, гэрээ, үзүүлэлтийг хийнэ;
 *  2) Өөрөө зар оруулах — Нэми-ийн баг хянасны дараа нийтлэгдэнэ.
 * Агент энд ирвэл агентын самбар руу.
 */
export default async function SellPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) {
    const { data: me } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
    if (me?.role === "agent" || me?.role === "office_admin") redirect("/agent/listings");
  }

  const card =
    "group flex h-full flex-col rounded-2xl border border-line bg-surface p-6 transition hover:border-brand-500 hover:shadow-md";
  const point = (t: string) => (
    <li className="flex items-start gap-2 text-sm text-ink">
      <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-600" aria-hidden /> {t}
    </li>
  );

  return (
    <div className="mx-auto max-w-4xl px-4 py-10">
      <h1 className="text-center text-3xl font-extrabold text-ink">Хөрөнгөө зарлах</h1>
      <p className="mx-auto mt-2 max-w-xl text-center text-muted">
        Орон сууц, байшин, оффисоо худалдах эсвэл түрээслүүлэх үү? Танд тохирох замаа сонгоорой.
      </p>

      <div className="mt-8 grid grid-cols-1 gap-5 md:grid-cols-2">
        <Link href="/sell/request" className={card}>
          <span className="inline-flex w-fit items-center gap-1 rounded-full bg-brand-50 px-2.5 py-1 text-xs font-semibold text-brand-700">
            <BadgeCheck className="size-3.5" aria-hidden /> Санал болгож буй
          </span>
          <span className="mt-4 flex items-center gap-3">
            <span className="flex size-12 items-center justify-center rounded-2xl bg-brand-50 text-brand-600 transition group-hover:bg-brand-600 group-hover:text-white">
              <Building2 className="size-6" aria-hidden />
            </span>
            <span className="text-lg font-bold text-ink">Мэргэжлийн оффист зуучлуулах</span>
          </span>
          <p className="mt-3 text-sm text-muted">2 минутын хүсэлт үлдээгээрэй — агент тантай холбогдоно.</p>
          <ul className="mt-4 space-y-2">
            {point("Агент ирж зураг авна, үнэ тогтооход тусална")}
            {point("Баталгаатай зар, үзүүлэлт, гэрээг хариуцна")}
            {point("Бүртгэл заавал биш")}
          </ul>
          <span className="mt-auto pt-5 text-sm font-semibold text-brand-600">Хүсэлт үлдээх →</span>
        </Link>

        <Link href="/sell/new" className={card}>
          <span className="inline-flex w-fit items-center gap-1 rounded-full bg-surface-2 px-2.5 py-1 text-xs font-semibold text-muted">
            <ListChecks className="size-3.5" aria-hidden /> Хянагдсаны дараа нийтлэгдэнэ
          </span>
          <span className="mt-4 flex items-center gap-3">
            <span className="flex size-12 items-center justify-center rounded-2xl bg-surface-2 text-ink transition group-hover:bg-ink group-hover:text-white">
              <Home className="size-6" aria-hidden />
            </span>
            <span className="text-lg font-bold text-ink">Өөрөө зар оруулах</span>
          </span>
          <p className="mt-3 text-sm text-muted">Зураг, үнэ, мэдээллээ оруулж, сонирхогч тан руу шууд залгана.</p>
          <ul className="mt-4 space-y-2">
            {point("Үнэгүй, нэвтэрсэн байхад хангалттай")}
            {point("Нэми-ийн баг хянаж, ихэвчлэн ажлын 1 өдөрт нийтэлнэ")}
            {point("«Миний зарууд»-аас засах, зарагдсан гэж тэмдэглэх")}
          </ul>
          <span className="mt-auto pt-5 text-sm font-semibold text-brand-600">Зар оруулах →</span>
        </Link>
      </div>

      <p className="mt-6 text-center text-sm text-muted">
        Үнээ мэдэхгүй байна уу?{" "}
        <Link href="/my-home" className="inline-flex min-h-11 items-center font-semibold text-brand-600 hover:underline">
          Зах зээлийн үнэлгээ тооцоолох →
        </Link>
      </p>

      {user ? (
        <p className="text-center text-sm">
          <Link href="/my-listings" className="inline-flex min-h-11 items-center font-semibold text-brand-600 hover:underline">
            Миний оруулсан зарууд →
          </Link>
        </p>
      ) : null}
    </div>
  );
}
