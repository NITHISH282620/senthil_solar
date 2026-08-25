-- ============================================================================
-- 0015 — IDEMPOTENT MONEY WRITES
--
-- The money forms disable their button while submitting, which stops a fast
-- double-click within one page. It does nothing about the failures a
-- contractor on a site actually hits:
--
--   * the request succeeded but the response was lost on a weak connection,
--     and he taps Save again because nothing appeared to happen
--   * he refreshes, or navigates back and forward, and resubmits
--   * a retry fires after a timeout that had already been processed
--
-- Each of those creates a second cash entry, a second payment or a second
-- expense. Duplicated money is the single worst failure this system can have,
-- and no amount of client-side care prevents it — the guarantee has to be at
-- the write.
--
-- Every money-writing action now carries a key generated once per intent. The
-- second arrival of the same key collides with a unique index and is
-- recognised as a repeat rather than a new transaction. Partial, so the
-- existing rows and any caller that does not supply a key are unaffected.
-- ============================================================================

ALTER TABLE cash_book ADD COLUMN request_key TEXT;
ALTER TABLE payments  ADD COLUMN request_key TEXT;
ALTER TABLE expenses  ADD COLUMN request_key TEXT;

CREATE UNIQUE INDEX cash_book_request_key_uniq ON cash_book(request_key)
  WHERE request_key IS NOT NULL;
CREATE UNIQUE INDEX payments_request_key_uniq  ON payments(request_key)
  WHERE request_key IS NOT NULL;
CREATE UNIQUE INDEX expenses_request_key_uniq  ON expenses(request_key)
  WHERE request_key IS NOT NULL;

COMMENT ON COLUMN cash_book.request_key IS
  'Idempotency key, one per submission intent. A repeat of the same key is the '
  'same transaction arriving twice, not a second one.';
COMMENT ON COLUMN payments.request_key IS 'Idempotency key. See cash_book.request_key.';
COMMENT ON COLUMN expenses.request_key IS 'Idempotency key. See cash_book.request_key.';
