-- ============================================================================
-- LIGHTWEIGHT QUOTATION -> SITE FLOW + CLIENT PAYMENTS LEDGER
--
-- The owner's real workflow, confirmed against two years of his own Excel
-- records: he prices a job (his ask), the client bargains it down (the
-- agreed price), and payments arrive against that agreed price over time.
-- None of that was representable before — quotations only had one total,
-- and it was never possible to see what a client had actually paid against
-- a site without cross-referencing the cash book by hand.
--
-- The Company -> Contract -> Site structure this owner actually runs
-- (confirmed: he manages many sites simultaneously under a contract) is
-- untouched here. This migration only adds:
--   1. A client-agreed price on quotations, distinct from the ask.
--   2. A direct quotation -> site link (a site's quotation history).
--   3. contract_id becoming optional on sites, for the genuine one-off job
--      that never grows into a multi-site award — the contract-based path
--      is unaffected and stays the normal one.
--   4. A client-payments rollup on v_site_financials, read from the
--      client_payment cash_book entries that already exist.
-- ============================================================================

-- ─── Quotations: client-agreed price + direct site link ────────────────────

ALTER TABLE quotations
  ADD COLUMN site_id UUID REFERENCES sites(id) ON DELETE SET NULL,
  ADD COLUMN negotiated_amount NUMERIC(14,2) CHECK (negotiated_amount >= 0),
  ADD COLUMN negotiated_notes TEXT,
  ADD COLUMN negotiated_at TIMESTAMPTZ;

COMMENT ON COLUMN quotations.negotiated_amount IS
  'What the client actually agreed to pay after bargaining, distinct from '
  'total_amount (the owner''s ask). NULL until recorded.';

CREATE INDEX idx_quotations_site ON quotations(site_id) WHERE deleted_at IS NULL;

-- ─── Sites: contract becomes optional ───────────────────────────────────────
--
-- The normal path (pick a contract, add a site under it) is unaffected —
-- createSite still resolves company_id from the contract when one is given.
-- This only unblocks a second, standalone path for a genuine one-off site
-- with no contract, where company_id is supplied directly instead.

ALTER TABLE sites ALTER COLUMN contract_id DROP NOT NULL;

CREATE OR REPLACE FUNCTION sync_site_company()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.contract_id IS NOT NULL THEN
    SELECT c.company_id INTO NEW.company_id
    FROM contracts c WHERE c.id = NEW.contract_id;

    IF NEW.company_id IS NULL THEN
      RAISE EXCEPTION 'Contract % does not exist', NEW.contract_id;
    END IF;
  ELSIF NEW.company_id IS NULL THEN
    RAISE EXCEPTION 'A site needs either a contract or a company.';
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON COLUMN sites.company_id IS
  'Synced from the contract when contract_id is set; otherwise supplied '
  'directly (the standalone, no-contract site path). Never set both ways '
  'at once — see sync_site_company().';

-- ─── v_site_financials: add the client-payments ledger columns ─────────────
--
-- Existing columns (site_id .. assigned_workers) are byte-for-byte identical
-- to the current definition in 20260824000100_security_and_money_fixes.sql —
-- CREATE OR REPLACE VIEW only allows appending columns, so this is additive.
-- client_received/client_balance_due inherit the same RLS boundary as
-- revenue_allocated: both source tables (site_commercials, cash_book) are
-- money-roles-only, so a field role still sees NULL for all of it.

CREATE OR REPLACE VIEW v_site_financials
WITH (security_invoker = true) AS
SELECT
  s.id            AS site_id,
  s.site_code,
  s.name          AS site_name,
  s.contract_id,
  s.company_id,
  s.stage,
  s.status,
  s.progress_percent,
  s.capacity_kw,
  sc.allocated_value AS revenue_allocated,

  COALESCE(m.material_cost, 0) AS material_cost,
  COALESCE(l.labour_cost,   0) AS labour_cost,
  COALESCE(e.expense_cost,  0) AS expense_cost,
  COALESCE(pe.pending_cost, 0) AS pending_cost,

  COALESCE(m.material_cost, 0)
    + COALESCE(l.labour_cost, 0)
    + COALESCE(e.expense_cost, 0) AS total_cost,

  sc.allocated_value
    - (COALESCE(m.material_cost, 0)
       + COALESCE(l.labour_cost, 0)
       + COALESCE(e.expense_cost, 0)) AS gross_profit,

  CASE
    WHEN sc.allocated_value > 0 THEN
      round(
        (sc.allocated_value
          - (COALESCE(m.material_cost, 0)
             + COALESCE(l.labour_cost, 0)
             + COALESCE(e.expense_cost, 0))
        ) * 100.0 / sc.allocated_value, 2)
    ELSE NULL
  END AS margin_percent,

  COALESCE(w.worker_count, 0) AS assigned_workers,

  -- New: what the client has actually paid against this site, and what's
  -- left. Sourced from the client_payment cash_book entries recorded
  -- through the existing Quick Money Sheet — no new write path needed.
  COALESCE(cp.received, 0) AS client_received,
  cp.last_payment_date,
  sc.allocated_value - COALESCE(cp.received, 0) AS client_balance_due
FROM sites s
LEFT JOIN site_commercials sc ON sc.site_id = s.id
LEFT JOIN LATERAL (
  SELECT SUM(total_value) AS material_cost
  FROM stock_ledger sl
  WHERE sl.site_id = s.id
    AND sl.txn_type IN ('site_consumption','installed','damaged','scrapped')
) m ON true
LEFT JOIN LATERAL (
  SELECT SUM(allocated_amount) AS labour_cost
  FROM payroll_site_allocations psa
  WHERE psa.site_id = s.id
) l ON true
LEFT JOIN LATERAL (
  SELECT SUM(amount) AS expense_cost
  FROM expenses ex
  WHERE ex.site_id = s.id
    AND ex.status IN ('approved','reimbursed')
    AND ex.deleted_at IS NULL
) e ON true
LEFT JOIN LATERAL (
  SELECT SUM(amount) AS pending_cost
  FROM expenses ex
  WHERE ex.site_id = s.id
    AND ex.status IN ('draft','pending')
    AND ex.deleted_at IS NULL
) pe ON true
LEFT JOIN LATERAL (
  SELECT COUNT(*) AS worker_count
  FROM site_assignments sa
  WHERE sa.site_id = s.id AND sa.is_active AND sa.deleted_at IS NULL
) w ON true
LEFT JOIN LATERAL (
  SELECT SUM(amount) AS received, MAX(entry_date) AS last_payment_date
  FROM cash_book cb
  WHERE cb.site_id = s.id
    AND cb.direction = 'in'
    AND cb.category = 'client_payment'
    AND cb.deleted_at IS NULL
) cp ON true
WHERE s.deleted_at IS NULL;

COMMENT ON VIEW v_site_financials IS
  'Per-site revenue, cost and profit, plus what the client has actually '
  'paid against the site (client_received) and what remains '
  '(client_balance_due). NULL for field roles: site_commercials and '
  'cash_book are both invisible to them.';
