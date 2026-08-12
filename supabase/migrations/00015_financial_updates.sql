-- ============================================================
-- Migration 015: Financial Updates
-- - Update expenses for project linkage + food tracking
-- - Create salary_advances table
-- - Create payroll table
-- - Update invoices for project linkage + billing period
-- - Update payments for TDS tracking
-- - Create submissions table
-- ============================================================

-- ─── EXPENSES: Add project link, food fields, new categories ───

ALTER TABLE expenses
  ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES projects(id),
  ADD COLUMN IF NOT EXISTS date DATE,
  ADD COLUMN IF NOT EXISTS head_count INTEGER,
  ADD COLUMN IF NOT EXISTS meal_type TEXT CHECK (meal_type IN ('breakfast', 'lunch', 'dinner', 'tea', 'snacks') OR meal_type IS NULL),
  ADD COLUMN IF NOT EXISTS rejection_reason TEXT;

-- Update category constraint to include new categories
ALTER TABLE expenses DROP CONSTRAINT IF EXISTS expenses_category_check;
ALTER TABLE expenses ADD CONSTRAINT expenses_category_check
  CHECK (category IN ('food', 'tea', 'water', 'fuel', 'travel', 'vehicle', 'equipment_rental', 'labour', 'materials', 'miscellaneous'));

-- Update status constraint
ALTER TABLE expenses DROP CONSTRAINT IF EXISTS expenses_status_check;
ALTER TABLE expenses ADD CONSTRAINT expenses_status_check
  CHECK (status IN ('pending', 'approved', 'rejected'));

-- Copy work_order_id to project_id where applicable (legacy data migration)
-- This would need manual mapping since work_orders != projects, but we set up the column

CREATE INDEX IF NOT EXISTS idx_expenses_project ON expenses(project_id);
CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses(date);
CREATE INDEX IF NOT EXISTS idx_expenses_category ON expenses(category);
CREATE INDEX IF NOT EXISTS idx_expenses_meal_type ON expenses(meal_type) WHERE meal_type IS NOT NULL;


-- ─── SALARY ADVANCES ───

CREATE TABLE IF NOT EXISTS salary_advances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES profiles(id),
  project_id UUID REFERENCES projects(id),
  amount NUMERIC(10,2) NOT NULL,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  reason TEXT,
  given_by UUID REFERENCES profiles(id),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'partially_deducted', 'fully_deducted')),
  amount_deducted NUMERIC(10,2) NOT NULL DEFAULT 0,
  deducted_in_payroll_id UUID, -- FK added after payroll table created
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_salary_advances_employee ON salary_advances(employee_id);
CREATE INDEX IF NOT EXISTS idx_salary_advances_status ON salary_advances(status) WHERE status != 'fully_deducted';
CREATE INDEX IF NOT EXISTS idx_salary_advances_project ON salary_advances(project_id);

ALTER TABLE salary_advances ENABLE ROW LEVEL SECURITY;

-- All authenticated can read advances (owner/accountant view all, employee sees own)
DROP POLICY IF EXISTS "salary_advances_select" ON salary_advances;
CREATE POLICY "salary_advances_select" ON salary_advances FOR SELECT USING (
  employee_id = auth.uid() OR
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'manager'))
);

-- Admin/Manager can create advances
DROP POLICY IF EXISTS "salary_advances_insert" ON salary_advances;
CREATE POLICY "salary_advances_insert" ON salary_advances FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'manager'))
);

-- Admin/Manager can update (for deduction tracking)
DROP POLICY IF EXISTS "salary_advances_update" ON salary_advances;
CREATE POLICY "salary_advances_update" ON salary_advances FOR UPDATE USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'manager'))
);


-- ─── PAYROLL ───

CREATE TABLE IF NOT EXISTS payroll (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES profiles(id),
  month INTEGER NOT NULL CHECK (month >= 1 AND month <= 12),
  year INTEGER NOT NULL,
  present_days NUMERIC(5,1) NOT NULL DEFAULT 0,
  overtime_hours NUMERIC(6,1) NOT NULL DEFAULT 0,
  daily_rate_used NUMERIC(10,2),
  ot_rate_used NUMERIC(10,2),
  gross_salary NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_advance_deduction NUMERIC(10,2) NOT NULL DEFAULT 0,
  other_deductions NUMERIC(10,2) NOT NULL DEFAULT 0,
  deduction_notes TEXT,
  bonus NUMERIC(10,2) NOT NULL DEFAULT 0,
  bonus_notes TEXT,
  net_salary NUMERIC(12,2) NOT NULL DEFAULT 0,
  is_paid BOOLEAN DEFAULT false,
  paid_date DATE,
  paid_method TEXT CHECK (paid_method IN ('bank_transfer', 'cash', 'upi') OR paid_method IS NULL),
  paid_reference TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(employee_id, month, year)
);

CREATE INDEX IF NOT EXISTS idx_payroll_employee ON payroll(employee_id);
CREATE INDEX IF NOT EXISTS idx_payroll_month_year ON payroll(year, month);
CREATE INDEX IF NOT EXISTS idx_payroll_is_paid ON payroll(is_paid) WHERE is_paid = false;

DROP TRIGGER IF EXISTS payroll_updated_at ON payroll;
CREATE TRIGGER payroll_updated_at
  BEFORE UPDATE ON payroll
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE payroll ENABLE ROW LEVEL SECURITY;

-- Payroll: Employee can view own, admin/manager can view all
DROP POLICY IF EXISTS "payroll_select" ON payroll;
CREATE POLICY "payroll_select" ON payroll FOR SELECT USING (
  employee_id = auth.uid() OR
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'manager'))
);

-- Admin/Manager can manage payroll
DROP POLICY IF EXISTS "payroll_modify" ON payroll;
CREATE POLICY "payroll_modify" ON payroll FOR ALL USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'manager'))
);

-- Add FK from salary_advances to payroll now that payroll exists
ALTER TABLE salary_advances
  ADD CONSTRAINT fk_salary_advances_payroll
  FOREIGN KEY (deducted_in_payroll_id) REFERENCES payroll(id);


-- ─── INVOICES: Add project link, billing period, TDS ───

ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES projects(id),
  ADD COLUMN IF NOT EXISTS billing_period_start DATE,
  ADD COLUMN IF NOT EXISTS billing_period_end DATE,
  ADD COLUMN IF NOT EXISTS tds_deducted NUMERIC(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS net_receivable NUMERIC(12,2);

CREATE INDEX IF NOT EXISTS idx_invoices_project ON invoices(project_id);


-- ─── PAYMENTS: Add TDS on payment ───

ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS tds_on_payment NUMERIC(12,2) DEFAULT 0;


-- ─── SUBMISSIONS ───

CREATE TABLE IF NOT EXISTS submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id),
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  include_attendance BOOLEAN DEFAULT true,
  include_work_logs BOOLEAN DEFAULT true,
  include_photos BOOLEAN DEFAULT true,
  include_expenses BOOLEAN DEFAULT true,
  include_invoice BOOLEAN DEFAULT false,
  invoice_id UUID REFERENCES invoices(id),
  cover_note TEXT,
  file_url TEXT,
  format TEXT DEFAULT 'pdf' CHECK (format IN ('pdf', 'zip', 'excel')),
  submitted_to_client BOOLEAN DEFAULT false,
  submitted_date DATE,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_submissions_project ON submissions(project_id);
CREATE INDEX IF NOT EXISTS idx_submissions_date ON submissions(created_at);

ALTER TABLE submissions ENABLE ROW LEVEL SECURITY;

-- Submissions: Admin/Manager can view and manage
DROP POLICY IF EXISTS "submissions_select" ON submissions;
CREATE POLICY "submissions_select" ON submissions FOR SELECT USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'manager'))
);

DROP POLICY IF EXISTS "submissions_modify" ON submissions;
CREATE POLICY "submissions_modify" ON submissions FOR ALL USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'manager'))
);
