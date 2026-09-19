-- ============================================================================
-- 0023 — Line-item negotiation, and a site's revenue that survives change
--
-- The single quotation-level negotiated_amount (0020) can't represent real
-- bargaining: the client accepts some lines and haggles others ("Field work
-- 8,000" while civil work is untouched). This adds the per-line figure the
-- business actually needs, and — because a site's revenue must be able to
-- grow when a client asks for additional work later without rewriting the
-- original approved number — turns site_commercials.allocated_value into a
-- sum across every approved quotation on that site rather than a single
-- overwritten slot. See v_quotation_totals below for the one place the
-- our-ask vs client-agreed rule is computed, so every reader agrees.
-- ============================================================================

ALTER TABLE quotation_items
  ADD COLUMN client_unit_price NUMERIC(14,2) CHECK (client_unit_price >= 0),
  ADD COLUMN client_line_total NUMERIC(14,2)
    GENERATED ALWAYS AS (quantity * client_unit_price) STORED;

COMMENT ON COLUMN quotation_items.client_unit_price IS
  'What the client agreed to for this one line, recorded separately from '
  'unit_price (the ask) — never overwrites it. NULL means this line was not '
  'individually negotiated; v_quotation_totals falls back to line_total.';

-- One place that decides "what did the client actually agree to," so the
-- list page, detail page, site page and site-revenue sync can never disagree
-- with each other about it.
CREATE OR REPLACE VIEW v_quotation_totals
WITH (security_invoker = true) AS
SELECT
  q.id AS quotation_id,
  q.total_amount AS our_total,
  CASE WHEN bool_or(i.client_unit_price IS NOT NULL)
    THEN SUM(COALESCE(i.client_line_total, i.line_total))
    ELSE COALESCE(q.negotiated_amount, q.total_amount)
  END AS client_agreed_total,
  CASE WHEN bool_or(i.client_unit_price IS NOT NULL)
    THEN SUM(COALESCE(i.client_line_total, i.line_total)) - q.total_amount
    ELSE COALESCE(q.negotiated_amount, q.total_amount) - q.total_amount
  END AS difference,
  bool_or(i.client_unit_price IS NOT NULL) AS has_line_negotiation
FROM quotations q
LEFT JOIN quotation_items i ON i.quotation_id = q.id
GROUP BY q.id;

COMMENT ON VIEW v_quotation_totals IS
  'Client-agreed total per quotation: the sum of each line''s agreed figure '
  '(falling back to that line''s ask when it was not individually '
  'negotiated) when any line has been negotiated; otherwise the '
  'quotation-level negotiated_amount quick-entry, or the ask if neither '
  'exists. This is the single source every page reads instead of '
  're-deriving the rule.';

-- Auditability (§17): the generic audit_trigger() from migration 0001 was
-- never attached to quotations/quotation_items, so quote revisions,
-- client-agreed amounts and approvals left no trail.
CREATE TRIGGER audit_quotations       AFTER INSERT OR UPDATE OR DELETE ON quotations       FOR EACH ROW EXECUTE FUNCTION audit_trigger();
CREATE TRIGGER audit_quotation_items  AFTER INSERT OR UPDATE OR DELETE ON quotation_items  FOR EACH ROW EXECUTE FUNCTION audit_trigger();
