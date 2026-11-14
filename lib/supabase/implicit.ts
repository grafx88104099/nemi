import { createClient as createSupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/types/database";

/**
 * Анон client — PKCE-гүй (implicit flow), session хадгалахгүй.
 *
 * ЯАГААД: `@supabase/ssr`-ийн хөтчийн client нь үргэлж PKCE ажиллуулдаг.
 * Нууц үг сэргээх захидлыг PKCE-ээр илгээвэл Supabase холбоосыг `?code=`-оор
 * буцаах ба түүнийг session болгон солихын тулд ХҮСЭЛТ ИЛГЭЭСЭН тэр хөтөчид
 * үлдсэн `code verifier` cookie зайлшгүй хэрэгтэй. Хэрэглэгч захидлаа өөр
 * хөтөч, утас эсвэл Gmail-ийн дотоод browser дээр нээвэл тэр cookie байхгүй
 * тул солилт амжилтгүй болж, шинэ нууц үг үүсгэх хэсэг огт ажилладаггүй.
 *
 * Иймд сэргээх захидлыг энэ client-ээр илгээнэ: flow state үүсэхгүй тул
 * Supabase токеныг URL hash-аар (#access_token=…) буцаана → /auth/confirm
 * хуудас setSession хийнэ (агентын урилга мөн ингэж ажилладаг).
 */
export function createImplicitClient() {
  return createSupabaseClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: {
        flowType: "implicit",
        autoRefreshToken: false,
        persistSession: false,
        detectSessionInUrl: false,
      },
    }
  );
}
