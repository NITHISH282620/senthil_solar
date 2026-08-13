-- ============================================================================
-- 0007 — REPORTING VIEWS
--
-- Profitability, cash position and receivables are computed in SQL over the
-- stamped lineage columns, not aggregated in application code. This is what
-- turns "which of my 100 sites lose money?" from an impossible question into
-- an indexed aggregation.
--
-- All views are security_invoker, so the caller's RLS applies. A supervisor
-- querying v_site_financials sees only their own sites; the money columns are
-- additionally gated because the underlying tables are.
--
-- Rollback: supabase/rollback/0007_views.down.sql
-- ============================================================================

-- ─── Staff directory (no compensation) ──────────────────────────────────────
-- Everyone needs to look up colleagues for assignment pickers, but nobody
-- except the owner should see salary, bank details or KYC numbers.

CREATE VIEW v_directory
WITH (security_invoker = true) AS
SELECT
  p.id,
  p.employee_code,
  p.full_name,
  p.phone,
  p.role,
  p.trade,
  p.department,
  p.designation,
  p.is_active,
  p.avatar_url
FROM profiles p
WHERE p.deleted_at IS NULL;

COMMENT ON VIEW v_directory IS
  'Roster without compensation, banking or KYC. Safe for assignment pickers.';

-- ─── Site financials ────────────────────────────────────────────────────────

CREATE VIEW v_site_financials
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
  s.allocated_value AS revenue_allocated,

  COALESCE(m.material_cost, 0) AS material_cost,
  COALESCE(l.labour_cost,   0) AS labour_cost,
  COALESCE(e.expense_cost,  0) AS expense_cost,

  COALESCE(m.material_cost, 0)
    + COALESCE(l.labour_cost, 0)
    + COALESCE(e.expense_cost, 0) AS total_cost,

  s.allocated_value
    - (COALESCE(m.material_cost, 0)
       + COALESCE(l.labour_cost, 0)
       + COALESCE(e.expense_cost, 0)) AS gross_profit,

  CASE
    WHEN s.allocated_value > 0 THEN
      round(
        (s.allocated_value
          - (COALESCE(m.material_cost, 0)
             + COALESCE(l.labour_cost, 0)
             + COALESCE(e.expense_cost, 0))
        ) * 100.0 / s.allocated_value, 2)
    ELSE NULL
  END AS margin_percent,

  COALESCE(w.worker_count, 0) AS assigned_workers
FROM sites s
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
  SELECT COUNT(*) AS worker_count
  FROM site_assignments sa
  WHERE sa.site_id = s.id AND sa.is_active AND sa.deleted_at IS NULL
) w ON true
WHERE s.deleted_at IS NULL;

COMMENT ON VIEW v_site_financials IS
  'Per-site P&L. Revenue is the site''s allocated share of its contract value.';

-- ─── Contract financials ────────────────────────────────────────────────────

CREATE VIEW v_contract_financials
WITH (security_invoker = true) AS
SELECT
  c.id AS contract_id,
  c.contract_number,
  c.title,
  c.company_id,
  co.name AS company_name,
  c.status,
  c.contract_value,
  c.start_date,
  c.deadline_date,

  COALESCE(sf.site_count, 0)      AS site_count,
  COALESCE(sf.completed_sites, 0) AS completed_sites,
  COALESCE(sf.total_cost, 0)      AS total_cost,
  c.contract_value - COALESCE(sf.total_cost, 0) AS gross_profit,

  COALESCE(inv.invoiced, 0) AS invoiced,
  COALESCE(inv.received, 0) AS received,
  COALESCE(inv.outstanding, 0) AS outstanding,
  c.contract_value - COALESCE(inv.invoiced, 0) AS unbilled,

  CASE
    WHEN c.deadline_date IS NOT NULL
     AND c.actual_end_date IS NULL
     AND c.deadline_date < (now() AT TIME ZONE 'Asia/Kolkata')::date
    THEN true ELSE false
  END AS is_overdue
FROM contracts c
JOIN companies co ON co.id = c.company_id
LEFT JOIN LATERAL (
  SELECT
    COUNT(*)                                              AS site_count,
    COUNT(*) FILTER (WHERE f.status = 'completed')        AS completed_sites,
    SUM(f.total_cost)                                     AS total_cost
  FROM v_site_financials f
  WHERE f.contract_id = c.id
) sf ON true
LEFT JOIN LATERAL (
  SELECT
    SUM(i.total_amount)    AS invoiced,
    SUM(i.amount_received) AS received,
    SUM(i.balance_due)     AS outstanding
  FROM invoices i
  WHERE i.contract_id = c.id
    AND i.deleted_at IS NULL
    AND i.status <> 'cancelled'
) inv ON true
WHERE c.deleted_at IS NULL;

-- ─── Company financials ─────────────────────────────────────────────────────

CREATE VIEW v_company_financials
WITH (security_invoker = true) AS
SELECT
  co.id AS company_id,
  co.company_code,
  co.name,
  co.status,
  COUNT(DISTINCT cf.contract_id)          AS contract_count,
  COALESCE(SUM(cf.contract_value), 0)     AS total_contract_value,
  COALESCE(SUM(cf.total_cost), 0)         AS total_cost,
  COALESCE(SUM(cf.gross_profit), 0)       AS gross_profit,
  COALESCE(SUM(cf.invoiced), 0)           AS total_invoiced,
  COALESCE(SUM(cf.received), 0)           AS total_received,
  COALESCE(SUM(cf.outstanding), 0)        AS total_outstanding
FROM companies co
LEFT JOIN v_contract_financials cf ON cf.company_id = co.id
WHERE co.deleted_at IS NULL
GROUP BY co.id, co.company_code, co.name, co.status;

-- ─── Stock on hand ──────────────────────────────────────────────────────────

CREATE VIEW v_stock_on_hand
WITH (security_invoker = true) AS
SELECT
  sl.material_id,
  m.sku,
  m.name AS material_name,
  m.category,
  m.unit,
  m.reorder_level,
  sl.location_id,
  loc.name AS location_name,
  loc.location_type,
  loc.site_id,
  SUM(sl.quantity_delta) AS qty_on_hand,
  CASE
    WHEN m.reorder_level IS NOT NULL
     AND SUM(sl.quantity_delta) < m.reorder_level
    THEN true ELSE false
  END AS is_below_reorder
FROM stock_ledger sl
JOIN materials m       ON m.id = sl.material_id
JOIN stock_locations loc ON loc.id = sl.location_id
GROUP BY sl.material_id, m.sku, m.name, m.category, m.unit, m.reorder_level,
         sl.location_id, loc.name, loc.location_type, loc.site_id
HAVING SUM(sl.quantity_delta) <> 0;

COMMENT ON VIEW v_stock_on_hand IS
  'Derived from the append-only ledger. There is no stored quantity to drift.';

-- ─── Receivables ageing ─────────────────────────────────────────────────────

CREATE VIEW v_receivables_ageing
WITH (security_invoker = true) AS
SELECT
  i.id AS invoice_id,
  i.invoice_number,
  i.company_id,
  co.name AS company_name,
  i.contract_id,
  i.invoice_date,
  i.due_date,
  i.total_amount,
  i.amount_received,
  i.balance_due,
  i.status,
  GREATEST(0, (now() AT TIME ZONE 'Asia/Kolkata')::date - i.due_date) AS days_overdue,
  CASE
    WHEN i.due_date IS NULL THEN 'no_due_date'
    WHEN i.due_date >= (now() AT TIME ZONE 'Asia/Kolkata')::date THEN 'current'
    WHEN (now() AT TIME ZONE 'Asia/Kolkata')::date - i.due_date <= 30 THEN '1_30'
    WHEN (now() AT TIME ZONE 'Asia/Kolkata')::date - i.due_date <= 60 THEN '31_60'
    WHEN (now() AT TIME ZONE 'Asia/Kolkata')::date - i.due_date <= 90 THEN '61_90'
    ELSE 'over_90'
  END AS ageing_bucket
FROM invoices i
JOIN companies co ON co.id = i.company_id
WHERE i.deleted_at IS NULL
  AND i.status NOT IN ('cancelled','draft')
  AND i.balance_due > 0;

-- ─── Daily cash position ────────────────────────────────────────────────────

CREATE VIEW v_cash_position
WITH (security_invoker = true) AS
SELECT
  entry_date,
  SUM(amount) FILTER (WHERE direction = 'in')  AS cash_in,
  SUM(amount) FILTER (WHERE direction = 'out') AS cash_out,
  SUM(CASE WHEN direction = 'in' THEN amount ELSE -amount END) AS net_movement,
  SUM(SUM(CASE WHEN direction = 'in' THEN amount ELSE -amount END))
    OVER (ORDER BY entry_date ROWS UNBOUNDED PRECEDING) AS running_balance
FROM cash_book
WHERE deleted_at IS NULL
GROUP BY entry_date;

COMMENT ON VIEW v_cash_position IS
  'Running balance is a window function over the ledger, never a stored value.';

-- ─── Attendance summary for payroll ─────────────────────────────────────────

CREATE VIEW v_attendance_monthly
WITH (security_invoker = true) AS
SELECT
  a.employee_id,
  EXTRACT(YEAR  FROM a.date)::INT AS period_year,
  EXTRACT(MONTH FROM a.date)::INT AS period_month,
  a.site_id,
  a.contract_id,
  SUM(a.day_fraction) FILTER (WHERE a.status IN ('present','half_day')) AS present_days,
  SUM(a.day_fraction) FILTER (WHERE a.status = 'leave')                 AS leave_days,
  SUM(a.overtime_hours)                                                 AS overtime_hours,
  COUNT(*) FILTER (WHERE a.status = 'absent')                           AS absent_days,
  COUNT(*) FILTER (WHERE a.within_geofence IS FALSE)                    AS out_of_geofence_count
FROM attendance a
WHERE a.deleted_at IS NULL
GROUP BY a.employee_id, EXTRACT(YEAR FROM a.date), EXTRACT(MONTH FROM a.date),
         a.site_id, a.contract_id;

-- ─── Owner dashboard: today ─────────────────────────────────────────────────

CREATE VIEW v_dashboard_today
WITH (security_invoker = true) AS
SELECT
  (SELECT COUNT(*) FROM sites
     WHERE status = 'active' AND deleted_at IS NULL) AS active_sites,

  (SELECT COUNT(DISTINCT employee_id) FROM attendance
     WHERE date = (now() AT TIME ZONE 'Asia/Kolkata')::date
       AND status IN ('present','half_day') AND deleted_at IS NULL) AS workers_present_today,

  (SELECT COUNT(*) FROM sites s
     WHERE s.status = 'active' AND s.deleted_at IS NULL
       AND NOT EXISTS (
         SELECT 1 FROM attendance a
         WHERE a.site_id = s.id
           AND a.date = (now() AT TIME ZONE 'Asia/Kolkata')::date
           AND a.deleted_at IS NULL)) AS sites_missing_attendance,

  (SELECT COALESCE(SUM(amount), 0) FROM cash_book
     WHERE entry_date = (now() AT TIME ZONE 'Asia/Kolkata')::date
       AND direction = 'in' AND deleted_at IS NULL) AS cash_in_today,

  (SELECT COALESCE(SUM(amount), 0) FROM cash_book
     WHERE entry_date = (now() AT TIME ZONE 'Asia/Kolkata')::date
       AND direction = 'out' AND deleted_at IS NULL) AS cash_out_today,

  (SELECT COALESCE(SUM(amount), 0) FROM expenses
     WHERE expense_date = (now() AT TIME ZONE 'Asia/Kolkata')::date
       AND category = 'fuel' AND deleted_at IS NULL) AS fuel_cost_today,

  (SELECT COUNT(*) FROM expenses
     WHERE status = 'pending' AND deleted_at IS NULL) AS pending_expense_approvals,

  (SELECT COALESCE(SUM(balance_due), 0) FROM invoices
     WHERE status IN ('sent','partially_paid','overdue') AND deleted_at IS NULL)
    AS total_outstanding,

  (SELECT COUNT(*) FROM invoices
     WHERE status IN ('sent','partially_paid')
       AND due_date < (now() AT TIME ZONE 'Asia/Kolkata')::date
       AND deleted_at IS NULL) AS overdue_invoices,

  (SELECT COUNT(*) FROM sites
     WHERE status = 'active' AND deleted_at IS NULL
       AND planned_end_date < (now() AT TIME ZONE 'Asia/Kolkata')::date
       AND actual_end_date IS NULL) AS delayed_sites,

  (SELECT COUNT(*) FROM contracts
     WHERE status = 'active' AND deleted_at IS NULL
       AND deadline_date BETWEEN (now() AT TIME ZONE 'Asia/Kolkata')::date
                             AND (now() AT TIME ZONE 'Asia/Kolkata')::date + 7)
    AS contracts_due_this_week;

COMMENT ON VIEW v_dashboard_today IS
  'Single-row snapshot for the owner home screen. One round trip, not twelve.';
