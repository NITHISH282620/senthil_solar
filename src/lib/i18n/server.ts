import "server-only";
import { cookies } from "next/headers";
import { getDictionary, type Dictionary } from "./index";
import { DEFAULT_LOCALE, isLocale, LOCALE_COOKIE, type Locale } from "./locale";

/** The locale for this request, read from the cookie set by the toggle. */
export async function getServerLocale(): Promise<Locale> {
  const cookieStore = await cookies();
  const value = cookieStore.get(LOCALE_COOKIE)?.value;
  return isLocale(value) ? value : DEFAULT_LOCALE;
}

/**
 * The dictionary for this request. A Server Component calls this once and
 * passes the result to `t(dict, "...")`, or straight to a Client Component
 * that needs to render translated text without its own client-side
 * dictionary lookup.
 */
export async function getServerDictionary(): Promise<Dictionary> {
  return getDictionary(await getServerLocale());
}
