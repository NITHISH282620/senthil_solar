import type { Dictionary } from "./dictionaries/en";
import en from "./dictionaries/en";
import ta from "./dictionaries/ta";
import type { Locale } from "./locale";

export type { Dictionary } from "./dictionaries/en";
export * from "./locale";

const dictionaries: Record<Locale, Dictionary> = { en, ta };

export function getDictionary(locale: Locale): Dictionary {
  return dictionaries[locale];
}

/** Dot-path key into a namespace, e.g. "attendance.saveTheDay". */
type DotPath<T, Prefix extends string = ""> = {
  [K in keyof T & string]: T[K] extends string
    ? `${Prefix}${K}`
    : DotPath<T[K], `${Prefix}${K}.`>;
}[keyof T & string];

export type TranslationKey = DotPath<Dictionary>;

/**
 * `t(dict, "attendance.saveTheDay")` → the string in whichever dictionary was
 * passed in. Works identically in a Server Component (given the dictionary
 * from `getServerDictionary()`) and a Client Component (given it from
 * `useLocale()`) — it is a pure function over a plain object, nothing more.
 *
 * `vars` fills `{{placeholders}}` — e.g. `t(dict, "dashboard.greeting", {
 * name: "Senthil" })` → "Good morning, Senthil". Business data (a name, a
 * site, a formatted amount) is never itself translated; it is substituted
 * into an already-translated sentence.
 */
export function t(
  dict: Dictionary,
  key: TranslationKey,
  vars?: Record<string, string | number>
): string {
  const parts = (key as string).split(".");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let node: any = dict;
  for (const part of parts) {
    node = node?.[part];
  }

  if (typeof node !== "string") {
    // A missing key must be visible in development, not a blank label in
    // front of the owner. It must never crash the page.
    if (process.env.NODE_ENV !== "production") {
      console.warn(`[i18n] missing key: ${key}`);
    }
    return key as string;
  }

  if (!vars) return node;

  return node.replace(/\{\{(\w+)\}\}/g, (_, name: string) =>
    name in vars ? String(vars[name]) : `{{${name}}}`
  );
}
