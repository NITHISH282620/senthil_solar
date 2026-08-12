import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function verifyMigration(tableName: string) {
  const { error } = await supabase.from(tableName).select("id").limit(1);
  if (error && error.code === 'PGRST205') {
    console.error(`FAILURE: Table '${tableName}' does not exist.`);
    process.exit(1);
  } else if (error && error.code !== 'PGRST116') {
    console.warn(`Warning: Query returned ${error.code}: ${error.message}`);
  }
  console.log(`SUCCESS: Table '${tableName}' exists and is accessible.`);
}

const tableToVerify = process.argv[2];
if (!tableToVerify) {
  console.error("Please provide a table name to verify.");
  process.exit(1);
}

verifyMigration(tableToVerify);
