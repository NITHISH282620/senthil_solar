-- ============================================================================
-- 0013 — EXPENSE LIFECYCLE, AND WHAT THE OWNER OWES HIS OWN PEOPLE
--
-- THE EXPENSE RULE, stated once. Two different things were sharing one table
-- and one status column, which is why the margin could be flattered by a
-- signature that had not happened yet.
--
--   PETTY CASH — the owner, a manager or an accountant spends company cash.
--   Rs 5 tea, Rs 20 parking, Rs 100 diesel. The money has already left the
--   box, so there is nothing to approve: createCashEntry writes the cash_book
--   movement and an expense at 'approved' in the same act. No queue, no
--   second person, no delay.
--
--   EXPENSE CLAIM — a supervisor or engineer spends THEIR OWN money on site.
--   No company cash has moved. The claim is:
--     draft/pending  -> a claim. Not a cost yet, and not cash.
--     approved       -> a recognised cost, and now a debt to that employee.
--     reimbursed     -> the employee has been paid; cash has finally left.
--     rejected       -> neither cost nor debt.
--
-- Only 'approved' and 'reimbursed' count in official profitability, which is
-- why v_site_financials reports pending_cost separately: a Rs 1,50,000 claim
-- waiting for a signature must not quietly turn a 39% site into a 54% one, and
-- must not be invisible either.
--
-- The gap this migration closes: 'reimbursed' existed in the schema and in the
-- UI's status badge, and nothing ever set it. An approved claim was recognised
-- as a cost and then never paid — so cash in hand was overstated by every
-- claim ever approved, and the employee who bought the diesel was never paid
-- back by the system that recorded his doing it.
-- ============================================================================

-- What the business owes its own people, in one place. The owner's evening
-- question "what do I owe employees?" had no answer: unreimbursed claims lived
-- in expenses, unpaid wages in payroll_lines, and advances ran the other way.
CREATE OR REPLACE VIEW v_employee_dues
WITH (security_invoker = true) AS
SELECT
  p.id            AS employee_id,
  p.full_name,
  p.employee_code,
  COALESCE(claims.amount, 0)   AS unreimbursed_claims,
  COALESCE(wages.amount, 0)    AS unpaid_wages,
  COALESCE(adv.balance, 0)     AS advance_owed_to_us,
  -- Net position. Positive: we owe them. Negative: they owe us.
  COALESCE(claims.amount, 0) + COALESCE(wages.amount, 0) - COALESCE(adv.balance, 0)
                               AS net_due_to_employee
FROM profiles p
LEFT JOIN LATERAL (
  SELECT SUM(e.amount) AS amount
  FROM expenses e
  WHERE e.paid_by = p.id
    AND e.status = 'approved'          -- approved but not yet reimbursed
    AND e.deleted_at IS NULL
) claims ON true
LEFT JOIN LATERAL (
  SELECT SUM(l.net_amount) AS amount
  FROM payroll_lines l
  JOIN payroll_runs r ON r.id = l.payroll_run_id
  WHERE l.employee_id = p.id
    AND NOT l.is_paid
    AND r.status IN ('finalised', 'draft')
    AND r.deleted_at IS NULL
) wages ON true
LEFT JOIN LATERAL (
  SELECT SUM(sa.balance) AS balance
  FROM salary_advances sa
  WHERE sa.employee_id = p.id
    AND sa.status IN ('outstanding', 'partially_recovered')
    AND sa.deleted_at IS NULL
) adv ON true
WHERE p.deleted_at IS NULL
  AND (COALESCE(claims.amount, 0) > 0
    OR COALESCE(wages.amount, 0) > 0
    OR COALESCE(adv.balance, 0) > 0);

COMMENT ON VIEW v_employee_dues IS
  'Net position with each employee: unreimbursed claims plus unpaid wages, less '
  'what they still owe on advances. Money roles only, via the underlying RLS.';


-- ─── Petty cash and an expense claim are not the same thing ─────────────────
--
-- Found by building v_employee_dues and reading its first output: it reported
-- the OWNER as owed Rs 13,12,900 in unreimbursed claims. He is owed nothing —
-- that is company cash he spent from the box, recorded through
-- createCashEntry, which sets paid_by to whoever recorded it and status to
-- 'approved'. Structurally identical to a supervisor's claim for diesel he
-- bought with his own money, and the two must never be added together.
--
-- The distinction is now explicit rather than inferred. It could have been
-- inferred — petty cash has a cash_book row pointing at it and a claim does
-- not — but a reimbursement liability should not depend on a join that a future
-- change might quietly break.

ALTER TABLE expenses
  ADD COLUMN paid_from TEXT NOT NULL DEFAULT 'company'
    CHECK (paid_from IN ('company', 'employee'));

COMMENT ON COLUMN expenses.paid_from IS
  'company = petty cash, already out of the box and settled. '
  'employee = the person spent their own money and is owed it back.';

-- Backfill from the cash book: anything the cash book already accounts for was
-- company money. Everything else was a claim.
UPDATE expenses e
SET paid_from = CASE
  WHEN EXISTS (
    SELECT 1 FROM cash_book cb
    WHERE cb.reference_table = 'expenses' AND cb.reference_id = e.id
  ) THEN 'company'
  ELSE 'employee'
END;

CREATE INDEX idx_expenses_to_reimburse ON expenses(paid_by)
  WHERE paid_from = 'employee' AND status = 'approved' AND deleted_at IS NULL;

-- Rebuild the dues view now that a claim can be told from petty cash.
CREATE OR REPLACE VIEW v_employee_dues
WITH (security_invoker = true) AS
SELECT
  p.id            AS employee_id,
  p.full_name,
  p.employee_code,
  COALESCE(claims.amount, 0)   AS unreimbursed_claims,
  COALESCE(wages.amount, 0)    AS unpaid_wages,
  COALESCE(adv.balance, 0)     AS advance_owed_to_us,
  COALESCE(claims.amount, 0) + COALESCE(wages.amount, 0) - COALESCE(adv.balance, 0)
                               AS net_due_to_employee
FROM profiles p
LEFT JOIN LATERAL (
  SELECT SUM(e.amount) AS amount
  FROM expenses e
  WHERE e.paid_by = p.id
    AND e.paid_from = 'employee'       -- their money, not the company's
    AND e.status = 'approved'          -- approved but not yet reimbursed
    AND e.deleted_at IS NULL
) claims ON true
LEFT JOIN LATERAL (
  SELECT SUM(l.net_amount) AS amount
  FROM payroll_lines l
  JOIN payroll_runs r ON r.id = l.payroll_run_id
  WHERE l.employee_id = p.id
    AND NOT l.is_paid
    AND r.status IN ('finalised', 'draft')
    AND r.deleted_at IS NULL
) wages ON true
LEFT JOIN LATERAL (
  SELECT SUM(sa.balance) AS balance
  FROM salary_advances sa
  WHERE sa.employee_id = p.id
    AND sa.status IN ('outstanding', 'partially_recovered')
    AND sa.deleted_at IS NULL
) adv ON true
WHERE p.deleted_at IS NULL
  AND (COALESCE(claims.amount, 0) > 0
    OR COALESCE(wages.amount, 0) > 0
    OR COALESCE(adv.balance, 0) > 0);
