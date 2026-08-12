# 05 — UI / UX Improvements

Companion to `PROJECT_AUDIT.md`. How the interface must change to be usable by a solar EPC owner and his field crews.

---

## 1. Who Actually Uses This

Design decisions follow from these four people, not from a generic "admin dashboard" template.

| User | Device | Context | Needs |
|---|---|---|---|
| **Owner** | Phone, 90% of the time | In a car, at a client meeting, between sites | Five answers in five seconds: what's wrong, what's pending, what's overdue, what's costing, what's earning |
| **Site Supervisor** | Cheap Android, cracked screen, bright sun, patchy 4G | Standing on a rooftop, one hand free | Mark 40 workers present in under a minute. Log an expense in four taps. Works offline |
| **Accountant** | Desktop | Office, month-end | Bulk data, exports, reconciliation, keyboard-driven |
| **Worker** | Basic Android | Site entrance | Clock in, clock out. Nothing else |

The current UI is built for a fifth person who does not exist: a desk-bound admin on a 1440px monitor.

---

## 2. Current State Problems

| # | Problem | Evidence |
|---|---|---|
| U1 | **Dashboard shows no data.** 5 of 6 stat cards are the hardcoded string `"—"`; the 3 quick-action cards have `cursor-pointer` but no handler | `dashboard/page.tsx` |
| U2 | **No mobile navigation.** Fixed 264px/68px sidebar with no breakpoint switch, no drawer, no bottom tabs — despite `sheet.tsx` being available | `sidebar.tsx`, `dashboard-shell.tsx` |
| U3 | **Two sidebar links 404.** `/documents` and `/reports` do not exist | `sidebar.tsx` |
| U4 | **Three built modules are unreachable.** No nav entry for `/customers`, `/quotations`, `/work-orders` | `sidebar.tsx` |
| U5 | **No loading, error, or empty-route states.** Zero `loading.tsx`, `error.tsx`, `not-found.tsx` files in the whole app | `src/app/**` |
| U6 | **No global search.** `cmdk` installed, `command.tsx` written, never mounted | — |
| U7 | **No bulk actions.** 50 workers = 50 separate interactions. `batchAttendanceSchema` was written for this and never used | `validations.ts` |
| U8 | **No optimistic UI.** Manual `useState` loading flags; no `useActionState`, no `useOptimistic` | all 8 forms |
| U9 | **Every form is a long single column.** Expense entry is 8 fields on one page | `forms/*` |
| U10 | **UTC dates.** `new Date().toISOString().split("T")[0]` × 6 — after 17:30 IST the app's "today" is tomorrow | `actions/*` |
| U11 | **Errors are raw Postgres strings** surfaced to end users | all actions |
| U12 | **No data density options.** Tables render every row with no pagination, sort, or column control | list pages |

---

## 3. Information Architecture

### 3.1 Navigation redesign

Current nav is a flat list of 8 items mixing operations and finance. Replace with role-aware grouping:

```
🏠  Home              — role-specific dashboard
⚡  Operations
      Contracts
      Sites
      Attendance
      Work Logs
💰  Finance
      Invoices
      Payments
      Expenses
      Payroll
📦  Inventory
      Materials
      Purchase Orders
      Vendors
👥  People
      Employees
      Advances
📊  Reports
⚙️  Settings
```

Groups collapse; only groups the role can access render at all. Nav is generated from the `role_permissions` matrix, not a hardcoded array — so a new role never needs a code change.

### 3.2 Mobile: bottom tabs, not a drawer

Below `md`, the sidebar disappears entirely and is replaced by five fixed bottom tabs sized for thumbs:

```
┌─────────────────────────────────────┐
│  Sites · Kanban by stage            │
│                                     │
│  [ content ]                        │
│                                     │
├─────────────────────────────────────┤
│  🏠      ⚡      ➕      💰      ☰   │
│ Home   Sites  Action  Money   More  │
└─────────────────────────────────────┘
```

The centre **Action** button is a raised FAB opening a context-aware sheet:

| Where you are | Primary action offered |
|---|---|
| Any site page | Mark Attendance · Add Expense · Upload Photo · Log Work |
| Home (supervisor) | Mark Attendance for my sites |
| Home (owner) | New Contract · New Site · Record Payment |
| Finance | New Invoice · Record Payment · Add Expense |

This is the single largest click-reduction available: the most common action is always one tap from anywhere.

---

## 4. Screen-by-Screen

### 4.1 Owner home — the five questions

Replace the current placeholder grid. Every card is tappable and drills to a filtered list.

```
┌──────────────────────────────────────────────────┐
│  Good morning, Senthil            8 Aug 2026     │
├──────────────────────────────────────────────────┤
│  ⚠️  NEEDS ATTENTION                         (7) │
│  🔴  3 sites — no attendance today               │
│  🔴  2 invoices overdue      ₹8,40,000           │
│  🟠  1 site past deadline    Coimbatore-04       │
│  🟠  1 contract deadline in 5 days               │
├──────────────────────────────────────────────────┤
│  THIS MONTH                                      │
│  ┌────────────┬────────────┬─────────────────┐   │
│  │ Revenue    │ Costs      │ Profit          │   │
│  │ ₹42.5L     │ ₹31.2L     │ ₹11.3L  ↑ 26.6% │   │
│  └────────────┴────────────┴─────────────────┘   │
├──────────────────────────────────────────────────┤
│  RIGHT NOW                                       │
│  Active sites  34   ·   Workers present 218/240  │
│  Receivable ₹67.8L  ·   Cash ₹12.4L              │
├──────────────────────────────────────────────────┤
│  SITE PROGRESS            [by stage ▾]           │
│  Planning ▓▓▓░░░░░░ 8   Installation ▓▓▓▓▓ 14    │
│  Material ▓▓▓▓░░░░░ 6   Testing     ▓▓░░░  4     │
├──────────────────────────────────────────────────┤
│  LOSS-MAKING SITES                          (3)  │
│  Erode-02      −₹1.2L   labour 180% of estimate  │
│  Salem-07      −₹0.4L   material overrun         │
└──────────────────────────────────────────────────┘
```

The "Needs Attention" block is deliberately first and deliberately red. If it is empty, it collapses to a single green line — the absence of problems is itself information.

### 4.2 Attendance — the make-or-break screen

Used daily by every supervisor. Current flow is unusable at 50 workers. Target: **50 workers in under 30 seconds.**

```
┌──────────────────────────────────────────────────┐
│  ← Erode-02          Fri, 8 Aug 2026    [📍 OK]  │
├──────────────────────────────────────────────────┤
│  [ All Present ]  [ Copy Yesterday ]             │
├──────────────────────────────────────────────────┤
│  Ramesh K.        Electrician    [P] H  A  L     │
│  Suresh M.        Helper         [P] H  A  L     │
│  Vijay R.         Helper          P  H [A] L     │
│  Karthik S.       Electrician    [P] H  A  L  +2h│
│  ...                                             │
├──────────────────────────────────────────────────┤
│  42 Present · 3 Half · 5 Absent      [ Save ]    │
└──────────────────────────────────────────────────┘
```

Design decisions:
- **"All Present" and "Copy Yesterday" first** — the common case is that most people showed up. Start from the likely answer and correct exceptions.
- **Segmented control per row**, not a dropdown. One tap, no modal, no scroll-jump.
- **Overtime is a `+2h` chip**, revealed only on long-press. Never clutter the default path.
- **Geofence chip in the header** shows whether the supervisor is on site. Out-of-fence is flagged and recorded, never blocked — a blocked supervisor abandons the app.
- **Saves optimistically**, queues offline, syncs on reconnect.

### 4.3 Site detail

Tabs, mobile-first, with a persistent header showing the stage pipeline:

```
Planning ─● Material ── Install ── Testing ── Commissioned ── Done
             ▲ current
```

Tabs: **Overview** (progress, crew count, cost vs. allocated value, next milestone) · **Crew** · **Attendance** (monthly grid) · **Expenses** · **Photos** (before/during/after) · **Materials** · **Documents**.

The Overview tab leads with a single profitability line — allocated value, cost to date, projected margin — because that is the question the owner opens the page to answer.

### 4.4 Contract detail

Sites roll up. A 100-site contract must be scannable:

- Header: value, invoiced, received, unbilled, days to deadline
- Milestone timeline with achieved/invoiced/paid states
- Site list with **kanban-by-stage as the default view**, table as an option, map as a third
- Bulk actions: advance stage for selected sites, assign crew, export

### 4.5 Expense quick entry — four taps

```
Tap 1: FAB → Add Expense
Tap 2: Category (icon grid — 🍽️ ⛽ 🚗 🔧 📦)
Tap 3: Amount (numeric keypad, auto-focused)
Tap 4: 📷 Photo → Save
```

Site is inferred from context or GPS. Date defaults to today. Everything else is optional and hidden behind "More details". Compare with the current 8-field single-column form.

### 4.6 Payroll review

Desktop-first — this is an accountant's screen.

Spreadsheet-like grid: employee · days · OT · gross · advance · deductions · net. Inline editable cells for adjustments. Running totals in a sticky footer. Row expands to show the source attendance days. Actions: Recalculate · Finalise (locks attendance) · Export bank sheet · Generate payslips.

---

## 5. Interaction Patterns

### 5.1 Reduce clicks systematically

| Task | Now | Target | How |
|---|---|---|---|
| Mark 50 workers present | ~50 interactions | 2 taps | "All Present" + Save |
| Log a site expense | 6 steps, 8 fields | 4 taps | FAB + icon grid + keypad + photo |
| Check today's attendance | 3 navigations | 0 | On the home screen |
| Find a site | Nav → list → scroll | 2 keys | `⌘K` global search |
| Create 50 sites | 50 × full form | 1 upload | CSV import |
| Approve 12 expenses | 12 × open/approve | 2 taps | Checkbox select + bulk approve |
| See site profit | Impossible | 1 tap | Site Overview tab |

### 5.2 Global command palette

Mount the already-installed `cmdk`. `⌘K` / `Ctrl+K`, and a search icon in the mobile header.

```
⌘K  ›  erode
     SITES        Erode-02 · Installation · 12 workers
                  Erode-05 · Testing · 6 workers
     CONTRACTS    Erode Textiles Pvt Ltd — ₹1.2Cr
     ACTIONS      Mark attendance at Erode-02
                  Add expense to Erode-02
```

Fuzzy search across sites, contracts, companies, employees, and invoices — plus verb actions, so the palette is a command runner and not only a finder.

### 5.3 Loading and error states

Add throughout `src/app`:
- **`loading.tsx`** per route segment with skeletons matching the real layout (`skeleton.tsx` already exists)
- **`error.tsx`** per segment with a retry button and a human message — never a raw Postgres string
- **`not-found.tsx`** with navigation back to a sensible parent
- **Suspense boundaries** around slow dashboard widgets so the shell paints immediately

### 5.4 Optimistic updates

Adopt React 19's built-ins, which the project has available and does not use:
- `useActionState` for form submission state, replacing manual `useState` loading flags
- `useOptimistic` for attendance toggles, expense approval, and stage transitions — the UI reflects the change instantly and reverts on failure
- `sonner` toasts for confirmation, with **Undo** on destructive actions (which soft delete makes genuinely reversible)

### 5.5 Empty states that teach

`empty-state.tsx` exists. Use it everywhere with a specific next action:

> **No sites yet**
> Sites are where the work happens. Add them one at a time, or import a spreadsheet.
> [ Add Site ] [ Import CSV ]

A first-run checklist on the owner's home — company details → first company → first contract → first sites → first employees → mark attendance — turns a cold start into a guided path.

---

## 6. Mobile and Field Conditions

The supervisor is outdoors, in sunlight, possibly wearing gloves, on a phone with a cracked screen and 2 bars of signal.

| Requirement | Implementation |
|---|---|
| Tap targets | Minimum 48×48px; primary actions 56px |
| Contrast | Test at WCAG AAA for outdoor sunlight, not AA |
| Thumb reach | Primary actions in the bottom third; never top-right |
| Offline | IndexedDB queue for attendance, expenses, photos; background sync; visible pending-sync badge |
| Connectivity | Persistent offline banner; never lose typed input on a failed request |
| Camera | Direct capture with GPS EXIF; client-side compression before upload |
| Data cost | Thumbnails in lists, full images on demand |
| Input | `inputmode="numeric"` on all money fields; native date pickers |

**PWA:** manifest, service worker, installable to home screen, splash screen. The supervisor should never open a browser — they tap an icon.

---

## 7. Visual Language

Keep the existing Tailwind v4 + shadcn foundation. It is coherent and modern. Refine rather than replace.

- **Keep** the amber/orange solar identity, but demote it from the full-width gradient banner (which occupies the most valuable screen real estate with decoration) to accents and the logo. Replace the banner with the "Needs Attention" block.
- **Semantic colour discipline:** red = overdue or loss, amber = pending or at-risk, emerald = healthy or profit, blue = informational. Currently colours are decorative and inconsistent between `constants.ts` and `status-badge.tsx` — consolidate into one source of truth.
- **Money formatting:** Indian grouping throughout (₹42,50,000 not ₹4,250,000). Lakh/crore abbreviation in compact contexts (₹42.5L, ₹1.2Cr). `format.ts` already centralises this — extend it.
- **Dates:** `date-fns` with an explicit `Asia/Kolkata` timezone. Fixes U10. Relative for recent ("2 hours ago"), absolute beyond a week.
- **Density toggle** on tables: comfortable for touch, compact for the accountant's desktop.
- **Charts:** `recharts` is installed and unused. Use it for the site-progress funnel, monthly cash flow, and cost-category breakdown. Keep to three chart types — bar, line, donut. Nothing exotic.

---

## 8. Accessibility

- Keyboard navigation for every action; visible focus rings (the accountant lives on a keyboard)
- Real `<label>` on every input — several current forms rely on placeholder text alone
- ARIA live regions for toasts and async status
- Status never communicated by colour alone — always paired with an icon or text
- Respect `prefers-reduced-motion`
- Tamil language support in a later phase; keep all user-facing strings in a single module from the start so this is a translation task, not a refactor

---

## 9. Priority

| Priority | Change | Effort |
|---|---|---|
| **P0** | Real dashboard data (U1) | M |
| **P0** | Mobile bottom nav + FAB (U2) | M |
| **P0** | Fix dead nav links, restore orphaned modules (U3, U4) | S |
| **P0** | Batch attendance screen (U7) | M |
| **P0** | IST timezone handling (U10) | S |
| **P1** | `loading`/`error`/`not-found` everywhere (U5) | M |
| **P1** | Command palette (U6) | S |
| **P1** | Expense quick entry | S |
| **P1** | Optimistic updates (U8) | M |
| **P1** | Human error messages (U11) | S |
| **P2** | Offline PWA | L |
| **P2** | Pagination, sort, density (U12) | M |
| **P2** | Empty states and first-run checklist | S |
| **P3** | Charts, accessibility audit, Tamil support | M |
