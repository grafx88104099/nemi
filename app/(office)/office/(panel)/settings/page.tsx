import { getMyOffice, getSampleListingPhoto } from "@/lib/queries-office";
import { Card, CardBody } from "@/components/ui/card";
import { OfficeSettingsForm } from "@/components/office/OfficeSettingsForm";
import { WatermarkSettings } from "@/components/office/WatermarkSettings";

export const metadata = { title: "Тохиргоо — Оффис" };

export default async function OfficeSettingsPage() {
  const data = await getMyOffice();
  if (!data) return null;
  const { office } = data;
  const samplePhoto = await getSampleListingPhoto(data.listings.map((l) => l.id));

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
      <Card className="mt-6">
        <CardBody>
          <WatermarkSettings
            initialEnabled={(office.watermark_enabled as boolean) ?? false}
            logoUrl={(office.logo_url as string | null) ?? null}
            label={(office.name as string) ?? ""}
            samplePhotoUrl={samplePhoto}
          />
        </CardBody>
      </Card>
    </div>
  );
}
