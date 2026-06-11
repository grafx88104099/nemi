import Link from "next/link";
import { Calendar, MapPin } from "lucide-react";

import { createClient } from "@/lib/supabase/server";
import { getMyViewings } from "@/lib/queries-user";
import { Card, CardBody } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { LoginPrompt } from "@/components/auth/LoginPrompt";
import { fmtMNT } from "@/lib/format";
import { BackLink } from "@/components/ui/back-link";

const STATUS: Record<string, { label: string; tone: "amber" | "green" | "neutral" | "rose" }> = {
  pending: { label: "Хүлээгдэж буй", tone: "amber" },
  confirmed: { label: "Баталгаажсан", tone: "green" },
  done: { label: "Болсон", tone: "neutral" },
  cancelled: { label: "Цуцалсан", tone: "rose" },
};

export default async function ToursPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return <LoginPrompt desc="Үзлэгийн цагаа харахын тулд нэвтэрнэ үү." next="/tours" />;

  const viewings = await getMyViewings();

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <BackLink />
      <h1 className="text-2xl font-extrabold text-ink">Үзлэгийн цаг</h1>
      <p className="mt-1 text-sm text-muted">{viewings.length} товлолт</p>
      {viewings.length === 0 ? (
        <p className="py-20 text-center text-muted">Одоогоор товлосон үзлэг алга. Зар дээрээс «Үзлэг товлох» дарна уу.</p>
      ) : (
        <div className="mt-6 space-y-3">
          {viewings.map((v) => (
            <Card key={v.id}>
              <CardBody className="flex items-center gap-4">
                {v.listing?.photo && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={v.listing.photo} alt="" className="size-20 rounded-xl object-cover" />
                )}
                <div className="flex-1">
                  <Link href={`/listings/${v.listing?.id}`} className="font-bold text-ink hover:underline">
                    {v.listing?.title}
                  </Link>
                  <div className="mt-1 flex items-center gap-3 text-sm text-muted">
                    <span className="flex items-center gap-1"><MapPin className="size-3.5" /> {v.listing?.district}</span>
                    {v.listing && <span>{fmtMNT(v.listing.price)}</span>}
                  </div>
                  <div className="mt-1 flex items-center gap-1 text-sm text-muted">
                    <Calendar className="size-3.5" />
                    {v.scheduled_at ? new Date(v.scheduled_at).toLocaleString("mn-MN") : "—"}
                    {v.agent && <span>· {v.agent.display_name}</span>}
                  </div>
                </div>
                <Badge tone={STATUS[v.status]?.tone ?? "neutral"}>{STATUS[v.status]?.label ?? v.status}</Badge>
              </CardBody>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
