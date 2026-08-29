-- ============================================================================
-- AI OWNER VOICE AGENT — event log
--
-- The agent never gets database access. It gets a fixed set of tool
-- functions, each of which is either read-only or wraps an existing,
-- already-validated server action (createCashEntry, addPayment,
-- createExpense, ...) unchanged. This table is not the audit trail for what
-- those actions did — audit_logs already has that, via the same triggers
-- every other write goes through. This table is the trail of what the AGENT
-- proposed and how the owner responded, so a review can answer "what did the
-- model suggest" separately from "what actually got written", and so a
-- financial mutation the model proposed can never be executed without a row
-- proving the owner confirmed it first.
--
-- Append-only, like audit_logs: no UPDATE or DELETE policy. A confirmation,
-- an execution, a rejection or a failure is always a NEW row referencing the
-- proposal via proposal_id, never a rewrite of the proposal itself.
-- ============================================================================

CREATE TABLE ai_agent_events (
  id            BIGSERIAL PRIMARY KEY,
  session_id    UUID NOT NULL,
  user_id       UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  proposal_id   BIGINT REFERENCES ai_agent_events(id),
  event_type    TEXT NOT NULL
                CHECK (event_type IN ('turn','proposal','confirmed','executed','rejected','failed')),
  input_text    TEXT,
  input_locale  TEXT,
  tool_name     TEXT,
  tool_args     JSONB,
  summary       TEXT,
  request_key   TEXT,
  result_table  TEXT,
  result_id     TEXT,
  error         TEXT,
  model_used    TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- A confirmed/executed row must trace back to the proposal it confirms.
ALTER TABLE ai_agent_events ADD CONSTRAINT ai_agent_events_proposal_required
  CHECK (event_type NOT IN ('confirmed','executed','rejected','failed') OR proposal_id IS NOT NULL);

-- The same request_key an execution passes to the underlying action
-- (cash_book/payments/expenses.request_key) is stored here too, so a retried
-- 'executed' write is recognisably the same one even if this row is what's
-- inspected first.
CREATE UNIQUE INDEX ai_agent_events_request_key_uniq ON ai_agent_events(request_key)
  WHERE request_key IS NOT NULL;

CREATE INDEX idx_ai_agent_events_session ON ai_agent_events(session_id, created_at);
CREATE INDEX idx_ai_agent_events_user_time ON ai_agent_events(user_id, created_at DESC);
CREATE INDEX idx_ai_agent_events_proposal ON ai_agent_events(proposal_id) WHERE proposal_id IS NOT NULL;

COMMENT ON TABLE ai_agent_events IS
  'Append-only trail of the voice agent''s proposals and the owner''s responses to them. '
  'Not a substitute for audit_logs — that still records the actual writes.';

ALTER TABLE ai_agent_events ENABLE ROW LEVEL SECURITY;

-- Owner-only, and only their own rows — matches the feature being owner-only.
-- No other role can read or write this table even if they somehow reached
-- the agent's API routes, because those routes themselves check auth_is_owner()
-- before ever calling the model, and every insert here carries user_id =
-- auth.uid() from the same authenticated request.
CREATE POLICY ai_agent_events_insert ON ai_agent_events FOR INSERT TO authenticated
  WITH CHECK (auth_is_owner() AND user_id = auth.uid());
CREATE POLICY ai_agent_events_select ON ai_agent_events FOR SELECT TO authenticated
  USING (auth_is_owner() AND user_id = auth.uid());
-- Deliberately no UPDATE or DELETE policy: the proposal/response history is immutable.
