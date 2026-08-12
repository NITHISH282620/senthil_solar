-- 00017_architecture_pivot_sites.sql
-- Pivot from Project-centric to Site-centric architecture

-- 1. Create sites table
CREATE TABLE sites (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    name VARCHAR(300) NOT NULL,
    district VARCHAR(100),
    address TEXT,
    gps_lat NUMERIC(10, 8),
    gps_lng NUMERIC(11, 8),
    total_workers_required INTEGER,
    start_date DATE,
    expected_end_date DATE,
    actual_end_date DATE,
    progress_percent INTEGER DEFAULT 0 CHECK (progress_percent >= 0 AND progress_percent <= 100),
    status VARCHAR(50) NOT NULL DEFAULT 'planning',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by UUID REFERENCES auth.users(id)
);

-- Index for querying sites by project
CREATE INDEX idx_sites_project_id ON sites(project_id);

-- 2. Rename project_assignments to site_assignments
ALTER TABLE project_assignments RENAME TO site_assignments;
ALTER TABLE site_assignments RENAME COLUMN project_id TO site_id;
-- Update foreign key constraint name if necessary (not strictly needed, but good practice)
ALTER TABLE site_assignments DROP CONSTRAINT IF EXISTS project_assignments_project_id_fkey;
ALTER TABLE site_assignments ADD CONSTRAINT site_assignments_site_id_fkey FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE CASCADE;

-- 3. Update attendance to link to site_id and support fractional shifts
ALTER TABLE attendance RENAME COLUMN project_id TO site_id;
ALTER TABLE attendance DROP CONSTRAINT IF EXISTS attendance_project_id_fkey;
ALTER TABLE attendance ADD CONSTRAINT attendance_site_id_fkey FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE SET NULL;
ALTER TABLE attendance ADD COLUMN working_hours NUMERIC(4,2) DEFAULT 1.0; -- e.g., 0.5 for half day, 1.0 for full

-- Drop old unique constraint
ALTER TABLE attendance DROP CONSTRAINT IF EXISTS attendance_employee_id_date_key;
-- Add new unique constraint (employee, site, date)
ALTER TABLE attendance ADD CONSTRAINT attendance_employee_site_date_key UNIQUE (employee_id, site_id, date);

-- 4. Update work_logs to link to site_id
ALTER TABLE work_logs RENAME COLUMN project_id TO site_id;
ALTER TABLE work_logs DROP CONSTRAINT IF EXISTS work_logs_project_id_fkey;
ALTER TABLE work_logs ADD CONSTRAINT work_logs_site_id_fkey FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE CASCADE;
-- Add status for review workflow
ALTER TABLE work_logs ADD COLUMN status VARCHAR(50) DEFAULT 'draft' CHECK (status IN ('draft', 'submitted', 'approved', 'locked'));

-- 5. Update expenses to link to site_id
ALTER TABLE expenses RENAME COLUMN project_id TO site_id;
ALTER TABLE expenses DROP CONSTRAINT IF EXISTS expenses_project_id_fkey;
ALTER TABLE expenses ADD CONSTRAINT expenses_site_id_fkey FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE SET NULL;

-- 6. Modify projects table (drop operational columns)
ALTER TABLE projects DROP COLUMN IF EXISTS district;
ALTER TABLE projects DROP COLUMN IF EXISTS site_address;
ALTER TABLE projects DROP COLUMN IF EXISTS site_gps_lat;
ALTER TABLE projects DROP COLUMN IF EXISTS site_gps_lng;
ALTER TABLE projects DROP COLUMN IF EXISTS geofence_radius_m;
ALTER TABLE projects DROP COLUMN IF EXISTS start_date;
ALTER TABLE projects DROP COLUMN IF EXISTS expected_end_date;
ALTER TABLE projects DROP COLUMN IF EXISTS actual_end_date;
ALTER TABLE projects DROP COLUMN IF EXISTS total_workers_required;
ALTER TABLE projects DROP COLUMN IF EXISTS progress_percent;

-- Triggers for updated_at on sites
CREATE TRIGGER handle_updated_at BEFORE UPDATE ON sites
  FOR EACH ROW EXECUTE FUNCTION moddatetime(updated_at);

-- Set up RLS for sites
ALTER TABLE sites ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Sites are viewable by all authenticated users"
  ON sites FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Sites are insertable by admins and managers"
  ON sites FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role IN ('admin', 'manager')
    )
  );

CREATE POLICY "Sites are updatable by admins and managers"
  ON sites FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role IN ('admin', 'manager')
    )
  );

CREATE POLICY "Sites are deletable by admins and managers"
  ON sites FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role IN ('admin', 'manager')
    )
  );
