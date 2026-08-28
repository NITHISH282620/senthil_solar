"use client";

import { useLocale } from "@/lib/i18n/locale-provider";
import { LOCALES, LOCALE_LABELS } from "@/lib/i18n/locale";
import { cn } from "@/lib/utils";
import { Languages } from "lucide-react";

/**
 * The persistent தமிழ் | English toggle. One component, used in the sidebar
 * (desktop and mobile) and on the login page — everywhere `nav.language`
 * needs a control next to it.
 *
 * `compact` drops the label icon and shrinks padding for tight spots (the
 * collapsed sidebar rail).
 */
export function LanguageToggle({ compact = false }: { compact?: boolean }) {
  const { locale, setLocale } = useLocale();

  return (
    <div
      role="group"
      aria-label="Language / மொழி"
      className={cn(
        "inline-flex items-center gap-0.5 rounded-lg border bg-muted/40 p-0.5",
        compact && "gap-0"
      )}
    >
      {!compact && <Languages className="ml-1.5 mr-0.5 h-3.5 w-3.5 text-muted-foreground" />}
      {LOCALES.map((code) => (
        <button
          key={code}
          type="button"
          onClick={() => setLocale(code)}
          aria-pressed={locale === code}
          className={cn(
            "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
            locale === code
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          {LOCALE_LABELS[code]}
        </button>
      ))}
    </div>
  );
}
