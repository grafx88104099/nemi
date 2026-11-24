import type { Metadata } from "next";

import { PropertyCardPage, propertyCardTitle } from "@/components/crm2/staff/card/PropertyCardPage";

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  return { title: await propertyCardTitle(id) };
}

/**
 * S03 — Staff хөрөнгийн карт (?tab=info|agreement|publish|calls|showings|deals|history).
 * ?sheet=next|checklist|contract|owner|location|size|price|roles|details|photos|confirm (&field=) — доод цонх
 * (searchParams-ийг бүтнээр нь картад дамжуулна; цонхыг клиент хост URL-аас уншина).
 */
export default async function OfficePropertyCardPage({ params, searchParams }: Props) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  return <PropertyCardPage panel="office" propertyId={id} searchParams={sp} />;
}
