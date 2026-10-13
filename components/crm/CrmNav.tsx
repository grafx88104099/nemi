"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Flame,
  Users,
  Building2,
  KanbanSquare,
  FileSignature,
  Percent,
  KeyRound,
  ShieldAlert,
  BarChart3,
  Settings2,
} from "lucide-react";

import { cn } from "@/lib/utils";
import type { CrmRole } from "@/lib/constants-crm";

/**
 * CRM-ийн хоёрдогч хэвтээ цэс — дүрээр шүүгдэнэ (roles серверээс prop-оор).
 * basePath: оффис панель "/office/crm", агент панель "/agent/crm".
 */

type NavItem = {
  segment: string; // basePath-д залгагдах ("" = үндсэн самбар)
  label: string;
  icon: typeof LayoutDashboard;
  /** undefined = бүх дүрд; массив = зөвхөн эдгээр дүрд. */
  roles?: CrmRole[];
  /** true = route зөвхөн оффис панельд бий — агент basePath-д нуугдана (404 холбоосоос сэргийлнэ). */
  officeOnly?: boolean;
};

const ITEMS: NavItem[] = [
  { segment: "", label: "Самбар", icon: LayoutDashboard },
  { segment: "/leads", label: "Сэжим", icon: Flame },
  { segment: "/contacts", label: "Харилцагч", icon: Users },
  { segment: "/properties", label: "Объект", icon: Building2 },
  { segment: "/pipeline", label: "Урсгал", icon: KanbanSquare },
  { segment: "/transactions", label: "Хэлцэл", icon: FileSignature, officeOnly: true },
  {
    segment: "/commissions",
    label: "Шимтгэл",
    icon: Percent,
    roles: ["agent", "team_lead", "sales_director", "ops_qc", "property_manager", "finance", "aml_officer", "ceo"],
  },
  {
    segment: "/rentals",
    label: "Түрээс",
    icon: KeyRound,
    officeOnly: true,
    roles: ["agent", "team_lead", "sales_director", "ops_qc", "property_manager", "finance", "aml_officer", "ceo"],
  },
  { segment: "/aml", label: "МУТСТ", icon: ShieldAlert, officeOnly: true, roles: ["aml_officer", "ceo"] },
  { segment: "/reports", label: "Тайлан", icon: BarChart3, officeOnly: true },
  {
    segment: "/settings",
    label: "Тохиргоо",
    icon: Settings2,
    officeOnly: true,
    roles: ["sysadmin", "ops_qc", "sales_director", "ceo"],
  },
];

export function CrmNav({ roles, basePath = "/office/crm" }: { roles: CrmRole[]; basePath?: string }) {
  const pathname = usePathname();
  const isOffice = basePath.startsWith("/office");
  const visible = ITEMS.filter(
    (it) => (isOffice || !it.officeOnly) && (!it.roles || it.roles.some((r) => roles.includes(r)))
  );

  return (
    <nav className="flex items-center gap-1 overflow-x-auto" aria-label="CRM цэс">
      {visible.map((it) => {
        const href = `${basePath}${it.segment}`;
        const active = it.segment === "" ? pathname === basePath : pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            className={cn(
              "flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-3 text-sm font-medium transition",
              active
                ? "border-brand-500 text-brand-700"
                : "border-transparent text-muted hover:border-line-strong hover:text-ink"
            )}
          >
            <it.icon className="size-4" /> {it.label}
          </Link>
        );
      })}
    </nav>
  );
}
