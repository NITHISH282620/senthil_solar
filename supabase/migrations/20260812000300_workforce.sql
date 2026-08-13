-- ============================================================================
-- 0003 — WORKFORCE
-- Attendance, leave, salary advances, and payroll with per-site cost
-- allocation.
--
-- The allocation table is what makes "labour cost per site" answerable, and
-- therefore what makes site profitability answerable at all.
--
-- Rollback: supabase/rollback/0003_workforce.down.sql
-- ============================================================================

-- ─── Attendance ─────────────────────────────────────────────────────────────

CREATE TABLE attendance (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  -- NOT NULL by design. The previous schema allowed NULL site_id inside a
  -- UNIQUE(employee_id, site_id, date) constraint; because NULLs are distinct
  -- in Postgres, that permitted unlimited duplicate rows per person per day.
  site_id     UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  contract_id UUID REFERENCES contracts(id) ON DELETE SET NULL,
  company_id  UUID REFERENCES companies(id) ON DELETE SET NULL,

  date   DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'present'
         CHECK (status IN ('present','absent','half_day','leave','holiday','week_off')),
  -- 1.0 full day, 0.5 half day, 0 absent. Drives payroll directly.
  day_fraction NUMERIC(3,2) NOT NULL DEFAULT 1.0
               CHECK (day_fraction BETWEEN 0 AND 1),

  check_in_at  TIMESTAMPTZ,
  check_out_at TIMESTAMPTZ,
  check_in_lat  NUMERIC(10,7),
  check_in_lng  NUMERIC(10,7),
  check_out_lat NUMERIC(10,7),
  check_out_lng NUMERIC(10,7),
  check_in_photo_url TEXT,

  within_geofence      BOOLEAN,
  distance_from_site_m INT,

  worked_hours   NUMERIC(5,2) CHECK (worked_hours >= 0),
  overtime_hours NUMERIC(5,2) NOT NULL DEFAULT 0 CHECK (overtime_hours >= 0),

  marked_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  source    TEXT NOT NULL DEFAULT 'self'
            CHECK (source IN ('self','supervisor','admin','offline_sync','import')),

  is_approved BOOLEAN NOT NULL DEFAULT false,
  approved_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  approved_at TIMESTAMPTZ,

  is_corrected      BOOLEAN NOT NULL DEFAULT false,
  correction_reason TEXT,
  -- Set when payroll is finalised; prevents retroactive edits to paid periods.
  is_locked BOOLEAN NOT NULL DEFAULT false,

  notes      TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ,

  CONSTRAINT attendance_unique_per_site_day UNIQUE (employee_id, site_id, date),
  CONSTRAINT attendance_checkout_after_checkin
    CHECK (check_out_at IS NULL OR check_in_at IS NULL OR check_out_at >= check_in_at),
  CONSTRAINT attendance_correction_needs_reason
    CHECK (NOT is_corrected OR correction_reason IS NOT NULL)
);

CREATE INDEX idx_att_employee_date ON attendance(employee_id, date DESC)
  WHERE deleted_at IS NULL;
CREATE INDEX idx_att_site_date     ON attendance(site_id, date DESC)
  WHERE deleted_at IS NULL;
CREATE INDEX idx_att_date          ON attendance(date)
  WHERE deleted_at IS NULL;
CREATE INDEX idx_att_payroll       ON attendance(employee_id, date)
  WHERE deleted_at IS NULL AND NOT is_locked;
CREATE INDEX idx_att_contract      ON attendance(contract_id) WHERE deleted_at IS NULL;

CREATE TRIGGER attendance_set_updated_at
  BEFORE UPDATE ON attendance FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER attendance_stamp_lineage
  BEFORE INSERT OR UPDATE OF site_id ON attendance
  FOR EACH ROW EXECUTE FUNCTION stamp_site_lineage();

COMMENT ON TABLE attendance IS
  'One row per employee per site per day. day_fraction and overtime_hours feed payroll.';

-- Great-circle distance in metres. Used for geofence validation; the geofence
-- radii here (hundreds of metres) make the spherical approximation more than
-- adequate, and it avoids a PostGIS dependency.
CREATE OR REPLACE FUNCTION haversine_metres(
  lat1 NUMERIC, lng1 NUMERIC, lat2 NUMERIC, lng2 NUMERIC
) RETURNS NUMERIC
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  r CONSTANT NUMERIC := 6371000;
  dlat NUMERIC; dlng NUMERIC; a NUMERIC;
BEGIN
  IF lat1 IS NULL OR lng1 IS NULL OR lat2 IS NULL OR lng2 IS NULL THEN
    RETURN NULL;
  END IF;
  dlat := radians(lat2 - lat1);
  dlng := radians(lng2 - lng1);
  a := sin(dlat / 2) ^ 2
     + cos(radians(lat1)) * cos(radians(lat2)) * sin(dlng / 2) ^ 2;
  RETURN r * 2 * atan2(sqrt(a), sqrt(1 - a));
END;
$$;

-- Evaluate the geofence on write. Out-of-fence check-ins are FLAGGED, never
-- blocked: a supervisor whose GPS drifts must still be able to record the day,
-- or the whole system gets abandoned for paper.
CREATE OR REPLACE FUNCTION evaluate_attendance_geofence()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_lat NUMERIC; v_lng NUMERIC; v_radius INT; v_dist NUMERIC;
BEGIN
  IF NEW.check_in_lat IS NULL OR NEW.check_in_lng IS NULL THEN
    NEW.within_geofence := NULL;
    NEW.distance_from_site_m := NULL;
    RETURN NEW;
  END IF;

  SELECT gps_lat, gps_lng, geofence_radius_m
    INTO v_lat, v_lng, v_radius
  FROM sites WHERE id = NEW.site_id;

  IF v_lat IS NULL OR v_lng IS NULL THEN
    NEW.within_geofence := NULL;      -- site has no coordinates yet
    NEW.distance_from_site_m := NULL;
    RETURN NEW;
  END IF;

  v_dist := haversine_metres(NEW.check_in_lat, NEW.check_in_lng, v_lat, v_lng);
  NEW.distance_from_site_m := round(v_dist);
  NEW.within_geofence := v_dist <= COALESCE(v_radius, 500);
  RETURN NEW;
END;
$$;

CREATE TRIGGER attendance_evaluate_geofence
  BEFORE INSERT OR UPDATE OF check_in_lat, check_in_lng, site_id ON attendance
  FOR EACH ROW EXECUTE FUNCTION evaluate_attendance_geofence();

-- Refuse edits to attendance already consumed by a finalised payroll run.
CREATE OR REPLACE FUNCTION guard_locked_attendance()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.is_locked AND NEW.is_locked THEN
    RAISE EXCEPTION
      'Attendance for % on % is locked by a finalised payroll run and cannot be changed',
      OLD.employee_id, OLD.date
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER attendance_guard_locked
  BEFORE UPDATE ON attendance
  FOR EACH ROW EXECUTE FUNCTION guard_locked_attendance();

-- ─── Leave ──────────────────────────────────────────────────────────────────

CREATE TABLE leave_requests (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  leave_type  TEXT NOT NULL CHECK (leave_type IN ('sick','casual','annual','unpaid','other')),
  from_date   DATE NOT NULL,
  to_date     DATE NOT NULL,
  is_paid     BOOLEAN NOT NULL DEFAULT true,
  reason      TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'pending'
              CHECK (status IN ('pending','approved','rejected','cancelled')),
  approved_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  approved_at TIMESTAMPTZ,
  rejection_reason TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at  TIMESTAMPTZ,
  CONSTRAINT leave_dates_sane CHECK (to_date >= from_date)
);

CREATE INDEX idx_leave_employee ON leave_requests(employee_id, from_date DESC)
  WHERE deleted_at IS NULL;
CREATE INDEX idx_leave_pending  ON leave_requests(status)
  WHERE status = 'pending' AND deleted_at IS NULL;

CREATE TRIGGER leave_requests_set_updated_at
  BEFORE UPDATE ON leave_requests FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ─── Salary advances ────────────────────────────────────────────────────────
-- Workers routinely request small advances (Rs 200-1000). Unrecovered advances
-- are pure loss, so recovery is automatic during payroll.

CREATE TABLE salary_advances (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  site_id     UUID REFERENCES sites(id) ON DELETE SET NULL,
  contract_id UUID REFERENCES contracts(id) ON DELETE SET NULL,
  company_id  UUID REFERENCES companies(id) ON DELETE SET NULL,

  amount        NUMERIC(14,2) NOT NULL CHECK (amount > 0),
  advance_date  DATE NOT NULL DEFAULT CURRENT_DATE,
  reason        TEXT,
  recovery_mode TEXT NOT NULL DEFAULT 'full_next_payroll'
                CHECK (recovery_mode IN ('full_next_payroll','instalments')),
  instalment_amount NUMERIC(14,2) CHECK (instalment_amount > 0),

  amount_recovered NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (amount_recovered >= 0),
  balance NUMERIC(14,2) GENERATED ALWAYS AS (amount - amount_recovered) STORED,

  status TEXT NOT NULL DEFAULT 'outstanding'
         CHECK (status IN ('outstanding','partially_recovered','recovered','written_off')),
  given_by     UUID REFERENCES profiles(id) ON DELETE SET NULL,
  payment_mode TEXT CHECK (payment_mode IN ('cash','upi','bank_transfer')),
  notes        TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ,

  CONSTRAINT advance_not_over_recovered CHECK (amount_recovered <= amount),
  CONSTRAINT advance_instalment_required
    CHECK (recovery_mode <> 'instalments' OR instalment_amount IS NOT NULL)
);

CREATE INDEX idx_advances_employee ON salary_advances(employee_id)
  WHERE deleted_at IS NULL;
CREATE INDEX idx_advances_outstanding ON salary_advances(employee_id, advance_date)
  WHERE status IN ('outstanding','partially_recovered') AND deleted_at IS NULL;

CREATE TRIGGER salary_advances_set_updated_at
  BEFORE UPDATE ON salary_advances FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER salary_advances_stamp_lineage
  BEFORE INSERT OR UPDATE OF site_id ON salary_advances
  FOR EACH ROW EXECUTE FUNCTION stamp_site_lineage();

-- Keep status in step with the recovered amount.
CREATE OR REPLACE FUNCTION sync_advance_status()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.status = 'written_off' THEN RETURN NEW; END IF;
  NEW.status := CASE
    WHEN NEW.amount_recovered = 0            THEN 'outstanding'
    WHEN NEW.amount_recovered >= NEW.amount  THEN 'recovered'
    ELSE 'partially_recovered'
  END;
  RETURN NEW;
END;
$$;

CREATE TRIGGER salary_advances_sync_status
  BEFORE INSERT OR UPDATE OF amount_recovered, amount ON salary_advances
  FOR EACH ROW EXECUTE FUNCTION sync_advance_status();

-- ─── Payroll ────────────────────────────────────────────────────────────────

CREATE TABLE payroll_runs (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  period_month INT NOT NULL CHECK (period_month BETWEEN 1 AND 12),
  period_year  INT NOT NULL CHECK (period_year BETWEEN 2000 AND 2100),
  status       TEXT NOT NULL DEFAULT 'draft'
               CHECK (status IN ('draft','finalised','paid','cancelled')),
  total_gross      NUMERIC(14,2) NOT NULL DEFAULT 0,
  total_deductions NUMERIC(14,2) NOT NULL DEFAULT 0,
  total_net        NUMERIC(14,2) NOT NULL DEFAULT 0,
  employee_count   INT NOT NULL DEFAULT 0,
  finalised_at TIMESTAMPTZ,
  finalised_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  notes        TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by   UUID REFERENCES profiles(id) ON DELETE SET NULL,
  deleted_at   TIMESTAMPTZ,
  UNIQUE (period_month, period_year)
);

CREATE TRIGGER payroll_runs_set_updated_at
  BEFORE UPDATE ON payroll_runs FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE payroll_lines (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payroll_run_id UUID NOT NULL REFERENCES payroll_runs(id) ON DELETE CASCADE,
  employee_id    UUID NOT NULL REFERENCES profiles(id),

  wage_mode TEXT NOT NULL CHECK (wage_mode IN ('monthly','daily','piece_rate')),

  present_days    NUMERIC(6,2) NOT NULL DEFAULT 0 CHECK (present_days >= 0),
  paid_leave_days NUMERIC(6,2) NOT NULL DEFAULT 0 CHECK (paid_leave_days >= 0),
  overtime_hours  NUMERIC(7,2) NOT NULL DEFAULT 0 CHECK (overtime_hours >= 0),

  -- Rates are snapshotted, so a later change to the employee's rate cannot
  -- retroactively alter a payslip that has already been issued.
  rate_used    NUMERIC(14,2),
  ot_rate_used NUMERIC(14,2),
  piece_units  NUMERIC(14,3),
  piece_rate_used NUMERIC(14,2),

  basic_amount    NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (basic_amount >= 0),
  overtime_amount NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (overtime_amount >= 0),
  bonus           NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (bonus >= 0),
  gross_amount    NUMERIC(14,2)
    GENERATED ALWAYS AS (basic_amount + overtime_amount + bonus) STORED,

  advance_deduction NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (advance_deduction >= 0),
  penalty_deduction NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (penalty_deduction >= 0),
  other_deduction   NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (other_deduction >= 0),
  net_amount NUMERIC(14,2)
    GENERATED ALWAYS AS (
      basic_amount + overtime_amount + bonus
      - advance_deduction - penalty_deduction - other_deduction
    ) STORED,

  is_paid        BOOLEAN NOT NULL DEFAULT false,
  paid_date      DATE,
  paid_method    TEXT CHECK (paid_method IN ('bank_transfer','cash','upi','cheque')),
  paid_reference TEXT,
  notes          TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (payroll_run_id, employee_id)
);

CREATE INDEX idx_payroll_lines_run      ON payroll_lines(payroll_run_id);
CREATE INDEX idx_payroll_lines_employee ON payroll_lines(employee_id);
CREATE INDEX idx_payroll_lines_unpaid   ON payroll_lines(is_paid) WHERE NOT is_paid;

CREATE TRIGGER payroll_lines_set_updated_at
  BEFORE UPDATE ON payroll_lines FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Splits each payroll line across the sites the employee actually worked,
-- proportional to their attendance. Without this, wages — the largest cost
-- line in the business — cannot be attributed to a site, and site
-- profitability is not computable.
CREATE TABLE payroll_site_allocations (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payroll_line_id UUID NOT NULL REFERENCES payroll_lines(id) ON DELETE CASCADE,
  site_id     UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  contract_id UUID REFERENCES contracts(id) ON DELETE SET NULL,
  company_id  UUID REFERENCES companies(id) ON DELETE SET NULL,
  days_worked      NUMERIC(6,2) NOT NULL CHECK (days_worked >= 0),
  overtime_hours   NUMERIC(7,2) NOT NULL DEFAULT 0,
  allocated_amount NUMERIC(14,2) NOT NULL CHECK (allocated_amount >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (payroll_line_id, site_id)
);

CREATE INDEX idx_payroll_alloc_site ON payroll_site_allocations(site_id);
CREATE INDEX idx_payroll_alloc_line ON payroll_site_allocations(payroll_line_id);

CREATE TRIGGER payroll_alloc_stamp_lineage
  BEFORE INSERT OR UPDATE OF site_id ON payroll_site_allocations
  FOR EACH ROW EXECUTE FUNCTION stamp_site_lineage();

COMMENT ON TABLE payroll_site_allocations IS
  'Per-site split of each payroll line, derived from attendance. Sums to gross_amount.';
