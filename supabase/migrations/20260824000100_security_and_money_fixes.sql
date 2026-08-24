-- ============================================================================
-- 0008 — SECURITY AND MONEY CORRECTIONS
--
-- Every change here was driven by a reproducible failure against a live
-- database, not by inspection. The failing case is recorded above each fix.
-- ============================================================================

-- ─── 1. Privilege escalation through profiles_update_self ───────────────────
--
-- REPRODUCED: as any worker,
--   UPDATE profiles SET role='owner' WHERE id = auth.uid();   -- 1 row
--   UPDATE profiles SET daily_rate=99999 WHERE id = auth.uid();
-- succeeded. profiles_update_self is USING (id = auth.uid()) and RLS has no
-- column granularity, so the subject of a row could rewrite their own role and
-- their own wage. The Supabase REST endpoint is reachable straight from the
-- browser with the user's own JWT, so this needed no application bug to
-- exploit — one fetch() from devtools was a full company takeover.
--
-- REPRODUCED: as a manager,
--   UPDATE profiles SET role='worker' WHERE id = <the owner>;  -- 1 row
--   UPDATE profiles SET bank_account_no='999' WHERE id = <the owner>;
-- profiles_manager_manage granted UPDATE on every row unconditionally.
--
-- RLS cannot express "these columns are off limits", so the guard is a
-- trigger. Authority to change pay, role and employment status rests with the
-- owner alone; everyone else may maintain their own contact details.

CREATE OR REPLACE FUNCTION guard_profile_privileged_columns()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor_role TEXT := auth_role();
BEGIN
  -- Server-side jobs and migrations run without a JWT; they are not the
  -- threat model and must keep working.
  IF auth.uid() IS NULL THEN RETURN NEW; END IF;

  -- The owner is the only unrestricted principal, by design.
  IF v_actor_role = 'owner' THEN RETURN NEW; END IF;

  IF NEW.role IS DISTINCT FROM OLD.role THEN
    RAISE EXCEPTION 'Only the owner can change a role'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF NEW.wage_mode        IS DISTINCT FROM OLD.wage_mode
  OR NEW.monthly_salary   IS DISTINCT FROM OLD.monthly_salary
  OR NEW.daily_rate       IS DISTINCT FROM OLD.daily_rate
  OR NEW.ot_rate_per_hour IS DISTINCT FROM OLD.ot_rate_per_hour
  OR NEW.piece_rate       IS DISTINCT FROM OLD.piece_rate THEN
    RAISE EXCEPTION 'Only the owner can change compensation'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF NEW.employee_code IS DISTINCT FROM OLD.employee_code
  OR NEW.is_active     IS DISTINCT FROM OLD.is_active
  OR NEW.deleted_at    IS DISTINCT FROM OLD.deleted_at
  OR NEW.date_of_joining IS DISTINCT FROM OLD.date_of_joining
  OR NEW.date_of_leaving IS DISTINCT FROM OLD.date_of_leaving THEN
    RAISE EXCEPTION 'Only the owner can change employment status'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Banking and KYC belong to the person they describe. A manager maintaining
  -- someone's record has no business rewriting where their salary is paid.
  IF NEW.id <> auth.uid() THEN
    IF NEW.bank_account_no IS DISTINCT FROM OLD.bank_account_no
    OR NEW.bank_ifsc       IS DISTINCT FROM OLD.bank_ifsc
    OR NEW.bank_name       IS DISTINCT FROM OLD.bank_name
    OR NEW.upi_id          IS DISTINCT FROM OLD.upi_id
    OR NEW.aadhaar_number  IS DISTINCT FROM OLD.aadhaar_number
    OR NEW.pan_number      IS DISTINCT FROM OLD.pan_number THEN
      RAISE EXCEPTION 'Only the owner or the employee themselves can change banking or KYC details'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_guard_privileged ON profiles;
CREATE TRIGGER profiles_guard_privileged
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION guard_profile_privileged_columns();

COMMENT ON FUNCTION guard_profile_privileged_columns IS
  'Column-level authority that RLS cannot express: role, pay, employment '
  'status and banking are owner-only. Closes self-promotion to owner.';

-- A manager maintains staff records but must never reach the owner's row.
DROP POLICY IF EXISTS profiles_manager_manage ON profiles;
CREATE POLICY profiles_manager_manage ON profiles FOR UPDATE TO authenticated
  USING (auth_has_role('manager') AND role <> 'owner')
  WITH CHECK (auth_has_role('manager') AND role <> 'owner');


-- ─── 2. Self-signup provisioned a working account ───────────────────────────
--
-- REPRODUCED: the local stack runs GOTRUE_DISABLE_SIGNUP=false with
-- MAILER_AUTOCONFIRM=true, and handle_new_user() gave every new auth user an
-- ACTIVE worker profile. A stranger could sign up and immediately read the
-- staff directory, the material catalogue and the company's GST and PAN
-- numbers — and, before fix 1, promote themselves to owner.
--
-- auth_role() already requires is_active, so provisioning newcomers as
-- inactive denies them everything until the owner admits them. createEmployee()
-- uses the service-role client and sets is_active = true, so the invite flow
-- is unaffected.

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_is_first BOOLEAN;
  v_code     TEXT;
  v_prefix   TEXT;
BEGIN
  SELECT NOT EXISTS (SELECT 1 FROM profiles) INTO v_is_first;

  SELECT COALESCE(employee_prefix, 'EMP') INTO v_prefix FROM company_settings LIMIT 1;
  v_code := next_document_number('employee', COALESCE(v_prefix, 'EMP'));

  INSERT INTO profiles (id, employee_code, full_name, email, role,
                        wage_mode, is_active)
  VALUES (
    NEW.id,
    v_code,
    COALESCE(NULLIF(TRIM(NEW.raw_user_meta_data ->> 'full_name'), ''), split_part(NEW.email, '@', 1)),
    NEW.email,
    CASE WHEN v_is_first THEN 'owner' ELSE 'worker' END,
    'daily',
    -- Bootstrap the first account. Everyone after that is dormant until the
    -- owner activates them, so a self-signup grants nothing.
    v_is_first
  );

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION handle_new_user IS
  'Bootstraps the first user as owner. Later signups are created INACTIVE so '
  'an uninvited registration carries no privileges.';


-- ─── 3. TDS left every MNC invoice permanently unpaid ───────────────────────
--
-- REPRODUCED: invoice of Rs 5,90,000; the client withholds 2% TDS
-- (Rs 10,000, mandatory under s.194C) and remits Rs 5,80,000. The payment
-- carried tds_deducted = 10000, but nothing ever copied it onto the invoice,
-- whose balance_due subtracts invoices.tds_deducted. Result: balance_due
-- Rs 10,000, status 'partially_paid', forever. Every invoice to every
-- corporate client would sit in receivables as unpaid, and the owner would
-- chase clients for money already deposited with the government.
--
-- Also: an invoice still in 'draft' was excluded from the status update, so
-- recording a payment against one left it at 'draft' — outside
-- v_receivables_ageing and outside the dashboard's outstanding total.
-- Money against an invoice is proof the invoice is real; it is now issued.

CREATE OR REPLACE FUNCTION sync_invoice_from_payments()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_invoice_id UUID := COALESCE(NEW.invoice_id, OLD.invoice_id);
  v_received   NUMERIC(14,2);
  v_tds        NUMERIC(14,2);
  v_inv        invoices%ROWTYPE;
BEGIN
  IF v_invoice_id IS NULL THEN RETURN COALESCE(NEW, OLD); END IF;

  SELECT COALESCE(SUM(amount), 0), COALESCE(SUM(tds_deducted), 0)
    INTO v_received, v_tds
  FROM payments
  WHERE invoice_id = v_invoice_id
    AND direction = 'inbound'
    AND deleted_at IS NULL;

  -- TDS withheld by the client settles the invoice just as cash does; it is
  -- simply paid to the tax department instead of to us.
  UPDATE invoices
  SET amount_received = v_received,
      tds_deducted    = v_tds
  WHERE id = v_invoice_id;

  SELECT * INTO v_inv FROM invoices WHERE id = v_invoice_id;

  -- Never override a terminal state chosen by a human.
  IF v_inv.status <> 'cancelled' THEN
    UPDATE invoices
    SET status = CASE
      WHEN v_inv.balance_due <= 0 THEN 'paid'
      WHEN v_received > 0         THEN 'partially_paid'
      WHEN v_inv.status = 'draft' THEN 'draft'   -- unpaid draft stays a draft
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

-- The overpayment guard only ran on INSERT, so an UPDATE could raise a
-- payment above the balance afterwards.
DROP TRIGGER IF EXISTS payments_guard_overpayment ON payments;
CREATE TRIGGER payments_guard_overpayment
  BEFORE INSERT OR UPDATE OF amount, invoice_id ON payments
  FOR EACH ROW EXECUTE FUNCTION guard_payment_not_overpaying();


-- ─── 4. Half a day was paid as a full day ───────────────────────────────────
--
-- REPRODUCED: updateAttendanceStatus() writes `status` and nothing else, but
-- payroll is driven by `day_fraction` (v_attendance_monthly sums it). Marking
-- a present day as 'half_day' left day_fraction at 1.00, so the half day was
-- paid in full. Marking someone 'absent' likewise still paid them.
--
-- day_fraction is now derived from status, so the two can never disagree.
-- An explicit fraction is still honoured for a genuine partial day.

CREATE OR REPLACE FUNCTION sync_attendance_day_fraction()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.day_fraction := CASE NEW.status
    WHEN 'absent'   THEN 0
    WHEN 'half_day' THEN 0.5
    WHEN 'present'  THEN
      -- Honour a deliberate partial day, but never more than one.
      CASE WHEN TG_OP = 'UPDATE' AND NEW.day_fraction IS DISTINCT FROM OLD.day_fraction
                AND NEW.day_fraction > 0 AND NEW.day_fraction < 1
           THEN NEW.day_fraction
           ELSE 1.0 END
    ELSE COALESCE(NEW.day_fraction, 1.0)   -- leave / holiday / week_off
  END;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS attendance_sync_day_fraction ON attendance;
CREATE TRIGGER attendance_sync_day_fraction
  BEFORE INSERT OR UPDATE OF status, day_fraction ON attendance
  FOR EACH ROW EXECUTE FUNCTION sync_attendance_day_fraction();

COMMENT ON FUNCTION sync_attendance_day_fraction IS
  'Keeps day_fraction in step with status. Payroll reads day_fraction, so the '
  'two disagreeing meant paying a full day for a half day.';


-- ─── 5. One man, one day, two sites, two days'' wages ───────────────────────
--
-- REPRODUCED: a daily-wage worker at Rs 700/day spends the morning at Unit-1
-- and the afternoon at Unit-2. The supervisor marks him present at both —
-- which the schema deliberately allows, one row per (employee, site, date).
-- v_attendance_monthly then reported present_days = 2.00 for a single calendar
-- day and the payroll engine paid Rs 1,400 for one day of work.
--
-- A man cannot work more than one man-day in a day. The fractions are now
-- normalised per calendar date before being aggregated, which both caps the
-- pay at one day and splits the labour cost across the two sites in the
-- proportion he was actually there. raw_present_days is kept so the
-- adjustment is visible rather than silent.

DROP VIEW IF EXISTS v_attendance_monthly;

CREATE VIEW v_attendance_monthly
WITH (security_invoker = true) AS
WITH per_day AS (
  SELECT
    a.employee_id,
    a.date,
    a.site_id,
    a.contract_id,
    a.status,
    a.overtime_hours,
    a.within_geofence,
    a.day_fraction,
    -- Total man-day the person is claimed for on this date, across all sites.
    SUM(a.day_fraction) FILTER (WHERE a.status IN ('present','half_day'))
      OVER (PARTITION BY a.employee_id, a.date) AS claimed_on_date
  FROM attendance a
  WHERE a.deleted_at IS NULL
), normalised AS (
  SELECT
    p.*,
    CASE
      WHEN p.status NOT IN ('present','half_day') THEN 0
      WHEN COALESCE(p.claimed_on_date, 0) > 1
        THEN p.day_fraction / p.claimed_on_date   -- scale back to one man-day
      ELSE p.day_fraction
    END AS paid_fraction
  FROM per_day p
)
SELECT
  n.employee_id,
  EXTRACT(YEAR  FROM n.date)::INT AS period_year,
  EXTRACT(MONTH FROM n.date)::INT AS period_month,
  n.site_id,
  n.contract_id,
  SUM(n.paid_fraction)                                                  AS present_days,
  SUM(n.day_fraction) FILTER (WHERE n.status IN ('present','half_day')) AS raw_present_days,
  SUM(n.day_fraction) FILTER (WHERE n.status = 'leave')                 AS leave_days,
  SUM(n.overtime_hours)                                                 AS overtime_hours,
  COUNT(*) FILTER (WHERE n.status = 'absent')                           AS absent_days,
  COUNT(*) FILTER (WHERE n.within_geofence IS FALSE)                    AS out_of_geofence_count
FROM normalised n
GROUP BY n.employee_id, EXTRACT(YEAR FROM n.date), EXTRACT(MONTH FROM n.date),
         n.site_id, n.contract_id;

COMMENT ON VIEW v_attendance_monthly IS
  'Payroll input. present_days is normalised so a calendar day never pays more '
  'than one man-day, however many sites the person was marked at; '
  'raw_present_days preserves what was actually recorded.';


-- ─── 6. Every man on site could read the contract value and the margin ──────
--
-- REPRODUCED: as a worker assigned to Tiruppur Unit-1,
--   SELECT revenue_allocated, gross_profit, margin_percent FROM v_site_financials;
--   -> 3850000.00 | 3841400.00 | 99.78
-- and directly,
--   SELECT allocated_value FROM sites;  -> 3850000.00
-- Supervisors saw the same for every site they are named on. The site row must
-- stay visible to the crew — they work there — but what the client is paying
-- must not. That is wage-negotiation leverage, and it walks to competitors.
--
-- RLS is row-level, so a money column living on a row that field staff must
-- read cannot be protected in place. The commercial value moves to its own
-- row, in its own table, behind auth_can_see_money().

CREATE TABLE site_commercials (
  site_id         UUID PRIMARY KEY REFERENCES sites(id) ON DELETE CASCADE,
  allocated_value NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (allocated_value >= 0),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE site_commercials IS
  'This site''s share of the parent contract value. Split out of sites so that '
  'field staff can read the site without reading what the client pays for it.';

CREATE TRIGGER site_commercials_set_updated_at
  BEFORE UPDATE ON site_commercials FOR EACH ROW EXECUTE FUNCTION set_updated_at();

INSERT INTO site_commercials (site_id, allocated_value)
SELECT id, allocated_value FROM sites;

ALTER TABLE site_commercials ENABLE ROW LEVEL SECURITY;

CREATE POLICY site_commercials_read ON site_commercials FOR SELECT TO authenticated
  USING (auth_can_see_money());
CREATE POLICY site_commercials_write ON site_commercials FOR ALL TO authenticated
  USING (auth_is_back_office()) WITH CHECK (auth_is_back_office());

-- Keep a commercial row for every site, so the money roles never meet a gap.
CREATE OR REPLACE FUNCTION ensure_site_commercials()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  INSERT INTO site_commercials (site_id, allocated_value)
  VALUES (NEW.id, 0)
  ON CONFLICT (site_id) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE TRIGGER sites_ensure_commercials
  AFTER INSERT ON sites
  FOR EACH ROW EXECUTE FUNCTION ensure_site_commercials();

DROP VIEW IF EXISTS v_company_financials;
DROP VIEW IF EXISTS v_contract_financials;
DROP VIEW IF EXISTS v_site_financials;

ALTER TABLE sites DROP COLUMN allocated_value;

CREATE VIEW v_site_financials
WITH (security_invoker = true) AS
SELECT
  s.id            AS site_id,
  s.site_code,
  s.name          AS site_name,
  s.contract_id,
  s.company_id,
  s.stage,
  s.status,
  s.progress_percent,
  s.capacity_kw,
  -- NULL for field roles: site_commercials is invisible to them, so the join
  -- yields nothing and revenue, profit and margin all disappear with it.
  sc.allocated_value AS revenue_allocated,

  COALESCE(m.material_cost, 0) AS material_cost,
  COALESCE(l.labour_cost,   0) AS labour_cost,
  COALESCE(e.expense_cost,  0) AS expense_cost,
  COALESCE(pe.pending_cost, 0) AS pending_cost,

  COALESCE(m.material_cost, 0)
    + COALESCE(l.labour_cost, 0)
    + COALESCE(e.expense_cost, 0) AS total_cost,

  sc.allocated_value
    - (COALESCE(m.material_cost, 0)
       + COALESCE(l.labour_cost, 0)
       + COALESCE(e.expense_cost, 0)) AS gross_profit,

  CASE
    WHEN sc.allocated_value > 0 THEN
      round(
        (sc.allocated_value
          - (COALESCE(m.material_cost, 0)
             + COALESCE(l.labour_cost, 0)
             + COALESCE(e.expense_cost, 0))
        ) * 100.0 / sc.allocated_value, 2)
    ELSE NULL
  END AS margin_percent,

  COALESCE(w.worker_count, 0) AS assigned_workers
FROM sites s
LEFT JOIN site_commercials sc ON sc.site_id = s.id
LEFT JOIN LATERAL (
  SELECT SUM(total_value) AS material_cost
  FROM stock_ledger sl
  WHERE sl.site_id = s.id
    AND sl.txn_type IN ('site_consumption','installed','damaged','scrapped')
) m ON true
LEFT JOIN LATERAL (
  SELECT SUM(allocated_amount) AS labour_cost
  FROM payroll_site_allocations psa
  WHERE psa.site_id = s.id
) l ON true
LEFT JOIN LATERAL (
  SELECT SUM(amount) AS expense_cost
  FROM expenses ex
  WHERE ex.site_id = s.id
    AND ex.status IN ('approved','reimbursed')
    AND ex.deleted_at IS NULL
) e ON true
-- Spending that has happened but is not yet approved. Excluded from cost so
-- the P&L stays defensible, but surfaced so a Rs 1,50,000 labour bill sitting
-- in the approval queue cannot quietly flatter the margin.
LEFT JOIN LATERAL (
  SELECT SUM(amount) AS pending_cost
  FROM expenses ex
  WHERE ex.site_id = s.id
    AND ex.status IN ('draft','pending')
    AND ex.deleted_at IS NULL
) pe ON true
LEFT JOIN LATERAL (
  SELECT COUNT(*) AS worker_count
  FROM site_assignments sa
  WHERE sa.site_id = s.id AND sa.is_active AND sa.deleted_at IS NULL
) w ON true
WHERE s.deleted_at IS NULL;

COMMENT ON VIEW v_site_financials IS
  'Per-site P&L. revenue_allocated, gross_profit and margin_percent are NULL '
  'for field roles, whose RLS hides site_commercials.';

CREATE VIEW v_contract_financials
WITH (security_invoker = true) AS
SELECT
  c.id AS contract_id,
  c.contract_number,
  c.title,
  c.company_id,
  co.name AS company_name,
  c.status,
  c.contract_value,
  c.start_date,
  c.deadline_date,

  COALESCE(sf.site_count, 0)      AS site_count,
  COALESCE(sf.completed_sites, 0) AS completed_sites,
  COALESCE(sf.total_cost, 0)      AS total_cost,
  COALESCE(sf.pending_cost, 0)    AS pending_cost,
  c.contract_value - COALESCE(sf.total_cost, 0) AS gross_profit,

  COALESCE(inv.invoiced, 0) AS invoiced,
  COALESCE(inv.received, 0) AS received,
  COALESCE(inv.outstanding, 0) AS outstanding,
  c.contract_value - COALESCE(inv.invoiced, 0) AS unbilled,

  CASE
    WHEN c.deadline_date IS NOT NULL
     AND c.actual_end_date IS NULL
     AND c.deadline_date < (now() AT TIME ZONE 'Asia/Kolkata')::date
    THEN true ELSE false
  END AS is_overdue
FROM contracts c
JOIN companies co ON co.id = c.company_id
LEFT JOIN LATERAL (
  SELECT
    COUNT(*)                                       AS site_count,
    COUNT(*) FILTER (WHERE f.status = 'completed') AS completed_sites,
    SUM(f.total_cost)                              AS total_cost,
    SUM(f.pending_cost)                            AS pending_cost
  FROM v_site_financials f
  WHERE f.contract_id = c.id
) sf ON true
LEFT JOIN LATERAL (
  SELECT
    SUM(i.total_amount)    AS invoiced,
    SUM(i.amount_received) AS received,
    SUM(i.balance_due)     AS outstanding
  FROM invoices i
  WHERE i.contract_id = c.id
    AND i.deleted_at IS NULL
    AND i.status <> 'cancelled'
) inv ON true
WHERE c.deleted_at IS NULL;

CREATE VIEW v_company_financials
WITH (security_invoker = true) AS
SELECT
  co.id AS company_id,
  co.company_code,
  co.name,
  co.status,
  COUNT(DISTINCT cf.contract_id)          AS contract_count,
  COALESCE(SUM(cf.contract_value), 0)     AS total_contract_value,
  COALESCE(SUM(cf.total_cost), 0)         AS total_cost,
  COALESCE(SUM(cf.gross_profit), 0)       AS gross_profit,
  COALESCE(SUM(cf.invoiced), 0)           AS total_invoiced,
  COALESCE(SUM(cf.received), 0)           AS total_received,
  COALESCE(SUM(cf.outstanding), 0)        AS total_outstanding
FROM companies co
LEFT JOIN v_contract_financials cf ON cf.company_id = co.id
WHERE co.deleted_at IS NULL
GROUP BY co.id, co.company_code, co.name, co.status;


-- ─── 7. A supervisor could not see the names of their own crew ──────────────
--
-- REPRODUCED: as the supervisor of Tiruppur Unit-1, the crew list and the
-- attendance sheet both rendered blank names — profiles_select_self restricts
-- direct reads to self plus back office, and the embedded profile came back
-- NULL. Marking attendance is the supervisor's whole job and they could not
-- tell one worker from another, which makes the role unusable in the field.
--
-- The obvious fix — widening profiles_select_self to people you share a site
-- with — is wrong, and dangerously so: RLS is row-level, so granting the row
-- would hand every colleague's daily_rate, bank_account_no and aadhaar_number
-- to anyone on the same site. It would trade a usability defect for a much
-- worse privacy breach.
--
-- Instead the roster view itself carries the rule. v_directory already selects
-- only non-sensitive columns, so making it SECURITY DEFINER and putting the
-- predicate inside it widens exactly those columns and nothing else. The
-- profiles table stays as locked down as it was.

CREATE OR REPLACE FUNCTION auth_shares_a_site_with(p_employee_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM site_assignments mine
    JOIN site_assignments theirs ON theirs.site_id = mine.site_id
    WHERE mine.employee_id = auth.uid()
      AND mine.is_active AND mine.deleted_at IS NULL
      AND theirs.employee_id = p_employee_id
      AND theirs.is_active AND theirs.deleted_at IS NULL
  )
  OR EXISTS (
    -- The named engineer or supervisor of a site sees that site's crew even
    -- if they hold no assignment row of their own.
    SELECT 1
    FROM sites s
    JOIN site_assignments theirs ON theirs.site_id = s.id
    WHERE (s.site_engineer_id = auth.uid() OR s.supervisor_id = auth.uid())
      AND s.deleted_at IS NULL
      AND theirs.employee_id = p_employee_id
      AND theirs.is_active AND theirs.deleted_at IS NULL
  );
$$;

COMMENT ON FUNCTION auth_shares_a_site_with IS
  'True when the caller and the subject are on a site together. Lets a '
  'supervisor identify their own crew without opening the whole roster.';

-- SECURITY DEFINER (security_invoker = false): the view bypasses RLS on
-- profiles and applies its own, narrower rule over safe columns only.
DROP VIEW IF EXISTS v_directory;

CREATE VIEW v_directory
WITH (security_invoker = false) AS
SELECT
  p.id,
  p.employee_code,
  p.full_name,
  p.phone,
  p.role,
  p.trade,
  p.department,
  p.designation,
  p.is_active,
  p.avatar_url
FROM profiles p
WHERE p.deleted_at IS NULL
  AND (
    p.id = auth.uid()
    OR auth_is_back_office()
    OR auth_has_role('accountant')
    OR auth_shares_a_site_with(p.id)
  );

COMMENT ON VIEW v_directory IS
  'Roster without compensation, banking or KYC. SECURITY DEFINER so a '
  'supervisor can name their own crew; the profiles table itself stays shut.';

REVOKE ALL ON v_directory FROM anon;
GRANT SELECT ON v_directory TO authenticated;
