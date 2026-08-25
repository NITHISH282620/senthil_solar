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

COMMIT;
