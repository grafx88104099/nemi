import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { Topbar } from "@/components/layout/Topbar";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/agent/login?next=/agent");

  return (
    <>
      <Topbar />
      <main className="flex-1 bg-bg">{children}</main>
    </>
  );
}
