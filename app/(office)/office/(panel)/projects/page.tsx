import { FolderKanban } from "lucide-react";

import { Card, CardBody } from "@/components/ui/card";

export const metadata = { title: "Төсөл — Оффис" };

export default function OfficeProjectsPage() {
  return (
    <div className="p-8">
      <h1 className="text-2xl font-extrabold text-ink">Төсөл</h1>
      <p className="text-sm text-muted">Оффисын төслүүдийн удирдлага</p>
      <Card className="mt-6">
        <CardBody>
          <div className="flex flex-col items-center justify-center gap-4 py-16 text-center">
            <div className="flex size-14 items-center justify-center rounded-2xl bg-brand-50 text-brand-700">
              <FolderKanban className="size-7" />
            </div>
            <div>
              <p className="text-lg font-bold text-ink">Тун удахгүй</p>
              <p className="mt-1 text-sm text-muted">Энэ хэсэг удахгүй нэмэгдэнэ.</p>
            </div>
          </div>
        </CardBody>
      </Card>
    </div>
  );
}
