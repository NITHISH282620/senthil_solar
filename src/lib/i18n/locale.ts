/**
 * The two supported UI languages, and how the choice is remembered.
 *
 * A cookie, not a URL segment. Next.js's own recommended pattern for
 * multi-language Next.js apps is routing-based — `/en/...`, `/ta/...` — which
 * is right for a public, SEO-facing site. This is an internal, authenticated
 * business tool where every route already exists once; rebuilding the whole
 * route tree under `app/[lang]/...` to get URL-based locales would touch
 * every page in the app for no benefit anyone asked for. A persistent toggle
 * that remembers the choice is what was actually requested, and a cookie is
 * the right way to remember it: it is readable on the server before the first
 * paint (no English-then-Tamil flash) and readable on the client for the
 * toggle itself.
 *
 * Adding a third language later is: add its code here, add a dictionary file
 * that satisfies the same shape as `en.ts`, add it to `dictionaries` in
 * `index.ts`. Nothing else in the app needs to change.
 */

export const LOCALES = ["en", "ta"] as const;
export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = "en";

export const LOCALE_LABELS: Record<Locale, string> = {
  en: "English",
  ta: "தமிழ்",
};

export const LOCALE_COOKIE = "solarops_locale";

export function isLocale(value: string | undefined | null): value is Locale {
  return !!value && (LOCALES as readonly string[]).includes(value);
}
