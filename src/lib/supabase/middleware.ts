import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseEnv } from "@/lib/env";

const SETUP_PATH = "/setup-required";

export async function updateSession(request: NextRequest) {
  const env = getSupabaseEnv();
  const pathname = request.nextUrl.pathname;

  // Unconfigured deployment: send every request to a page that says exactly
  // what is missing, instead of throwing a 500 on every route.
  if (!env) {
    if (pathname === SETUP_PATH) return NextResponse.next({ request });
    const url = request.nextUrl.clone();
    url.pathname = SETUP_PATH;
    url.search = "";
    return NextResponse.redirect(url);
  }

  // Configured: nobody should be sitting on the setup page.
  if (pathname === SETUP_PATH) {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    return NextResponse.redirect(url);
  }

  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(env.url, env.anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value)
        );
        supabaseResponse = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          supabaseResponse.cookies.set(name, value, options)
        );
      },
    },
  });

  // If Supabase itself is unreachable (deleted project, outage, network), fail
  // to the login page rather than surfacing a raw exception on every route.
  let user = null;
  try {
    const { data } = await supabase.auth.getUser();
    user = data.user;
  } catch {
    if (pathname.startsWith("/login")) return supabaseResponse;
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("error", "backend_unreachable");
    return NextResponse.redirect(url);
  }

  const isAuthRoute =
    pathname.startsWith("/login") ||
    pathname.startsWith("/forgot-password") ||
    pathname.startsWith("/auth/callback");

  const isRootPath = pathname === "/";

  /** Redirect while preserving any refreshed auth cookies. */
  function redirectTo(path: string) {
    const url = request.nextUrl.clone();
    url.pathname = path;
    const res = NextResponse.redirect(url);
    supabaseResponse.cookies.getAll().forEach((cookie) => {
      res.cookies.set(cookie.name, cookie.value);
    });
    return res;
  }

  if (!user && !isAuthRoute && !isRootPath) return redirectTo("/login");
  if (isRootPath) return redirectTo(user ? "/dashboard" : "/login");
  if (user && isAuthRoute) return redirectTo("/dashboard");

  return supabaseResponse;
}
