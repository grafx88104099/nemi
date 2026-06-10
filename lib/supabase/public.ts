import { createClient as createSupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/types/database";

/**
 * Cookie-гүй анон client — зөвхөн НИЙТИЙН (RLS public) уншилтад зориулсан.
 * unstable_cache дотор cookies() ашиглах боломжгүй тул кэшлэх public query-д
 * үүнийг хэрэглэнэ. Хэрэглэгчийн session-аас хамаарахгүй.
 */
export function createPublicClient() {
  return createSupabaseClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}
