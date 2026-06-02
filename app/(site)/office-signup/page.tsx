import { Building2 } from "lucide-react";

import { Card, CardBody } from "@/components/ui/card";
import { OfficeRequestForm } from "@/components/office/OfficeRequestForm";

export const metadata = { title: "Оффис нээх — Нэми" };

export default function OfficeSignupPage() {
  return (
    <div className="mx-auto max-w-lg px-4 py-12">
      <div className="text-center">
        <div className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-brand-50 text-brand-600">
          <Building2 className="size-6" />
        </div>
        <h1 className="mt-4 text-2xl font-extrabold text-ink">Үл хөдлөхийн оффис нээх</h1>
        <p className="mt-2 text-sm text-muted">
          Хүсэлт илгээснээр Нэми админ хянаж баталгаажуулна. Баталгаажсаны дараа та
          оффисын самбараас өөрийн агентуудыг бүртгэх боломжтой болно.
        </p>
      </div>
      <Card className="mt-6">
        <CardBody>
          <OfficeRequestForm />
        </CardBody>
      </Card>
    </div>
  );
}
