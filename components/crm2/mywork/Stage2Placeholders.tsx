import type { LucideIcon } from "lucide-react";
import { BarChart3, CheckCircle2, Clock3, Wallet } from "lucide-react";

import { getCrm2Context } from "@/lib/crm2/context";
import { COMING_LATER_TEXT } from "@/lib/crm2/labels";
import { crm2Paths, type Crm2Panel } from "@/lib/crm2/paths";
import type { Crm2Context } from "@/lib/crm2/types";
import { Card, CardBody } from "@/components/ui/card";
import { ButtonLink } from "@/components/ui/button";
import { NoAccessState } from "@/components/crm2/ui";

/**
 * Дараагийн шатанд нээгдэх цэсүүдийн түр хуудас (Хүлээлгийн үйлчлүүлэгч, Санхүү,
 * Тайлан): юу нэмэгдэхийг энгийн үгээр, одоо юуг ашиглаж болохыг заана.
 */

type Spec = {
  title: string;
  icon: LucideIcon;
  intro: string;
  coming: string[];
  now?: { text: string; href: (p: ReturnType<typeof crm2Paths>) => string; label: string };
  allowed: (ctx: Crm2Context) => boolean;
  deniedText?: string;
};

const SPECS = {
  waitlist: {
    title: "Хүлээлгийн үйлчлүүлэгч",
    icon: Clock3,
    intro: "Одоогоор тохирох Staff хөрөнгө олдоогүй үйлчлүүлэгчдийг энд хянана.",
    coming: [
      "Тохирох хөрөнгө одоогоор олдоогүй харилцагчийг шаардлагынх нь хамт жагсаалтад нэмэх — одоо байгаа харилцагчийн картыг ашиглана.",
      "Staff-д хөрөнгө нэмэгдэх, өөрчлөгдөх бүрт хүлээж буй хүмүүсийн шаардлагатай харьцуулж, таарсныг хариуцсан агентад мэдэгдэх.",
      "Дахин холбогдох өдөр ба сануулгыг хүн бүрээр тавих.",
      "Санал болгох хөрөнгийг сонгосноор тухайн харилцагчтай шинэ хэлцэл эхлүүлэх.",
    ],
    now: {
      text: "Одоо харилцагчийн карт дээр шаардлагаа бүртгэж, өмнөх хувилбаруудыг нь харж болно.",
      href: (p) => p.contacts(),
      label: "Харилцагчид",
    },
    allowed: () => true,
  },
  finance: {
    title: "Санхүү",
    icon: Wallet,
    intro: "Амжилттай хэлцлийн мөнгөн талыг энд хөтөлнө.",
    coming: [
      "Баталгаажсан хэлцлийн гэрээний скан, хэлцлийн дүн ба валютыг хадгалах; олон зургийг нэг PDF болгох.",
      "Шимтгэлийн нэхэмжлэл үүсгэж, төлөгдсөн дүнг хянах — бүрэн төлөгдөөгүй хэлцэл хаагдахгүй.",
      "Төлбөрийг зөвхөн санхүүгийн эрхтэй ажилтан батална; баталсан хүн, цаг бүртгэгдэнэ.",
      "Шимтгэлийг агентуудад хуваарилах.",
    ],
    allowed: (ctx) => ctx.hasFinance || ctx.isManager,
    deniedText: "Санхүүгийн хэсэг санхүүгийн эрхтэй ажилтан ба удирдлагад харагдана.",
  },
  reports: {
    title: "Тайлан",
    icon: BarChart3,
    intro: "Staff, хэлцэл ба агентуудын ажлын үр дүнгийн тайлан энд гарна.",
    coming: [
      "Сонгосон хугацаа, агент, төсөл, ангиллаар шүүсэн удирдлагын тойм.",
      "Олон дуудлагатай хэлцлийг ганц л хэлцэл гэж, харин дуудлага, үзүүлэлт бүрийг тусад нь тоолох.",
      "Баталгаажсан, цуцлагдсан хэлцэл, орсон шимтгэл ба төлөгдөөгүй дүн.",
      "Хөрөнгийн эзэнд зориулсан тухайн хөрөнгийн тайлан — бусад үйлчлүүлэгчийн хувийн мэдээлэлгүй, илгээхээс өмнө шалгаж татаж авна.",
    ],
    allowed: (ctx) => ctx.isTeamLead || ctx.isManager || ctx.hasFinance,
    deniedText: "Тайлан багийн ахлагч, удирдлага ба санхүүгийн ажилтанд харагдана.",
  },
} satisfies Record<string, Spec>;

export async function Stage2Placeholder({ panel, page }: { panel: Crm2Panel; page: keyof typeof SPECS }) {
  const spec: Spec = SPECS[page];
  const ctx = await getCrm2Context();
  const paths = crm2Paths(panel);
  const Icon = spec.icon;

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-4 sm:py-6 md:px-6">
      <h1 className="text-xl font-extrabold text-ink sm:text-2xl">{spec.title}</h1>
      {!ctx?.isMember || !spec.allowed(ctx) ? (
        <NoAccessState className="mt-4" description={spec.deniedText ?? "CRM-ийн эрхтэй ажилтанд харагдана."} />
      ) : (
        <Card className="mt-4">
          <CardBody className="p-4 sm:p-6">
            <div className="flex items-start gap-3">
              <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-full bg-surface-2 text-subtle" aria-hidden>
                <Icon className="size-5" />
              </span>
              <div className="min-w-0">
                <p className="font-semibold text-ink">{COMING_LATER_TEXT}</p>
                <p className="mt-0.5 text-sm text-muted">{spec.intro}</p>
              </div>
            </div>
            <ul className="mt-4 space-y-2">
              {spec.coming.map((line) => (
                <li key={line} className="flex items-start gap-2 text-sm text-ink">
                  <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-subtle" aria-hidden />
                  <span>{line}</span>
                </li>
              ))}
            </ul>
            {spec.now ? (
              <div className="mt-5 flex flex-col gap-2 rounded-xl bg-surface-2 p-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm text-muted">{spec.now.text}</p>
                <ButtonLink href={spec.now.href(paths)} variant="outline" size="touch" className="shrink-0 self-start sm:self-auto">
                  {spec.now.label}
                </ButtonLink>
              </div>
            ) : null}
          </CardBody>
        </Card>
      )}
    </div>
  );
}
