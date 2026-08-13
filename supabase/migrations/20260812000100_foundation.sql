-- ============================================================================
-- 0001 — FOUNDATION
-- Extensions, shared triggers, RBAC primitives, RLS helper functions,
-- document numbering, and the generic audit trail.
--
-- Everything else in the schema depends on this file.
-- Rollback: supabase/rollback/0001_foundation.down.sql
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;   -- gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS pg_trgm;    -- trigram indexes for search

-- ─── Shared triggers ────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION set_updated_at IS
  'Maintains updated_at. Attach as BEFORE UPDATE on every mutable table.';

-- ─── Roles ──────────────────────────────────────────────────────────────────
-- A lookup table rather than a CHECK constraint: the business will add roles,
-- and doing so must not require a schema migration plus a redeploy.

CREATE TABLE roles (
  code       TEXT PRIMARY KEY,
  label      TEXT NOT NULL,
  rank       INT  NOT NULL,             -- higher = more authority
  is_field   BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE roles IS
  'System roles. rank orders authority; is_field marks roles that work on site.';

INSERT INTO roles (code, label, rank, is_field) VALUES
  ('owner',         'Owner',         100, false),
  ('manager',       'Manager',        80, false),
  ('accountant',    'Accountant',     70, false),
  ('engineer',      'Site Engineer',  60, true),
  ('supervisor',    'Supervisor',     50, true),
  ('store_manager', 'Store Manager',  50, false),
  ('worker',        'Worker',         10, true),
  ('client',        'Client Portal',   5, false);

-- Resource-level permission matrix. Consulted by the application layer for
-- navigation and action gating; RLS enforces the same rules independently.
CREATE TABLE role_permissions (
  role_code  TEXT NOT NULL REFERENCES roles(code) ON DELETE CASCADE,
  resource   TEXT NOT NULL,
  can_read   BOOLEAN NOT NULL DEFAULT false,
  can_create BOOLEAN NOT NULL DEFAULT false,
  can_update BOOLEAN NOT NULL DEFAULT false,
  can_delete BOOLEAN NOT NULL DEFAULT false,
  can_approve BOOLEAN NOT NULL DEFAULT false,
  scope      TEXT NOT NULL DEFAULT 'all'
             CHECK (scope IN ('all', 'assigned_sites', 'own')),
  PRIMARY KEY (role_code, resource)
);

COMMENT ON COLUMN role_permissions.scope IS
  'all = every row; assigned_sites = rows for sites the user is assigned to; own = rows the user owns.';

-- ─── Profiles ───────────────────────────────────────────────────────────────

CREATE TABLE profiles (
  id            UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  employee_code TEXT UNIQUE NOT NULL,
  full_name     TEXT NOT NULL,
  email         TEXT UNIQUE NOT NULL,
  phone         TEXT,
  role          TEXT NOT NULL DEFAULT 'worker' REFERENCES roles(code),

  -- Trade / classification
  trade         TEXT CHECK (trade IN
                  ('electrician','helper','supervisor','engineer','driver',
                   'welder','fitter','office','other')),
  department    TEXT,
  designation   TEXT,

  -- Compensation
  wage_mode     TEXT NOT NULL DEFAULT 'daily'
                CHECK (wage_mode IN ('monthly','daily','piece_rate')),
  monthly_salary   NUMERIC(14,2) CHECK (monthly_salary >= 0),
  daily_rate       NUMERIC(14,2) CHECK (daily_rate >= 0),
  ot_rate_per_hour NUMERIC(14,2) CHECK (ot_rate_per_hour >= 0),
  piece_rate       NUMERIC(14,2) CHECK (piece_rate >= 0),

  -- Statutory / KYC
  aadhaar_number TEXT,
  pan_number     TEXT,
  pf_number      TEXT,
  esi_number     TEXT,

  -- Banking
  bank_name       TEXT,
  bank_account_no TEXT,
  bank_ifsc       TEXT,
  upi_id          TEXT,

  -- Employment
  date_of_joining DATE,
  date_of_leaving DATE,
  reports_to      UUID REFERENCES profiles(id) ON DELETE SET NULL,

  emergency_contact_name  TEXT,
  emergency_contact_phone TEXT,
  address     TEXT,
  avatar_url  TEXT,
  notes       TEXT,

  is_active   BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by  UUID REFERENCES profiles(id) ON DELETE SET NULL,
  deleted_at  TIMESTAMPTZ,

  CONSTRAINT profile_leaving_after_joining
    CHECK (date_of_leaving IS NULL OR date_of_joining IS NULL
           OR date_of_leaving >= date_of_joining),
  CONSTRAINT profile_not_own_manager CHECK (reports_to IS DISTINCT FROM id)
);

CREATE INDEX idx_profiles_role      ON profiles(role)  WHERE deleted_at IS NULL;
CREATE INDEX idx_profiles_active    ON profiles(is_active) WHERE deleted_at IS NULL;
CREATE INDEX idx_profiles_reports_to ON profiles(reports_to);
CREATE INDEX idx_profiles_name_trgm ON profiles USING gin (full_name gin_trgm_ops);

CREATE TRIGGER profiles_set_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

COMMENT ON TABLE profiles IS
  'Employee master, 1:1 with auth.users. Wage fields drive payroll directly.';

-- ─── RLS helper functions ───────────────────────────────────────────────────
--
-- These are the keystone of the security model. The previous schema inlined
--   EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN (...))
-- into 40+ policies. That had two defects:
--
--   1. On `profiles` itself it is infinitely recursive — a policy on profiles
--      that reads profiles. PostgreSQL raises 42P17 and every admin write
--      fails.
--   2. It re-executes per candidate row, so cost scales with table size.
--
-- SECURITY DEFINER runs the function as its owner, bypassing RLS on profiles
-- and eliminating the recursion. STABLE lets the planner cache the result for
-- the duration of the statement, so it runs once rather than per row.
-- search_path is pinned to defeat search-path injection.

CREATE OR REPLACE FUNCTION auth_role()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT role FROM profiles
  WHERE id = auth.uid() AND is_active AND deleted_at IS NULL;
$$;

CREATE OR REPLACE FUNCTION auth_has_role(VARIADIC p_roles TEXT[])
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT COALESCE(auth_role() = ANY(p_roles), false);
$$;

-- Senthil. The only unrestricted principal in the system.
CREATE OR REPLACE FUNCTION auth_is_owner()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT COALESCE(auth_role() = 'owner', false);
$$;

-- Back-office roles see company-wide operational data.
CREATE OR REPLACE FUNCTION auth_is_back_office()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT COALESCE(auth_role() IN ('owner','manager'), false);
$$;

-- Roles permitted to see money: owner, manager, accountant.
-- Deliberately excludes every field role. No supervisor, engineer or worker
-- may see company financials — a hard requirement from the business.
CREATE OR REPLACE FUNCTION auth_can_see_money()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT COALESCE(auth_role() IN ('owner','manager','accountant'), false);
$$;

COMMENT ON FUNCTION auth_role IS
  'Current user''s role. SECURITY DEFINER to avoid recursive RLS on profiles.';
COMMENT ON FUNCTION auth_can_see_money IS
  'Financial visibility gate. Field roles are excluded by design.';

-- ─── Document numbering ─────────────────────────────────────────────────────
--
-- Replaces next_sequence(), which was silently broken: it was not
-- SECURITY DEFINER, and the `sequences` table had only a SELECT policy, so the
-- UPDATE matched zero rows, next_val stayed NULL, and the function returned
-- NULL with no error. Callers checked only for an error, so every generated
-- document number was NULL and every insert failed on NOT NULL.
--
-- This version is SECURITY DEFINER, financial-year aware, concurrency-safe via
-- INSERT .. ON CONFLICT DO UPDATE, and raises loudly instead of returning NULL.

CREATE TABLE doc_sequences (
  doc_type      TEXT   NOT NULL,
  fiscal_year   INT    NOT NULL,
  current_value BIGINT NOT NULL DEFAULT 0,
  PRIMARY KEY (doc_type, fiscal_year)
);

COMMENT ON TABLE doc_sequences IS
  'Per-document-type, per-financial-year counters. Indian FY starts in April.';

CREATE OR REPLACE FUNCTION next_document_number(p_doc_type TEXT, p_prefix TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_fy_start INT;
  v_fy       INT;
  v_next     BIGINT;
BEGIN
  IF p_doc_type IS NULL OR p_prefix IS NULL THEN
    RAISE EXCEPTION 'next_document_number requires a doc_type and prefix';
  END IF;

  SELECT COALESCE(financial_year_start_month, 4) INTO v_fy_start
  FROM company_settings LIMIT 1;
  v_fy_start := COALESCE(v_fy_start, 4);

  v_fy := CASE
            WHEN EXTRACT(MONTH FROM (now() AT TIME ZONE 'Asia/Kolkata')) >= v_fy_start
            THEN EXTRACT(YEAR FROM (now() AT TIME ZONE 'Asia/Kolkata'))
            ELSE EXTRACT(YEAR FROM (now() AT TIME ZONE 'Asia/Kolkata')) - 1
          END;

  INSERT INTO doc_sequences (doc_type, fiscal_year, current_value)
  VALUES (p_doc_type, v_fy, 1)
  ON CONFLICT (doc_type, fiscal_year)
  DO UPDATE SET current_value = doc_sequences.current_value + 1
  RETURNING current_value INTO v_next;

  IF v_next IS NULL THEN
    RAISE EXCEPTION 'Failed to allocate % number for FY%', p_doc_type, v_fy;
  END IF;

  -- e.g. INV/2026-27/0001
  RETURN format('%s/%s-%s/%s', p_prefix, v_fy,
                lpad(((v_fy + 1) % 100)::TEXT, 2, '0'),
                lpad(v_next::TEXT, 4, '0'));
END;
$$;

COMMENT ON FUNCTION next_document_number IS
  'Allocates a gap-free, FY-scoped document number. Raises rather than returning NULL.';

-- ─── Company settings ───────────────────────────────────────────────────────

CREATE TABLE company_settings (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_name TEXT NOT NULL DEFAULT 'Sentil Solar',
  legal_name   TEXT,
  logo_url     TEXT,
  address      TEXT,
  city         TEXT,
  state        TEXT,
  state_code   TEXT,          -- GST state code; drives IGST vs CGST/SGST
  pincode      TEXT,
  phone        TEXT,
  email        TEXT,
  website      TEXT,
  gst_number   TEXT,
  pan_number   TEXT,
  cin_number   TEXT,

  -- Document prefixes
  quotation_prefix TEXT NOT NULL DEFAULT 'QT',
  contract_prefix  TEXT NOT NULL DEFAULT 'CON',
  site_prefix      TEXT NOT NULL DEFAULT 'SITE',
  invoice_prefix   TEXT NOT NULL DEFAULT 'INV',
  expense_prefix   TEXT NOT NULL DEFAULT 'EXP',
  po_prefix        TEXT NOT NULL DEFAULT 'PO',
  employee_prefix  TEXT NOT NULL DEFAULT 'EMP',

  -- Operational defaults
  default_gst_percent      NUMERIC(6,3) NOT NULL DEFAULT 18,
  shift_start_time         TIME NOT NULL DEFAULT '08:00',
  shift_end_time           TIME NOT NULL DEFAULT '17:00',
  standard_hours_per_day   NUMERIC(4,1) NOT NULL DEFAULT 8,
  ot_after_hours           NUMERIC(4,1) NOT NULL DEFAULT 8,
  default_geofence_radius_m INT NOT NULL DEFAULT 500,
  financial_year_start_month INT NOT NULL DEFAULT 4
    CHECK (financial_year_start_month BETWEEN 1 AND 12),
  working_days_per_month   NUMERIC(4,1) NOT NULL DEFAULT 26,

  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT company_settings_singleton CHECK (id = id)
);

CREATE TRIGGER company_settings_set_updated_at
  BEFORE UPDATE ON company_settings
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Exactly one settings row, ever.
CREATE UNIQUE INDEX company_settings_only_one ON company_settings ((true));

INSERT INTO company_settings (company_name) VALUES ('Sentil Solar');

-- ─── Bank accounts ──────────────────────────────────────────────────────────

CREATE TABLE bank_accounts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_name    TEXT NOT NULL,
  bank_name       TEXT NOT NULL,
  account_number  TEXT NOT NULL,
  ifsc            TEXT NOT NULL,
  branch          TEXT,
  account_type    TEXT NOT NULL DEFAULT 'current'
                  CHECK (account_type IN ('current','savings','od','cc')),
  opening_balance NUMERIC(14,2) NOT NULL DEFAULT 0,
  is_primary      BOOLEAN NOT NULL DEFAULT false,
  is_active       BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at      TIMESTAMPTZ
);

CREATE UNIQUE INDEX bank_accounts_one_primary
  ON bank_accounts ((true)) WHERE is_primary AND deleted_at IS NULL;

CREATE TRIGGER bank_accounts_set_updated_at
  BEFORE UPDATE ON bank_accounts
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ─── Audit trail ────────────────────────────────────────────────────────────
--
-- The previous audit_logs table restricted `action` to document_upload /
-- document_delete / other, so financial changes — the only ones that matter —
-- could not be recorded. This version is generic and trigger-driven.

CREATE TABLE audit_logs (
  id          BIGSERIAL PRIMARY KEY,
  user_id     UUID REFERENCES profiles(id) ON DELETE SET NULL,
  user_role   TEXT,
  action      TEXT NOT NULL
              CHECK (action IN ('insert','update','delete','restore','login','export')),
  table_name  TEXT NOT NULL,
  record_id   UUID,
  old_values  JSONB,
  new_values  JSONB,
  changed_fields TEXT[],
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_audit_record  ON audit_logs(table_name, record_id, created_at DESC);
CREATE INDEX idx_audit_user    ON audit_logs(user_id, created_at DESC);
CREATE INDEX idx_audit_created ON audit_logs(created_at DESC);

COMMENT ON TABLE audit_logs IS
  'Append-only. No UPDATE or DELETE policy exists, so history cannot be rewritten.';

CREATE OR REPLACE FUNCTION audit_trigger()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_old JSONB;
  v_new JSONB;
  v_changed TEXT[];
  v_action TEXT;
  v_record_id UUID;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_action := 'insert';
    v_new := to_jsonb(NEW);
    v_record_id := (v_new ->> 'id')::UUID;

  ELSIF TG_OP = 'UPDATE' THEN
    v_old := to_jsonb(OLD);
    v_new := to_jsonb(NEW);
    v_record_id := (v_new ->> 'id')::UUID;
    -- A soft delete is recorded as its own action, not a generic update.
    v_action := CASE
      WHEN v_old ->> 'deleted_at' IS NULL AND v_new ->> 'deleted_at' IS NOT NULL
        THEN 'delete'
      WHEN v_old ->> 'deleted_at' IS NOT NULL AND v_new ->> 'deleted_at' IS NULL
        THEN 'restore'
      ELSE 'update'
    END;
    SELECT array_agg(key) INTO v_changed
    FROM jsonb_each(v_new)
    WHERE v_new -> key IS DISTINCT FROM v_old -> key
      AND key <> 'updated_at';
    -- Nothing of substance changed; do not record noise.
    IF v_changed IS NULL THEN RETURN NEW; END IF;

  ELSE -- hard DELETE
    v_action := 'delete';
    v_old := to_jsonb(OLD);
    v_record_id := (v_old ->> 'id')::UUID;
  END IF;

  INSERT INTO audit_logs (user_id, user_role, action, table_name,
                          record_id, old_values, new_values, changed_fields)
  VALUES (auth.uid(), auth_role(), v_action, TG_TABLE_NAME,
          v_record_id, v_old, v_new, v_changed);

  RETURN COALESCE(NEW, OLD);
END;
$$;

COMMENT ON FUNCTION audit_trigger IS
  'Generic audit trigger. Attach AFTER INSERT OR UPDATE OR DELETE on any table with a uuid id.';

-- ─── New-user provisioning ──────────────────────────────────────────────────
-- The first account to sign up becomes the owner (Senthil). Everyone after is
-- a worker until the owner promotes them — least privilege by default.

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_is_first BOOLEAN;
  v_role     TEXT;
  v_code     TEXT;
  v_prefix   TEXT;
BEGIN
  SELECT NOT EXISTS (SELECT 1 FROM profiles) INTO v_is_first;
  v_role := CASE WHEN v_is_first THEN 'owner' ELSE 'worker' END;

  SELECT COALESCE(employee_prefix, 'EMP') INTO v_prefix FROM company_settings LIMIT 1;
  v_code := next_document_number('employee', COALESCE(v_prefix, 'EMP'));

  INSERT INTO profiles (id, employee_code, full_name, email, role,
                        wage_mode, is_active)
  VALUES (
    NEW.id,
    v_code,
    COALESCE(NULLIF(TRIM(NEW.raw_user_meta_data ->> 'full_name'), ''), split_part(NEW.email, '@', 1)),
    NEW.email,
    v_role,
    'daily',
    true
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();
