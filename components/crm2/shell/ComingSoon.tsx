import type { LucideIcon } from "lucide-react";
import { Hourglass } from "lucide-react";

import { Card, CardBody } from "@/components/ui/card";
import { COMING_LATER_TEXT } from "@/lib/crm2/labels";

/**
 * Хараахан хийгдээгүй CRM хэсгийн түр хуудас: гарчиг ба «дараагийн шатанд».
 * Дараагийн шатанд жинхэнэ дэлгэцээр солигдоно.
 */
export function ComingSoon({
  title,
  description,
  icon: Icon = Hourglass,
  children,
}: {
  title: string;
  description?: string;
  icon?: LucideIcon;
  children?: React.ReactNode;
}) {
  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-4 sm:py-6 md:px-6">
      <h1 className="text-xl font-extrabold text-ink sm:text-2xl">{title}</h1>
      <Card className="mt-4">
        <CardBody className="flex flex-col items-center gap-2 py-10 text-center">
          <Icon className="size-8 text-subtle" aria-hidden />
          <p className="text-base font-semibold text-ink">{COMING_LATER_TEXT}</p>
          {description ? <p className="max-w-md text-sm text-muted">{description}</p> : null}
        </CardBody>
      </Card>
      {children ? <div className="mt-4">{children}</div> : null}
    </div>
  );
}
