-- ============================================================
-- Migration 008: Financials (Invoices, Payments, Expenses)
-- ============================================================

CREATE TABLE IF NOT EXISTS invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_number TEXT UNIQUE NOT NULL,
  customer_id UUID NOT NULL REFERENCES customers(id),
  work_order_id UUID REFERENCES work_orders(id),
  quotation_id UUID REFERENCES quotations(id),
  subtotal NUMERIC(12,2) NOT NULL DEFAULT 0,
  tax_percent NUMERIC(5,2) NOT NULL DEFAULT 18,
  tax_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  discount_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  amount_paid NUMERIC(12,2) NOT NULL DEFAULT 0,
  balance_due NUMERIC(12,2) GENERATED ALWAYS AS (total_amount - amount_paid) STORED,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'sent', 'partially_paid', 'paid', 'overdue', 'cancelled')),
  due_date DATE,
  notes TEXT,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS invoice_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  unit TEXT NOT NULL DEFAULT 'nos',
  quantity NUMERIC(10,2) NOT NULL DEFAULT 1,
  unit_price NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_price NUMERIC(12,2) NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  amount NUMERIC(12,2) NOT NULL,
  payment_method TEXT NOT NULL CHECK (payment_method IN ('cash', 'bank_transfer', 'cheque', 'upi', 'credit_card')),
  payment_date DATE NOT NULL,
  reference_number TEXT,
  notes TEXT,
  received_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  expense_number TEXT UNIQUE NOT NULL,
  employee_id UUID NOT NULL REFERENCES profiles(id),
  category TEXT NOT NULL CHECK (category IN ('travel', 'materials', 'tools', 'meals', 'other')),
  title TEXT NOT NULL,
  description TEXT,
  total_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'paid')),
  work_order_id UUID REFERENCES work_orders(id),
  approved_by UUID REFERENCES profiles(id),
  approved_at TIMESTAMPTZ,
  receipt_url TEXT,
  notes TEXT,
  submitted_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS expense_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  expense_id UUID NOT NULL REFERENCES expenses(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  amount NUMERIC(12,2) NOT NULL,
  receipt_url TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_invoices_customer ON invoices(customer_id);
CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices(status);
CREATE INDEX IF NOT EXISTS idx_invoice_items_invoice ON invoice_items(invoice_id);
CREATE INDEX IF NOT EXISTS idx_payments_invoice ON payments(invoice_id);
CREATE INDEX IF NOT EXISTS idx_expenses_employee ON expenses(employee_id);
CREATE INDEX IF NOT EXISTS idx_expenses_status ON expenses(status);
CREATE INDEX IF NOT EXISTS idx_expenses_work_order ON expenses(work_order_id);

-- Triggers for updated_at
DROP TRIGGER IF EXISTS invoices_updated_at ON invoices;
CREATE TRIGGER invoices_updated_at
  BEFORE UPDATE ON invoices
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS expenses_updated_at ON expenses;
CREATE TRIGGER expenses_updated_at
  BEFORE UPDATE ON expenses
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Update invoice status and amount_paid trigger when payment is added
CREATE OR REPLACE FUNCTION update_invoice_payment_status()
RETURNS TRIGGER AS $$
BEGIN
  -- Re-calculate amount_paid for the invoice
  UPDATE invoices
  SET amount_paid = (
    SELECT COALESCE(SUM(amount), 0)
    FROM payments
    WHERE invoice_id = NEW.invoice_id
  )
  WHERE id = NEW.invoice_id;
  
  -- The status update logic is better handled in application code or another trigger,
  -- but we can do a simple status check here if desired. Let's keep it simple and just update amount_paid.
  -- The generated column 'balance_due' will update automatically.
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_invoice_payment
  AFTER INSERT OR UPDATE OR DELETE ON payments
  FOR EACH ROW
  EXECUTE FUNCTION update_invoice_payment_status();

-- RLS Policies
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoice_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE expense_items ENABLE ROW LEVEL SECURITY;

-- Invoices & Payments: Admins/Managers can manage all, Employees can read all
DROP POLICY IF EXISTS "invoices_select_all" ON invoices;
CREATE POLICY "invoices_select_all" ON invoices FOR SELECT USING (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS "invoices_modify_admin" ON invoices;
CREATE POLICY "invoices_modify_admin" ON invoices FOR ALL USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'manager')));

DROP POLICY IF EXISTS "invoice_items_select_all" ON invoice_items;
CREATE POLICY "invoice_items_select_all" ON invoice_items FOR SELECT USING (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS "invoice_items_modify_admin" ON invoice_items;
CREATE POLICY "invoice_items_modify_admin" ON invoice_items FOR ALL USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'manager')));

DROP POLICY IF EXISTS "payments_select_all" ON payments;
CREATE POLICY "payments_select_all" ON payments FOR SELECT USING (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS "payments_modify_admin" ON payments;
CREATE POLICY "payments_modify_admin" ON payments FOR ALL USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'manager')));

-- Expenses: Employees can read/manage their own. Admins/Managers can read/manage all.
DROP POLICY IF EXISTS "expenses_select_all" ON expenses;
CREATE POLICY "expenses_select_all" ON expenses FOR SELECT USING (
  employee_id = auth.uid() OR
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'manager'))
);

DROP POLICY IF EXISTS "expenses_insert_own" ON expenses;
CREATE POLICY "expenses_insert_own" ON expenses FOR INSERT WITH CHECK (
  employee_id = auth.uid()
);

DROP POLICY IF EXISTS "expenses_update" ON expenses;
CREATE POLICY "expenses_update" ON expenses FOR UPDATE USING (
  -- Employee can update if pending
  (employee_id = auth.uid() AND status = 'pending') OR
  -- Admin/manager can update anything
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'manager'))
);

DROP POLICY IF EXISTS "expenses_delete" ON expenses;
CREATE POLICY "expenses_delete" ON expenses FOR DELETE USING (
  -- Employee can delete if pending
  (employee_id = auth.uid() AND status = 'pending') OR
  -- Admin/manager can delete anything
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'manager'))
);

-- Expense Items inherit access from expenses
DROP POLICY IF EXISTS "expense_items_select" ON expense_items;
CREATE POLICY "expense_items_select" ON expense_items FOR SELECT USING (
  EXISTS (SELECT 1 FROM expenses WHERE expenses.id = expense_items.expense_id AND (
    expenses.employee_id = auth.uid() OR
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('admin', 'manager'))
  ))
);

DROP POLICY IF EXISTS "expense_items_modify" ON expense_items;
CREATE POLICY "expense_items_modify" ON expense_items FOR ALL USING (
  EXISTS (SELECT 1 FROM expenses WHERE expenses.id = expense_items.expense_id AND (
    (expenses.employee_id = auth.uid() AND expenses.status = 'pending') OR
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('admin', 'manager'))
  ))
);
