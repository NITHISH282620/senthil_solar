import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

/**
 * Signing out is a mutation, so it answers to POST and nothing else.
 *
 * This handler used to sign out on GET, and the sign-out control was an
 * ordinary <Link>. Next.js prefetches links in the viewport, so the request
 * fired the moment the page rendered: anyone who merely LANDED on
 * /unauthorized was signed out before touching anything, and the page meant to
 * explain the problem became the thing that caused a second one.
 *
 * A destructive GET is also reachable by anything that follows a URL — a
 * crawler, a link preview, an <img src> on a hostile page — which is logout
 * CSRF. Restricting it to POST closes both.
 *
 * Most callers should use logoutAction() in src/actions/auth.ts. This remains
 * for form posts that cannot reach a server action.
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  await supabase.auth.signOut();

  return NextResponse.redirect(new URL("/login", request.url), {
    // 303 so the browser follows with GET rather than repeating the POST.
    status: 303,
  });
}
