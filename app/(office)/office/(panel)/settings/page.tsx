import { getMyOffice } from "@/lib/queries-office";
import { Card, CardBody } from "@/components/ui/card";
import { OfficeSettingsForm } from "@/components/office/OfficeSettingsForm";

export const metadata = { title: "Тохиргоо — Оффис" };

export default async function OfficeSettingsPage() {
  const data = await getMyOffice();
  if (!data) return null;
  const { office } = data;

  return (
    <div className="p-8">
      <h1 className="text-2xl font-extrabold text-ink">Оффисын тохиргоо</h1>
      <p className="text-sm text-muted">Оффисын мэдээллээ шинэчлэх</p>
      <Card className="mt-6">
        <CardBody>
          <OfficeSettingsForm
            initial={{
              name: (office.name as string) ?? "",
              logo: (office.logo as string) ?? "",
              color: (office.color as string) ?? "#C2410C",
              phone: (office.phone as string) ?? "",
              email: (office.email as string) ?? "",
              address: (office.address as string) ?? "",
            }}
          />
        </CardBody>
      </Card>
    </div>
  );
}
