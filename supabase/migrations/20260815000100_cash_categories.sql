-- ============================================================================
-- 0008 — CASH BOOK CATEGORIES
--
-- The daily-money workflow needs two movement types the original category
-- seed did not cover: advances handed to a worker, and wages paid out. Both
-- are cash movements the owner records constantly, and cash_book.category is
-- a foreign key into this table, so they must exist as rows rather than as
-- free text.
--
-- Idempotent: safe to re-run against a database that already has them.
-- ============================================================================

INSERT INTO expense_categories (code, label, icon, requires_head_count, is_system, sort_order) VALUES
  ('worker_advance', 'Worker Advance', '💵', false, true, 95),
  ('salary',         'Salary / Wages', '🧾', false, true, 96),
  ('client_payment', 'Client Payment', '🏦', false, true,  5)
ON CONFLICT (code) DO NOTHING;

COMMENT ON TABLE expense_categories IS
  'Lookup for expense and cash-book categories. System rows cannot be deleted; '
  'the owner may add custom rows without a migration.';
