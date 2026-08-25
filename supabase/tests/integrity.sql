-- ============================================================================
-- DATA INTEGRITY — check, and a self-test that the check works
--
--   docker exec -i supabase_db_<project> psql -U postgres -d postgres \
--     < supabase/tests/integrity.sql
--
-- Part 1 must return no rows. Part 2 injects one defect of each class it can
-- reach and asserts the view reports them, then rolls back — because a check
-- that is vacuously empty is worse than no check at all: it reassures.
--
-- Expected in part 2: three classes caught —
--   attendance_fraction_vs_status, cash_reference_dangling,
--   financial_row_unaudited
-- The money invariants are not injectable here: overpayment, advance balance
-- and allocation drift are all held by constraints or generated columns, so
-- producing a violating row would mean defeating the very guard under test.
-- ============================================================================

\pset footer off
SET client_min_messages = warning;

\echo ''
\echo '=== PART 1: live data — every invariant must be clean ==='
SELECT invariant, record_id, reference, recorded, derived
FROM v_integrity_check
ORDER BY invariant;

\echo ''
\echo '=== PART 2: self-test — the check must catch injected defects ==='
BEGIN;

-- An unaudited financial mutation.
ALTER TABLE payments DISABLE TRIGGER audit_payments;
INSERT INTO payments(company_id, direction, amount, payment_date, payment_method)
SELECT id, 'inbound', 1, CURRENT_DATE, 'cash' FROM companies LIMIT 1;
ALTER TABLE payments ENABLE TRIGGER audit_payments;

-- A day_fraction contradicting its status. Payroll reads only the fraction, so
-- the two disagreeing is what let a half day be paid in full. Requires
-- disabling the trigger that normally keeps them in step.
--
-- Note what is NOT injected here: a person marked present at several sites on
-- one day. That was a defect under the old invariant and is not one now —
-- v_attendance_monthly normalises it to a single man-day, and a supervisor
-- serving four sites is ordinary. It belongs in v_attendance_review, not here.
ALTER TABLE attendance DISABLE TRIGGER attendance_sync_day_fraction;
INSERT INTO attendance(employee_id, site_id, date, status, day_fraction, source)
SELECT p.id, s.id, DATE '2027-01-09', 'half_day', 1.0, 'admin'
FROM profiles p, sites s
WHERE p.role = 'worker' AND s.deleted_at IS NULL
ORDER BY p.created_at, s.created_at LIMIT 1;
ALTER TABLE attendance ENABLE TRIGGER attendance_sync_day_fraction;

-- A cash line mirroring a payment that does not exist.
INSERT INTO cash_book(entry_date, direction, amount, payment_mode, is_office,
                      description, reference_table, reference_id)
VALUES (CURRENT_DATE, 'in', 5000, 'cash', true, 'self-test dangling',
        'payments', '99999999-9999-9999-9999-999999999999');

SELECT invariant, count(*) AS caught
FROM v_integrity_check
GROUP BY invariant ORDER BY invariant;

ROLLBACK;

\echo ''
\echo '=== clean again after rollback (must be 0) ==='
SELECT count(*) AS violations FROM v_integrity_check;
