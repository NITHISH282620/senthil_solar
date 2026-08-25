-- ============================================================================
-- 0016 — THE THREE QUESTIONS THE DASHBOARD COULD NOT ANSWER
--
-- Found by using the application as the owner rather than by reading it: log
-- in, open the dashboard, and try to answer the fourteen questions a
-- contractor actually has at the end of a day. Eleven were answered. Three
-- were not:
--
--   "Who is absent?"            — only a present count existed. Absence is the
--                                 one that costs a day's progress, and it was
--                                 the one not shown.
--   "What do I owe my people?"  — v_employee_dues existed and nothing read it.
--   "What credit am I holding?" — v_client_credit existed and nothing read it.
--
-- The last two are the same mistake twice: building the query and never
-- putting it on the screen, which is how the Rs 50,000 overpayment became
-- invisible in the first place.
-- ============================================================================

-- CREATE OR REPLACE cannot insert a column into the middle of a view.
DROP VIEW IF EXISTS v_dashboard_today;

CREATE VIEW v_dashboard_today
WITH (security_invoker = true) AS
SELECT
  (SELECT COUNT(*) FROM sites
     WHERE status = 'active' AND deleted_at IS NULL) AS active_sites,

  (SELECT COUNT(DISTINCT employee_id) FROM attendance
     WHERE date = (now() AT TIME ZONE 'Asia/Kolkata')::date
       AND status IN ('present','half_day') AND deleted_at IS NULL) AS workers_present_today,

  -- The number that actually costs a day of progress.
  (SELECT COUNT(DISTINCT employee_id) FROM attendance
     WHERE date = (now() AT TIME ZONE 'Asia/Kolkata')::date
       AND status = 'absent' AND deleted_at IS NULL) AS workers_absent_today,

  (SELECT COUNT(DISTINCT employee_id) FROM attendance
     WHERE date = (now() AT TIME ZONE 'Asia/Kolkata')::date
       AND status = 'leave' AND deleted_at IS NULL) AS workers_on_leave_today,

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

  -- Yesterday, so "is today normal?" is answerable without leaving the page.
  (SELECT COALESCE(SUM(amount), 0) FROM cash_book
     WHERE entry_date = (now() AT TIME ZONE 'Asia/Kolkata')::date - 1
       AND direction = 'in' AND deleted_at IS NULL) AS cash_in_yesterday,

  (SELECT COALESCE(SUM(amount), 0) FROM cash_book
     WHERE entry_date = (now() AT TIME ZONE 'Asia/Kolkata')::date - 1
       AND direction = 'out' AND deleted_at IS NULL) AS cash_out_yesterday,

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

  -- What the business owes its own people: claims it has approved but not paid
  -- back, plus wages finalised but not handed over.
  (SELECT COALESCE(SUM(unreimbursed_claims + unpaid_wages), 0)
     FROM v_employee_dues) AS owed_to_employees,

  -- Client money already banked and not yet set against any invoice.
  (SELECT COALESCE(SUM(credit_available), 0) FROM v_client_credit) AS client_credit_held,

  (SELECT COUNT(*) FROM sites
     WHERE status = 'active' AND deleted_at IS NULL
       AND planned_end_date < (now() AT TIME ZONE 'Asia/Kolkata')::date
       AND actual_end_date IS NULL) AS delayed_sites,

  (SELECT COUNT(*) FROM contracts
     WHERE status = 'active' AND deleted_at IS NULL
       AND deadline_date BETWEEN (now() AT TIME ZONE 'Asia/Kolkata')::date
                             AND (now() AT TIME ZONE 'Asia/Kolkata')::date + 7)
    AS contracts_due_this_week;
