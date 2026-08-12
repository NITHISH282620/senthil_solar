/**
 * Environment configuration.
 *
 * Deliberately does NOT throw at module scope. A misconfigured deployment
 * should render an actionable page explaining what is missing, not crash every
 * route with an opaque 500 — which is precisely what happened on the first
 * Vercel deploy of this project.
 *
 * Note on NEXT_PUBLIC_* variables: Next.js inlines these into the client bundle
 * at BUILD time. Setting them after a build has run is not enough; the project
 * must be redeployed for the browser client to see them.
 */

export interface SupabaseEnv {
  url: string;
  anonKey: string;
}

/** Missing or still holding a placeholder value from .env.example. */
function isUnset(value: string | undefined): boolean {
  if (!value) return true;
  const v = value.trim();
  if (v === "") return true;
  return (
    v.startsWith("your_") ||
    v === "your_supabase_project_url" ||
    v === "your_supabase_anon_key"
  );
}

/** Public Supabase config, or null when the deployment is not configured. */
export function getSupabaseEnv(): SupabaseEnv | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (isUnset(url) || isUnset(anonKey)) return null;
  return { url: url!, anonKey: anonKey! };
}

export function isSupabaseConfigured(): boolean {
  return getSupabaseEnv() !== null;
}

/**
 * Server-only. Throws if called when unconfigured — callers on the server
 * should gate on `isSupabaseConfigured()` first.
 */
export function requireSupabaseEnv(): SupabaseEnv {
  const env = getSupabaseEnv();
  if (!env) {
    throw new Error(
      "Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and " +
        "NEXT_PUBLIC_SUPABASE_ANON_KEY, then redeploy."
    );
  }
  return env;
}

/** Names of the variables that are missing, for diagnostics. */
export function missingEnvVars(): string[] {
  const missing: string[] = [];
  if (isUnset(process.env.NEXT_PUBLIC_SUPABASE_URL))
    missing.push("NEXT_PUBLIC_SUPABASE_URL");
  if (isUnset(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY))
    missing.push("NEXT_PUBLIC_SUPABASE_ANON_KEY");
  return missing;
}

/**
 * Server-side only variables. Never referenced from a client component.
 */
export function missingServerEnvVars(): string[] {
  const missing: string[] = [];
  if (isUnset(process.env.SUPABASE_SERVICE_ROLE_KEY))
    missing.push("SUPABASE_SERVICE_ROLE_KEY");
  return missing;
}

/**
 * Absolute app URL, used for auth redirect links (password reset).
 * Falls back to the Vercel-provided URL, then localhost.
 */
export function getAppUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_APP_URL;
  if (!isUnset(explicit)) return explicit!.replace(/\/$/, "");

  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL ?? process.env.VERCEL_URL;
  if (vercel) return `https://${vercel}`;

  return "http://localhost:3000";
}
