-- ============================================================
-- Migration 006: Security hardening
-- ============================================================

-- H3: Fix profiles SELECT policy to require authentication
-- Previously: USING (true) — allows unauthenticated reads
DROP POLICY IF EXISTS "profiles_select_all" ON profiles;
DROP POLICY IF EXISTS "profiles_select_authenticated" ON profiles;
CREATE POLICY "profiles_select_authenticated"
  ON profiles FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- H2: Add index on profiles(role) for RLS policy performance
CREATE INDEX IF NOT EXISTS idx_profiles_role ON profiles(role);
CREATE INDEX IF NOT EXISTS idx_profiles_is_active ON profiles(is_active);

-- Add index on quotation_items for fast lookup by quotation
CREATE INDEX IF NOT EXISTS idx_quotation_items_quotation ON quotation_items(quotation_id);
