import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing Supabase env vars");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
  console.log("Checking for test users...");
  
  // Create admin
  const adminEmail = "admin@solarops.com";
  const password = "password123";
  
  // Let's just create an admin user
  const { data: adminAuth, error: adminErr } = await supabase.auth.admin.createUser({
    email: adminEmail,
    password: password,
    email_confirm: true,
  });

  if (adminErr) {
    console.log("Admin creation error (might exist):", adminErr.message);
  } else {
    console.log("Created auth admin:", adminAuth.user.id);
    await supabase.from("profiles").upsert({
      id: adminAuth.user.id,
      employee_id: "EMP-001",
      full_name: "Admin User",
      email: adminEmail,
      role: "admin",
      is_active: true
    });
  }

  // Create employee
  const empEmail = "employee@solarops.com";
  const { data: empAuth, error: empErr } = await supabase.auth.admin.createUser({
    email: empEmail,
    password: password,
    email_confirm: true,
  });

  if (empErr) {
    console.log("Employee creation error (might exist):", empErr.message);
  } else {
    console.log("Created auth employee:", empAuth.user.id);
    await supabase.from("profiles").upsert({
      id: empAuth.user.id,
      employee_id: "EMP-002",
      full_name: "Test Employee",
      email: empEmail,
      role: "employee",
      is_active: true
    });
  }
  
  console.log("Done.");
  console.log("--- CREDENTIALS ---");
  console.log("Admin: admin@solarops.com / password123");
  console.log("Employee: employee@solarops.com / password123");
}

main();
