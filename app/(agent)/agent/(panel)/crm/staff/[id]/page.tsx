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

/** S03 — Staff хөрөнгийн карт (?tab=info|agreement|calls|showings|deals|history). */
export default async function AgentPropertyCardPage({ params, searchParams }: Props) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  return <PropertyCardPage panel="agent" propertyId={id} searchParams={sp} />;
}
