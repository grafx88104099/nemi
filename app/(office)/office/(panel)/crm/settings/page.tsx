import Link from "next/link";
import { redirect } from "next/navigation";
import { Bell, ChevronRight, GitBranch, SlidersHorizontal, UserCog, UsersRound, type LucideIcon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardBody } from "@/components/ui/card";
import { getCrm2Context } from "@/lib/crm2/context";
import { getCrmStaffContext } from "@/lib/queries-crm-core";
import { canManageTeams, hasTeamProgressRole } from "@/lib/queries-crm-teams";
import { SETTINGS_VIEW_ROLES } from "./_lib/guard";

export const metadata = { title: "CRM тохиргоо — Оффис" };

type Section = { href: string | null; icon: LucideIcon; title: string; desc: string };

/**
 * CRM тохиргооны нүүр: Staff-ийн дүрэм (crm2), агент ба эрх, баг, салбар, мэдэгдэл. Хэсэг бүр өөрийн
 * хуудсандаа эрхийг давхар шалгана; энд зөвхөн харах эрхтэйг жагсаана.
 */
export default async function CrmSettingsPage() {
  const [ctx, canManage, ctx2] = await Promise.all([getCrmStaffContext(), canManageTeams(), getCrm2Context()]);
  if (!ctx) redirect("/office");

  const settingsRole = ctx.roles.some((r) => (SETTINGS_VIEW_ROLES as readonly string[]).includes(r));
  // crm2-ийн бизнес дүрэм: удирдлага, тохиргоо удирдагч харна (засах эрхийг хуудас өөрөө шалгана).
  const policiesRole = !!ctx2?.isMember && (ctx2.canManageSettings || ctx2.isManager || ctx2.isOfficeAdmin);
  const sections: Section[] = [
    ...(policiesRole
      ? [
          {
            href: "/office/crm/settings/policies",
            icon: SlidersHorizontal,
            title: "Staff-ийн дүрэм, анхдагч утга",
            desc: "Ангилал, гэрээ батлагч, эрх, сануулгын хугацаа, архивын дүрэм, файлын хязгаар",
          },
        ]
      : []),
    ...(settingsRole
      ? [
          {
            href: "/office/crm/settings/staff",
            icon: UserCog,
            title: "Агент, хэрэглэгчийн эрх",
            desc: "CRM-ийн дүр, салбар, баг, панелийн админ, чөлөө, гарах урсгал",
          },
        ]
      : []),
    ...(canManage || hasTeamProgressRole(ctx.roles)
      ? [
          {
            href: "/office/crm/teams",
            icon: UsersRound,
            title: "Багууд",
            desc: "Багийн бүрэлдэхүүн, ахлагч томилох, батлах, бүх багийн явц",
          },
        ]
      : []),
    ...(settingsRole
      ? [
          {
            href: "/office/crm/settings/branches",
            icon: GitBranch,
            title: "Салбар",
            desc: "Багуудын харьяалах салбарын жагсаалт",
          },
        ]
      : []),
    {
      href: "/office/crm/notifications",
      icon: Bell,
      title: "Мэдэгдэл",
      desc: "Танд ирсэн CRM-ийн бүх мэдэгдэл",
    },
  ];

  return (
    <div className="mx-auto w-full max-w-5xl p-4 sm:p-8">
      <h1 className="text-2xl font-extrabold text-ink">CRM тохиргоо</h1>
      <p className="text-sm text-muted">Өөрчлөлт бүр аудитад бүртгэгдэнэ.</p>
      <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
        {sections.map((s) => {
          const body = (
            <CardBody className="flex min-h-full items-start gap-3 p-4">
              <s.icon className="mt-0.5 size-5 shrink-0 text-brand-600" aria-hidden />
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-2 font-semibold text-ink">
                  {s.title}
                  {s.href ? null : <Badge tone="neutral">удахгүй</Badge>}
                </p>
                <p className="mt-0.5 text-sm text-muted">{s.desc}</p>
              </div>
              {s.href ? <ChevronRight className="mt-0.5 size-4 shrink-0 text-subtle" aria-hidden /> : null}
            </CardBody>
          );
          return s.href ? (
            <Link key={s.title} href={s.href} className="block rounded-2xl transition hover:shadow-md">
              <Card className="h-full">{body}</Card>
            </Link>
          ) : (
            <Card key={s.title} className="h-full opacity-80">
              {body}
            </Card>
          );
        })}
      </div>
    </div>
  );
}
