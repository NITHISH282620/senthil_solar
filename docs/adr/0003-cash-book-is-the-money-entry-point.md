# ADR-0003 — The Cash Book Is the Entry Point for Money, and It Fans Out

- **Status:** Accepted
- **Date:** 2026-08-15
- **Deciders:** Lead Architect (autonomous mandate)
- **Relates to:** ADR-0001 (single canonical domain model)

## Context

The business runs on constant, small cash movements: ₹5 tea, ₹20 parking, ₹100
diesel, ₹300 handed to a worker, ₹5,00,000 arriving from an MNC. The owner will
not use the product at all if recording ₹20 costs him a multi-screen ERP
workflow. The target is a single sheet, under ten seconds, on a phone.

That creates a modelling problem, because one physical act — "I paid ₹100 for
fuel at Site 4" — is simultaneously three different facts to the business:

1. cash left the box (a **treasury** fact),
2. Site 4 got ₹100 more expensive (a **profitability** fact),
3. someone must be accountable for it (an **approval** fact).

The schema already separates these. `cash_book` is an append-only ledger whose
running balance is always derived. `expenses` carries approval state, and
`v_site_financials` computes each site's cost from `expenses` — specifically
from rows with status `approved` or `reimbursed` — never from `cash_book`.

Two failure modes were available, and both are silent:

- Write only to `cash_book`, and site profitability never sees the ₹100. The
  cash balance is right, every margin is wrong, and nothing errors.
- Write to both without linking them, and the money is counted twice the moment
  anyone sums across the two tables.

## Decision

**One quick entry writes to every table the movement implies, in one action,
and links them by `reference_table` / `reference_id`.**

Concretely, `createCashEntry` fans out as follows:

| Movement | Rows written |
|---|---|
| Money out, site-attributed, ordinary category | `expenses` + `cash_book` → expense |
| Money out, category `worker_advance` | `salary_advances` + `cash_book` → advance |
| Money out, office overhead | `cash_book` only |
| Money in, client payment | handled by `addPayment`: `payments` + `cash_book` → payment |

Three rules make this safe:

- **`cash_book` is never a cost source.** Profitability reads `expenses`;
  `cash_book` reads as treasury. Nothing sums across both, so nothing
  double-counts.
- **Categories that are not costs are excluded explicitly.** An advance is a
  recoverable debt, wages reach site cost through payroll allocation, and a
  client payment is revenue. These are named in `NON_EXPENSE_CATEGORIES` rather
  than inferred.
- **The fan-out is all-or-nothing.** The dependent row is written first; if the
  `cash_book` insert then fails, the dependent row is deleted. The ledger is
  never left describing money that no other table agrees exists.

Approval follows role rather than adding a step: entries by the owner or an
accountant are `approved` on write, so their own spending reaches profitability
immediately. Entries by an engineer or supervisor land as `pending` and wait for
approval, which is the control the business actually wants.

## Consequences

**Good.** One sheet, one action, correct books. Site margins move the moment
money moves. An advance handed out in the field is already a payroll deduction.
Voiding reverses the whole fan-out, so the audit trail stays honest.

**Costs.** `createCashEntry` performs up to three round trips and compensates
manually on failure, because PostgREST gives the application no transaction. The
window is small but real: a crash between the two inserts can orphan a dependent
row. The compensating deletes cover the failure path we can observe; a process
death mid-call cannot be covered from here.

**If this proves insufficient**, the fan-out should move into a single
`SECURITY DEFINER` Postgres function called as one RPC, making it atomic. That
is a strictly better design and was not chosen now only because it is harder to
evolve while the write shapes are still settling. Revisit once they stop moving.

## Alternatives rejected

- **Teach `v_site_financials` to read `cash_book`.** Would make the quick entry
  a single insert, but abandons approval entirely — every unreviewed field entry
  would immediately alter reported margins — and invites double counting the
  moment anything writes to both tables.
- **Make the owner file an expense and a cash entry separately.** Correct books,
  but it is the Excel workflow the product exists to replace.
