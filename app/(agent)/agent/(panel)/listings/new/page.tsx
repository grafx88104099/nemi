import Link from "next/link";
import { redirect } from "next/navigation";
import { Clock } from "lucide-react";

import { getMyAgent } from "@/lib/queries-agent";
import { Card, CardBody } from "@/components/ui/card";
import { ListingForm } from "@/components/dashboard/ListingForm";

export default async function NewListingPage() {
  const agent = await getMyAgent();
  if (!agent) redirect("/agent");

  // Pending агент зар оруулж чадахгүй (оффис батлах хүртэл)
  if (agent.status !== "active") {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16 text-center">
        <div className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-amber-100 text-amber-700">
          <Clock className="size-6" />
        </div>
        <h1 className="mt-4 text-xl font-bold text-ink">Баталгаажуулалт хүлээж байна</h1>
        <p className="mt-2 text-muted">
          «{(agent.office?.name as string) ?? "Таны оффис"}» таны бүртгэлийг баталгаажуулсны
          дараа зар оруулах боломжтой болно. Энэ хооронд профайлаа бэлдэж болно.
        </p>
        <Link href="/agent/profile" className="mt-5 inline-block font-semibold text-brand-600 hover:underline">
          Профайл засах →
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="text-2xl font-extrabold text-ink">Шинэ зар нийтлэх</h1>
      <Card className="mt-5">
        <CardBody>
          <ListingForm />
        </CardBody>
      </Card>
    </div>
  );
}
