-- ============================================================================
-- 0010 — CONTROLLED PROVISIONING, OWNER RECOVERABILITY, SETTINGS EXPOSURE
--
-- Reproduced before writing this, against the running stack:
--
--   POST /auth/v1/signup {"email":"attacker@evil.test", ...}   -> HTTP 200
--   ... returns a usable access_token (MAILER_AUTOCONFIRM=true)
--
-- and with that token, through the public REST API:
--
--   GET /rest/v1/company_settings   -> 1 row: GST number, PAN, address, phone
--   GET /rest/v1/roles              -> 8 rows
--   GET /rest/v1/expense_categories -> 20 rows
--
-- Migration 0009 already made the account dormant, so every business table
-- returned 0 rows. What remains is that an uninvited stranger could create an
-- account at all, and could read the company's statutory identity.
--
-- The intended model is the only one:
--     owner creates the account -> assigns role -> assigns site -> user logs in
-- ============================================================================

-- ─── 1. No account exists that the owner did not ask for ────────────────────
--
-- `enable_signup = false` in supabase/config.toml is the first line of defence,
-- but it is a platform setting: it can be flipped in a dashboard, lost in a
-- project migration, or differ between environments. The invariant is enforced
-- here as well so it travels with the schema.
--
-- Finding the right discriminator took a measurement. The obvious one —
-- requiring a marker in raw_app_meta_data, which only the admin API can set —
-- does not work: GoTrue applies app_metadata in an UPDATE *after* the INSERT,
-- so at BEFORE INSERT time the column holds only
-- {"provider":"email","providers":["email"]} for an admin-created user exactly
-- as it does for a self-signup. Guarding on it rejected the owner's own
-- provisioning path, which was verified by capturing what the trigger actually
-- receives rather than by assuming.
--
-- raw_user_meta_data is no good either: a signup request can set it freely.
--
-- So authorisation is recorded before the account is made. The owner writes an
-- invitation; the trigger admits an address only if one exists. The table is
-- owner-only under RLS, so a public signup has no way to create its own
-- permission slip. This also matches the intended model exactly, and leaves a
-- record of who admitted whom.

CREATE TABLE employee_invitations (
  email       TEXT PRIMARY KEY,
  invited_by  UUID REFERENCES profiles(id) ON DELETE SET NULL,
  intended_role TEXT REFERENCES roles(code),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  consumed_at TIMESTAMPTZ,
  CONSTRAINT invitation_email_lower CHECK (email = lower(email))
);

COMMENT ON TABLE employee_invitations IS
  'The owner''s permission slip for an account to exist. guard_user_provisioning '
  'refuses any auth.users insert without an unconsumed row here.';

CREATE INDEX idx_invitations_open ON employee_invitations(email)
  WHERE consumed_at IS NULL;

ALTER TABLE employee_invitations ENABLE ROW LEVEL SECURITY;

-- Only the owner, and only through the owner's own session. The service-role
-- key bypasses RLS entirely, which is what lets createEmployee write it.
CREATE POLICY invitations_owner_all ON employee_invitations FOR ALL TO authenticated
  USING (auth_is_owner()) WITH CHECK (auth_is_owner());

CREATE OR REPLACE FUNCTION guard_user_provisioning()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_email TEXT := lower(COALESCE(NEW.email, ''));
BEGIN
  -- Bootstrap: the very first account becomes the owner. Without this there is
  -- no way to stand a new deployment up at all.
  IF NOT EXISTS (SELECT 1 FROM profiles) THEN
    RETURN NEW;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM employee_invitations
    WHERE email = v_email AND consumed_at IS NULL
  ) THEN
    RAISE EXCEPTION
      'Accounts are created by the owner, not by signing up. Ask the owner to add you.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Single use. A leaked invitation cannot be replayed into a second account.
  UPDATE employee_invitations
  SET consumed_at = now()
  WHERE email = v_email AND consumed_at IS NULL;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION guard_user_provisioning IS
  'Rejects self-registration: an account requires an unconsumed, owner-created '
  'invitation. Invitations are single use.';

DROP TRIGGER IF EXISTS on_auth_user_provisioning ON auth.users;
CREATE TRIGGER on_auth_user_provisioning
  BEFORE INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION guard_user_provisioning();

-- An account the owner deliberately invited is active immediately; there is no
-- one else who could activate it, and making the owner do it twice is friction
-- for no security gain. The dormant path from migration 0009 remains as a
-- backstop for any account that reaches auth.users another way.
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_is_first BOOLEAN;
  v_invited  BOOLEAN;
  v_role     TEXT;
  v_code     TEXT;
  v_prefix   TEXT;
BEGIN
  SELECT NOT EXISTS (SELECT 1 FROM profiles) INTO v_is_first;

  SELECT true, COALESCE(intended_role, 'worker')
    INTO v_invited, v_role
  FROM employee_invitations
  WHERE email = lower(NEW.email)
  ORDER BY consumed_at DESC NULLS FIRST
  LIMIT 1;

  v_invited := COALESCE(v_invited, false);

  SELECT COALESCE(employee_prefix, 'EMP') INTO v_prefix FROM company_settings LIMIT 1;
  v_code := next_document_number('employee', COALESCE(v_prefix, 'EMP'));

  INSERT INTO profiles (id, employee_code, full_name, email, role,
                        wage_mode, is_active)
  VALUES (
    NEW.id,
    v_code,
    COALESCE(NULLIF(TRIM(NEW.raw_user_meta_data ->> 'full_name'), ''),
             split_part(NEW.email, '@', 1)),
    NEW.email,
    CASE WHEN v_is_first THEN 'owner' ELSE COALESCE(v_role, 'worker') END,
    'daily',
    v_is_first OR v_invited
  );

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION handle_new_user IS
  'Bootstraps the first account as owner; an invited account starts active with '
  'the role the owner intended; anything else starts dormant and reads nothing.';


-- ─── 2. The owner must always be able to get back in ────────────────────────
--
-- Nothing stopped the last owner from being demoted, deactivated or
-- soft-deleted. The company would then have no principal who could restore
-- anyone — auth_is_owner() would be false for every user, and no policy grants
-- the necessary write. That is an unrecoverable lockout, and it needs no
-- attacker: one mistaken edit does it.

CREATE OR REPLACE FUNCTION guard_last_owner()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_other_owners INT;
BEGIN
  -- Only care when this row is ceasing to be a usable owner.
  IF OLD.role <> 'owner' THEN RETURN NEW; END IF;
  IF NEW.role = 'owner' AND NEW.is_active AND NEW.deleted_at IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT COUNT(*) INTO v_other_owners
  FROM profiles
  WHERE role = 'owner' AND is_active AND deleted_at IS NULL AND id <> OLD.id;

  IF v_other_owners = 0 THEN
    RAISE EXCEPTION
      'This is the only active owner. Promote another owner before changing this account.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION guard_last_owner IS
  'Prevents locking the business out of its own system by demoting, '
  'deactivating or deleting the last active owner.';

DROP TRIGGER IF EXISTS profiles_guard_last_owner ON profiles;
CREATE TRIGGER profiles_guard_last_owner
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION guard_last_owner();


-- ─── 3. The company's statutory identity is not reference data ──────────────
--
-- company_settings_read was USING (true), so any authenticated user — a
-- dormant self-registration included — could read the GST number, the PAN, the
-- CIN, the registered address and the company's contact details. Those appear
-- on invoices the company issues to clients, so this is not a catastrophe, but
-- there is no reason for a stranger or a helper on a roof to have it.
--
-- Field staff do need two operational values: the OT threshold, which
-- attendance check-out uses to derive overtime, and the geofence radius. Those
-- move to a view that exposes nothing else.

DROP POLICY IF EXISTS company_settings_read ON company_settings;
CREATE POLICY company_settings_read ON company_settings FOR SELECT TO authenticated
  USING (auth_can_see_money());

CREATE OR REPLACE VIEW v_work_settings
WITH (security_invoker = false) AS
SELECT
  cs.shift_start_time,
  cs.shift_end_time,
  cs.standard_hours_per_day,
  cs.ot_after_hours,
  cs.default_geofence_radius_m,
  cs.working_days_per_month
FROM company_settings cs
-- Any active employee, and nobody else: auth_role() is NULL for a dormant or
-- deleted account, which is what keeps a self-registration out.
WHERE auth_role() IS NOT NULL;

COMMENT ON VIEW v_work_settings IS
  'Shift, overtime and geofence rules for any active employee. Carries no GST, '
  'PAN, CIN, address or contact details.';

REVOKE ALL ON v_work_settings FROM anon;
GRANT SELECT ON v_work_settings TO authenticated;

-- Reference lookups are harmless in themselves, but a dormant account has no
-- business enumerating anything. auth_role() is NULL until the owner admits
-- them, so this closes the last of what a self-registration could read.
DROP POLICY IF EXISTS roles_read ON roles;
CREATE POLICY roles_read ON roles FOR SELECT TO authenticated
  USING (auth_role() IS NOT NULL);

DROP POLICY IF EXISTS expense_categories_read ON expense_categories;
CREATE POLICY expense_categories_read ON expense_categories FOR SELECT TO authenticated
  USING (auth_role() IS NOT NULL);

DROP POLICY IF EXISTS site_stages_read ON site_stages;
CREATE POLICY site_stages_read ON site_stages FOR SELECT TO authenticated
  USING (auth_role() IS NOT NULL);

DROP POLICY IF EXISTS role_permissions_read ON role_permissions;
CREATE POLICY role_permissions_read ON role_permissions FOR SELECT TO authenticated
  USING (auth_role() IS NOT NULL);

DROP POLICY IF EXISTS materials_read ON materials;
CREATE POLICY materials_read ON materials FOR SELECT TO authenticated
  USING (deleted_at IS NULL AND auth_role() IS NOT NULL);

DROP POLICY IF EXISTS stock_locations_read ON stock_locations;
CREATE POLICY stock_locations_read ON stock_locations FOR SELECT TO authenticated
  USING (deleted_at IS NULL AND auth_role() IS NOT NULL);
