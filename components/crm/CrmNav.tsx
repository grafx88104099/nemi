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
  CalendarRange,
  CalendarDays,
  UsersRound,
  ShieldCheck,
  Scale,
  Wallet,
  Gauge,
  ListChecks,
  Link2,
  Activity,
  Home,
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
  /** true = route зөвхөн агентын панельд бий. */
  agentOnly?: boolean;
  /** Оффисын панельд өөр дүрийн шүүлт (агентын панельд roles хэрэглэнэ). */
  officeRoles?: CrmRole[];
  /**
   * true = «Багууд»: баг удирдах (crm_can_manage_teams) эсвэл багийн явц харах эрх шаардана —
   * office_admin нь CRM дүр биш тул roles-оор шүүж болохгүй, серверээс canOpenTeams-ээр ирнэ.
   */
  teamsAccess?: boolean;
};

const LEAD_ROLES: CrmRole[] = ["team_lead", "sales_director", "ops_qc", "ceo", "sysadmin"];

const ITEMS: NavItem[] = [
  { segment: "", label: "Самбар", icon: LayoutDashboard },
  { segment: "/week", label: "Долоо хоног", icon: CalendarRange, officeRoles: LEAD_ROLES },
  { segment: "/calendar", label: "Календарь", icon: CalendarDays },
  { segment: "/team", label: "Миний баг", icon: UsersRound, agentOnly: true, roles: LEAD_ROLES },
  { segment: "/leads", label: "Сэжим", icon: Flame },
  { segment: "/listings", label: "Сэжимтэй зар", icon: Home },
  { segment: "/contacts", label: "Харилцагч", icon: Users },
  { segment: "/properties", label: "Үл хөдлөх", icon: Building2 },
  { segment: "/pipeline", label: "Урсгал", icon: KanbanSquare },
  { segment: "/transactions", label: "Хэлцэл", icon: FileSignature },
  { segment: "/worklists", label: "Ажлын жагсаалт", icon: ListChecks, agentOnly: true },
  { segment: "/links", label: "Холбоос, тайлан", icon: Link2, agentOnly: true },
  { segment: "/pool", label: "Эзэмшил, сан", icon: ShieldCheck },
  { segment: "/disputes", label: "Маргаан, хүсэлт", icon: Scale, officeOnly: true },
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
  {
    segment: "/finance",
    label: "Санхүү",
    icon: Wallet,
    officeOnly: true,
    roles: ["finance", "property_manager", "sales_director", "ops_qc", "ceo"],
  },
  { segment: "/aml", label: "МУТСТ", icon: ShieldAlert, officeOnly: true, roles: ["aml_officer", "ceo"] },
  {
    segment: "/quality",
    label: "Чанар, KPI",
    icon: Gauge,
    officeOnly: true,
    roles: ["ops_qc", "sales_director", "ceo", "sysadmin", "team_lead", "marketing", "finance"],
  },
  { segment: "/vitals", label: "Ажлын эрүүл мэнд", icon: Activity, officeOnly: true, roles: LEAD_ROLES },
  { segment: "/teams", label: "Багууд", icon: UsersRound, officeOnly: true, teamsAccess: true },
  { segment: "/reports", label: "Тайлан", icon: BarChart3, officeOnly: true },
  {
    segment: "/settings",
    label: "Тохиргоо",
    icon: Settings2,
    officeOnly: true,
    roles: ["sysadmin", "ops_qc", "sales_director", "ceo"],
  },
];

export function CrmNav({
  roles,
  basePath = "/office/crm",
  canOpenTeams = false,
}: {
  roles: CrmRole[];
  basePath?: string;
  canOpenTeams?: boolean;
}) {
  const pathname = usePathname();
  const isOffice = basePath.startsWith("/office");
  const visible = ITEMS.filter((it) => {
    if (isOffice ? it.agentOnly : it.officeOnly) return false;
    if (it.teamsAccess && !canOpenTeams) return false;
    const need = isOffice && it.officeRoles ? it.officeRoles : it.roles;
    return !need || need.some((r) => roles.includes(r));
  });

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
