-- ============================================================
-- Migration 011: Projects, Project Assignments, Project Documents
-- Core entity for the Field Operations Management System.
-- Everything (attendance, expenses, work logs, invoices) links to a project.
-- ============================================================

CREATE TABLE IF NOT EXISTS projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  client_company TEXT NOT NULL,
  client_contact_name TEXT,
  client_contact_phone TEXT,
  client_gst TEXT,
  district TEXT,
  site_address TEXT,
  site_gps_lat NUMERIC,
  site_gps_lng NUMERIC,
  geofence_radius_m INTEGER DEFAULT 500,
  scope_description TEXT,
  rate_type TEXT CHECK (rate_type IN ('per_unit', 'per_day', 'lump_sum')),
  rate_amount NUMERIC(12,2),
  rate_unit TEXT,
  start_date DATE,
  expected_end_date DATE,
  actual_end_date DATE,
  progress_percent INTEGER DEFAULT 0 CHECK (progress_percent >= 0 AND progress_percent <= 100),
  status TEXT NOT NULL DEFAULT 'not_started' CHECK (status IN ('not_started', 'in_progress', 'completed', 'billed', 'closed')),
  total_workers_required INTEGER,
  notes TEXT,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS project_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  role_in_project TEXT NOT NULL DEFAULT 'worker' CHECK (role_in_project IN ('supervisor', 'worker')),
  assigned_date DATE DEFAULT CURRENT_DATE,
  removed_date DATE,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(project_id, employee_id)
);

CREATE TABLE IF NOT EXISTS project_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  doc_type TEXT DEFAULT 'other' CHECK (doc_type IN ('work_order', 'drawing', 'certificate', 'letter', 'other')),
  file_url TEXT NOT NULL,
  uploaded_by UUID REFERENCES profiles(id),
  uploaded_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_projects_status ON projects(status);
CREATE INDEX IF NOT EXISTS idx_projects_district ON projects(district);
CREATE INDEX IF NOT EXISTS idx_projects_client ON projects(client_company);
CREATE INDEX IF NOT EXISTS idx_project_assignments_project ON project_assignments(project_id);
CREATE INDEX IF NOT EXISTS idx_project_assignments_employee ON project_assignments(employee_id);
CREATE INDEX IF NOT EXISTS idx_project_assignments_active ON project_assignments(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_project_documents_project ON project_documents(project_id);

-- Triggers
DROP TRIGGER IF EXISTS projects_updated_at ON projects;
CREATE TRIGGER projects_updated_at
  BEFORE UPDATE ON projects
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Sequence for project codes
INSERT INTO sequences (name, current_value)
VALUES ('project_code', 0)
ON CONFLICT (name) DO NOTHING;

-- RLS
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_documents ENABLE ROW LEVEL SECURITY;

-- Projects: All authenticated users can read (supervisors need to see their assigned projects)
DROP POLICY IF EXISTS "projects_select_all" ON projects;
CREATE POLICY "projects_select_all"
  ON projects FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- Projects: Admin/Manager can modify
DROP POLICY IF EXISTS "projects_admin_manager_modify" ON projects;
CREATE POLICY "projects_admin_manager_modify"
  ON projects FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'manager')
    )
  );

-- Assignments: All authenticated can read
DROP POLICY IF EXISTS "project_assignments_select_all" ON project_assignments;
CREATE POLICY "project_assignments_select_all"
  ON project_assignments FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- Assignments: Admin/Manager can modify
DROP POLICY IF EXISTS "project_assignments_admin_modify" ON project_assignments;
CREATE POLICY "project_assignments_admin_modify"
  ON project_assignments FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'manager')
    )
  );

-- Documents: All authenticated can read
DROP POLICY IF EXISTS "project_documents_select_all" ON project_documents;
CREATE POLICY "project_documents_select_all"
  ON project_documents FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- Documents: Any authenticated user can upload
DROP POLICY IF EXISTS "project_documents_insert" ON project_documents;
CREATE POLICY "project_documents_insert"
  ON project_documents FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

-- Documents: Admin/Manager or uploader can delete
DROP POLICY IF EXISTS "project_documents_delete" ON project_documents;
CREATE POLICY "project_documents_delete"
  ON project_documents FOR DELETE
  USING (
    uploaded_by = auth.uid() OR
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'manager')
    )
  );
