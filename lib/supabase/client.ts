import { createBrowserClient } from "@supabase/ssr";

import type { Database } from "@/types/database";

/**
 * Browser (client component) Supabase client.
 * Зөвхөн NEXT_PUBLIC_* түлхүүр ашиглана — RLS бодлогоор хамгаалагдсан.
 */
export function createClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
