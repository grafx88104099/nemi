import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

/**
 * CRM-ийн эхний дэлгэц — Staff жагсаалт. Утсанд суулгасан апп (manifest start_url = /agent/crm)
 * энд нээгддэг: оффисын админ оффисын панелийн CRM руу — тэнд CRM ба оффисын бүх цэс
 * (самбар, агентууд, зарууд, тохиргоо) нэг дор. iPhone-д суусан апп start_url-аа хадгалдаг тул
 * manifest-ийг биш энэ хуудсыг өөрчилсөн.
 */
export default async function AgentCrmIndexPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) {
    const { data: profile } = await supabase.from("profiles").select("role, office_id").eq("id", user.id).maybeSingle();
    if (profile?.role === "office_admin" && profile.office_id) redirect("/office/crm");
  }
  redirect("/agent/crm/staff");
}
