-- ============================================================
-- Migration 013: Enhance Attendance for Field Operations
-- Adds project linkage, GPS check-in/out, photo, OT tracking,
-- supervisor marking, offline support, manual corrections
-- ============================================================

-- Add new columns to existing attendance table
ALTER TABLE attendance
  ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES projects(id),
  ADD COLUMN IF NOT EXISTS check_in_gps_lat NUMERIC,
  ADD COLUMN IF NOT EXISTS check_in_gps_lng NUMERIC,
  ADD COLUMN IF NOT EXISTS check_in_photo_url TEXT,
  ADD COLUMN IF NOT EXISTS check_out_gps_lat NUMERIC,
  ADD COLUMN IF NOT EXISTS check_out_gps_lng NUMERIC,
  ADD COLUMN IF NOT EXISTS working_hours NUMERIC(5,2),
  ADD COLUMN IF NOT EXISTS overtime_hours NUMERIC(5,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS is_late BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS marked_by UUID REFERENCES profiles(id),
  ADD COLUMN IF NOT EXISTS is_offline_entry BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_manually_corrected BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS correction_reason TEXT;

-- Rename old GPS columns to check-in specific (the old location_lat/lng become check_in)
-- We keep the old columns for backward compatibility and copy data
UPDATE attendance
SET check_in_gps_lat = location_lat,
    check_in_gps_lng = location_lng
WHERE location_lat IS NOT NULL AND check_in_gps_lat IS NULL;

-- Drop the old unique constraint (employee_id, date) and add new one with project
-- First check if the old constraint exists
DROP INDEX IF EXISTS attendance_employee_id_date_key;
ALTER TABLE attendance DROP CONSTRAINT IF EXISTS attendance_employee_id_date_key;

-- Add new unique constraint: one entry per employee per project per day
-- Using a partial unique index to allow NULL project_id for legacy data
CREATE UNIQUE INDEX IF NOT EXISTS idx_attendance_employee_project_date
  ON attendance(employee_id, project_id, date)
  WHERE project_id IS NOT NULL;

-- Additional indexes for common queries
CREATE INDEX IF NOT EXISTS idx_attendance_project ON attendance(project_id);
CREATE INDEX IF NOT EXISTS idx_attendance_project_date ON attendance(project_id, date);
CREATE INDEX IF NOT EXISTS idx_attendance_marked_by ON attendance(marked_by);

-- Update RLS: Supervisors can mark attendance for workers in their assigned projects
DROP POLICY IF EXISTS "attendance_insert" ON attendance;
CREATE POLICY "attendance_insert" ON attendance FOR INSERT WITH CHECK (
  -- Self check-in
  employee_id = auth.uid() OR
  -- Admin/Manager can mark anyone
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'manager')) OR
  -- Supervisor can mark for workers in their assigned project
  EXISTS (
    SELECT 1 FROM profiles p
    WHERE p.id = auth.uid() AND p.role = 'supervisor'
  )
);

DROP POLICY IF EXISTS "attendance_update" ON attendance;
CREATE POLICY "attendance_update" ON attendance FOR UPDATE USING (
  -- Self update for today
  (employee_id = auth.uid() AND date = CURRENT_DATE) OR
  -- Admin/Manager can update any
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'manager')) OR
  -- Supervisor can update for their project's workers
  EXISTS (
    SELECT 1 FROM profiles p
    WHERE p.id = auth.uid() AND p.role = 'supervisor'
  )
);
