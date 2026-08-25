-- ============================================================================
-- IDEMPOTENT MONEY WRITES — executable
--
--   docker exec -i supabase_db_<project> psql -U postgres -d postgres \
--     < supabase/tests/idempotency.sql
--
-- Note: run WITHOUT -v ON_ERROR_STOP=1. The duplicate-key errors below are the
-- assertions passing.
--
-- The forms disable their button while submitting, which handles a fast
-- double-click and nothing else. These are the failures a contractor on a site
-- actually hits: a response lost on a weak connection, a refresh, a retry after
-- a timeout that had already been processed. Each of those would otherwise
-- create a second cash entry, a second receipt or a second expense.
-- ============================================================================

\pset footer off
SET client_min_messages = warning;
BEGIN;

INSERT INTO companies(company_code, name, state_code, status)
VALUES ('IDEM', 'Idempotency Test Ltd', '33', 'active');

INSERT INTO invoices(invoice_number, company_id, invoice_date, due_date, subtotal, status)
SELECT 'IDEM/INV', id, CURRENT_DATE, CURRENT_DATE + 30, 1000000, 'sent'
FROM companies WHERE company_code = 'IDEM';

\echo ''
\echo '=== cash entry: the same submission arriving twice ==='
INSERT INTO cash_book(entry_date, direction, amount, payment_mode, is_office, description, request_key)
VALUES (CURRENT_DATE, 'out', 100, 'cash', true, 'Rs 100 diesel', 'test-cash-1');
SAVEPOINT a;
INSERT INTO cash_book(entry_date, direction, amount, payment_mode, is_office, description, request_key)
VALUES (CURRENT_DATE, 'out', 100, 'cash', true, 'Rs 100 diesel', 'test-cash-1');
ROLLBACK TO a;
SELECT count(*) AS rows, sum(amount) AS total, 'expect 1 / 100.00' AS expected
FROM cash_book WHERE request_key = 'test-cash-1';

\echo ''
\echo '=== client receipt: a PARTIAL payment retried ==='
\echo '    The balance would absorb a second one, so only the key can stop it.'
INSERT INTO payments(invoice_id, company_id, direction, amount, payment_date, payment_method, request_key)
SELECT id, company_id, 'inbound', 10000, CURRENT_DATE, 'upi', 'test-pay-1'
FROM invoices WHERE invoice_number = 'IDEM/INV';
SAVEPOINT b;
INSERT INTO payments(invoice_id, company_id, direction, amount, payment_date, payment_method, request_key)
SELECT id, company_id, 'inbound', 10000, CURRENT_DATE, 'upi', 'test-pay-1'
FROM invoices WHERE invoice_number = 'IDEM/INV';
ROLLBACK TO b;
SELECT amount_received, balance_due, 'expect 10000.00 / 990000.00' AS expected
FROM invoices WHERE invoice_number = 'IDEM/INV';

\echo ''
\echo '=== expense claim retried ==='
INSERT INTO expenses(expense_number, category, expense_date, title, amount, paid_from, status, request_key)
VALUES ('IDEM/E1', 'fuel', CURRENT_DATE, 'Diesel', 500, 'employee', 'pending', 'test-exp-1');
SAVEPOINT c;
INSERT INTO expenses(expense_number, category, expense_date, title, amount, paid_from, status, request_key)
VALUES ('IDEM/E2', 'fuel', CURRENT_DATE, 'Diesel', 500, 'employee', 'pending', 'test-exp-1');
ROLLBACK TO c;
SELECT count(*) AS rows, sum(amount) AS total, 'expect 1 / 500.00' AS expected
FROM expenses WHERE request_key = 'test-exp-1';

\echo ''
\echo '=== a genuinely new entry must still go through ==='
INSERT INTO cash_book(entry_date, direction, amount, payment_mode, is_office, description, request_key)
VALUES (CURRENT_DATE, 'out', 100, 'cash', true, 'Rs 100 diesel again', 'test-cash-2');
SELECT count(*) AS rows, 'expect 2' AS expected
FROM cash_book WHERE request_key LIKE 'test-cash-%';

\echo ''
\echo '=== rows without a key are unaffected: the index is partial ==='
INSERT INTO cash_book(entry_date, direction, amount, payment_mode, is_office, description)
VALUES (CURRENT_DATE, 'out', 7, 'cash', true, 'no key A'),
       (CURRENT_DATE, 'out', 7, 'cash', true, 'no key B');
SELECT count(*) AS rows, 'expect 2' AS expected
FROM cash_book WHERE request_key IS NULL AND amount = 7;

ROLLBACK;
