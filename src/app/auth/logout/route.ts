import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const supabase = await createClient();
  await supabase.auth.signOut();
  
  const url = new URL("/login", request.url);
  url.searchParams.set("error", "Your user profile is missing. Please contact support or recreate it.");
  
  return NextResponse.redirect(url);
}
