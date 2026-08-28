import type { Metadata } from "next";
import { getServerDictionary } from "@/lib/i18n/server";
import { t } from "@/lib/i18n";
import { LanguageToggle } from "@/components/shared/language-toggle";

export const metadata: Metadata = {
  title: "Login — SolarOps",
  description: "Sign in to your SolarOps operations management account",
};

export default async function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const dict = await getServerDictionary();

  return (
    <div className="flex min-h-screen relative">
      {/* Language toggle — reachable before signing in, on every screen size */}
      <div className="absolute top-4 right-4 z-10">
        <LanguageToggle />
      </div>

      {/* Left panel — branding */}
      <div className="hidden lg:flex lg:w-1/2 relative overflow-hidden bg-gradient-to-br from-amber-500 via-orange-500 to-red-600">
        <div className="absolute inset-0 bg-black/20" />
        {/* Decorative sun rays */}
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full bg-yellow-300/20 blur-3xl" />
        <div className="absolute bottom-0 left-0 right-0 h-1/3 bg-gradient-to-t from-black/40 to-transparent" />

        <div className="relative z-10 flex flex-col justify-between p-12 text-white">
          <div>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-white/20 backdrop-blur-sm flex items-center justify-center">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="24"
                  height="24"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <circle cx="12" cy="12" r="4" />
                  <path d="M12 2v2" />
                  <path d="M12 20v2" />
                  <path d="m4.93 4.93 1.41 1.41" />
                  <path d="m17.66 17.66 1.41 1.41" />
                  <path d="M2 12h2" />
                  <path d="M20 12h2" />
                  <path d="m6.34 17.66-1.41 1.41" />
                  <path d="m19.07 4.93-1.41 1.41" />
                </svg>
              </div>
              <span className="text-xl font-bold tracking-tight">SolarOps</span>
            </div>
          </div>

          <div className="space-y-6">
            <h1 className="text-4xl font-bold leading-tight">
              {t(dict, "auth.marketingHeadline")}
            </h1>
            <p className="text-white/80 text-lg max-w-md">
              {t(dict, "auth.marketingSubtitle")}
            </p>
            <div className="flex gap-8 text-sm">
              <div>
                <div className="text-2xl font-bold">500+</div>
                <div className="text-white/70">{t(dict, "auth.statInstallations")}</div>
              </div>
              <div>
                <div className="text-2xl font-bold">₹12Cr+</div>
                <div className="text-white/70">{t(dict, "auth.statRevenue")}</div>
              </div>
              <div>
                <div className="text-2xl font-bold">99.8%</div>
                <div className="text-white/70">{t(dict, "auth.statUptime")}</div>
              </div>
            </div>
          </div>

          <p className="text-white/50 text-sm">{t(dict, "auth.copyright")}</p>
        </div>
      </div>

      {/* Right panel — auth form */}
      <div className="flex-1 flex items-center justify-center p-6 sm:p-12 bg-background">
        {children}
      </div>
    </div>
  );
}
