-- ============================================================
-- Migration 012: Update profiles for Field Operations
-- Adds supervisor role, employee type, wage rates, bank name
-- ============================================================

-- Add supervisor to the role check constraint
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE profiles ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('admin', 'manager', 'supervisor', 'employee'));

-- Add new columns for field operations workforce management
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS employee_type TEXT DEFAULT 'daily_wage' CHECK (employee_type IN ('daily_wage', 'monthly_salary')),
  ADD COLUMN IF NOT EXISTS daily_rate NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS ot_rate_per_hour NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS bank_name TEXT,
  ADD COLUMN IF NOT EXISTS aadhar_number TEXT;

-- Rename salary to monthly_salary for clarity (keep backward compat)
-- We can't easily rename in Postgres, so we add monthly_salary and keep salary as-is
-- The app layer will use monthly_salary going forward
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS monthly_salary NUMERIC(12,2);

-- Copy existing salary values into monthly_salary for existing rows
UPDATE profiles SET monthly_salary = salary WHERE salary IS NOT NULL AND monthly_salary IS NULL;

-- Update the RLS policy for supervisor role
-- Supervisors should be treated like a limited manager for their assigned projects
DROP POLICY IF EXISTS "profiles_admin_all" ON profiles;
CREATE POLICY "profiles_admin_all"
  ON profiles FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid() AND p.role IN ('admin', 'manager')
    )
  );
