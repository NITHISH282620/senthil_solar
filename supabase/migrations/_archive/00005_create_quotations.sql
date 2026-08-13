-- ============================================================
-- Migration 005: Quotations + Quotation Items tables
-- ============================================================

CREATE TABLE IF NOT EXISTS quotations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quotation_number TEXT UNIQUE NOT NULL,
  customer_id UUID NOT NULL REFERENCES customers(id),
  title TEXT NOT NULL,
  description TEXT,
  system_capacity_kw NUMERIC(8,2),
  panel_type TEXT,
  inverter_type TEXT,
  subtotal NUMERIC(12,2) NOT NULL DEFAULT 0,
  tax_percent NUMERIC(5,2) DEFAULT 0,
  tax_amount NUMERIC(12,2) DEFAULT 0,
  discount_amount NUMERIC(12,2) DEFAULT 0,
  total_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'sent', 'approved', 'rejected', 'expired', 'converted')),
  valid_until DATE,
  approved_by UUID REFERENCES profiles(id),
  created_by UUID REFERENCES profiles(id),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS quotation_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quotation_id UUID NOT NULL REFERENCES quotations(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  unit TEXT DEFAULT 'nos',
  quantity NUMERIC(10,2) NOT NULL,
  unit_price NUMERIC(12,2) NOT NULL,
  total_price NUMERIC(12,2) NOT NULL,
  sort_order INT DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_quotations_customer ON quotations(customer_id);
CREATE INDEX IF NOT EXISTS idx_quotations_status ON quotations(status);

DROP TRIGGER IF EXISTS quotations_updated_at ON quotations;
CREATE TRIGGER quotations_updated_at
  BEFORE UPDATE ON quotations
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- RLS
ALTER TABLE quotations ENABLE ROW LEVEL SECURITY;
ALTER TABLE quotation_items ENABLE ROW LEVEL SECURITY;

-- Everyone can read quotations
DROP POLICY IF EXISTS "quotations_select_all" ON quotations;
CREATE POLICY "quotations_select_all"
  ON quotations FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- Admin and Manager can modify quotations
DROP POLICY IF EXISTS "quotations_admin_manager_modify" ON quotations;
CREATE POLICY "quotations_admin_manager_modify"
  ON quotations FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'manager')
    )
  );

-- Everyone can read quotation items
DROP POLICY IF EXISTS "quotation_items_select_all" ON quotation_items;
CREATE POLICY "quotation_items_select_all"
  ON quotation_items FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- Admin and Manager can modify quotation items
DROP POLICY IF EXISTS "quotation_items_admin_manager_modify" ON quotation_items;
CREATE POLICY "quotation_items_admin_manager_modify"
  ON quotation_items FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'manager')
    )
  );
