-- ============================================================================
-- Remove the test principals and the Phase 9 simulation from a LOCAL database.
--
--   docker exec -i supabase_db_<project> psql -U postgres -d postgres \
--     < supabase/tests/cleanup_test_data.sql
--
-- Never run this against production. It deletes by naming convention, and a
-- real employee whose email happens to start with "sim." would go with it.
-- ============================================================================

BEGIN;

-- The simulated contract takes its sites, assignments, attendance, expenses and
-- invoices with it through ON DELETE CASCADE and the soft-delete columns.
DELETE FROM cash_book  WHERE site_id IN (SELECT id FROM sites WHERE site_code LIKE 'SIM/%');
DELETE FROM expenses   WHERE site_id IN (SELECT id FROM sites WHERE site_code LIKE 'SIM/%');
DELETE FROM salary_advances WHERE site_id IN (SELECT id FROM sites WHERE site_code LIKE 'SIM/%');
DELETE FROM payments   WHERE invoice_id IN (SELECT id FROM invoices WHERE invoice_number LIKE 'SIM/%');
DELETE FROM invoices   WHERE invoice_number LIKE 'SIM/%';
DELETE FROM sites      WHERE site_code LIKE 'SIM/%';
DELETE FROM contracts  WHERE contract_number LIKE 'SIM/%';
DELETE FROM companies  WHERE company_code IN ('SIM','P3','P3D','P4','P7','P13','P13B','CR','IDEM');
DELETE FROM vendors    WHERE vendor_code LIKE 'SIM/%';

-- Test principals. Deleting the auth user cascades to the profile.
DELETE FROM auth.users WHERE email LIKE 'sim.%' OR email LIKE 't.%@test'
                          OR email IN ('newhire@senthilsolar.test','attacker@evil.test');
DELETE FROM employee_invitations WHERE email LIKE 'sim.%' OR email LIKE 't.%@test'
                          OR email LIKE '%@evil.test' OR email LIKE '%legit%';

SELECT 'remaining profiles: ' || count(*) FROM profiles;
SELECT 'integrity violations: ' || count(*) FROM v_integrity_check;

COMMIT;
