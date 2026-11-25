import { cache } from "react";

import { createClient } from "@/lib/supabase/server";

/**
 * Нэвтэрсэн хэрэглэгч (auth.getUser — GoTrue-аар JWT-г баталгаажуулна), НЭГ хүсэлтэд нэг удаа.
 * Layout, Topbar, хуудас, getCrmStaffContext бүгд үүнийг хуваалцана — өмнө нь render бүрт
 * 3-4 удаа GoTrue руу дараалан очдог байв. React cache нь Server Component-ийн render дотор л
 * хадгална; Server Action-д шууд дуудагдана (хүсэлт бүрт шинэ).
 */
export const getAuthUser = cache(async () => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
});
