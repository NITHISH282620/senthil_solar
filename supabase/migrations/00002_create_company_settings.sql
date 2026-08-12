-- ============================================================
-- Migration 002: Company Settings table
-- ============================================================

CREATE TABLE IF NOT EXISTS company_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_name TEXT NOT NULL DEFAULT 'SolarOps',
  logo_url TEXT,
  address TEXT,
  phone TEXT,
  email TEXT,
  gst_number TEXT,
  pan_number TEXT,
  bank_name TEXT,
  bank_account_no TEXT,
  bank_ifsc TEXT,
  invoice_prefix TEXT DEFAULT 'INV',
  quotation_prefix TEXT DEFAULT 'QT',
  work_order_prefix TEXT DEFAULT 'WO',
  tax_rate NUMERIC(5,2) DEFAULT 18.00,
  updated_at TIMESTAMPTZ DEFAULT now()
);

DROP TRIGGER IF EXISTS company_settings_updated_at ON company_settings;
CREATE TRIGGER company_settings_updated_at
  BEFORE UPDATE ON company_settings
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- RLS
ALTER TABLE company_settings ENABLE ROW LEVEL SECURITY;

-- Everyone can read settings
DROP POLICY IF EXISTS "settings_select_all" ON company_settings;
CREATE POLICY "settings_select_all"
  ON company_settings FOR SELECT
  USING (true);

-- Only admins can modify settings
DROP POLICY IF EXISTS "settings_admin_modify" ON company_settings;
CREATE POLICY "settings_admin_modify"
  ON company_settings FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
    )
  );

-- Seed default row only if none exists
INSERT INTO company_settings (company_name)
SELECT 'SolarOps'
WHERE NOT EXISTS (SELECT 1 FROM company_settings);
