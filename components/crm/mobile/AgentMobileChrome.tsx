"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Building2,
  CalendarCheck,
  CalendarRange,
  FileSignature,
  Flame,
  Home,
  KanbanSquare,
  Link2,
  ListChecks,
  Menu,
  Percent,
  Plus,
  QrCode,
  Search,
  ShieldCheck,
  Trophy,
  Users,
  UsersRound,
  Activity,
  Repeat,
  ListTodo,
} from "lucide-react";

import { Drawer } from "@/components/ui/drawer";
import { CommandPalette, openCommandPalette } from "@/components/crm/CommandPalette";
import type { CrmRole } from "@/lib/constants-crm";
import { cn } from "@/lib/utils";
import { showBottomNav } from "@/lib/crm/today";

import { InstallPrompt } from "./InstallPrompt";
import { PushToggle } from "./PushToggle";
import { registerSw } from "./pwa";

/**
 * Агентын панелийн гар утасны бүрхүүл (UX-6, R4, R29):
 *   • доод 5 таб — Өнөөдөр, Сэжим, +, Хайх, Цэс (md-ээс доош);
 *   • Ctrl/⌘+K нэгдсэн хайлт (бүх дэлгэцэд);
 *   • service worker бүртгэл (push, суулгах).
 * Карт (сэжим, харилцагч, боломж…) нь өөрийн доод үйлдлийн мөртэй тул
 * доод таб зөвхөн жагсаалт, самбарын дэлгэцэд харагдана.
 */

const BASE = "/agent/crm";
const LEAD_ROLES: CrmRole[] = ["team_lead", "sales_director", "ops_qc", "ceo", "sysadmin"];

type Item = { href: string; label: string; icon: typeof Flame; roles?: CrmRole[] };

const MENU_SECTIONS: { title: string; items: Item[] }[] = [
  {
    title: "Өдөр тутмын ажил",
    items: [
      { href: BASE, label: "Өнөөдөр", icon: CalendarCheck },
      { href: `${BASE}/worklists`, label: "Ажлын жагсаалт", icon: ListChecks },
      { href: `${BASE}/worklists/tracks`, label: "Ажлын цуваа", icon: Repeat },
      { href: `${BASE}/week`, label: "Долоо хоног", icon: CalendarRange },
      { href: "/agent/tasks", label: "Даалгавар", icon: ListTodo },
    ],
  },
  {
    title: "Бүртгэл",
    items: [
      { href: `${BASE}/leads`, label: "Сэжим", icon: Flame },
      { href: `${BASE}/listings`, label: "Сэжимтэй зар", icon: Home },
      { href: `${BASE}/contacts`, label: "Харилцагч", icon: Users },
      { href: `${BASE}/properties`, label: "Үл хөдлөх", icon: Building2 },
      { href: `${BASE}/pipeline`, label: "Урсгал", icon: KanbanSquare },
      { href: `${BASE}/transactions`, label: "Хэлцэл", icon: FileSignature },
      { href: `${BASE}/pool`, label: "Эзэмшил, сан", icon: ShieldCheck },
      { href: `${BASE}/commissions`, label: "Шимтгэл", icon: Percent },
    ],
  },
  {
    title: "Харилцагчид илгээх",
    items: [
      { href: `${BASE}/links`, label: "Холбоос, тайлан", icon: Link2 },
      { href: `${BASE}/links?tab=qr`, label: "Нээлттэй үзлэгийн QR", icon: QrCode },
    ],
  },
  {
    title: "Баг",
    items: [
      { href: `${BASE}/worklists/leaderboard`, label: "Тэргүүлэгчид", icon: Trophy },
      { href: `${BASE}/worklists/vitals`, label: "Ажлын эрүүл мэнд", icon: Activity, roles: LEAD_ROLES },
      { href: `${BASE}/team`, label: "Миний баг", icon: UsersRound, roles: LEAD_ROLES },
    ],
  },
];

const QUICK_ADD: Item[] = [
  { href: `${BASE}/leads?new=1`, label: "Шинэ сэжим", icon: Flame },
  { href: `${BASE}/contacts?new=1`, label: "Шинэ харилцагч", icon: Users },
  { href: `${BASE}/links?new=collection`, label: "Сонголтын жагсаалт илгээх", icon: Link2 },
  { href: `${BASE}/links?new=open_house`, label: "Нээлттэй үзлэгийн QR", icon: QrCode },
];

function visible(items: Item[], roles: CrmRole[]) {
  return items.filter((i) => !i.roles || i.roles.some((r) => roles.includes(r)));
}

export function AgentMobileChrome({ roles }: { roles: CrmRole[] }) {
  const pathname = usePathname() ?? "";
  const [menu, setMenu] = useState(false);
  const [add, setAdd] = useState(false);

  useEffect(() => {
    void registerSw();
  }, []);

  const show = showBottomNav(pathname);
  const isActive = (href: string) => (href === BASE ? pathname === BASE : pathname.startsWith(href));

  return (
    <>
      <CommandPalette basePath={BASE} />
      {show ? (
        <>
          <div aria-hidden className="h-[calc(4rem+env(safe-area-inset-bottom))] md:hidden" />
          <nav
            aria-label="CRM доод цэс"
            className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface/95 backdrop-blur md:hidden"
            style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
          >
            <div className="mx-auto grid h-16 max-w-lg grid-cols-5">
              <Tab href={BASE} label="Өнөөдөр" icon={CalendarCheck} active={isActive(BASE)} />
              <Tab href={`${BASE}/leads`} label="Сэжим" icon={Flame} active={isActive(`${BASE}/leads`)} />
              <button
                type="button"
                onClick={() => setAdd(true)}
                className="flex flex-col items-center justify-center gap-0.5 text-[11px] font-medium text-brand-700"
                aria-label="Шинээр нэмэх"
              >
                <span className="grid size-10 place-items-center rounded-full bg-brand-500 text-white shadow-md">
                  <Plus className="size-5" />
                </span>
              </button>
              <button
                type="button"
                onClick={openCommandPalette}
                className="flex flex-col items-center justify-center gap-0.5 text-[11px] font-medium text-muted"
              >
                <Search className="size-5" /> Хайх
              </button>
              <button
                type="button"
                onClick={() => setMenu(true)}
                className={cn(
                  "flex flex-col items-center justify-center gap-0.5 text-[11px] font-medium",
                  menu ? "text-brand-700" : "text-muted"
                )}
              >
                <Menu className="size-5" /> Цэс
              </button>
            </div>
          </nav>
        </>
      ) : null}

      <Drawer open={add} onClose={() => setAdd(false)} title="Шинээр нэмэх" widthClassName="max-w-sm">
        <div className="grid gap-2">
          {QUICK_ADD.map((i) => (
            <Link key={i.href} href={i.href} onClick={() => setAdd(false)} className="flex items-center gap-3 rounded-xl border border-line px-3 py-3 text-sm font-medium text-ink hover:bg-surface-2">
              <i.icon className="size-5 text-brand-600" /> {i.label}
            </Link>
          ))}
        </div>
      </Drawer>

      <Drawer open={menu} onClose={() => setMenu(false)} title="CRM цэс" widthClassName="max-w-sm">
        <div className="space-y-4">
          <InstallPrompt />
          <PushToggle compact />
          {MENU_SECTIONS.map((s) => {
            const items = visible(s.items, roles);
            if (!items.length) return null;
            return (
              <div key={s.title}>
                <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-subtle">{s.title}</p>
                <div className="grid gap-1">
                  {items.map((i) => (
                    <Link
                      key={i.href}
                      href={i.href}
                      onClick={() => setMenu(false)}
                      className={cn(
                        "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm",
                        isActive(i.href.split("?")[0]) ? "bg-brand-50 font-medium text-brand-700" : "text-ink hover:bg-surface-2"
                      )}
                    >
                      <i.icon className="size-4 text-brand-600" /> {i.label}
                    </Link>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </Drawer>
    </>
  );
}

function Tab({ href, label, icon: Icon, active }: { href: string; label: string; icon: typeof Flame; active: boolean }) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn("flex flex-col items-center justify-center gap-0.5 text-[11px] font-medium", active ? "text-brand-700" : "text-muted")}
    >
      <Icon className="size-5" /> {label}
    </Link>
  );
}
