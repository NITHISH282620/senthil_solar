import { Sun, AlertTriangle, Check } from "lucide-react";
import { missingEnvVars, missingServerEnvVars } from "@/lib/env";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Setup required — Sentil Solar Ops",
  robots: { index: false, follow: false },
};

// Always evaluated at request time so it reflects the live environment.
export const dynamic = "force-dynamic";

const REQUIRED = [
  {
    name: "NEXT_PUBLIC_SUPABASE_URL",
    hint: "Supabase → Project Settings → Data API → Project URL",
  },
  {
    name: "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
    hint: "Supabase → Project Settings → API Keys → publishable. Safe to expose; it ships in the browser bundle. The legacy name NEXT_PUBLIC_SUPABASE_ANON_KEY also works.",
  },
  {
    name: "SUPABASE_SECRET_KEY",
    hint: "Same page → secret. Server-side only — never commit it or paste it anywhere public. Legacy name SUPABASE_SERVICE_ROLE_KEY also works.",
  },
  {
    name: "NEXT_PUBLIC_APP_URL",
    hint: "This deployment's URL. Used for password-reset links.",
  },
];

export default function SetupRequiredPage() {
  const missingPublic = missingEnvVars();
  const missingServer = missingServerEnvVars();
  const missing = new Set([...missingPublic, ...missingServer]);

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center gap-8 px-6 py-16">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-amber-500 to-orange-600 text-white">
          <Sun size={20} />
        </div>
        <span className="text-lg font-bold tracking-tight">Sentil Solar Ops</span>
      </div>

      <div className="space-y-3">
        <div className="flex items-center gap-2 text-amber-600">
          <AlertTriangle size={18} />
          <h1 className="text-xl font-semibold">Setup required</h1>
        </div>
        <p className="text-sm leading-relaxed text-muted-foreground">
          The application built and deployed successfully, but it has no
          database connection. Set the environment variables below, then
          redeploy.
        </p>
      </div>

      <ol className="space-y-4 text-sm">
        <li className="rounded-lg border p-4">
          <p className="font-medium">1. Create a Supabase project</p>
          <p className="mt-1 text-muted-foreground">
            The project this repository previously pointed at no longer exists.
            Create a new one at supabase.com, then copy its keys.
          </p>
        </li>

        <li className="rounded-lg border p-4">
          <p className="font-medium">2. Add these environment variables</p>
          <p className="mt-1 text-muted-foreground">
            In Vercel: Project → Settings → Environment Variables. Locally:{" "}
            <code className="rounded bg-muted px-1 py-0.5 text-xs">
              .env.local
            </code>
            .
          </p>
          <ul className="mt-3 space-y-2">
            {REQUIRED.map((v) => {
              const isMissing = missing.has(v.name);
              return (
                <li key={v.name} className="flex items-start gap-2">
                  <span className="mt-0.5 shrink-0">
                    {isMissing ? (
                      <AlertTriangle size={14} className="text-amber-600" />
                    ) : (
                      <Check size={14} className="text-emerald-600" />
                    )}
                  </span>
                  <span className="min-w-0">
                    <code className="break-all font-mono text-xs font-medium">
                      {v.name}
                    </code>
                    <span className="block text-xs text-muted-foreground">
                      {isMissing ? v.hint : "Set"}
                    </span>
                  </span>
                </li>
              );
            })}
          </ul>
        </li>

        <li className="rounded-lg border p-4">
          <p className="font-medium">3. Redeploy</p>
          <p className="mt-1 text-muted-foreground">
            Variables prefixed{" "}
            <code className="rounded bg-muted px-1 py-0.5 text-xs">
              NEXT_PUBLIC_
            </code>{" "}
            are baked into the build, so saving them is not enough — the project
            must be rebuilt for the change to take effect.
          </p>
        </li>

        <li className="rounded-lg border p-4">
          <p className="font-medium">4. Apply the database schema</p>
          <p className="mt-1 text-muted-foreground">
            Run the migrations in{" "}
            <code className="rounded bg-muted px-1 py-0.5 text-xs">
              supabase/migrations
            </code>{" "}
            against the new project. The first account to sign up automatically
            becomes the owner.
          </p>
        </li>
      </ol>

      <p className="text-xs text-muted-foreground">
        This page is shown only while configuration is incomplete. Once the
        variables are set it redirects to the dashboard automatically.
      </p>
    </main>
  );
}
