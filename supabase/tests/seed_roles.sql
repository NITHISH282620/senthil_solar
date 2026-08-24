-- ============================================================================
-- Test principals, one per role, for supabase/tests/rls_matrix.sql.
--
-- Inserting into auth.users fires handle_new_user(), which creates the profile
-- and — since migration 0009 — creates it INACTIVE. The UPDATE that follows is
-- what admits each test user, which is itself the behaviour being relied on.
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
