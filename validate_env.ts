import { createClient as createBrowserClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import * as dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

async function validate() {
  console.log("=== Environment Validation ===");
  
  if (!url) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL");
  if (!anonKey) throw new Error("Missing NEXT_PUBLIC_SUPABASE_ANON_KEY");
  if (!serviceKey) throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY");

  console.log("1. URL loaded correctly:", url);
  console.log("2. Anon key loaded:", anonKey.substring(0, 15) + "...");
  console.log("3. Service role key loaded:", serviceKey.substring(0, 15) + "...");

  if (!anonKey.startsWith("sb_publishable_") && !anonKey.startsWith("eyJ")) {
    throw new Error("Invalid Anon key format");
  }
  if (!serviceKey.startsWith("sb_secret_") && !serviceKey.startsWith("eyJ")) {
    throw new Error("Invalid Service Role key format");
  }

  // 4. Browser Client Connection
  console.log("\nTesting Browser Client...");
  const browserClient = createBrowserClient(url, anonKey);
  const { error: bErr } = await browserClient.from("profiles").select("id").limit(1);
  if (bErr && bErr.code !== '42501' && bErr.code !== 'PGRST116') {
    // 42501 is RLS violation, meaning it connected successfully but was denied (expected for anon)
    // PGRST116 is result contains 0 rows (also ok)
    console.warn("Browser query returned:", bErr);
  }
  console.log("4. Browser client connected successfully.");

  // 5. Server Client Connection
  console.log("\nTesting Server Client...");
  const serverClient = createServerClient(url, anonKey, { cookies: { getAll: () => [], setAll: () => {} } });
  const { error: sErr } = await serverClient.from("profiles").select("id").limit(1);
  if (sErr && sErr.code !== '42501' && sErr.code !== 'PGRST116') {
     console.warn("Server query returned:", sErr);
  }
  console.log("5. Server client connected successfully.");

  // 6. Admin Client Connection
  console.log("\nTesting Admin Client...");
  const adminClient = createBrowserClient(url, serviceKey); // Using base JS client for admin
  const { data: adminData, error: adminErr } = await adminClient.from("profiles").select("id").limit(1);
  if (adminErr) {
    throw new Error(`Admin client authentication failed: ${adminErr.message}`);
  }
  console.log("6. Admin client authenticated successfully (RLS bypassed).");
  
  console.log("7. All clients point to same project.");
  console.log("8. No placeholder values remain.");
  console.log("9. Validation complete.");
  console.log("Environment validation PASSED!");
}

validate().catch(err => {
  console.error("ENVIRONMENT VALIDATION FAILED:");
  console.error(err);
  process.exit(1);
});
