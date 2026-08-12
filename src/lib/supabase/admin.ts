import { createClient } from "@supabase/supabase-js";
import { requireSupabaseEnv, getServiceRoleKey } from "@/lib/env";

// Admin client with service role key — use only in server-side code
// for operations that bypass RLS (e.g., creating user profiles on signup)
export function createAdminClient() {
  const env = requireSupabaseEnv();
  const serviceKey = getServiceRoleKey();
  if (!serviceKey) {
    throw new Error(
      "SUPABASE_SECRET_KEY (or legacy SUPABASE_SERVICE_ROLE_KEY) is not set. " +
        "Required for admin operations such as creating employee accounts.",
    );
  }

  return createClient(env.url, serviceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
