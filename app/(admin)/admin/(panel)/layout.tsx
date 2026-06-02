import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { AdminSidebar } from "@/components/admin/AdminSidebar";

export default async function AdminPanelLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/admin/login");

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (profile?.role !== "admin") redirect("/admin/login");

  return (
    <div className="flex min-h-screen bg-bg">
      <AdminSidebar email={user.email ?? ""} />
      <main className="flex-1 overflow-x-hidden">{children}</main>
    </div>
  );
}
