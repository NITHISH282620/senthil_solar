-- ============================================================================
-- 0012 — DATA INTEGRITY INVARIANTS, AS A QUERY
--
-- The books have been reconciled by hand several times during this work. That
-- does not survive the next feature. These are the invariants the business
-- depends on, expressed so that a single query answers "is anything wrong?".
--
-- Written as a view rather than as constraints because most of them are
-- cross-row aggregates: PostgreSQL CHECK constraints cannot see other rows, and
-- the ones that could be triggers would fire on every write for a condition
-- that only ever needs checking periodically. Where a constraint IS the right
-- tool it is already in place — invoice overpayment, advance over-recovery,
-- non-negative amounts, one attendance row per employee per site per day.
--
-- Any row returned by v_integrity_check is a defect. Empty is correct.
-- ============================================================================

CREATE OR REPLACE VIEW v_integrity_check
WITH (security_invoker = true) AS

-- 1. An invoice's recorded receipts must equal its live payment rows.
SELECT
  'invoice_received_mismatch'         AS invariant,
  i.id::text                          AS record_id,
  i.invoice_number                    AS reference,
  i.amount_received                   AS recorded,
  COALESCE(p.paid, 0)                 AS derived
FROM invoices i
LEFT JOIN LATERAL (
  SELECT SUM(amount) AS paid FROM payments
  WHERE invoice_id = i.id AND direction = 'inbound' AND deleted_at IS NULL
) p ON true
WHERE i.deleted_at IS NULL
  AND i.amount_received <> COALESCE(p.paid, 0)

UNION ALL

-- 2. An invoice's TDS must equal the TDS carried on its receipts. Divergence
--    here is what made every corporate invoice sit part-paid forever.
SELECT
  'invoice_tds_mismatch', i.id::text, i.invoice_number,
  i.tds_deducted, COALESCE(p.tds, 0)
FROM invoices i
LEFT JOIN LATERAL (
  SELECT SUM(tds_deducted) AS tds FROM payments
  WHERE invoice_id = i.id AND direction = 'inbound' AND deleted_at IS NULL
) p ON true
WHERE i.deleted_at IS NULL
  AND i.tds_deducted <> COALESCE(p.tds, 0)

UNION ALL

-- 3. Nobody may be paid more than the invoice owes, credit excepted — and
--    credit is deliberately unallocated, so it is not counted here.
SELECT
  'invoice_overpaid', i.id::text, i.invoice_number,
  i.amount_received, i.net_receivable
FROM invoices i
WHERE i.deleted_at IS NULL
  AND i.status <> 'cancelled'
  AND i.amount_received > i.net_receivable + 0.01

UNION ALL

-- 4. Site labour allocations must sum to the payslip's labour cost. The
--    largest-remainder distribution in generatePayroll exists for this.
SELECT
  'payroll_allocation_drift', l.id::text,
  l.employee_id::text,
  (l.basic_amount + l.overtime_amount + l.bonus), COALESCE(a.allocated, 0)
FROM payroll_lines l
LEFT JOIN LATERAL (
  SELECT SUM(allocated_amount) AS allocated
  FROM payroll_site_allocations WHERE payroll_line_id = l.id
) a ON true
-- A line with no allocation at all is legitimate: office staff work at no site.
WHERE a.allocated IS NOT NULL
  AND ABS((l.basic_amount + l.overtime_amount + l.bonus) - a.allocated) > 0.01

UNION ALL

-- 5. An advance can never be recovered beyond its value, and its balance must
--    be exactly what is left.
SELECT
  'advance_balance_wrong', sa.id::text, sa.employee_id::text,
  sa.balance, (sa.amount - sa.amount_recovered)
FROM salary_advances sa
WHERE sa.deleted_at IS NULL
  AND sa.balance <> sa.amount - sa.amount_recovered

UNION ALL

-- 6. A man cannot work more than one man-day in a day. This is what the
--    normalisation in v_attendance_monthly enforces for pay; a row here means
--    the underlying data itself is impossible.
SELECT
  'attendance_over_one_day', a.employee_id::text, a.date::text,
  SUM(a.day_fraction), 1
FROM attendance a
WHERE a.deleted_at IS NULL AND a.status IN ('present','half_day')
GROUP BY a.employee_id, a.date
HAVING SUM(a.day_fraction) > 1

UNION ALL

-- 7. day_fraction and status must agree, because payroll reads only the former.
SELECT
  'attendance_fraction_vs_status', a.id::text, a.date::text,
  a.day_fraction,
  CASE a.status WHEN 'absent' THEN 0 WHEN 'half_day' THEN 0.5 ELSE 1 END
FROM attendance a
WHERE a.deleted_at IS NULL
  AND ((a.status = 'absent'   AND a.day_fraction <> 0)
    OR (a.status = 'half_day' AND a.day_fraction <> 0.5)
    OR (a.status = 'present'  AND a.day_fraction = 0))

UNION ALL

-- 8. Every cash-book line that claims to mirror something must actually point
--    at a live row. A dangling reference is money whose story cannot be told.
SELECT
  'cash_reference_dangling', cb.id::text, cb.description,
  cb.amount, 0
FROM cash_book cb
WHERE cb.deleted_at IS NULL
  AND cb.reference_table = 'payments'
  AND cb.reference_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM payments p WHERE p.id = cb.reference_id AND p.deleted_at IS NULL
  )

UNION ALL

-- 9. A site cost must belong to a site that exists and is not deleted.
SELECT
  'expense_orphaned_site', e.id::text, e.expense_number, e.amount, 0
FROM expenses e
WHERE e.deleted_at IS NULL
  AND e.site_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM sites s WHERE s.id = e.site_id AND s.deleted_at IS NULL)

UNION ALL

-- 10. Stock on hand may not go negative. Nothing writes stock_ledger yet, so
--     this is a guard against the inventory module arriving without one.
SELECT
  'negative_stock', material_id::text, location_id::text, qty_on_hand, 0
FROM v_stock_on_hand
WHERE qty_on_hand < 0

UNION ALL

-- 11. Every financial mutation must have left an audit row. Checked against the
--     tables carrying audit triggers; a live financial row with no audit
--     history means the trigger was dropped or bypassed.
SELECT
  'financial_row_unaudited', x.id::text, x.tbl, 0, 0
FROM (
  SELECT id, 'payments'   AS tbl FROM payments   WHERE deleted_at IS NULL
  UNION ALL SELECT id, 'cash_book' FROM cash_book WHERE deleted_at IS NULL
  UNION ALL SELECT id, 'invoices'  FROM invoices  WHERE deleted_at IS NULL
  UNION ALL SELECT id, 'expenses'  FROM expenses  WHERE deleted_at IS NULL
) x
WHERE NOT EXISTS (
  SELECT 1 FROM audit_logs al
  WHERE al.table_name = x.tbl AND al.record_id = x.id
);

COMMENT ON VIEW v_integrity_check IS
  'The invariants the business depends on, as one query. Any row is a defect; '
  'empty is correct. Run after every migration and before every release.';
