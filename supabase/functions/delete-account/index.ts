// ============================================================
// delete-account — Edge Function (мобайл аппын "Бүртгэл устгах")
// MOBILE_APP_PLAN.md §2.2 — App Store (2022+) / Google Play (2024+)
// заавал шаардлага: апп дотроос бүртгэл устгах зам.
//
// Урсгал:
//   1. Дуудагчийг Authorization JWT-ээс таньж авна (verify_jwt = true).
//   2. profiles.role != 'buyer' ЭСВЭЛ agents мөр (profile_id = user.id)
//      байвал 403-аар ТАТГАЛЗАНА — агентын public directory мөр болон
//      зарууд орфон болохоос сэргийлнэ. Шалгалтыг service-role-оор хийнэ
//      (profiles нь own-row RLS-тэй тул user JWT-ээр ч уншигдана, харин
//      agents шалгалтыг найдвартай болгохын тулд service-role хэрэглэв).
//   3. auth.admin.deleteUser(user.id) — FK cascade бусдыг цэвэрлэнэ.
//
// FK семантик (миграциудаас шалгаж баталгаажуулсан, 2026-07-18):
//   auth.users(id)-г шууд заадаг:
//     profiles.id                → on delete CASCADE   (20260601000100 init_schema:31)
//     analytics_events.user_id   → on delete SET NULL  (20260718000100 mobile_support:30)
//   profiles(id)-г заадаг (profiles устахад cascade-аар дамжина):
//     favorites.user_id          → CASCADE  (init_schema:178) — мөр устна
//     saved_searches.user_id     → CASCADE  (init_schema:186) — мөр устна
//     recently_viewed.user_id    → CASCADE  (init_schema:194) — мөр устна
//     notifications.user_id      → CASCADE  (init_schema:306) — мөр устна
//     conversations.buyer_id     → CASCADE  (init_schema:226) — харилцан яриа
//         устна; messages нь conversation_id CASCADE тул хамт устна
//     messages.sender_id         → SET NULL (init_schema:235) — өөр
//         conversation-д (жишээ нь agent тал) үлдсэн мессежийн sender_id null болно
//     viewings.buyer_id          → SET NULL (init_schema:251) — үзэлтийн
//         түүх агентад үлдэнэ, buyer_id null болно
//     reviews.author_id          → SET NULL (init_schema:263) — сэтгэгдэл
//         үлдэнэ, зохиогч null ("устгагдсан хэрэглэгч") болно
//     agents.profile_id          → SET NULL (init_schema:86) — гэхдээ agents
//         мөртэй хэрэглэгчийг энэ функц огт устгахгүй (403)
//     office_invites.created_by/used_by → SET NULL (20260601001100)
//     office_requests.requester_id      → CASCADE  (20260601000800:12)
//     office_requests.reviewed_by       → NO ACTION (20260601000800:18) —
//         устгалтыг БЛОКЛОЖ болно, гэхдээ reviewed_by нь зөвхөн
//         office/admin role тул 'buyer' шалгалт үүнийг аль хэдийн хаадаг
//     tasks.created_by/responsible_id, task_assignees.profile_id,
//     task_comments.author_id           → CASCADE  (20260611000100) —
//         оффис/агентын модуль тул buyer-т мөр байхгүй байх ёстой
//
// Deploy:
//   supabase functions deploy delete-account
//   (verify_jwt нь default true — JWT-гүй хүсэлтийг gateway дээр хаана.
//    SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY нь Edge
//    runtime-д автоматаар inject хийгддэг — гараар secret тохируулах шаардлагагүй.)
//
// Гар тест (Deno тест-н оронд):
//   1. buyer хэрэглэгчээр нэвтэрч access_token авна:
//      curl -X POST "$SUPABASE_URL/auth/v1/token?grant_type=password" \
//        -H "apikey: $ANON" -H "Content-Type: application/json" \
//        -d '{"email":"buyer@test.mn","password":"..."}'
//   2. Функц дуудна (амжилт → 200 {"ok":true}):
//      curl -X POST "$SUPABASE_URL/functions/v1/delete-account" \
//        -H "Authorization: Bearer $ACCESS_TOKEN" -H "apikey: $ANON"
//   3. Шалгах: auth.users-с мөр устсан; favorites/saved_searches/
//      recently_viewed/notifications хоосон; viewings.buyer_id,
//      reviews.author_id, messages.sender_id null болсон;
//      analytics_events.user_id null болсон.
//   4. agent role-той хэрэглэгчээр давтахад → 403, мөр хэвээр.
//   5. JWT-гүй дуудахад → gateway 401.
//   6. Flutter талаас: Supabase.instance.client.functions.invoke('delete-account')
//      → амжилтын дараа клиент өөрөө signOut() хийнэ (§2.2 spec 3).
// ============================================================

import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: Record<string, unknown>, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  // supabase_flutter functions.invoke() нь POST + preflight OPTIONS илгээдэг.
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return json({ ok: false, error: "Method not allowed" }, 405);
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return json({ ok: false, error: "Нэвтрэлт шаардлагатай." }, 401);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;

  // Дуудагчийг JWT-ээс нь таних — anon key + дамжуулсан Authorization header.
  const userClient = createClient(
    supabaseUrl,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );

  const {
    data: { user },
    error: userError,
  } = await userClient.auth.getUser();
  if (userError || !user) {
    return json({ ok: false, error: "Нэвтрэлт шаардлагатай." }, 401);
  }

  // Service-role: RLS-ийг тойрч role + agents шалгалт, дараа нь admin delete.
  // (SUPABASE_SERVICE_ROLE_KEY нь Edge runtime-д автоматаар inject хийгддэг.)
  const adminClient = createClient(
    supabaseUrl,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  const [profileRes, agentRes] = await Promise.all([
    adminClient
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle(),
    adminClient
      .from("agents")
      .select("id")
      .eq("profile_id", user.id)
      .limit(1)
      .maybeSingle(),
  ]);

  if (profileRes.error || agentRes.error) {
    console.error("delete-account: lookup failed", {
      userId: user.id,
      profileError: profileRes.error?.message,
      agentError: agentRes.error?.message,
    });
    return json(
      { ok: false, error: "Түр зуурын алдаа гарлаа. Дахин оролдоно уу." },
      500,
    );
  }

  // profiles мөр байхгүй (орфон auth user — trigger-ээс өмнө үүссэн эсвэл
  // profile гараар устгагдсан) бол buyer-тэй адил устгаж БОЛНО; зөвхөн
  // бодит non-buyer role эсвэл agents мөртэй үед л татгалзана.
  const role = profileRes.data?.role;
  if (
    (profileRes.data !== null && role !== "buyer") ||
    agentRes.data !== null
  ) {
    return json(
      {
        ok: false,
        error:
          "Агентын бүртгэлийг аппаас устгах боломжгүй. Оффисын админтайгаа эсвэл дэмжлэгийн багтай холбогдоно уу.",
      },
      403,
    );
  }

  const { error: deleteError } = await adminClient.auth.admin.deleteUser(
    user.id,
  );
  if (deleteError) {
    console.error("delete-account: deleteUser failed", {
      userId: user.id,
      error: deleteError.message,
    });
    return json(
      { ok: false, error: "Бүртгэл устгахад алдаа гарлаа. Дахин оролдоно уу." },
      500,
    );
  }

  return json({ ok: true }, 200);
});
