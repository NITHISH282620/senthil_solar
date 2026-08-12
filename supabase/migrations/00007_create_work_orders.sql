-- ============================================================
-- Migration 007: Work Orders tables
-- ============================================================

CREATE TABLE IF NOT EXISTS work_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  work_order_number TEXT UNIQUE NOT NULL,
  customer_id UUID NOT NULL REFERENCES customers(id),
  quotation_id UUID REFERENCES quotations(id),
  title TEXT NOT NULL,
  description TEXT,
  type TEXT NOT NULL CHECK (type IN ('installation', 'maintenance', 'repair', 'inspection')),
  priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'scheduled', 'in_progress', 'on_hold', 'completed', 'cancelled')),
  scheduled_date DATE,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  site_address TEXT,
  site_lat NUMERIC,
  site_lng NUMERIC,
  estimated_hours NUMERIC(6,2),
  actual_hours NUMERIC(6,2),
  notes TEXT,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS work_order_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  work_order_id UUID NOT NULL REFERENCES work_orders(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  role TEXT DEFAULT 'technician',
  assigned_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(work_order_id, employee_id)
);

CREATE TABLE IF NOT EXISTS work_order_updates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  work_order_id UUID NOT NULL REFERENCES work_orders(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES profiles(id),
  update_type TEXT NOT NULL CHECK (update_type IN ('note', 'status_change', 'photo')),
  content TEXT,
  photo_url TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_work_orders_customer ON work_orders(customer_id);
CREATE INDEX IF NOT EXISTS idx_work_orders_quotation ON work_orders(quotation_id);
CREATE INDEX IF NOT EXISTS idx_work_orders_status ON work_orders(status);
CREATE INDEX IF NOT EXISTS idx_work_order_assignments_wo ON work_order_assignments(work_order_id);
CREATE INDEX IF NOT EXISTS idx_work_order_assignments_employee ON work_order_assignments(employee_id);
CREATE INDEX IF NOT EXISTS idx_work_order_updates_wo ON work_order_updates(work_order_id);

-- Triggers for updated_at
DROP TRIGGER IF EXISTS work_orders_updated_at ON work_orders;
CREATE TRIGGER work_orders_updated_at
  BEFORE UPDATE ON work_orders
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- RLS
ALTER TABLE work_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE work_order_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE work_order_updates ENABLE ROW LEVEL SECURITY;

-- Work Orders RLS
DROP POLICY IF EXISTS "work_orders_select_all" ON work_orders;
CREATE POLICY "work_orders_select_all"
  ON work_orders FOR SELECT
  USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "work_orders_admin_manager_modify" ON work_orders;
CREATE POLICY "work_orders_admin_manager_modify"
  ON work_orders FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'manager')
    )
  );

-- Employees can update work orders they are assigned to
DROP POLICY IF EXISTS "work_orders_employee_update" ON work_orders;
CREATE POLICY "work_orders_employee_update"
  ON work_orders FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM work_order_assignments
      WHERE work_order_assignments.work_order_id = work_orders.id
      AND work_order_assignments.employee_id = auth.uid()
    )
  );

-- Assignments RLS
DROP POLICY IF EXISTS "work_order_assignments_select_all" ON work_order_assignments;
CREATE POLICY "work_order_assignments_select_all"
  ON work_order_assignments FOR SELECT
  USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "work_order_assignments_admin_manager_modify" ON work_order_assignments;
CREATE POLICY "work_order_assignments_admin_manager_modify"
  ON work_order_assignments FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'manager')
    )
  );

-- Updates RLS
DROP POLICY IF EXISTS "work_order_updates_select_all" ON work_order_updates;
CREATE POLICY "work_order_updates_select_all"
  ON work_order_updates FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- Any authenticated user can create an update (e.g. adding a note/photo to their assigned WO)
DROP POLICY IF EXISTS "work_order_updates_insert" ON work_order_updates;
CREATE POLICY "work_order_updates_insert"
  ON work_order_updates FOR INSERT
  WITH CHECK (
    auth.uid() = employee_id -- Can only insert updates for themselves
  );
