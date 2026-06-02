import Link from "next/link";
import { Building2, ArrowRight } from "lucide-react";

import { Logo } from "@/components/brand/Logo";

const cols: { title: string; links: [string, string][] }[] = [
  {
    title: "Хайх",
    links: [
      ["/listings", "Зар хайх"],
      ["/agents", "Агент хайх"],
      ["/home-loans", "Орон сууцны зээл"],
    ],
  },
  {
    title: "Мэргэжилтнүүд",
    links: [
      ["/partners", "⭐ Нэми Premier"],
      ["/office-signup", "Оффис нээх"],
      ["/agent/login", "Агентаар нэвтрэх"],
      ["/office/login", "Оффисоор нэвтрэх"],
      ["/agent/rental-manager", "Түрээс удирдах"],
    ],
  },
  {
    title: "Нэми",
    links: [
      ["/news", "Мэдээ ба блог"],
      ["/about", "Бидний тухай"],
      ["/help", "Тусламжийн төв"],
      ["/contact", "Холбоо барих"],
      ["/admin/login", "Системийн админ"],
    ],
  },
];

export function Footer() {
  return (
    <footer className="mt-20 bg-ink text-white/80">
      <div className="mx-auto max-w-7xl px-4 py-14">
        <div className="grid gap-10 md:grid-cols-[1.4fr_repeat(3,1fr)]">
          <div className="space-y-4">
            <Logo color="#fff" className="h-7 w-auto" />
            <p className="text-sm text-white/60">
              Баталгаатай үл хөдлөхийн платформ. Худалдан авагч, агент,
              оффисуудыг AI-аар нэгтгэсэн.
            </p>
            <Link
              href="/office-signup"
              className="inline-flex items-center gap-2 text-sm font-semibold text-brand-logo hover:underline"
            >
              <Building2 className="size-4" /> Оффис болж нэгдэх
              <ArrowRight className="size-4" />
            </Link>
            <div className="flex gap-6 pt-2 text-sm">
              <div>
                <b className="block text-white">12,480+</b>
                <span className="text-white/50">Идэвхтэй зар</span>
              </div>
              <div>
                <b className="block text-white">320+</b>
                <span className="text-white/50">Баталгаажсан агент</span>
              </div>
              <div>
                <b className="block text-white">28</b>
                <span className="text-white/50">Хамтрагч оффис</span>
              </div>
            </div>
          </div>
          {cols.map((c) => (
            <div key={c.title} className="space-y-2.5">
              <h4 className="text-sm font-semibold text-white">{c.title}</h4>
              {c.links.map(([href, label]) => (
                <Link
                  key={label}
                  href={href}
                  className="block text-sm text-white/60 hover:text-white"
                >
                  {label}
                </Link>
              ))}
            </div>
          ))}
        </div>
        <div className="mt-12 flex flex-col gap-3 border-t border-white/10 pt-6 text-xs text-white/50 sm:flex-row sm:items-center sm:justify-between">
          <span>© 2026 Нэми технологи. Бүх эрх хуулиар хамгаалагдсан. · v1.0</span>
          <div className="flex gap-4">
            <Link href="/terms" className="hover:text-white">Үйлчилгээний нөхцөл</Link>
            <Link href="/privacy" className="hover:text-white">Нууцлал</Link>
            <span>🇲🇳 Монгол</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
