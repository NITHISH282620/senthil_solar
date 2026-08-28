"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { getDictionary, type Dictionary } from "./index";
import { LOCALE_COOKIE, type Locale } from "./locale";
import { t as translate, type TranslationKey } from "./index";

interface LocaleContextValue {
  locale: Locale;
  dict: Dictionary;
  setLocale: (locale: Locale) => void;
  t: (key: TranslationKey, vars?: Record<string, string | number>) => string;
}

const LocaleContext = createContext<LocaleContextValue | null>(null);

/**
 * Wraps the app once, at the root, seeded with the locale the SERVER already
 * decided (from the cookie) — so the very first paint is already in the
 * right language and there is no English-flashes-then-Tamil flicker.
 *
 * Switching locale writes the cookie directly (not through a server action —
 * this is a UI preference, not data) and calls `router.refresh()` so every
 * Server Component on the current page re-reads the cookie and re-renders in
 * the new language in the same stroke as the client tree does.
 */
export function LocaleProvider({
  initialLocale,
  children,
}: {
  initialLocale: Locale;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [locale, setLocaleState] = useState<Locale>(initialLocale);

  const setLocale = useCallback(
    (next: Locale) => {
      setLocaleState(next);
      // 400 days is the practical cap most browsers now enforce on
      // document.cookie max-age; there is no meaningful downside to asking
      // for longer since this is a preference, not a security-bearing value.
      document.cookie = `${LOCALE_COOKIE}=${next}; path=/; max-age=34560000; SameSite=Lax`;
      router.refresh();
    },
    [router]
  );

  const dict = useMemo(() => getDictionary(locale), [locale]);

  const value = useMemo<LocaleContextValue>(
    () => ({
      locale,
      dict,
      setLocale,
      t: (key, vars) => translate(dict, key, vars),
    }),
    [locale, dict, setLocale]
  );

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

/** `const { t, locale, setLocale } = useLocale();` in any Client Component. */
export function useLocale(): LocaleContextValue {
  const ctx = useContext(LocaleContext);
  if (!ctx) {
    throw new Error("useLocale() must be used inside <LocaleProvider>.");
  }
  return ctx;
}
