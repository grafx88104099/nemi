import type { Metadata } from "next";

import { withBrand } from "@/lib/seo/site";

export const metadata: Metadata = {
  title: withBrand("Нууцлалын бодлого"),
  description: "Нэми ямар мэдээлэл цуглуулж, хэрхэн ашиглаж, хадгалдаг тухай.",
  alternates: { canonical: "/privacy" },
};

export default function PrivacyPage() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-12">
      <h1 className="text-3xl font-extrabold text-ink">Нууцлалын бодлого</h1>
      <p className="mt-2 text-sm text-subtle">Сүүлд шинэчилсэн: 2026-11-23</p>
      <div className="mt-6 space-y-5 text-muted">
        <section>
          <h2 className="font-bold text-ink">1. Цуглуулдаг мэдээлэл</h2>
          <p className="mt-1">
            Бид таны нэр, и-мэйл, утас, болон платформ дээрх үйлдлийн мэдээллийг
            үйлчилгээ үзүүлэх зорилгоор цуглуулдаг.
          </p>
        </section>
        <section>
          <h2 className="font-bold text-ink">2. Мэдээллийн ашиглалт</h2>
          <p className="mt-1">
            Таны мэдээллийг зар тааруулах, агенттай холбох, сэрэмжлүүлэг илгээх
            зорилгоор ашиглана. Бид таны хувийн мэдээллийг гуравдагч этгээдэд
            зарж борлуулдаггүй.
          </p>
          <p className="mt-2">
            Зарын хайлтад «AI-аар ойлгуулах» товчийг дарвал таны хайлтын бичвэрийг зөвхөн
            шүүлт гаргах зорилгоор Anthropic (Claude API) руу илгээнэ; Нэми уг бичвэрийг
            хадгалахгүй (гарсан шүүлтийг л 1 хоног түр кэшилнэ), давтамж хязгаарлахын тулд
            IP хаягийн хэшээр тоолуур л хадгална.
          </p>
        </section>
        <section>
          <h2 className="font-bold text-ink">4. Хандалтын эх сурвалж ба зарын үзэлтийн статистик</h2>
          <p className="mt-1">
            Таныг Facebook, Viber, unegui.mn зэрэг ямар сувгаар орж ирснийг (utm_source,
            utm_medium, utm_campaign) 30 хоног хадгалах first-party cookie (nemi_attr) ашиглана.
            Мөн зар хэдэн удаа үзэгдсэнийг тоолохдоо санамсаргүй таних тэмдгийн (nemi_sid) хэш,
            үзсэн зар, суваг, огноог хадгална. IP хаяг, төхөөрөмжийн мэдээлэл, нэр, утсыг энэ
            статистикт хадгалахгүй, гуравдагч этгээдэд дамжуулахгүй.
          </p>
          <p className="mt-2">
            Чат, үзлэгийн хүсэлт, зуучлуулах хүсэлт үүсгэхэд тухайн сувгийг тэмдэглэнэ.
            Үзэлтийн мэдээллийг 180 хоногийн дараа устгана.
          </p>
          <p className="mt-2">
            Хөтөч тань «Do Not Track» эсвэл «Global Privacy Control» дохио илгээвэл cookie
            тавихгүй, үзэлт тоолохгүй, сувгийг тэмдэглэхгүй.
          </p>
        </section>
        <section>
          <h2 className="font-bold text-ink">5. Таны эрх</h2>
          <p className="mt-1">
            Та өөрийн мэдээллээ хэдийд ч засах, устгах хүсэлт гаргах эрхтэй.
            Дансны тохиргооноос мэдээллээ удирдана уу.
          </p>
        </section>
      </div>
    </div>
  );
}
