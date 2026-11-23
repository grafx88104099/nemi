import { createClient } from "@/lib/supabase/server";
import { createPublicClient } from "@/lib/supabase/public";
import { OwnerRequestForm } from "@/components/sell/OwnerRequestForm";
import { BackLink } from "@/components/ui/back-link";

export const metadata = { title: "Оффист зуучлуулах — Нэми" };

export default async function OwnerRequestPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const [{ data: offices }, profile] = await Promise.all([
    // Зөвхөн бодитоор зар нийтэлж буй оффис — зар нь устсан туршилтын/идэвхгүй
    // оффис руу эзний хүсэлт очихгүй (серверийн үйлдэл мөн ижил шалгана).
    createPublicClient()
      .from("offices")
      .select("id, name, listings_count")
      .is("suspended_at", null)
      .gt("listings_count", 0)
      .order("listings_count", { ascending: false }),
    user
      ? supabase.from("profiles").select("full_name, phone").eq("id", user.id).maybeSingle().then((r) => r.data)
      : Promise.resolve(null),
  ]);

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <BackLink href="/sell" label="Зарах руу буцах" />
      <h1 className="text-2xl font-extrabold text-ink">Оффист зуучлуулах хүсэлт</h1>
      <p className="mt-1 text-sm text-muted">
        Мэдэх зүйлээ л бөглөөрэй — агент тантай холбогдоод үлдсэнийг тодруулна.
      </p>
      <div className="mt-6">
        <OwnerRequestForm
          offices={(offices ?? []).map((o) => ({ id: o.id as string, name: o.name as string }))}
          initialName={profile?.full_name ?? ""}
          initialPhone={profile?.phone ?? ""}
        />
      </div>
    </div>
  );
}
