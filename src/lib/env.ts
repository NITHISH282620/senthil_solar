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

/**
 * Supabase renamed its client-side key from "anon" to "publishable" (and
 * "service_role" to "secret"). Its own Next.js scaffolding now emits
 * NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, while older guides and this codebase
 * used NEXT_PUBLIC_SUPABASE_ANON_KEY. Accept either so that copying the
 * snippet straight out of the Supabase dashboard just works.
 *
 * NOTE: these values MUST be referenced as full literal `process.env.X`
 * expressions. Next.js inlines NEXT_PUBLIC_* at build time by static text
 * substitution — dynamic lookups like process.env[name] are not replaced and
 * would be undefined in the browser bundle.
 */
function publishableKey(): string | undefined {
  const publishable = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!isUnset(publishable)) return publishable;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!isUnset(anon)) return anon;
  return undefined;
}

/** Public Supabase config, or null when the deployment is not configured. */
export function getSupabaseEnv(): SupabaseEnv | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = publishableKey();
  if (isUnset(url) || isUnset(key)) return null;
  return { url: url!, anonKey: key! };
}

/** Server-side secret key, under either the new or legacy name. */
export function getServiceRoleKey(): string | undefined {
  const secret = process.env.SUPABASE_SECRET_KEY;
  if (!isUnset(secret)) return secret;
  const legacy = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!isUnset(legacy)) return legacy;
  return undefined;
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
  if (!publishableKey()) missing.push("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");
  return missing;
}

/**
 * Server-side only variables. Never referenced from a client component.
 */
export function missingServerEnvVars(): string[] {
  const missing: string[] = [];
  if (!getServiceRoleKey()) missing.push("SUPABASE_SECRET_KEY");
  return missing;
}

/**
 * Guards against the most likely misconfiguration: pointing a new deployment
 * at a Supabase project that no longer exists. Returns the project ref parsed
 * out of the URL, or null if the URL is not a Supabase host.
 */
export function supabaseProjectRef(): string | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (isUnset(url)) return null;
  const m = /^https:\/\/([a-z0-9]+)\.supabase\.(co|in)/i.exec(url!.trim());
  return m ? m[1] : null;
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
