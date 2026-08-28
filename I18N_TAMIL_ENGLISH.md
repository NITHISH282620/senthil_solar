# English ↔ Tamil (தமிழ் | English) — i18n system

Status date: 2026-08-28. This document exists to state honestly what is and
is not translated, so nobody assumes "Tamil is done" when a screen is still
English-only.

## Architecture

- **Locale storage: a cookie (`solarops_locale`), not a URL segment.**
  Next's own recommended pattern for this Next.js version is
  `app/[lang]/...` routing (`node_modules/next/dist/docs/01-app/02-guides/internationalization.md`).
  That's built for public, SEO-facing, unauthenticated multi-language sites.
  This is an internal authenticated tool where every user wants a persistent
  *preference*, not a shareable URL that encodes language — so the cookie
  approach was used instead, keeping the spirit of Next's pattern (typed
  dictionaries, server-side loading) without the routing overhead.
- **`src/lib/i18n/dictionaries/{en,ta}.ts`** — namespaced dictionaries
  (`common`, `nav`, `auth`, `dashboard`, `quickMoney`, `attendance`,
  `expenses`, `cash`, `quotations`, `employees`, `payroll`, `settings`,
  `roles`). `en.ts` is the source of shape truth: a `Widen<T>` mapped type
  widens its string-literal leaves to `string` so `ta.ts` (typed as
  `Dictionary`) must have every key English has — a missing Tamil key is a
  **TypeScript compile error**, not a silently-English string in the Tamil UI.
- **`src/lib/i18n/index.ts`** — `t(dict, key, vars?)`. `key` is a
  compile-time-checked dot path (`DotPath<Dictionary>`, e.g.
  `"dashboard.greeting"`) — a typo in a key is a compile error, not a runtime
  blank. `vars` fills `{{placeholders}}`, e.g.
  `t(dict, "dashboard.greeting", { name: "Senthil" })`.
- **Server Components**: `getServerLocale()` / `getServerDictionary()` in
  `src/lib/i18n/server.ts` (a `server-only` module) read the cookie via
  `await cookies()` and return the right dictionary for the request — no
  flash of the wrong language on first paint.
- **Client Components**: `useLocale()` from `src/lib/i18n/locale-provider.tsx`
  gives `{ locale, dict, setLocale, t }`. `t` here takes just the key
  (`t("nav.dashboard")`) since the dictionary is already bound.
- **Switching language**: `setLocale()` writes the cookie directly (this is a
  UI preference, not data — no server action needed) and calls
  `router.refresh()`, so every Server Component on the current page re-reads
  the cookie and re-renders in the new language in the same stroke as the
  client tree.
- **Font**: `Noto_Sans_Tamil` (Google, via `next/font/google`) is wired into
  the `--font-sans` fallback chain in `globals.css`
  (`var(--font-geist-sans), var(--font-noto-tamil), ...`), not swapped in per
  locale. The browser resolves font-family per glyph, so Tamil and English
  render correctly in the same sentence with zero per-locale `className`
  branching anywhere in the component tree.
- **Business data is never translated.** ₹ amounts, dates, GST/tax terms,
  invoice numbers, site/company/employee names are substituted into
  already-translated sentences via `{{placeholders}}` — never looked up in
  the dictionary. `formatCurrency()` output, `s.site_name`, `r.company_name`,
  `r.invoice_number` etc. are passed straight through in every call site
  touched.
- **Tamil is real business Tamil, not machine translation.** Where Tamil
  Nadu contractors genuinely say the English word in business speech
  ("சைட்" for site, "PDF"), that word is kept. Where there's a natural,
  everyday Tamil verb (சேமி/save, ரத்து செய்/cancel, வந்தார்/present), that's
  used instead of a stiff formal coinage. See the header comment in
  `src/lib/i18n/dictionaries/ta.ts`.
- **Adding a third language later**: add `src/lib/i18n/dictionaries/hi.ts`
  (say) typed as `Dictionary`, add it to the `dictionaries` map in
  `src/lib/i18n/index.ts`, add its code to `LOCALES`/`LOCALE_LABELS` in
  `src/lib/i18n/locale.ts`. No other file changes — every consumer already
  goes through `t()`.

## Coverage — what is actually translated right now

This pass wired the **highest-visibility, always-present chrome** — the
surfaces every single user sees on every single visit, regardless of role:

| Surface | Status |
|---|---|
| Login page (`/login`) — headline, labels, buttons, forgot-password link, known auth error | ✅ Translated |
| Auth layout marketing panel (desktop-only left panel) | ✅ Translated |
| Language toggle itself, on the login screen | ✅ Present, top-right, reachable before signing in |
| Sidebar navigation — every nav item label, both expanded and collapsed (tooltip) states, desktop and the mobile `Sheet` drawer (same component) | ✅ Translated |
| Sidebar user role label (e.g. "Owner"/"உரிமையாளர்") | ✅ Translated |
| Sidebar sign-out tooltip | ✅ Translated |
| Header — page title per route, mobile hamburger menu `sr-only` text | ✅ Translated |
| Dashboard (owner/manager/accountant view) — greeting, all tiles, "Needs attention", site profitability, receivables | ✅ Translated |
| Dashboard (field-role view: worker/engineer/supervisor) — greeting, both action cards | ✅ Translated |
| Language toggle, inside the dashboard sidebar (desktop + mobile) | ✅ Present |

**Not yet wired to `t()` — dictionary namespaces exist for some of these
(`quickMoney`, `attendance`, `quotations`), but the consuming components
still render hardcoded English:**

- Quotations (list, create/edit form, print view)
- Contracts, Sites, Cash Book, Attendance (crew sheet + my-attendance),
  Expenses, Billing/Invoices, Employees, Payroll, Settings, Audit Trail
- All dialogs, confirmations, toasts, and validation-error messages on those
  pages
- Quick Money sheet (dictionary keys exist, component not wired)

**Do not report this as "the whole app is in Tamil."** It is not. What
shipped is a complete, tested, production-grade i18n *system* plus full
coverage of the chrome every user always sees — login, navigation, and the
dashboard. Extending coverage to the remaining modules is mechanical (import
`useLocale()` or `getServerDictionary()`, replace each hardcoded string with
`t(dict, "namespace.key")`, add the key to both dictionaries) but was not
completed for every module in this pass.

## Verification performed

- `npx tsc --noEmit` — clean, no errors, including the `Widen<T>` completeness
  check confirming Tamil has every English key.
- `npm run lint` — 5 pre-existing warnings, unrelated to this change, 0 errors.
- `npx next build` — production build succeeds.
- **Local, server-rendered HTML** (curl against `localhost:3002`, dev server
  pointed at the production Supabase project per prior instruction):
  - `GET /login` with no cookie → English, `<html lang="en">`.
  - `GET /login` with `Cookie: solarops_locale=ta` → full Tamil copy,
    `<html lang="ta">`, `aria-pressed="true"` on the Tamil toggle button,
    the `--font-noto-tamil` CSS variable present on `<html class>`.
- **S24 Ultra viewport screenshots** (Playwright/Chromium, 384×854 CSS px,
  the DevTools S24 Ultra preset) of `/login` in both languages: no overflow,
  no truncation, no broken layout, Tamil glyphs render correctly, the
  language toggle and all form controls fit and remain usable.
- **Not verified with a live screenshot**: the authenticated sidebar/header/
  dashboard at the S24 Ultra viewport. No production login credentials were
  available in this session (the owner password was shared once, earlier,
  and was correctly never written to any persisted file or memory — by
  design, credentials are never stored). Confidence in these surfaces comes
  from: `tsc`/build passing, the identical `LocaleProvider`/`LanguageToggle`
  /font infrastructure already proven correct on the login page, and manual
  review confirming no `truncate`/`whitespace-nowrap` classes were added to
  any translated label (the app's existing `truncate` usage is reserved for
  business-data fields like site/company names, which stay untranslated).
  **If a real screenshot of the authenticated Tamil dashboard on a phone is
  needed, it must be taken with real credentials, either by the owner
  directly or by handing this session a test account's password.**
- **Not yet deployed to or verified on production** as of this line — see
  the deployment section below.
