-- ============================================================================
-- 0017 — QUOTATION VALIDITY WINDOW
--
-- Quotations carried only `valid_until` — a single expiry date. The owner
-- runs jobs where a quote is only meant to hold from a specific start date
-- (a seasonal rate, a bulk-material price locked for a window), so a bare
-- expiry cannot express "valid from the 1st through the 15th." Adds
-- `valid_from`, and a constraint so a quotation can never be entered with its
-- window backwards.
-- ============================================================================

ALTER TABLE quotations ADD COLUMN valid_from DATE;

ALTER TABLE quotations
  ADD CONSTRAINT quotation_validity_window_sane
  CHECK (valid_from IS NULL OR valid_until IS NULL OR valid_until >= valid_from);

COMMENT ON COLUMN quotations.valid_from IS
  'When this price becomes effective. NULL means effective immediately, mirroring the old behaviour.';
