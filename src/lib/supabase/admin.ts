import { createClient } from "@supabase/supabase-js";
import { requireSupabaseEnv } from "@/lib/env";

// Admin client with service role key — use only in server-side code
// for operations that bypass RLS (e.g., creating user profiles on signup)
export function createAdminClient() {
  const env = requireSupabaseEnv();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY is not set. Required for admin operations.",
    );
  }

  return createClient(env.url, serviceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
