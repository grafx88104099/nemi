import type { Metadata } from "next";

import { DealPage, dealTitle } from "@/components/crm2/deals/DealPage";

type Props = { params: Promise<{ id: string; dealId: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { dealId } = await params;
  return { title: await dealTitle(dealId) };
}

/** Хэлцлийн хуудас (хөрөнгө × харилцагч). */
export default async function AgentDealPage({ params }: Props) {
  const { id, dealId } = await params;
  return <DealPage panel="agent" propertyId={id} dealId={dealId} />;
}
