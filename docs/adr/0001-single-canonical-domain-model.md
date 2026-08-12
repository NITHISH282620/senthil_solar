# ADR-0001 — One Canonical Domain Model: Company → Contract → Site

- **Status:** Accepted
- **Date:** 2026-08-12
- **Deciders:** Lead Architect (autonomous mandate)

## Context

The repository contained three competing "job" hierarchies built in sequence, none retired:

| Generation | Entities | State when audited |
|---|---|---|
| v1 — retail shop | `customers → quotations → work_orders → invoices` | Code complete, unreachable from navigation, type layer gutted |
| v2 — field ops | `projects → attendance/expenses/work_logs` | Half-built |
| v3 — site pivot | `projects → sites` | Schema only, **zero application code** |

Consequences observed: `invoices` carries three optional parents (`work_order_id`, `quotation_id`, `project_id`) with no constraint; `projects.client_company` is free TEXT unrelated to the `customers` table; `expenses` has both `work_order_id` and `site_id`. Revenue and cost cannot be attributed to a common parent, so profitability is not computable even in principle.

The business brief is unambiguous about the required hierarchy:

```
Organization → Client Company → Contract → Project (optional) → Site → every other record
```

## Decision

Adopt **Company → Contract → Site** as the single canonical hierarchy. Every operational and financial record hangs off a Site (or, where genuinely site-independent, off a Contract or the Organization).

Entity disposition:

| Legacy | Disposition | Reason |
|---|---|---|
| `customers` | **Becomes `companies`** + `company_contacts` | Brief requires client companies with GST, terms, multiple contacts |
| `projects` | **Becomes `contracts`** | Brief requires contract value, milestones, payment schedule |
| `sites` | **Kept and built out** | The unit of execution; brief is explicit that everything belongs to a site |
| `quotations` | **Kept, re-parented to `companies`** | Brief requires quotations and quotation→contract conversion |
| `work_orders` | **Retired and deleted** | See below |
| `work_order_assignments` | Retired | Duplicates `site_assignments` |
| `work_order_updates` | Retired | Duplicates the required append-only Site Timeline |

`Project` is retained in the schema as an **optional** grouping layer between Contract and Site, per the brief's "Project (optional)". It is nullable on `sites` and no code path requires it.

## Why `work_orders` is deleted rather than restored

1. **Absent from the brief.** The business specification never mentions work orders. It specifies Contracts and Sites.
2. **Structurally duplicative.** `work_orders` has its own customer FK, status enum, assignment table, and update feed — every one of which is duplicated by `sites`, `site_assignments`, and `site_events`.
3. **Cost of keeping it.** Its type and validation layer was already gutted (`createWorkOrderSchema`, `WorkOrderAssignment`, `WorkOrderUpdate` all missing). Restoring roughly 200 lines of schema and types to make a module compile that is scheduled for deletion in Phase 1 is pure waste.
4. **It actively blocks the model.** While `expenses.work_order_id` and `invoices.work_order_id` exist, cost attribution has two competing parents and profitability stays impossible.

The two genuinely good components it carried — the kanban board and the timeline — are **ideas worth keeping, not code worth keeping**. Both were typed tightly against `WorkOrder`. They are rewritten in Phase 1 as the Site stage kanban and the append-only Site Timeline, which is what the brief actually asks for.

## Alternatives considered

**A. Restore all three architectures and let them coexist.**
Rejected. Every subsequent module (materials, payroll, invoicing) would need to attach to three parents or pick one arbitrarily. This is precisely the failure mode that produced the current state.

**B. Keep `work_orders` as a sub-task entity beneath Site.**
Rejected for now. There is a legitimate future need for task cards within a site, but `work_orders` is the wrong shape for it — it is customer-parented, not site-parented. When site-level tasks are needed they will be modelled fresh as `site_tasks`. Retaining a mis-shaped table "just in case" is how the current mess accumulated.

**C. Big-bang rewrite of everything at once.**
Rejected. The client runs a live business on this system. Retirement proceeds module by module behind a strangler pattern, and every phase ends deployable.

## Consequences

**Positive**
- One parent chain, so every cost row can carry `site_id → contract_id → company_id` and profitability becomes a single indexed aggregation.
- ~6 files and 3 tables removed immediately; roughly 200 lines of dead schema never written.
- `invoices` gets exactly one parent chain, enforceable by constraint.

**Negative**
- The `/work-orders` routes disappear. Acceptable: they were unreachable from the sidebar, so no user had a path to them.
- Any existing `work_orders` rows must be migrated to `sites` during the Phase 1 backfill, or archived to `_legacy_work_orders`. Handled explicitly in the Phase 1 migration, with unresolvable rows quarantined rather than dropped.

## Follow-ups

- Phase 1 migration backfills `customers → companies`, `projects → contracts`, and `work_orders → sites`.
- Legacy tables are renamed `_legacy_*` for one release cycle before being dropped.
