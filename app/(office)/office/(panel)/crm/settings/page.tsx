import Link from "next/link";
import {
  GitBranch,
  Gauge,
  Percent,
  Map,
  Workflow,
  BellRing,
  ListTree,
  Users2,
  PiggyBank,
  ChevronRight,
} from "lucide-react";

import { Card, CardBody } from "@/components/ui/card";
import { requireSettingsAccess } from "./_lib/guard";

export const metadata = { title: "CRM тохиргоо — Оффис" };

const SECTIONS = [
  {
    href: "/office/crm/settings/pipelines",
    icon: GitBranch,
    title: "Урсгал, шат, шилжих шалгуур",
    desc: "Борлуулалтын урсгал, шатны магадлал, шилжилтийн дүрэм, шилжих шалгуурын шаардлага",
  },
  {
    href: "/office/crm/settings/scoring",
    icon: Gauge,
    title: "Оноо, жин, босго",
    desc: "Сэжимийн оноо, тохируулгын жин, ангиллын босго (хувилбартай)",
  },
  {
    href: "/office/crm/settings/commissions",
    icon: Percent,
    title: "Шимтгэлийн журам",
    desc: "5 журмын хувилбар, түрээсийн хөлсний шатлал, ханшийн хүснэгт",
  },
  {
    href: "/office/crm/settings/zones",
    icon: Map,
    title: "Бүс, салбар, баг",
    desc: "Бүсийн лавлах, салбар, багийн бүтэц",
  },
  {
    href: "/office/crm/settings/rules",
    icon: Workflow,
    title: "Автомат дүрэм, SLA, хуанли",
    desc: "Автомат дүрмийн идэвх, туршилтын горим, SLA босго, ажлын өдрийн хуанли",
  },
  {
    href: "/office/crm/settings/notifications",
    icon: BellRing,
    title: "Мэдэгдлийн матриц",
    desc: "Мэдэгдэл бүрийн хүлээн авагч дүр, суваг, заавал ангилал",
  },
  {
    href: "/office/crm/settings/lookups",
    icon: ListTree,
    title: "Лавлах жагсаалтууд",
    desc: "Эх сурвалж, алдсан шалтгаан, шошго, засварын ангилал…",
  },
  {
    href: "/office/crm/settings/staff",
    icon: Users2,
    title: "Ажилтан, дүр",
    desc: "CRM-ийн ажилтны бүртгэл, дүрийн оноолт, гарах урсгал",
  },
  {
    href: "/office/crm/settings/budget",
    icon: PiggyBank,
    title: "Төсөв, KPI жишиг",
    desc: "Сар, салбарын төсөв, KPI-ийн жишиг, чанарын аудит, аяны зардал",
  },
];

export default async function CrmSettingsIndexPage() {
  await requireSettingsAccess();
  return (
    <div className="p-8">
      <h1 className="text-2xl font-extrabold text-ink">CRM тохиргоо</h1>
      <p className="text-sm text-muted">
        Бүх параметр хувилбартай хадгалагдана — өөрчлөлт зөвхөн урагш үйлчилнэ, хуучин тооцоо өөрчлөгдөхгүй.
      </p>
      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
        {SECTIONS.map((s) => (
          <Link key={s.href} href={s.href} className="group">
            <Card className="h-full transition group-hover:border-brand-200 group-hover:shadow">
              <CardBody className="flex items-start gap-4">
                <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-700">
                  <s.icon className="size-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-bold text-ink">{s.title}</p>
                  <p className="mt-0.5 text-sm text-muted">{s.desc}</p>
                </div>
                <ChevronRight className="mt-1 size-4 shrink-0 text-subtle" />
              </CardBody>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
