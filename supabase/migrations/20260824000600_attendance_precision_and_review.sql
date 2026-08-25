-- ============================================================================
-- 0014 — ATTENDANCE NORMALISATION PRECISION, AND WHAT IS ACTUALLY A DEFECT
--
-- Both problems here surfaced from the full-day simulation in Phase 9, where a
-- supervisor covering four sites and two supervisors covering three each
-- produced three integrity violations.
--
-- PROBLEM 1 — precision. Normalising a man-day across three sites is 1/3 per
-- site, which NUMERIC renders as a repeating decimal that does not sum back:
--
--   Sim Sup1 (4 sites) -> paid_days 1.00000000000000000000
--   Sim Sup2 (3 sites) -> paid_days 0.99999999999999999999
--
-- Rounding downstream hid the financial effect, so nobody would have noticed
-- until a report compared day counts and found 0.9999999 where 1 belonged.
-- The shares are now rounded, with the remainder given to the largest, exactly
-- as generatePayroll does for money.
--
-- PROBLEM 2 — the invariant was wrong, not the data. A supervisor at four
-- sites in one day is NORMAL: he serves four sites and his wage is spread
-- across them. Reporting that as a defect trains the owner to ignore a check
-- that is supposed to mean something, which is worse than having no check.
--
-- What must never happen is being PAID more than one man-day, and that is what
-- v_integrity_check now tests. Raw multi-site days move to a review list,
-- because they are occasionally worth a second look — two supervisors may each
-- believe they had the same man all day — but they are not defects, and the
-- system should not guess between the two readings.
-- ============================================================================

DROP VIEW IF EXISTS v_attendance_monthly;

CREATE VIEW v_attendance_monthly
WITH (security_invoker = true) AS
WITH per_day AS (
  SELECT
    a.employee_id, a.date, a.site_id, a.contract_id, a.status,
    a.overtime_hours, a.within_geofence, a.day_fraction,
    SUM(a.day_fraction) FILTER (WHERE a.status IN ('present','half_day'))
      OVER (PARTITION BY a.employee_id, a.date) AS claimed_on_date,
    ROW_NUMBER() OVER (
      PARTITION BY a.employee_id, a.date
      ORDER BY a.day_fraction DESC, a.site_id
    ) AS share_rank,
    COUNT(*) FILTER (WHERE a.status IN ('present','half_day'))
      OVER (PARTITION BY a.employee_id, a.date) AS sites_on_date
  FROM attendance a
  WHERE a.deleted_at IS NULL
), scaled AS (
  SELECT
    p.*,
    CASE
      WHEN p.status NOT IN ('present','half_day') THEN 0
      WHEN COALESCE(p.claimed_on_date, 0) > 1
        -- Round to four places: enough to split a day between several sites
        -- without a repeating decimal, and far finer than pay ever needs.
        THEN round(p.day_fraction / p.claimed_on_date, 4)
      ELSE p.day_fraction
    END AS paid_fraction
  FROM per_day p
), balanced AS (
  SELECT
    s.*,
    -- Rounding leaves a residue; give it to the largest share so a day is
    -- exactly a day. 1/3 三 times is 0.3333 x 3 = 0.9999, and the missing
    -- 0.0001 belongs to somebody.
    CASE
      WHEN s.share_rank = 1 AND COALESCE(s.claimed_on_date, 0) > 1
        THEN s.paid_fraction + (1 - SUM(s.paid_fraction) OVER (
               PARTITION BY s.employee_id, s.date))
      ELSE s.paid_fraction
    END AS final_fraction
  FROM scaled s
)
SELECT
  b.employee_id,
  EXTRACT(YEAR  FROM b.date)::INT AS period_year,
  EXTRACT(MONTH FROM b.date)::INT AS period_month,
  b.site_id,
  b.contract_id,
  SUM(b.final_fraction)                                                 AS present_days,
  SUM(b.day_fraction) FILTER (WHERE b.status IN ('present','half_day')) AS raw_present_days,
  SUM(b.day_fraction) FILTER (WHERE b.status = 'leave')                 AS leave_days,
  SUM(b.overtime_hours)                                                 AS overtime_hours,
  COUNT(*) FILTER (WHERE b.status = 'absent')                           AS absent_days,
  COUNT(*) FILTER (WHERE b.within_geofence IS FALSE)                    AS out_of_geofence_count
FROM balanced b
GROUP BY b.employee_id, EXTRACT(YEAR FROM b.date), EXTRACT(MONTH FROM b.date),
         b.site_id, b.contract_id;

COMMENT ON VIEW v_attendance_monthly IS
  'Payroll input. present_days is normalised so a calendar day never pays more '
  'than one man-day however many sites the person served, and the rounding '
  'residue is settled so a full day is exactly 1.0000. raw_present_days keeps '
  'what was recorded.';

-- ─── Days worth a second look, which are not defects ────────────────────────

CREATE OR REPLACE VIEW v_attendance_review
WITH (security_invoker = true) AS
SELECT
  a.employee_id,
  p.full_name,
  a.date,
  COUNT(*)                AS sites_marked,
  SUM(a.day_fraction)     AS claimed_days,
  1.0                     AS paid_days,
  array_agg(s.site_code ORDER BY s.site_code) AS sites
FROM attendance a
JOIN profiles p ON p.id = a.employee_id
JOIN sites s    ON s.id = a.site_id
WHERE a.deleted_at IS NULL
  AND a.status IN ('present','half_day')
GROUP BY a.employee_id, p.full_name, a.date
HAVING SUM(a.day_fraction) > 1;

COMMENT ON VIEW v_attendance_review IS
  'Days where someone was marked at several sites for more than a full day in '
  'total. Usually legitimate — a supervisor serving four sites — and always '
  'paid as one day. Occasionally two supervisors each believing they had the '
  'same worker all day, which is worth asking about.';

-- ─── Correct the invariant to test what actually matters ────────────────────

CREATE OR REPLACE VIEW v_integrity_check
WITH (security_invoker = true) AS
SELECT 'invoice_received_mismatch' AS invariant, i.id::text AS record_id,
       i.invoice_number AS reference, i.amount_received AS recorded,
       COALESCE(p.paid, 0) AS derived
FROM invoices i
LEFT JOIN LATERAL (
  SELECT SUM(amount) AS paid FROM payments
  WHERE invoice_id = i.id AND direction = 'inbound' AND deleted_at IS NULL) p ON true
WHERE i.deleted_at IS NULL AND i.amount_received <> COALESCE(p.paid, 0)

UNION ALL
SELECT 'invoice_tds_mismatch', i.id::text, i.invoice_number, i.tds_deducted, COALESCE(p.tds, 0)
FROM invoices i
LEFT JOIN LATERAL (
  SELECT SUM(tds_deducted) AS tds FROM payments
  WHERE invoice_id = i.id AND direction = 'inbound' AND deleted_at IS NULL) p ON true
WHERE i.deleted_at IS NULL AND i.tds_deducted <> COALESCE(p.tds, 0)

UNION ALL
SELECT 'invoice_overpaid', i.id::text, i.invoice_number, i.amount_received, i.net_receivable
FROM invoices i
WHERE i.deleted_at IS NULL AND i.status <> 'cancelled'
  AND i.amount_received > i.net_receivable + 0.01

UNION ALL
SELECT 'payroll_allocation_drift', l.id::text, l.employee_id::text,
       (l.basic_amount + l.overtime_amount + l.bonus), COALESCE(a.allocated, 0)
FROM payroll_lines l
LEFT JOIN LATERAL (
  SELECT SUM(allocated_amount) AS allocated
  FROM payroll_site_allocations WHERE payroll_line_id = l.id) a ON true
WHERE a.allocated IS NOT NULL
  AND ABS((l.basic_amount + l.overtime_amount + l.bonus) - a.allocated) > 0.01

UNION ALL
SELECT 'advance_balance_wrong', sa.id::text, sa.employee_id::text,
       sa.balance, (sa.amount - sa.amount_recovered)
FROM salary_advances sa
WHERE sa.deleted_at IS NULL AND sa.balance <> sa.amount - sa.amount_recovered

UNION ALL
-- What must never happen: being PAID more than one man-day. Serving several
-- sites in a day is normal and lands in v_attendance_review instead.
SELECT 'attendance_paid_over_one_day', v.employee_id::text,
       v.period_month || '/' || v.period_year, SUM(v.present_days), NULL
FROM v_attendance_monthly v
GROUP BY v.employee_id, v.period_month, v.period_year
HAVING SUM(v.present_days) > (
  SELECT COUNT(DISTINCT a.date) FROM attendance a
  WHERE a.employee_id = v.employee_id AND a.deleted_at IS NULL
    AND a.status IN ('present','half_day')
    AND EXTRACT(MONTH FROM a.date) = v.period_month
    AND EXTRACT(YEAR  FROM a.date) = v.period_year) + 0.01

UNION ALL
SELECT 'attendance_fraction_vs_status', a.id::text, a.date::text, a.day_fraction,
       CASE a.status WHEN 'absent' THEN 0 WHEN 'half_day' THEN 0.5 ELSE 1 END
FROM attendance a
WHERE a.deleted_at IS NULL
  AND ((a.status = 'absent'   AND a.day_fraction <> 0)
    OR (a.status = 'half_day' AND a.day_fraction <> 0.5)
    OR (a.status = 'present'  AND a.day_fraction = 0))

UNION ALL
SELECT 'cash_reference_dangling', cb.id::text, cb.description, cb.amount, 0
FROM cash_book cb
WHERE cb.deleted_at IS NULL AND cb.reference_table = 'payments' AND cb.reference_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM payments p WHERE p.id = cb.reference_id AND p.deleted_at IS NULL)

UNION ALL
SELECT 'expense_orphaned_site', e.id::text, e.expense_number, e.amount, 0
FROM expenses e
WHERE e.deleted_at IS NULL AND e.site_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM sites s WHERE s.id = e.site_id AND s.deleted_at IS NULL)

UNION ALL
SELECT 'negative_stock', material_id::text, location_id::text, qty_on_hand, 0
FROM v_stock_on_hand WHERE qty_on_hand < 0

UNION ALL
SELECT 'financial_row_unaudited', x.id::text, x.tbl, 0, 0
FROM (
  SELECT id, 'payments'   AS tbl FROM payments   WHERE deleted_at IS NULL
  UNION ALL SELECT id, 'cash_book' FROM cash_book WHERE deleted_at IS NULL
  UNION ALL SELECT id, 'invoices'  FROM invoices  WHERE deleted_at IS NULL
  UNION ALL SELECT id, 'expenses'  FROM expenses  WHERE deleted_at IS NULL
) x
WHERE NOT EXISTS (
  SELECT 1 FROM audit_logs al WHERE al.table_name = x.tbl AND al.record_id = x.id);
