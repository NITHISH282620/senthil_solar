-- ============================================================================
-- Test principals, one per role, for supabase/tests/rls_matrix.sql.
--
-- Inserting into auth.users fires two triggers: guard_user_provisioning(), which
-- refuses any account the owner did not invite, and handle_new_user(), which
-- creates the profile. An invited account is created active with the role the
-- invitation named, so the UPDATE below only has to set pay.
-- ============================================================================

BEGIN;

CREATE TEMP TABLE _p(email text, role text, uid uuid) ON COMMIT DROP;
INSERT INTO _p VALUES
 ('t.manager@test',  'manager',       '11111111-0000-0000-0000-000000000001'),
 ('t.account@test',  'accountant',    '11111111-0000-0000-0000-000000000002'),
 ('t.engineer@test', 'engineer',      '11111111-0000-0000-0000-000000000003'),
 ('t.store@test',    'store_manager', '11111111-0000-0000-0000-000000000004'),
 ('t.client@test',   'client',        '11111111-0000-0000-0000-000000000005'),
 ('t.sup2@test',     'supervisor',    '11111111-0000-0000-0000-000000000006'),
 ('t.workerb@test',  'worker',        '11111111-0000-0000-0000-000000000007');

-- The owner authorises each account before it can exist. Migration 0010 refuses
-- an auth.users insert without an unconsumed invitation, so the harness has to
-- follow the same path a real hire does — which is also worth exercising.
INSERT INTO employee_invitations (email, intended_role, invited_by)
SELECT _p.email, _p.role, (SELECT id FROM profiles WHERE role = 'owner' LIMIT 1)
FROM _p
ON CONFLICT (email) DO UPDATE
  SET consumed_at = NULL, intended_role = EXCLUDED.intended_role;

INSERT INTO auth.users (instance_id, id, aud, role, email, encrypted_password,
                        email_confirmed_at, created_at, updated_at,
                        raw_app_meta_data, raw_user_meta_data)
SELECT '00000000-0000-0000-0000-000000000000', uid, 'authenticated','authenticated',
       email, crypt('Test@1234', gen_salt('bf')), now(), now(), now(),
       '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb
FROM _p
ON CONFLICT (id) DO NOTHING;

UPDATE profiles p
SET role = _p.role,
    is_active = true,
    wage_mode = CASE WHEN _p.role IN ('worker','supervisor','engineer')
                     THEN 'daily' ELSE 'monthly' END,
    daily_rate = CASE WHEN _p.role IN ('worker','supervisor','engineer')
                      THEN 700 END,
    monthly_salary = CASE WHEN _p.role NOT IN ('worker','supervisor','engineer')
                          THEN 30000 END
FROM _p WHERE p.id = _p.uid;

-- Fixtures the legitimate-operations block depends on. Without these it reports
-- BLOCKED for actions that are actually allowed — a false alarm that reads
-- exactly like a real authorisation failure.
INSERT INTO site_assignments (site_id, employee_id, role_on_site, assigned_date, is_active)
SELECT s.id, p.id, p.role, CURRENT_DATE, true
FROM (SELECT id FROM sites WHERE deleted_at IS NULL ORDER BY created_at, site_code LIMIT 1) s
CROSS JOIN profiles p
WHERE p.email IN ('t.sup2@test', 't.engineer@test')
ON CONFLICT DO NOTHING;

-- One payslip, so "worker reads own payslip" has something to read.
INSERT INTO payroll_runs (period_month, period_year, status)
VALUES (1, 2020, 'draft')
ON CONFLICT (period_month, period_year) DO NOTHING;

-- For the worker _who picks: DISTINCT ON (role) ORDER BY role, created_at, i.e.
-- the earliest-created active worker. Naming a different one would leave the
-- assertion reading a payslip that is not its own and reporting BLOCKED.
INSERT INTO payroll_lines (payroll_run_id, employee_id, wage_mode, present_days,
                           rate_used, basic_amount)
SELECT r.id, p.id, 'daily', 1, 700, 700
FROM payroll_runs r,
     (SELECT id FROM profiles
       WHERE role = 'worker' AND is_active AND deleted_at IS NULL
       ORDER BY created_at LIMIT 1) p
WHERE r.period_month = 1 AND r.period_year = 2020
ON CONFLICT (payroll_run_id, employee_id) DO NOTHING;

COMMIT;
