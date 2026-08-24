-- ============================================================================
-- 0011 — UNALLOCATED CLIENT CREDIT
--
-- Reproduced: invoice Rs 4,00,000, client transfers Rs 4,50,000. The invoice
-- settles and Rs 50,000 is written as an inbound payment with no invoice_id —
-- but nothing surfaced it. Not in v_receivables_ageing, not in the dashboard's
-- outstanding total, not on any screen:
--
--   unallocated inbound payments | 1 row | 50000.00     (findable only in SQL)
--
-- Recorded but invisible is, from the owner's chair, the same as lost. He will
-- bill that client again for money he already has.
--
-- THE BUSINESS RULE, stated once and implemented here:
--
--   Money received that exceeds an invoice's balance, or that arrives before
--   any invoice exists, is held as UNALLOCATED CLIENT CREDIT — a payments row
--   against the company with invoice_id NULL. It is real cash: it is already
--   in the cash book and in the bank.
--
--   Credit never reduces receivables by itself. Which bill it settles is a
--   commercial decision, so the owner makes it. But it is always shown beside
--   the client's outstanding balance, so it cannot be forgotten.
--
--   Applying credit re-points the payment row at an invoice, splitting it when
--   the credit is larger than that invoice's balance.
-- ============================================================================

CREATE VIEW v_client_credit
WITH (security_invoker = true) AS
SELECT
  p.company_id,
  co.name          AS company_name,
  co.company_code,
  SUM(p.amount)    AS credit_available,
  COUNT(*)         AS credit_entries,
  MIN(p.payment_date) AS oldest_credit_date
FROM payments p
JOIN companies co ON co.id = p.company_id
WHERE p.invoice_id IS NULL
  AND p.direction = 'inbound'
  AND p.deleted_at IS NULL
  AND co.deleted_at IS NULL
GROUP BY p.company_id, co.name, co.company_code
HAVING SUM(p.amount) > 0;

COMMENT ON VIEW v_client_credit IS
  'Money a client has paid that is not yet set against any invoice. Real cash, '
  'already banked and in the cash book, awaiting allocation by the owner.';

-- The individual credits, so the owner can see where each came from.
CREATE VIEW v_client_credit_detail
WITH (security_invoker = true) AS
SELECT
  p.id AS payment_id,
  p.company_id,
  co.name AS company_name,
  p.amount,
  p.payment_date,
  p.payment_method,
  p.reference_number,
  p.notes
FROM payments p
JOIN companies co ON co.id = p.company_id
WHERE p.invoice_id IS NULL
  AND p.direction = 'inbound'
  AND p.deleted_at IS NULL
  AND co.deleted_at IS NULL;

COMMENT ON VIEW v_client_credit_detail IS
  'One row per unallocated receipt, for allocating credit against an invoice.';
