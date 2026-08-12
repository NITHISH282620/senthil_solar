-- ============================================================
-- Migration 014: Work Logs + Work Log Photos
-- Supervisor submits daily structured proof-of-work per project.
-- ============================================================

CREATE TABLE IF NOT EXISTS work_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  submitted_by UUID NOT NULL REFERENCES profiles(id),
  work_description TEXT NOT NULL,
  work_category TEXT DEFAULT 'other' CHECK (work_category IN ('civil', 'structure', 'panel_installation', 'electrical', 'testing', 'other')),
  workers_present_count INTEGER,
  materials_used TEXT,
  problems TEXT,
  weather TEXT CHECK (weather IN ('good', 'rainy', 'extreme_heat') OR weather IS NULL),
  remarks TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(project_id, date)
);

CREATE TABLE IF NOT EXISTS work_log_photos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  work_log_id UUID NOT NULL REFERENCES work_logs(id) ON DELETE CASCADE,
  photo_url TEXT NOT NULL,
  thumbnail_url TEXT,
  caption TEXT,
  gps_lat NUMERIC,
  gps_lng NUMERIC,
  taken_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_work_logs_project ON work_logs(project_id);
CREATE INDEX IF NOT EXISTS idx_work_logs_date ON work_logs(date);
CREATE INDEX IF NOT EXISTS idx_work_logs_project_date ON work_logs(project_id, date);
CREATE INDEX IF NOT EXISTS idx_work_logs_submitted_by ON work_logs(submitted_by);
CREATE INDEX IF NOT EXISTS idx_work_log_photos_log ON work_log_photos(work_log_id);

-- Triggers
DROP TRIGGER IF EXISTS work_logs_updated_at ON work_logs;
CREATE TRIGGER work_logs_updated_at
  BEFORE UPDATE ON work_logs
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- RLS
ALTER TABLE work_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE work_log_photos ENABLE ROW LEVEL SECURITY;

-- Work logs: All authenticated can read
DROP POLICY IF EXISTS "work_logs_select_all" ON work_logs;
CREATE POLICY "work_logs_select_all"
  ON work_logs FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- Work logs: Supervisors, Admins, Managers can create
DROP POLICY IF EXISTS "work_logs_insert" ON work_logs;
CREATE POLICY "work_logs_insert"
  ON work_logs FOR INSERT
  WITH CHECK (
    submitted_by = auth.uid() AND
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'manager', 'supervisor')
    )
  );

-- Work logs: Only submitter or admin/manager can update
DROP POLICY IF EXISTS "work_logs_update" ON work_logs;
CREATE POLICY "work_logs_update"
  ON work_logs FOR UPDATE
  USING (
    submitted_by = auth.uid() OR
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'manager')
    )
  );

-- Photos: All authenticated can read
DROP POLICY IF EXISTS "work_log_photos_select_all" ON work_log_photos;
CREATE POLICY "work_log_photos_select_all"
  ON work_log_photos FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- Photos: Any authenticated can insert (they upload to their own work log)
DROP POLICY IF EXISTS "work_log_photos_insert" ON work_log_photos;
CREATE POLICY "work_log_photos_insert"
  ON work_log_photos FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

-- Photos: Admin/Manager or the work log submitter can delete
DROP POLICY IF EXISTS "work_log_photos_delete" ON work_log_photos;
CREATE POLICY "work_log_photos_delete"
  ON work_log_photos FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM work_logs
      WHERE work_logs.id = work_log_photos.work_log_id
      AND (
        work_logs.submitted_by = auth.uid() OR
        EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('admin', 'manager'))
      )
    )
  );
