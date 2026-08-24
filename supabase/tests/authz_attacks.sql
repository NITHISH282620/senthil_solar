-- ============================================================================
-- AUTHORISATION ATTACK SUITE — executable
--
--   docker exec -i supabase_db_<project> psql -U postgres -d postgres \
--     < supabase/tests/authz_attacks.sql
--
-- Every line of output must read BLOCKED, except the block at the end marked
-- LEGITIMATE, which must read ALLOWED. Anything else is a regression.
--
-- Each assertion runs in its own transaction and is rolled back. That is not
-- tidiness: auth_role() is STABLE and argument-free, so PostgreSQL may evaluate
-- it once per statement and reuse the answer. Batching assertions into one
-- statement made a worker appear able to write cash_book, salary_advances and
-- attendance — three false positives. One principal per statement, always.
--
-- Requires supabase/tests/seed_roles.sql, and _who / _escalation_check from
-- supabase/tests/rls_matrix.sql.
-- ============================================================================

\set QUIET on
SET client_min_messages = warning;

CREATE OR REPLACE FUNCTION _attempt(p_role text, p_sql text) RETURNS text
LANGUAGE plpgsql AS $fn$
DECLARE n bigint; v_uid uuid;
BEGIN
  SELECT id INTO v_uid FROM _who WHERE role = p_role;
  IF v_uid IS NULL THEN RETURN 'SKIPPED (no ' || p_role || ' seeded)'; END IF;
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_uid, 'role', 'authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  EXECUTE p_sql;
  GET DIAGNOSTICS n = ROW_COUNT;
  EXECUTE 'RESET ROLE';
  RETURN CASE WHEN n = 0 THEN 'BLOCKED' ELSE 'ALLOWED (' || n || ')' END;
EXCEPTION WHEN others THEN
  EXECUTE 'RESET ROLE';
  RETURN 'BLOCKED';
END; $fn$;
\set QUIET off


\echo ''
\echo '=========== ATTACKS — every line must read BLOCKED ==========='

BEGIN;
SELECT 'manager: promote self to owner' AS attack, _attempt('manager', 'UPDATE profiles SET role=''owner'' WHERE id=(SELECT id FROM _who WHERE role=''manager'')') AS result;
ROLLBACK;

BEGIN;
SELECT 'manager: raise own pay' AS attack, _attempt('manager', 'UPDATE profiles SET daily_rate=99999, monthly_salary=999999 WHERE id=(SELECT id FROM _who WHERE role=''manager'')') AS result;
ROLLBACK;

BEGIN;
SELECT 'manager: change ANOTHER employee''s role' AS attack, _attempt('manager', 'UPDATE profiles SET role=''owner'' WHERE id=(SELECT id FROM _who WHERE role=''worker'') AND id<>(SELECT id FROM _who WHERE role=''manager'')') AS result;
ROLLBACK;

BEGIN;
SELECT 'manager: read the owner''s bank details' AS attack, _attempt('manager', 'SELECT 1 FROM profiles WHERE id=(SELECT id FROM _who WHERE role=''owner'') AND bank_account_no IS NOT NULL') AS result;
ROLLBACK;

BEGIN;
SELECT 'manager: create an invitation (mint a new owner)' AS attack, _attempt('manager', 'INSERT INTO employee_invitations(email,intended_role) VALUES(''mallory-manager@evil.test'',''owner'')') AS result;
ROLLBACK;

BEGIN;
SELECT 'manager: delete audit history' AS attack, _attempt('manager', 'DELETE FROM audit_logs') AS result;
ROLLBACK;

BEGIN;
SELECT 'manager: rewrite audit history' AS attack, _attempt('manager', 'UPDATE audit_logs SET user_role=''worker''') AS result;
ROLLBACK;

BEGIN;
SELECT 'accountant: promote self to owner' AS attack, _attempt('accountant', 'UPDATE profiles SET role=''owner'' WHERE id=(SELECT id FROM _who WHERE role=''accountant'')') AS result;
ROLLBACK;

BEGIN;
SELECT 'accountant: raise own pay' AS attack, _attempt('accountant', 'UPDATE profiles SET daily_rate=99999, monthly_salary=999999 WHERE id=(SELECT id FROM _who WHERE role=''accountant'')') AS result;
ROLLBACK;

BEGIN;
SELECT 'accountant: change ANOTHER employee''s role' AS attack, _attempt('accountant', 'UPDATE profiles SET role=''owner'' WHERE id=(SELECT id FROM _who WHERE role=''worker'') AND id<>(SELECT id FROM _who WHERE role=''accountant'')') AS result;
ROLLBACK;

BEGIN;
SELECT 'accountant: read the owner''s bank details' AS attack, _attempt('accountant', 'SELECT 1 FROM profiles WHERE id=(SELECT id FROM _who WHERE role=''owner'') AND bank_account_no IS NOT NULL') AS result;
ROLLBACK;

BEGIN;
SELECT 'accountant: create an invitation (mint a new owner)' AS attack, _attempt('accountant', 'INSERT INTO employee_invitations(email,intended_role) VALUES(''mallory-accountant@evil.test'',''owner'')') AS result;
ROLLBACK;

BEGIN;
SELECT 'accountant: delete audit history' AS attack, _attempt('accountant', 'DELETE FROM audit_logs') AS result;
ROLLBACK;

BEGIN;
SELECT 'accountant: rewrite audit history' AS attack, _attempt('accountant', 'UPDATE audit_logs SET user_role=''worker''') AS result;
ROLLBACK;

BEGIN;
SELECT 'engineer: promote self to owner' AS attack, _attempt('engineer', 'UPDATE profiles SET role=''owner'' WHERE id=(SELECT id FROM _who WHERE role=''engineer'')') AS result;
ROLLBACK;

BEGIN;
SELECT 'engineer: raise own pay' AS attack, _attempt('engineer', 'UPDATE profiles SET daily_rate=99999, monthly_salary=999999 WHERE id=(SELECT id FROM _who WHERE role=''engineer'')') AS result;
ROLLBACK;

BEGIN;
SELECT 'engineer: change ANOTHER employee''s role' AS attack, _attempt('engineer', 'UPDATE profiles SET role=''owner'' WHERE id=(SELECT id FROM _who WHERE role=''worker'') AND id<>(SELECT id FROM _who WHERE role=''engineer'')') AS result;
ROLLBACK;

BEGIN;
SELECT 'engineer: read the owner''s bank details' AS attack, _attempt('engineer', 'SELECT 1 FROM profiles WHERE id=(SELECT id FROM _who WHERE role=''owner'') AND bank_account_no IS NOT NULL') AS result;
ROLLBACK;

BEGIN;
SELECT 'engineer: create an invitation (mint a new owner)' AS attack, _attempt('engineer', 'INSERT INTO employee_invitations(email,intended_role) VALUES(''mallory-engineer@evil.test'',''owner'')') AS result;
ROLLBACK;

BEGIN;
SELECT 'engineer: delete audit history' AS attack, _attempt('engineer', 'DELETE FROM audit_logs') AS result;
ROLLBACK;

BEGIN;
SELECT 'engineer: rewrite audit history' AS attack, _attempt('engineer', 'UPDATE audit_logs SET user_role=''worker''') AS result;
ROLLBACK;

BEGIN;
SELECT 'supervisor: promote self to owner' AS attack, _attempt('supervisor', 'UPDATE profiles SET role=''owner'' WHERE id=(SELECT id FROM _who WHERE role=''supervisor'')') AS result;
ROLLBACK;

BEGIN;
SELECT 'supervisor: raise own pay' AS attack, _attempt('supervisor', 'UPDATE profiles SET daily_rate=99999, monthly_salary=999999 WHERE id=(SELECT id FROM _who WHERE role=''supervisor'')') AS result;
ROLLBACK;

BEGIN;
SELECT 'supervisor: change ANOTHER employee''s role' AS attack, _attempt('supervisor', 'UPDATE profiles SET role=''owner'' WHERE id=(SELECT id FROM _who WHERE role=''worker'') AND id<>(SELECT id FROM _who WHERE role=''supervisor'')') AS result;
ROLLBACK;

BEGIN;
SELECT 'supervisor: read the owner''s bank details' AS attack, _attempt('supervisor', 'SELECT 1 FROM profiles WHERE id=(SELECT id FROM _who WHERE role=''owner'') AND bank_account_no IS NOT NULL') AS result;
ROLLBACK;

BEGIN;
SELECT 'supervisor: create an invitation (mint a new owner)' AS attack, _attempt('supervisor', 'INSERT INTO employee_invitations(email,intended_role) VALUES(''mallory-supervisor@evil.test'',''owner'')') AS result;
ROLLBACK;

BEGIN;
SELECT 'supervisor: delete audit history' AS attack, _attempt('supervisor', 'DELETE FROM audit_logs') AS result;
ROLLBACK;

BEGIN;
SELECT 'supervisor: rewrite audit history' AS attack, _attempt('supervisor', 'UPDATE audit_logs SET user_role=''worker''') AS result;
ROLLBACK;

BEGIN;
SELECT 'store_manager: promote self to owner' AS attack, _attempt('store_manager', 'UPDATE profiles SET role=''owner'' WHERE id=(SELECT id FROM _who WHERE role=''store_manager'')') AS result;
ROLLBACK;

BEGIN;
SELECT 'store_manager: raise own pay' AS attack, _attempt('store_manager', 'UPDATE profiles SET daily_rate=99999, monthly_salary=999999 WHERE id=(SELECT id FROM _who WHERE role=''store_manager'')') AS result;
ROLLBACK;

BEGIN;
SELECT 'store_manager: change ANOTHER employee''s role' AS attack, _attempt('store_manager', 'UPDATE profiles SET role=''owner'' WHERE id=(SELECT id FROM _who WHERE role=''worker'') AND id<>(SELECT id FROM _who WHERE role=''store_manager'')') AS result;
ROLLBACK;

BEGIN;
SELECT 'store_manager: read the owner''s bank details' AS attack, _attempt('store_manager', 'SELECT 1 FROM profiles WHERE id=(SELECT id FROM _who WHERE role=''owner'') AND bank_account_no IS NOT NULL') AS result;
ROLLBACK;

BEGIN;
SELECT 'store_manager: create an invitation (mint a new owner)' AS attack, _attempt('store_manager', 'INSERT INTO employee_invitations(email,intended_role) VALUES(''mallory-store_manager@evil.test'',''owner'')') AS result;
ROLLBACK;

BEGIN;
SELECT 'store_manager: delete audit history' AS attack, _attempt('store_manager', 'DELETE FROM audit_logs') AS result;
ROLLBACK;

BEGIN;
SELECT 'store_manager: rewrite audit history' AS attack, _attempt('store_manager', 'UPDATE audit_logs SET user_role=''worker''') AS result;
ROLLBACK;

BEGIN;
SELECT 'worker: promote self to owner' AS attack, _attempt('worker', 'UPDATE profiles SET role=''owner'' WHERE id=(SELECT id FROM _who WHERE role=''worker'')') AS result;
ROLLBACK;

BEGIN;
SELECT 'worker: raise own pay' AS attack, _attempt('worker', 'UPDATE profiles SET daily_rate=99999, monthly_salary=999999 WHERE id=(SELECT id FROM _who WHERE role=''worker'')') AS result;
ROLLBACK;

BEGIN;
SELECT 'worker: change ANOTHER employee''s role' AS attack, _attempt('worker', 'UPDATE profiles SET role=''owner'' WHERE id=(SELECT id FROM _who WHERE role=''worker'') AND id<>(SELECT id FROM _who WHERE role=''worker'')') AS result;
ROLLBACK;

BEGIN;
SELECT 'worker: read the owner''s bank details' AS attack, _attempt('worker', 'SELECT 1 FROM profiles WHERE id=(SELECT id FROM _who WHERE role=''owner'') AND bank_account_no IS NOT NULL') AS result;
ROLLBACK;

BEGIN;
SELECT 'worker: create an invitation (mint a new owner)' AS attack, _attempt('worker', 'INSERT INTO employee_invitations(email,intended_role) VALUES(''mallory-worker@evil.test'',''owner'')') AS result;
ROLLBACK;

BEGIN;
SELECT 'worker: delete audit history' AS attack, _attempt('worker', 'DELETE FROM audit_logs') AS result;
ROLLBACK;

BEGIN;
SELECT 'worker: rewrite audit history' AS attack, _attempt('worker', 'UPDATE audit_logs SET user_role=''worker''') AS result;
ROLLBACK;

BEGIN;
SELECT 'client: promote self to owner' AS attack, _attempt('client', 'UPDATE profiles SET role=''owner'' WHERE id=(SELECT id FROM _who WHERE role=''client'')') AS result;
ROLLBACK;

BEGIN;
SELECT 'client: raise own pay' AS attack, _attempt('client', 'UPDATE profiles SET daily_rate=99999, monthly_salary=999999 WHERE id=(SELECT id FROM _who WHERE role=''client'')') AS result;
ROLLBACK;

BEGIN;
SELECT 'client: change ANOTHER employee''s role' AS attack, _attempt('client', 'UPDATE profiles SET role=''owner'' WHERE id=(SELECT id FROM _who WHERE role=''worker'') AND id<>(SELECT id FROM _who WHERE role=''client'')') AS result;
ROLLBACK;

BEGIN;
SELECT 'client: read the owner''s bank details' AS attack, _attempt('client', 'SELECT 1 FROM profiles WHERE id=(SELECT id FROM _who WHERE role=''owner'') AND bank_account_no IS NOT NULL') AS result;
ROLLBACK;

BEGIN;
SELECT 'client: create an invitation (mint a new owner)' AS attack, _attempt('client', 'INSERT INTO employee_invitations(email,intended_role) VALUES(''mallory-client@evil.test'',''owner'')') AS result;
ROLLBACK;

BEGIN;
SELECT 'client: delete audit history' AS attack, _attempt('client', 'DELETE FROM audit_logs') AS result;
ROLLBACK;

BEGIN;
SELECT 'client: rewrite audit history' AS attack, _attempt('client', 'UPDATE audit_logs SET user_role=''worker''') AS result;
ROLLBACK;

BEGIN;
SELECT 'engineer: SELECT cash_book' AS attack, _attempt('engineer', 'SELECT 1 FROM cash_book') AS result;
ROLLBACK;

BEGIN;
SELECT 'engineer: INSERT cash_book' AS attack, _attempt('engineer', 'INSERT INTO cash_book(entry_date,direction,amount,payment_mode,is_office,description) VALUES(CURRENT_DATE,''out'',1,''cash'',true,''x'')') AS result;
ROLLBACK;

BEGIN;
SELECT 'engineer: SELECT invoices' AS attack, _attempt('engineer', 'SELECT 1 FROM invoices') AS result;
ROLLBACK;

BEGIN;
SELECT 'engineer: UPDATE invoices' AS attack, _attempt('engineer', 'UPDATE invoices SET status=''paid''') AS result;
ROLLBACK;

BEGIN;
SELECT 'engineer: INSERT payments' AS attack, _attempt('engineer', 'INSERT INTO payments(company_id,direction,amount,payment_date,payment_method) SELECT id,''inbound'',1,CURRENT_DATE,''cash'' FROM companies LIMIT 1') AS result;
ROLLBACK;

BEGIN;
SELECT 'engineer: SELECT bank_accounts' AS attack, _attempt('engineer', 'SELECT 1 FROM bank_accounts') AS result;
ROLLBACK;

BEGIN;
SELECT 'engineer: SELECT payroll_lines of others' AS attack, _attempt('engineer', 'SELECT 1 FROM payroll_lines WHERE employee_id<>(SELECT id FROM _who WHERE role=''engineer'')') AS result;
ROLLBACK;

BEGIN;
SELECT 'engineer: UPDATE payroll_lines' AS attack, _attempt('engineer', 'UPDATE payroll_lines SET advance_deduction=0') AS result;
ROLLBACK;

BEGIN;
SELECT 'engineer: grant self an advance' AS attack, _attempt('engineer', 'INSERT INTO salary_advances(employee_id,amount,advance_date) VALUES((SELECT id FROM _who WHERE role=''engineer''),50000,CURRENT_DATE)') AS result;
ROLLBACK;

BEGIN;
SELECT 'engineer: SELECT site revenue' AS attack, _attempt('engineer', 'SELECT 1 FROM site_commercials') AS result;
ROLLBACK;

BEGIN;
SELECT 'engineer: SELECT contracts' AS attack, _attempt('engineer', 'SELECT 1 FROM contracts') AS result;
ROLLBACK;

BEGIN;
SELECT 'engineer: SELECT company GST/PAN' AS attack, _attempt('engineer', 'SELECT 1 FROM company_settings') AS result;
ROLLBACK;

BEGIN;
SELECT 'engineer: DELETE sites' AS attack, _attempt('engineer', 'DELETE FROM sites') AS result;
ROLLBACK;

BEGIN;
SELECT 'engineer: DELETE expenses' AS attack, _attempt('engineer', 'DELETE FROM expenses') AS result;
ROLLBACK;

BEGIN;
SELECT 'supervisor: SELECT cash_book' AS attack, _attempt('supervisor', 'SELECT 1 FROM cash_book') AS result;
ROLLBACK;

BEGIN;
SELECT 'supervisor: INSERT cash_book' AS attack, _attempt('supervisor', 'INSERT INTO cash_book(entry_date,direction,amount,payment_mode,is_office,description) VALUES(CURRENT_DATE,''out'',1,''cash'',true,''x'')') AS result;
ROLLBACK;

BEGIN;
SELECT 'supervisor: SELECT invoices' AS attack, _attempt('supervisor', 'SELECT 1 FROM invoices') AS result;
ROLLBACK;

BEGIN;
SELECT 'supervisor: UPDATE invoices' AS attack, _attempt('supervisor', 'UPDATE invoices SET status=''paid''') AS result;
ROLLBACK;

BEGIN;
SELECT 'supervisor: INSERT payments' AS attack, _attempt('supervisor', 'INSERT INTO payments(company_id,direction,amount,payment_date,payment_method) SELECT id,''inbound'',1,CURRENT_DATE,''cash'' FROM companies LIMIT 1') AS result;
ROLLBACK;

BEGIN;
SELECT 'supervisor: SELECT bank_accounts' AS attack, _attempt('supervisor', 'SELECT 1 FROM bank_accounts') AS result;
ROLLBACK;

BEGIN;
SELECT 'supervisor: SELECT payroll_lines of others' AS attack, _attempt('supervisor', 'SELECT 1 FROM payroll_lines WHERE employee_id<>(SELECT id FROM _who WHERE role=''supervisor'')') AS result;
ROLLBACK;

BEGIN;
SELECT 'supervisor: UPDATE payroll_lines' AS attack, _attempt('supervisor', 'UPDATE payroll_lines SET advance_deduction=0') AS result;
ROLLBACK;

BEGIN;
SELECT 'supervisor: grant self an advance' AS attack, _attempt('supervisor', 'INSERT INTO salary_advances(employee_id,amount,advance_date) VALUES((SELECT id FROM _who WHERE role=''supervisor''),50000,CURRENT_DATE)') AS result;
ROLLBACK;

BEGIN;
SELECT 'supervisor: SELECT site revenue' AS attack, _attempt('supervisor', 'SELECT 1 FROM site_commercials') AS result;
ROLLBACK;

BEGIN;
SELECT 'supervisor: SELECT contracts' AS attack, _attempt('supervisor', 'SELECT 1 FROM contracts') AS result;
ROLLBACK;

BEGIN;
SELECT 'supervisor: SELECT company GST/PAN' AS attack, _attempt('supervisor', 'SELECT 1 FROM company_settings') AS result;
ROLLBACK;

BEGIN;
SELECT 'supervisor: DELETE sites' AS attack, _attempt('supervisor', 'DELETE FROM sites') AS result;
ROLLBACK;

BEGIN;
SELECT 'supervisor: DELETE expenses' AS attack, _attempt('supervisor', 'DELETE FROM expenses') AS result;
ROLLBACK;

BEGIN;
SELECT 'store_manager: SELECT cash_book' AS attack, _attempt('store_manager', 'SELECT 1 FROM cash_book') AS result;
ROLLBACK;

BEGIN;
SELECT 'store_manager: INSERT cash_book' AS attack, _attempt('store_manager', 'INSERT INTO cash_book(entry_date,direction,amount,payment_mode,is_office,description) VALUES(CURRENT_DATE,''out'',1,''cash'',true,''x'')') AS result;
ROLLBACK;

BEGIN;
SELECT 'store_manager: SELECT invoices' AS attack, _attempt('store_manager', 'SELECT 1 FROM invoices') AS result;
ROLLBACK;

BEGIN;
SELECT 'store_manager: UPDATE invoices' AS attack, _attempt('store_manager', 'UPDATE invoices SET status=''paid''') AS result;
ROLLBACK;

BEGIN;
SELECT 'store_manager: INSERT payments' AS attack, _attempt('store_manager', 'INSERT INTO payments(company_id,direction,amount,payment_date,payment_method) SELECT id,''inbound'',1,CURRENT_DATE,''cash'' FROM companies LIMIT 1') AS result;
ROLLBACK;

BEGIN;
SELECT 'store_manager: SELECT bank_accounts' AS attack, _attempt('store_manager', 'SELECT 1 FROM bank_accounts') AS result;
ROLLBACK;

BEGIN;
SELECT 'store_manager: SELECT payroll_lines of others' AS attack, _attempt('store_manager', 'SELECT 1 FROM payroll_lines WHERE employee_id<>(SELECT id FROM _who WHERE role=''store_manager'')') AS result;
ROLLBACK;

BEGIN;
SELECT 'store_manager: UPDATE payroll_lines' AS attack, _attempt('store_manager', 'UPDATE payroll_lines SET advance_deduction=0') AS result;
ROLLBACK;

BEGIN;
SELECT 'store_manager: grant self an advance' AS attack, _attempt('store_manager', 'INSERT INTO salary_advances(employee_id,amount,advance_date) VALUES((SELECT id FROM _who WHERE role=''store_manager''),50000,CURRENT_DATE)') AS result;
ROLLBACK;

BEGIN;
SELECT 'store_manager: SELECT site revenue' AS attack, _attempt('store_manager', 'SELECT 1 FROM site_commercials') AS result;
ROLLBACK;

BEGIN;
SELECT 'store_manager: SELECT contracts' AS attack, _attempt('store_manager', 'SELECT 1 FROM contracts') AS result;
ROLLBACK;

BEGIN;
SELECT 'store_manager: SELECT company GST/PAN' AS attack, _attempt('store_manager', 'SELECT 1 FROM company_settings') AS result;
ROLLBACK;

BEGIN;
SELECT 'store_manager: DELETE sites' AS attack, _attempt('store_manager', 'DELETE FROM sites') AS result;
ROLLBACK;

BEGIN;
SELECT 'store_manager: DELETE expenses' AS attack, _attempt('store_manager', 'DELETE FROM expenses') AS result;
ROLLBACK;

BEGIN;
SELECT 'worker: SELECT cash_book' AS attack, _attempt('worker', 'SELECT 1 FROM cash_book') AS result;
ROLLBACK;

BEGIN;
SELECT 'worker: INSERT cash_book' AS attack, _attempt('worker', 'INSERT INTO cash_book(entry_date,direction,amount,payment_mode,is_office,description) VALUES(CURRENT_DATE,''out'',1,''cash'',true,''x'')') AS result;
ROLLBACK;

BEGIN;
SELECT 'worker: SELECT invoices' AS attack, _attempt('worker', 'SELECT 1 FROM invoices') AS result;
ROLLBACK;

BEGIN;
SELECT 'worker: UPDATE invoices' AS attack, _attempt('worker', 'UPDATE invoices SET status=''paid''') AS result;
ROLLBACK;

BEGIN;
SELECT 'worker: INSERT payments' AS attack, _attempt('worker', 'INSERT INTO payments(company_id,direction,amount,payment_date,payment_method) SELECT id,''inbound'',1,CURRENT_DATE,''cash'' FROM companies LIMIT 1') AS result;
ROLLBACK;

BEGIN;
SELECT 'worker: SELECT bank_accounts' AS attack, _attempt('worker', 'SELECT 1 FROM bank_accounts') AS result;
ROLLBACK;

BEGIN;
SELECT 'worker: SELECT payroll_lines of others' AS attack, _attempt('worker', 'SELECT 1 FROM payroll_lines WHERE employee_id<>(SELECT id FROM _who WHERE role=''worker'')') AS result;
ROLLBACK;

BEGIN;
SELECT 'worker: UPDATE payroll_lines' AS attack, _attempt('worker', 'UPDATE payroll_lines SET advance_deduction=0') AS result;
ROLLBACK;

BEGIN;
SELECT 'worker: grant self an advance' AS attack, _attempt('worker', 'INSERT INTO salary_advances(employee_id,amount,advance_date) VALUES((SELECT id FROM _who WHERE role=''worker''),50000,CURRENT_DATE)') AS result;
ROLLBACK;

BEGIN;
SELECT 'worker: SELECT site revenue' AS attack, _attempt('worker', 'SELECT 1 FROM site_commercials') AS result;
ROLLBACK;

BEGIN;
SELECT 'worker: SELECT contracts' AS attack, _attempt('worker', 'SELECT 1 FROM contracts') AS result;
ROLLBACK;

BEGIN;
SELECT 'worker: SELECT company GST/PAN' AS attack, _attempt('worker', 'SELECT 1 FROM company_settings') AS result;
ROLLBACK;

BEGIN;
SELECT 'worker: DELETE sites' AS attack, _attempt('worker', 'DELETE FROM sites') AS result;
ROLLBACK;

BEGIN;
SELECT 'worker: DELETE expenses' AS attack, _attempt('worker', 'DELETE FROM expenses') AS result;
ROLLBACK;

BEGIN;
SELECT 'client: SELECT cash_book' AS attack, _attempt('client', 'SELECT 1 FROM cash_book') AS result;
ROLLBACK;

BEGIN;
SELECT 'client: INSERT cash_book' AS attack, _attempt('client', 'INSERT INTO cash_book(entry_date,direction,amount,payment_mode,is_office,description) VALUES(CURRENT_DATE,''out'',1,''cash'',true,''x'')') AS result;
ROLLBACK;

BEGIN;
SELECT 'client: SELECT invoices' AS attack, _attempt('client', 'SELECT 1 FROM invoices') AS result;
ROLLBACK;

BEGIN;
SELECT 'client: UPDATE invoices' AS attack, _attempt('client', 'UPDATE invoices SET status=''paid''') AS result;
ROLLBACK;

BEGIN;
SELECT 'client: INSERT payments' AS attack, _attempt('client', 'INSERT INTO payments(company_id,direction,amount,payment_date,payment_method) SELECT id,''inbound'',1,CURRENT_DATE,''cash'' FROM companies LIMIT 1') AS result;
ROLLBACK;

BEGIN;
SELECT 'client: SELECT bank_accounts' AS attack, _attempt('client', 'SELECT 1 FROM bank_accounts') AS result;
ROLLBACK;

BEGIN;
SELECT 'client: SELECT payroll_lines of others' AS attack, _attempt('client', 'SELECT 1 FROM payroll_lines WHERE employee_id<>(SELECT id FROM _who WHERE role=''client'')') AS result;
ROLLBACK;

BEGIN;
SELECT 'client: UPDATE payroll_lines' AS attack, _attempt('client', 'UPDATE payroll_lines SET advance_deduction=0') AS result;
ROLLBACK;

BEGIN;
SELECT 'client: grant self an advance' AS attack, _attempt('client', 'INSERT INTO salary_advances(employee_id,amount,advance_date) VALUES((SELECT id FROM _who WHERE role=''client''),50000,CURRENT_DATE)') AS result;
ROLLBACK;

BEGIN;
SELECT 'client: SELECT site revenue' AS attack, _attempt('client', 'SELECT 1 FROM site_commercials') AS result;
ROLLBACK;

BEGIN;
SELECT 'client: SELECT contracts' AS attack, _attempt('client', 'SELECT 1 FROM contracts') AS result;
ROLLBACK;

BEGIN;
SELECT 'client: SELECT company GST/PAN' AS attack, _attempt('client', 'SELECT 1 FROM company_settings') AS result;
ROLLBACK;

BEGIN;
SELECT 'client: DELETE sites' AS attack, _attempt('client', 'DELETE FROM sites') AS result;
ROLLBACK;

BEGIN;
SELECT 'client: DELETE expenses' AS attack, _attempt('client', 'DELETE FROM expenses') AS result;
ROLLBACK;

BEGIN;
SELECT 'engineer: read Site B' AS attack, _attempt('engineer', 'SELECT 1 FROM sites WHERE id=''1c1c2f09-834a-4609-9e1c-9d0a312106d5''') AS result;
ROLLBACK;

BEGIN;
SELECT 'engineer: read Site B attendance' AS attack, _attempt('engineer', 'SELECT 1 FROM attendance WHERE site_id=''1c1c2f09-834a-4609-9e1c-9d0a312106d5''') AS result;
ROLLBACK;

BEGIN;
SELECT 'engineer: write expense on Site B' AS attack, _attempt('engineer', 'INSERT INTO expenses(expense_number,site_id,category,title,amount,created_by) VALUES(''ATK1'',''1c1c2f09-834a-4609-9e1c-9d0a312106d5'',''fuel'',''x'',5,(SELECT id FROM _who WHERE role=''engineer''))') AS result;
ROLLBACK;

BEGIN;
SELECT 'engineer: mark attendance on Site B' AS attack, _attempt('engineer', 'INSERT INTO attendance(employee_id,site_id,date,status) VALUES((SELECT id FROM _who WHERE role=''worker''),''1c1c2f09-834a-4609-9e1c-9d0a312106d5'',CURRENT_DATE,''present'')') AS result;
ROLLBACK;

BEGIN;
SELECT 'engineer: reassign crew to own site' AS attack, _attempt('engineer', 'INSERT INTO site_assignments(site_id,employee_id,role_on_site,assigned_date) VALUES(''fd70abe1-50d3-4b4b-983b-2e9fe3ce86ad'',(SELECT id FROM _who WHERE role=''client''),''worker'',CURRENT_DATE)') AS result;
ROLLBACK;

BEGIN;
SELECT 'worker: mark attendance for someone else' AS attack, _attempt('worker', 'INSERT INTO attendance(employee_id,site_id,date,status) VALUES((SELECT id FROM _who WHERE role=''owner''),''fd70abe1-50d3-4b4b-983b-2e9fe3ce86ad'',CURRENT_DATE,''present'')') AS result;
ROLLBACK;

BEGIN;
SELECT 'worker: approve own expense' AS attack, _attempt('worker', 'UPDATE expenses SET status=''approved''') AS result;
ROLLBACK;

BEGIN;
SELECT 'worker: read documents of others' AS attack, _attempt('worker', 'SELECT 1 FROM documents WHERE uploaded_by IS DISTINCT FROM (SELECT id FROM _who WHERE role=''worker'')') AS result;
ROLLBACK;

BEGIN;
SELECT 'owner: demote the last owner' AS attack, _attempt('owner', 'UPDATE profiles SET role=''worker'' WHERE id=(SELECT id FROM _who WHERE role=''owner'')') AS result;
ROLLBACK;

BEGIN;
SELECT 'owner: deactivate the last owner' AS attack, _attempt('owner', 'UPDATE profiles SET is_active=false WHERE id=(SELECT id FROM _who WHERE role=''owner'')') AS result;
ROLLBACK;

BEGIN;
SELECT 'owner: soft-delete the last owner' AS attack, _attempt('owner', 'UPDATE profiles SET deleted_at=now() WHERE id=(SELECT id FROM _who WHERE role=''owner'')') AS result;
ROLLBACK;


\echo ''
\echo '=========== LEGITIMATE — every line must read ALLOWED ==========='

BEGIN;
SELECT 'owner: set a worker''s pay' AS action, _attempt('owner', 'UPDATE profiles SET daily_rate=800 WHERE id=(SELECT id FROM _who WHERE role=''worker'')') AS result;
ROLLBACK;

BEGIN;
SELECT 'owner: change a role' AS action, _attempt('owner', 'UPDATE profiles SET role=''supervisor'' WHERE id=(SELECT id FROM _who WHERE role=''worker'')') AS result;
ROLLBACK;

BEGIN;
SELECT 'owner: invite an employee' AS action, _attempt('owner', 'INSERT INTO employee_invitations(email,intended_role) VALUES(''legit@senthilsolar.test'',''worker'')') AS result;
ROLLBACK;

BEGIN;
SELECT 'worker: update own phone' AS action, _attempt('worker', 'UPDATE profiles SET phone=''9000000000'' WHERE id=(SELECT id FROM _who WHERE role=''worker'')') AS result;
ROLLBACK;

BEGIN;
SELECT 'manager: correct a worker''s phone' AS action, _attempt('manager', 'UPDATE profiles SET phone=''9111111111'' WHERE id=(SELECT id FROM _who WHERE role=''worker'')') AS result;
ROLLBACK;

BEGIN;
SELECT 'accountant: record a client payment' AS action, _attempt('accountant', 'INSERT INTO payments(company_id,direction,amount,payment_date,payment_method) SELECT id,''inbound'',1,CURRENT_DATE,''cash'' FROM companies LIMIT 1') AS result;
ROLLBACK;

BEGIN;
SELECT 'supervisor: mark crew at own site' AS action, _attempt('supervisor', 'INSERT INTO attendance(employee_id,site_id,date,status) VALUES((SELECT id FROM _who WHERE role=''worker''),''fd70abe1-50d3-4b4b-983b-2e9fe3ce86ad'',CURRENT_DATE-1,''present'')') AS result;
ROLLBACK;

BEGIN;
SELECT 'engineer: expense at own site' AS action, _attempt('engineer', 'INSERT INTO expenses(expense_number,site_id,category,title,amount,created_by) VALUES(''OK1'',''fd70abe1-50d3-4b4b-983b-2e9fe3ce86ad'',''fuel'',''diesel'',500,(SELECT id FROM _who WHERE role=''engineer''))') AS result;
ROLLBACK;

BEGIN;
SELECT 'worker: read own payslip' AS action, _attempt('worker', 'SELECT 1 FROM payroll_lines WHERE employee_id=(SELECT id FROM _who WHERE role=''worker'')') AS result;
ROLLBACK;
