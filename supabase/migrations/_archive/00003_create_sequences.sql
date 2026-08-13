-- ============================================================
-- Migration 003: Sequence generator for auto-incrementing IDs
-- ============================================================

CREATE TABLE IF NOT EXISTS sequences (
  name TEXT PRIMARY KEY,
  current_value BIGINT NOT NULL DEFAULT 0
);

-- Seed sequences for all entity types
INSERT INTO sequences (name, current_value) VALUES
  ('employee', 0),
  ('customer', 0),
  ('quotation', 0),
  ('work_order', 0),
  ('invoice', 0),
  ('expense', 0)
ON CONFLICT (name) DO NOTHING;

-- Function to get next sequence value (with row locking)
CREATE OR REPLACE FUNCTION next_sequence(seq_name TEXT, prefix TEXT DEFAULT '')
RETURNS TEXT AS $$
DECLARE
  next_val BIGINT;
  current_year TEXT;
BEGIN
  current_year := to_char(now(), 'YYYY');

  UPDATE sequences
  SET current_value = current_value + 1
  WHERE name = seq_name
  RETURNING current_value INTO next_val;

  IF prefix = '' THEN
    RETURN lpad(next_val::TEXT, 3, '0');
  ELSE
    RETURN prefix || '-' || current_year || '-' || lpad(next_val::TEXT, 3, '0');
  END IF;
END;
$$ LANGUAGE plpgsql;

-- RLS
ALTER TABLE sequences ENABLE ROW LEVEL SECURITY;

-- Only authenticated users can read; mutations happen through functions
DROP POLICY IF EXISTS "sequences_select" ON sequences;
CREATE POLICY "sequences_select"
  ON sequences FOR SELECT
  USING (auth.uid() IS NOT NULL);
