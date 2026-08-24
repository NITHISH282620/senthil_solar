-- ============================================================================
-- RLS ACCESS MATRIX — executable
--
-- Produces ROLE_ACCESS_MATRIX.md's read columns by actually running each query
-- as each principal, rather than by reading policy source. Reading policies is
-- how the escalation in migration 0009 survived review in the first place.
--
--   docker exec -i supabase_db_<project> psql -U postgres -d postgres \
--     < supabase/tests/rls_matrix.sql
--
-- Expects one active profile per role. Seed with supabase/tests/seed_roles.sql.
--
-- IMPORTANT: _probe must be called one principal per statement. auth_role() is
-- STABLE and takes no arguments, so within a single statement PostgreSQL is
-- free to evaluate it once and reuse the answer for every row — which silently
-- reports one principal's permissions under another's name. The write suite
-- below therefore uses one transaction per assertion; batching it produced
-- false ALLOWED results on cash_book, salary_advances and attendance.
-- ============================================================================

CREATE OR REPLACE FUNCTION _probe(p_uid uuid, p_sql text) RETURNS text
LANGUAGE plpgsql AS $$
DECLARE n bigint;
BEGIN
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  EXECUTE 'SELECT count(*) FROM (' || p_sql || ') z' INTO n;
  EXECUTE 'RESET ROLE';
  RETURN n::text;
EXCEPTION WHEN others THEN
  EXECUTE 'RESET ROLE';
  RETURN 'DENIED';
END; $$;

COMMENT ON FUNCTION _probe IS
  'Runs one SELECT as one principal and reports the visible row count.';

CREATE OR REPLACE VIEW _who AS
SELECT DISTINCT ON (p.role) p.id, p.role,
  CASE p.role WHEN 'owner' THEN 1 WHEN 'manager' THEN 2 WHEN 'accountant' THEN 3
              WHEN 'engineer' THEN 4 WHEN 'supervisor' THEN 5
              WHEN 'store_manager' THEN 6 WHEN 'worker' THEN 7 ELSE 8 END AS ord
FROM profiles p
WHERE p.is_active AND p.deleted_at IS NULL
ORDER BY p.role, p.created_at;

\echo ''
\echo '=== FINANCIAL VISIBILITY (field roles must be 0 across the money columns) ==='
SELECT w.role,
  _probe(w.id,'select 1 from companies')       AS clients,
  _probe(w.id,'select 1 from contracts')       AS contracts,
  _probe(w.id,'select 1 from invoices')        AS invoices,
  _probe(w.id,'select 1 from payments')        AS payments,
  _probe(w.id,'select 1 from cash_book')       AS cash,
  _probe(w.id,'select 1 from bank_accounts')   AS bank,
  _probe(w.id,'select 1 from expenses')        AS expenses,
  _probe(w.id,'select 1 from salary_advances') AS advances,
  _probe(w.id,'select 1 from payroll_lines')   AS payslips,
  _probe(w.id,'select 1 from audit_logs')      AS audit
FROM _who w ORDER BY w.ord;

\echo ''
\echo '=== SITE SCOPING AND THE REVENUE BOUNDARY ==='
\echo '    site_revenue MUST be 0 for engineer, supervisor, store, worker, client.'
SELECT w.role,
  _probe(w.id,'select 1 from sites')             AS sites,
  _probe(w.id,'select 1 from attendance')        AS attendance,
  _probe(w.id,'select 1 from site_commercials')  AS site_revenue,
  _probe(w.id,'select 1 from v_site_financials where revenue_allocated is not null')
                                                 AS pnl_with_revenue,
  _probe(w.id,'select 1 from v_directory')       AS roster,
  _probe(w.id,'select 1 from profiles')          AS full_profiles
FROM _who w ORDER BY w.ord;

\echo ''
\echo '=== PRIVILEGE ESCALATION (every line must say BLOCKED) ==='
\echo '    Each runs in its own transaction: see the note on STABLE caching above.'

CREATE OR REPLACE FUNCTION _escalation_check(p_uid uuid, p_sql text) RETURNS text
LANGUAGE plpgsql AS $$
DECLARE n bigint;
BEGIN
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  EXECUTE p_sql;
  GET DIAGNOSTICS n = ROW_COUNT;
  EXECUTE 'RESET ROLE';
  RETURN CASE WHEN n = 0 THEN 'BLOCKED' ELSE '*** ALLOWED — REGRESSION ***' END;
EXCEPTION WHEN insufficient_privilege THEN
  EXECUTE 'RESET ROLE'; RETURN 'BLOCKED';
WHEN others THEN
  EXECUTE 'RESET ROLE'; RETURN 'BLOCKED';
END; $$;

BEGIN;
SELECT 'worker promotes self to owner' AS attack,
       _escalation_check((SELECT id FROM _who WHERE role='worker'),
         'UPDATE profiles SET role=''owner'' WHERE id=' ||
         quote_literal((SELECT id FROM _who WHERE role='worker')) || '::uuid') AS result;
ROLLBACK;

BEGIN;
SELECT 'worker raises own daily_rate' AS attack,
       _escalation_check((SELECT id FROM _who WHERE role='worker'),
         'UPDATE profiles SET daily_rate=99999 WHERE id=' ||
         quote_literal((SELECT id FROM _who WHERE role='worker')) || '::uuid') AS result;
ROLLBACK;

BEGIN;
SELECT 'accountant promotes self to owner' AS attack,
       _escalation_check((SELECT id FROM _who WHERE role='accountant'),
         'UPDATE profiles SET role=''owner'' WHERE id=' ||
         quote_literal((SELECT id FROM _who WHERE role='accountant')) || '::uuid') AS result;
ROLLBACK;

BEGIN;
SELECT 'manager demotes the owner' AS attack,
       _escalation_check((SELECT id FROM _who WHERE role='manager'),
         'UPDATE profiles SET role=''worker'' WHERE id=' ||
         quote_literal((SELECT id FROM _who WHERE role='owner')) || '::uuid') AS result;
ROLLBACK;

BEGIN;
SELECT 'manager rewrites owner bank account' AS attack,
       _escalation_check((SELECT id FROM _who WHERE role='manager'),
         'UPDATE profiles SET bank_account_no=''999'' WHERE id=' ||
         quote_literal((SELECT id FROM _who WHERE role='owner')) || '::uuid') AS result;
ROLLBACK;

BEGIN;
SELECT 'supervisor promotes self to manager' AS attack,
       _escalation_check((SELECT id FROM _who WHERE role='supervisor'),
         'UPDATE profiles SET role=''manager'' WHERE id=' ||
         quote_literal((SELECT id FROM _who WHERE role='supervisor')) || '::uuid') AS result;
ROLLBACK;
