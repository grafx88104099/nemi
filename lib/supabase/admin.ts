import { createClient as createSupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/types/database";

/**
 * Service-role client — RLS-ийг тойрно. ЗӨВХӨН серверт (webhook, cron,
 * системийн бичилт). Хэрэглэгчийн хүсэлтэд хэзээ ч бүү ашигла.
 */
export function createAdminClient() {
  return createSupabaseClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}
