import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { OfficeSidebar } from "@/components/office/OfficeSidebar";

export default async function OfficePanelLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/office/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, office_id")
    .eq("id", user.id)
    .single();

  if ((profile?.role !== "office_admin" && profile?.role !== "admin") || !profile?.office_id) {
    redirect("/office/login");
  }

  const { data: office } = await supabase.from("offices").select("name").eq("id", profile.office_id).single();

  return (
    <div className="flex min-h-screen bg-bg">
      <OfficeSidebar officeName={office?.name ?? "Оффис"} email={user.email ?? ""} />
      <main className="flex-1 overflow-x-hidden">{children}</main>
    </div>
  );
}
