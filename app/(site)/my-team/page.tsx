import Link from "next/link";
import { ShieldCheck, MessageCircle } from "lucide-react";

import { createClient } from "@/lib/supabase/server";
import { Card, CardBody } from "@/components/ui/card";
import { Avatar } from "@/components/ui/avatar";
import { LoginPrompt } from "@/components/auth/LoginPrompt";
import { BackLink } from "@/components/ui/back-link";

export default async function MyTeamPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return <LoginPrompt desc="Харьцсан агентуудаа харахын тулд нэвтэрнэ үү." next="/my-team" />;

  const { data } = await supabase
    .from("conversations")
    .select("id, agent:agents(id, display_name, avatar, verified, specialty, phone, office:offices(name, color))")
    .eq("buyer_id", user.id);

  // Давхардлыг арилгах (агентаар)
  const seen = new Set<string>();
  const agents = (data ?? [])
    .map((c) => (c as unknown as { agent: { id: string; display_name: string; avatar: string | null; verified: boolean; specialty: string | null; phone: string | null; office: { name: string; color: string | null } | null } | null }).agent)
    .filter((a): a is NonNullable<typeof a> => {
      if (!a || seen.has(a.id)) return false;
      seen.add(a.id);
      return true;
    });

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <BackLink />
      <h1 className="text-2xl font-extrabold text-ink">Миний баг</h1>
      <p className="mt-1 text-sm text-muted">Таны харьцаж байсан агентууд</p>
      {agents.length === 0 ? (
        <p className="py-16 text-center text-muted">Одоогоор харьцсан агент алга. Зар дээрээс агенттай чатлаж эхэлнэ үү.</p>
      ) : (
        <div className="mt-6 space-y-3">
          {agents.map((a) => (
            <Card key={a.id}>
              <CardBody className="flex items-center gap-3">
                <Avatar initials={a.avatar ?? "NA"} color={a.office?.color ?? "#C2410C"} size="md" />
                <div className="min-w-0 flex-1">
                  <Link href={`/agents/${a.id}`} className="flex items-center gap-1 font-bold text-ink hover:underline">
                    {a.display_name}
                    {a.verified && <ShieldCheck className="size-4 text-emerald-600" />}
                  </Link>
                  <div className="text-sm text-muted">{a.office?.name} · {a.specialty}</div>
                </div>
                {a.phone && (
                  <a href={`tel:${a.phone}`} className="rounded-lg p-2 text-brand-600 hover:bg-surface-2" title={a.phone}>
                    <MessageCircle className="size-5" />
                  </a>
                )}
              </CardBody>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
