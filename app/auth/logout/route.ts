import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";

// Logout-г POST-оор хийнэ (CSRF хамгаалалт). UI-д LogoutButton (client signOut)
// ашигладаг; энэ endpoint нь сервер талын нөөц хувилбар.
export async function POST(request: Request) {
  const supabase = await createClient();
  await supabase.auth.signOut();
  return NextResponse.redirect(new URL("/", request.url), { status: 303 });
}
