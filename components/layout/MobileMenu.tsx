"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Building2,
  CircleHelp,
  Home,
  Info,
  Landmark,
  Map as MapIcon,
  Menu,
  Newspaper,
  Plus,
  Search,
  Sparkles,
  Tag,
  Users,
  type LucideIcon,
} from "lucide-react";

import { Drawer } from "@/components/ui/drawer";
import { RENT_SEARCH_LINKS, RENT_TOOL_LINKS } from "@/components/layout/RentMenu";

type MenuItem = { href: string; label: string; icon: LucideIcon };

const SEARCH: MenuItem[] = [
  { href: "/listings?deal=sale", label: "Худалдах", icon: Search },
  { href: "/map", label: "Газрын зураг", icon: MapIcon },
  ...RENT_SEARCH_LINKS,
];

// «Хадгалсан зар» нь доод цэсний таб тул энд давтахгүй.
const TOOLS: MenuItem[] = [
  { href: "/home-loans", label: "Зээлийн тооцоолуур", icon: Landmark },
  { href: "/my-home", label: "Гэрийн үнэлгээ", icon: Home },
  { href: "/ai", label: "AI туслах", icon: Sparkles },
  ...RENT_TOOL_LINKS.filter((l) => l.href !== "/favorites"),
];

const OTHER: MenuItem[] = [
  { href: "/agents", label: "Агентууд", icon: Users },
  { href: "/offices", label: "Оффисууд", icon: Building2 },
  { href: "/news", label: "Мэдээ", icon: Newspaper },
  { href: "/help", label: "Тусламж", icon: CircleHelp },
  { href: "/about", label: "Бидний тухай", icon: Info },
];

/**
 * Гар утасны «Цэс» (md-ээс доош) — NavLinks/RentMenu-ийн бүх очих газар.
 * Drawer-ийг document.body руу portal хийнэ: header-ийн backdrop-blur нь
 * fixed хүүхдийн containing block болдог тул шууд дотор нь зурвал header-ийн
 * өндөрт хавчигдана.
 */
export function MobileMenu({ sellHref }: { sellHref: string }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const [prevPath, setPrevPath] = useState(pathname);
  // Back/forward зэрэг замын өөрчлөлтөөр хаагдана (effect-гүй, render үеийн тохируулга).
  if (pathname !== prevPath) {
    setPrevPath(pathname);
    setOpen(false);
  }

  const close = () => setOpen(false);
  const sell: MenuItem[] = [
    { href: "/sell", label: "Хөрөнгөө зарах", icon: Tag },
    ...(sellHref !== "/sell" ? [{ href: sellHref, label: "Зар оруулах", icon: Plus }] : []),
  ];

  return (
    <>
      <button
        type="button"
        aria-label="Цэс"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(true)}
        className="flex size-11 items-center justify-center rounded-lg text-ink hover:bg-surface-2 md:hidden"
      >
        <Menu className="size-5" aria-hidden />
      </button>
      {open
        ? createPortal(
            <Drawer open={open} onClose={close} title="Цэс" widthClassName="max-w-xs">
              <nav aria-label="Цэс" className="space-y-5">
                <MenuGroup title="Хайх" items={SEARCH} onNavigate={close} />
                <MenuGroup title="Хэрэгсэл" items={TOOLS} onNavigate={close} />
                <MenuGroup title="Зарах" items={sell} onNavigate={close} />
                <MenuGroup title="Бусад" items={OTHER} onNavigate={close} />
              </nav>
            </Drawer>,
            document.body
          )
        : null}
    </>
  );
}

function MenuGroup({ title, items, onNavigate }: { title: string; items: MenuItem[]; onNavigate: () => void }) {
  return (
    <section>
      <h3 className="mb-1 px-2 text-xs font-semibold uppercase text-muted">{title}</h3>
      <ul>
        {items.map((l) => (
          <li key={l.href}>
            <Link
              href={l.href}
              onClick={onNavigate}
              className="flex min-h-11 items-center gap-2.5 rounded-lg px-2 text-sm text-ink hover:bg-surface-2"
            >
              <l.icon className="size-4 text-brand-600" aria-hidden />
              {l.label}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
