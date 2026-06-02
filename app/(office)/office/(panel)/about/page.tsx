import { getMyOffice } from "@/lib/queries-office";
import { Card, CardBody } from "@/components/ui/card";
import { OfficeAboutForm } from "@/components/office/OfficeAboutForm";

export const metadata = { title: "Танилцуулга — Оффис" };

export default async function OfficeAboutPage() {
  const data = await getMyOffice();
  if (!data) return null;
  const { office } = data;

  return (
    <div className="p-8">
      <h1 className="text-2xl font-extrabold text-ink">Оффисын танилцуулга</h1>
      <p className="text-sm text-muted">Нийтэд харагдах танилцуулга мэдээллээ оруулна уу</p>
      <Card className="mt-6">
        <CardBody>
          <OfficeAboutForm
            officeName={(office.name as string) ?? ""}
            logo={(office.logo as string) ?? "OF"}
            color={(office.color as string) ?? "#C2410C"}
            verified={(office.verified as boolean) ?? false}
            initial={{
              description: (office.description as string) ?? "",
              about: (office.about as string) ?? "",
              website: (office.website as string) ?? "",
              founded_year: office.founded_year ? String(office.founded_year) : "",
              license_no: (office.license_no as string) ?? "",
              facebook: (office.facebook as string) ?? "",
              instagram: (office.instagram as string) ?? "",
              logo_url: (office.logo_url as string) ?? "",
              cover_url: (office.cover_url as string) ?? "",
              specialties: ((office.specialties as string[]) ?? []).join(", "),
              service_areas: ((office.service_areas as string[]) ?? []).join(", "),
            }}
          />
        </CardBody>
      </Card>
    </div>
  );
}
