-- 00018_petty_cash_ledger.sql
-- Create a double-entry inspired petty cash ledger

CREATE TABLE cash_transfers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    from_user_id UUID REFERENCES profiles(id) ON DELETE SET NULL, -- Null if company external
    to_user_id UUID REFERENCES profiles(id) ON DELETE SET NULL, -- Null if returning to company
    amount NUMERIC(12, 2) NOT NULL,
    transaction_date DATE NOT NULL,
    transaction_type VARCHAR(50) NOT NULL CHECK (transaction_type IN ('advance', 'settlement', 'return', 'adjustment')),
    reference_type VARCHAR(50), -- e.g., 'expense_id'
    reference_id UUID,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by UUID REFERENCES auth.users(id)
);

-- Index for querying balances and history quickly
CREATE INDEX idx_cash_transfers_from_user ON cash_transfers(from_user_id);
CREATE INDEX idx_cash_transfers_to_user ON cash_transfers(to_user_id);
CREATE INDEX idx_cash_transfers_date ON cash_transfers(transaction_date);

-- RLS
ALTER TABLE cash_transfers ENABLE ROW LEVEL SECURITY;

-- Everyone can see their own transfers
CREATE POLICY "Users can view their own cash transfers"
  ON cash_transfers FOR SELECT
  TO authenticated
  USING (
    from_user_id = auth.uid() OR to_user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role IN ('admin', 'manager')
    )
  );

-- Only admins/managers can insert transfers (advances, adjustments, returns)
-- Expense settlements are created by triggers/backend when expense is approved
CREATE POLICY "Admins can manage cash transfers"
  ON cash_transfers FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role IN ('admin', 'manager')
    )
  );
