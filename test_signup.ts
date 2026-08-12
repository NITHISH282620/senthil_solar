import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl!, supabaseKey!);

async function main() {
  console.log("Attempting to sign up E2E test user...");
  
  // Use a random email to avoid rate limits / existing users
  const randomEmail = `e2etest${Date.now()}@solarops.com`;
  
  const { data, error } = await supabase.auth.signUp({
    email: randomEmail,
    password: "password123",
  });

  if (error) {
    console.error("SignUp error:", error);
    process.exit(1);
  } else {
    console.log("SignUp success!");
    console.log("User ID:", data.user?.id);
    console.log("Checking if auto-profile trigger worked...");
    
    // We can't select from profiles as an anon user unless RLS allows it.
    // Wait, profiles_select_all allows reading all active profiles!
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", data.user?.id)
      .single();
      
    if (profileError) {
      console.error("Profile fetch error:", profileError);
    } else {
      console.log("SUCCESS! Auto-created Profile:", profile);
    }
  }
}

main();
