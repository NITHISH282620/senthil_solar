-- ============================================================================
-- 0004 — FINANCIAL
-- Expenses, the daily cash book, GST-correct invoicing, and payments.
--
-- Rollback: supabase/rollback/0004_financial.down.sql
-- ============================================================================

-- ─── Expense categories ─────────────────────────────────────────────────────
-- A lookup table so the owner can add categories without a migration. The
-- business explicitly asked for custom categories.

CREATE TABLE expense_categories (
  code       TEXT PRIMARY KEY,
  label      TEXT NOT NULL,
  icon       TEXT,
  requires_head_count BOOLEAN NOT NULL DEFAULT false,
  is_system  BOOLEAN NOT NULL DEFAULT false,   -- system rows cannot be deleted
  is_active  BOOLEAN NOT NULL DEFAULT true,
  sort_order INT NOT NULL DEFAULT 0
);

INSERT INTO expense_categories (code, label, icon, requires_head_count, is_system, sort_order) VALUES
  ('fuel',          'Fuel',            '⛽', false, true,  10),
  ('food',          'Food',            '🍽️', true,  true,  20),
  ('tea',           'Tea',             '🍵', true,  true,  30),
  ('snacks',        'Snacks',          '🍪', true,  true,  40),
  ('water',         'Water',           '💧', false, true,  50),
  ('accommodation', 'Accommodation',   '🏠', true,  true,  60),
  ('transport',     'Transport',       '🚚', false, true,  70),
  ('parking',       'Parking',         '🅿️', false, true,  80),
  ('daily_labour',  'Daily Labour',    '👷', true,  true,  90),
  ('repairs',       'Repairs',         '🔧', false, true, 100),
  ('vehicle',       'Vehicle',         '🚗', false, true, 110),
  ('office',        'Office',          '🏢', false, true, 120),
  ('electricity',   'Electricity',     '⚡', false, true, 130),
  ('tools',         'Tools',           '🛠️', false, true, 140),
  ('equipment',     'Equipment Rental','🏗️', false, true, 150),
  ('materials',     'Materials',       '📦', false, true, 160),
  ('miscellaneous', 'Miscellaneous',   '📋', false, true, 999);

-- ─── Expenses ───────────────────────────────────────────────────────────────

CREATE TABLE expenses (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  expense_number TEXT UNIQUE NOT NULL,

  -- Nullable: office overheads are legitimately not site-attributable.
  -- Everything else must carry a site so profitability stays computable.
  site_id     UUID REFERENCES sites(id) ON DELETE SET NULL,
  contract_id UUID REFERENCES contracts(id) ON DELETE SET NULL,
  company_id  UUID REFERENCES companies(id) ON DELETE SET NULL,

  category     TEXT NOT NULL REFERENCES expense_categories(code),
  expense_date DATE NOT NULL DEFAULT CURRENT_DATE,
  title        TEXT NOT NULL,
  description  TEXT,
  amount       NUMERIC(14,2) NOT NULL CHECK (amount > 0),

  head_count INT CHECK (head_count > 0),
  meal_type  TEXT CHECK (meal_type IN ('breakfast','lunch','dinner','tea','snacks')),

  paid_by      UUID REFERENCES profiles(id) ON DELETE SET NULL,
  payment_mode TEXT NOT NULL DEFAULT 'cash'
               CHECK (payment_mode IN ('cash','upi','bank_transfer','card','credit')),
  vendor_name  TEXT,
  receipt_url  TEXT,

  status TEXT NOT NULL DEFAULT 'pending'
         CHECK (status IN ('draft','pending','approved','rejected','reimbursed')),
  approved_by      UUID REFERENCES profiles(id) ON DELETE SET NULL,
  approved_at      TIMESTAMPTZ,
  rejection_reason TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  deleted_at TIMESTAMPTZ,

  CONSTRAINT expense_rejection_needs_reason
    CHECK (status <> 'rejected' OR rejection_reason IS NOT NULL)
);

CREATE INDEX idx_expenses_site_date ON expenses(site_id, expense_date DESC)
  WHERE deleted_at IS NULL;
CREATE INDEX idx_expenses_date      ON expenses(expense_date DESC) WHERE deleted_at IS NULL;
CREATE INDEX idx_expenses_category  ON expenses(category)          WHERE deleted_at IS NULL;
CREATE INDEX idx_expenses_pending   ON expenses(status)
  WHERE status = 'pending' AND deleted_at IS NULL;
CREATE INDEX idx_expenses_paid_by   ON expenses(paid_by)           WHERE deleted_at IS NULL;
CREATE INDEX idx_expenses_contract  ON expenses(contract_id)       WHERE deleted_at IS NULL;

CREATE TRIGGER expenses_set_updated_at
  BEFORE UPDATE ON expenses FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER expenses_stamp_lineage
  BEFORE INSERT OR UPDATE OF site_id ON expenses
  FOR EACH ROW EXECUTE FUNCTION stamp_site_lineage();

-- ─── Daily cash book ────────────────────────────────────────────────────────
--
-- The owner spends constantly and in small amounts: Rs 5 tea, Rs 10 parking,
-- Rs 100 diesel. Nothing is too small to record. This is an append-only
-- ledger; the running balance is derived, never stored, so it can always be
-- reconstructed and can never drift.

CREATE TABLE cash_book (
  id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_date DATE NOT NULL DEFAULT CURRENT_DATE,
  direction TEXT NOT NULL CHECK (direction IN ('in','out')),
  amount    NUMERIC(14,2) NOT NULL CHECK (amount > 0),

  payment_mode TEXT NOT NULL DEFAULT 'cash'
               CHECK (payment_mode IN ('cash','upi','bank','card')),
  bank_account_id UUID REFERENCES bank_accounts(id) ON DELETE SET NULL,

  -- Office overheads have no site; everything else should.
  site_id     UUID REFERENCES sites(id) ON DELETE SET NULL,
  contract_id UUID REFERENCES contracts(id) ON DELETE SET NULL,
  company_id  UUID REFERENCES companies(id) ON DELETE SET NULL,
  is_office   BOOLEAN NOT NULL DEFAULT false,

  category    TEXT REFERENCES expense_categories(code),
  description TEXT NOT NULL,
  counterparty TEXT,

  -- Links back to whatever produced this movement.
  reference_table TEXT CHECK (reference_table IN
    ('expenses','salary_advances','payroll_lines','payments','purchase_orders')),
  reference_id UUID,

  handled_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  notes      TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  deleted_at TIMESTAMPTZ,

  CONSTRAINT cash_book_site_or_office
    CHECK (is_office OR site_id IS NOT NULL),
  CONSTRAINT cash_book_bank_mode
    CHECK (payment_mode <> 'bank' OR bank_account_id IS NOT NULL)
);

CREATE INDEX idx_cash_book_date ON cash_book(entry_date DESC) WHERE deleted_at IS NULL;
CREATE INDEX idx_cash_book_site ON cash_book(site_id, entry_date DESC)
  WHERE deleted_at IS NULL;
CREATE INDEX idx_cash_book_direction ON cash_book(direction, entry_date DESC)
  WHERE deleted_at IS NULL;
CREATE INDEX idx_cash_book_mode ON cash_book(payment_mode) WHERE deleted_at IS NULL;

CREATE TRIGGER cash_book_set_updated_at
  BEFORE UPDATE ON cash_book FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER cash_book_stamp_lineage
  BEFORE INSERT OR UPDATE OF site_id ON cash_book
  FOR EACH ROW EXECUTE FUNCTION stamp_site_lineage();

COMMENT ON TABLE cash_book IS
  'Append-only cash ledger. Running balance is always derived, never stored.';

-- ─── Invoices ───────────────────────────────────────────────────────────────
--
-- Indian GST done properly: intra-state supply splits into CGST + SGST,
-- inter-state uses IGST. The previous schema had a single tax_percent, which
-- cannot produce a filable GSTR-1.

CREATE TABLE invoices (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_number TEXT UNIQUE NOT NULL,

  company_id   UUID NOT NULL REFERENCES companies(id),
  contract_id  UUID REFERENCES contracts(id) ON DELETE SET NULL,
  site_id      UUID REFERENCES sites(id) ON DELETE SET NULL,
  milestone_id UUID REFERENCES contract_milestones(id) ON DELETE SET NULL,

  invoice_date DATE NOT NULL DEFAULT CURRENT_DATE,
  due_date     DATE,
  billing_period_start DATE,
  billing_period_end   DATE,

  place_of_supply_state_code TEXT,
  is_interstate BOOLEAN NOT NULL DEFAULT false,

  subtotal        NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (subtotal >= 0),
  discount_amount NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (discount_amount >= 0),
  taxable_amount  NUMERIC(14,2)
    GENERATED ALWAYS AS (subtotal - discount_amount) STORED,

  cgst_amount NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (cgst_amount >= 0),
  sgst_amount NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (sgst_amount >= 0),
  igst_amount NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (igst_amount >= 0),

  total_amount NUMERIC(14,2)
    GENERATED ALWAYS AS
      (subtotal - discount_amount + cgst_amount + sgst_amount + igst_amount) STORED,

  tds_deducted   NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (tds_deducted >= 0),
  retention_held NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (retention_held >= 0),

  net_receivable NUMERIC(14,2)
    GENERATED ALWAYS AS
      (subtotal - discount_amount + cgst_amount + sgst_amount + igst_amount
       - tds_deducted - retention_held) STORED,

  amount_received NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (amount_received >= 0),

  balance_due NUMERIC(14,2)
    GENERATED ALWAYS AS
      (subtotal - discount_amount + cgst_amount + sgst_amount + igst_amount
       - tds_deducted - retention_held - amount_received) STORED,

  status TEXT NOT NULL DEFAULT 'draft'
         CHECK (status IN ('draft','sent','partially_paid','paid','overdue','cancelled')),

  irn          TEXT,   -- e-invoice reference number, when applicable
  eway_bill_no TEXT,
  notes        TEXT,
  terms        TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  deleted_at TIMESTAMPTZ,

  -- IGST and CGST/SGST are mutually exclusive.
  CONSTRAINT invoice_gst_mode_consistent CHECK (
    (is_interstate AND cgst_amount = 0 AND sgst_amount = 0)
    OR (NOT is_interstate AND igst_amount = 0)
  ),
  CONSTRAINT invoice_period_sane
    CHECK (billing_period_end IS NULL OR billing_period_start IS NULL
           OR billing_period_end >= billing_period_start)
);

CREATE INDEX idx_invoices_company  ON invoices(company_id)  WHERE deleted_at IS NULL;
CREATE INDEX idx_invoices_contract ON invoices(contract_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_invoices_status   ON invoices(status)      WHERE deleted_at IS NULL;
CREATE INDEX idx_invoices_overdue  ON invoices(due_date)
  WHERE status IN ('sent','partially_paid') AND deleted_at IS NULL;

CREATE TRIGGER invoices_set_updated_at
  BEFORE UPDATE ON invoices FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE invoice_items (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id  UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  hsn_sac_code TEXT,
  unit        TEXT NOT NULL DEFAULT 'nos',
  quantity    NUMERIC(14,3) NOT NULL DEFAULT 1 CHECK (quantity > 0),
  unit_price  NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (unit_price >= 0),
  gst_percent NUMERIC(6,3)  NOT NULL DEFAULT 18 CHECK (gst_percent >= 0),
  line_total  NUMERIC(14,2) GENERATED ALWAYS AS (quantity * unit_price) STORED,
  sort_order  INT NOT NULL DEFAULT 0
);

CREATE INDEX idx_invoice_items_invoice ON invoice_items(invoice_id);

-- ─── Payments ───────────────────────────────────────────────────────────────

CREATE TABLE payments (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id  UUID REFERENCES invoices(id) ON DELETE SET NULL,
  company_id  UUID REFERENCES companies(id) ON DELETE SET NULL,
  contract_id UUID REFERENCES contracts(id) ON DELETE SET NULL,
  bank_account_id UUID REFERENCES bank_accounts(id) ON DELETE SET NULL,

  direction TEXT NOT NULL DEFAULT 'inbound'
            CHECK (direction IN ('inbound','outbound')),
  amount    NUMERIC(14,2) NOT NULL CHECK (amount > 0),
  payment_date   DATE NOT NULL DEFAULT CURRENT_DATE,
  payment_method TEXT NOT NULL
                 CHECK (payment_method IN ('cash','bank_transfer','cheque','upi','card')),
  reference_number TEXT,
  tds_deducted NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (tds_deducted >= 0),
  notes        TEXT,
  received_by  UUID REFERENCES profiles(id) ON DELETE SET NULL,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  deleted_at TIMESTAMPTZ
);

CREATE INDEX idx_payments_invoice ON payments(invoice_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_payments_company ON payments(company_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_payments_date    ON payments(payment_date DESC) WHERE deleted_at IS NULL;

CREATE TRIGGER payments_set_updated_at
  BEFORE UPDATE ON payments FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Recompute the parent invoice's received total and status whenever payments
-- change. Single source of truth: the previous schema did this in a trigger
-- AND again in application code, which raced and read pre-trigger state.
CREATE OR REPLACE FUNCTION sync_invoice_from_payments()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_invoice_id UUID := COALESCE(NEW.invoice_id, OLD.invoice_id);
  v_received   NUMERIC(14,2);
  v_inv        invoices%ROWTYPE;
BEGIN
  IF v_invoice_id IS NULL THEN RETURN COALESCE(NEW, OLD); END IF;

  SELECT COALESCE(SUM(amount), 0) INTO v_received
  FROM payments
  WHERE invoice_id = v_invoice_id
    AND direction = 'inbound'
    AND deleted_at IS NULL;

  UPDATE invoices SET amount_received = v_received WHERE id = v_invoice_id;

  SELECT * INTO v_inv FROM invoices WHERE id = v_invoice_id;

  -- Never override a terminal state chosen by a human.
  IF v_inv.status NOT IN ('cancelled','draft') THEN
    UPDATE invoices
    SET status = CASE
      WHEN v_inv.balance_due <= 0 THEN 'paid'
      WHEN v_received > 0         THEN 'partially_paid'
      WHEN v_inv.due_date IS NOT NULL
           AND v_inv.due_date < (now() AT TIME ZONE 'Asia/Kolkata')::date
        THEN 'overdue'
      ELSE 'sent'
    END
    WHERE id = v_invoice_id;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER payments_sync_invoice
  AFTER INSERT OR UPDATE OR DELETE ON payments
  FOR EACH ROW EXECUTE FUNCTION sync_invoice_from_payments();

-- Reject a payment that would overpay the invoice.
CREATE OR REPLACE FUNCTION guard_payment_not_overpaying()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_balance NUMERIC(14,2);
BEGIN
  IF NEW.invoice_id IS NULL OR NEW.direction <> 'inbound' THEN RETURN NEW; END IF;

  SELECT balance_due INTO v_balance FROM invoices WHERE id = NEW.invoice_id;

  IF v_balance IS NOT NULL AND NEW.amount > v_balance + 0.01 THEN
    RAISE EXCEPTION
      'Payment of % exceeds the outstanding balance of % on this invoice',
      NEW.amount, v_balance
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER payments_guard_overpayment
  BEFORE INSERT ON payments
  FOR EACH ROW EXECUTE FUNCTION guard_payment_not_overpaying();
