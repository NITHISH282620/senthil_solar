-- ============================================================
-- Migration 016: Update Company Settings for Field Operations
-- Adds shift configuration, overtime rules, and financial year
-- ============================================================

ALTER TABLE company_settings
  ADD COLUMN IF NOT EXISTS shift_start_time TIME DEFAULT '07:00',
  ADD COLUMN IF NOT EXISTS shift_end_time TIME DEFAULT '17:00',
  ADD COLUMN IF NOT EXISTS ot_after_hours NUMERIC(4,1) DEFAULT 8,
  ADD COLUMN IF NOT EXISTS financial_year_start_month INTEGER DEFAULT 4,
  ADD COLUMN IF NOT EXISTS default_geofence_radius INTEGER DEFAULT 500,
  ADD COLUMN IF NOT EXISTS expense_prefix TEXT DEFAULT 'EXP',
  ADD COLUMN IF NOT EXISTS project_prefix TEXT DEFAULT 'PRJ';

-- Update the existing sequences for new entities
INSERT INTO sequences (name, current_value)
VALUES
  ('submission_code', 0)
ON CONFLICT (name) DO NOTHING;
