-- ============================================================================
-- 0002 — COMMERCIAL CORE
-- Client Company -> Contract -> Project (optional) -> Site
--
-- This is the single canonical hierarchy (ADR-0001). Every operational and
-- financial record in later migrations hangs off a Site, and every Site
-- resolves to exactly one Contract and one Company.
--
-- Rollback: supabase/rollback/0002_commercial.down.sql
-- ============================================================================

-- ─── Client companies ───────────────────────────────────────────────────────

CREATE TABLE companies (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_code  TEXT UNIQUE NOT NULL,
  name          TEXT NOT NULL,
  legal_name    TEXT,
  company_type  TEXT NOT NULL DEFAULT 'corporate'
                CHECK (company_type IN
                  ('corporate','factory','industrial','commercial',
                   'government','residential')),

  gst_number    TEXT,
  pan_number    TEXT,

  billing_address  TEXT,
  shipping_address TEXT,
  city    TEXT,
  state   TEXT,
  state_code TEXT,        -- GST state code: drives IGST vs CGST/SGST
  pincode TEXT,

  -- Commercial terms
  payment_terms_days INT NOT NULL DEFAULT 30 CHECK (payment_terms_days >= 0),
  credit_limit       NUMERIC(14,2) CHECK (credit_limit >= 0),
  tds_applicable     BOOLEAN NOT NULL DEFAULT false,
  tds_percent        NUMERIC(6,3) NOT NULL DEFAULT 2 CHECK (tds_percent >= 0),
  retention_percent  NUMERIC(6,3) NOT NULL DEFAULT 0
                     CHECK (retention_percent >= 0 AND retention_percent <= 100),

  status  TEXT NOT NULL DEFAULT 'active'
          CHECK (status IN ('prospect','active','inactive','blacklisted')),
  notes   TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  deleted_at TIMESTAMPTZ
);

CREATE INDEX idx_companies_status    ON companies(status) WHERE deleted_at IS NULL;
CREATE INDEX idx_companies_name_trgm ON companies USING gin (name gin_trgm_ops);

CREATE TRIGGER companies_set_updated_at
  BEFORE UPDATE ON companies FOR EACH ROW EXECUTE FUNCTION set_updated_at();

COMMENT ON TABLE companies IS
  'Client organisations that award contracts. Distinct from profiles (staff).';

CREATE TABLE company_contacts (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  designation TEXT,
  phone       TEXT,
  email       TEXT,
  contact_type TEXT CHECK (contact_type IN ('billing','technical','management','site')),
  is_primary  BOOLEAN NOT NULL DEFAULT false,
  notes       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at  TIMESTAMPTZ
);

CREATE INDEX idx_company_contacts_company ON company_contacts(company_id)
  WHERE deleted_at IS NULL;

-- At most one primary contact per company.
CREATE UNIQUE INDEX company_contacts_one_primary
  ON company_contacts (company_id) WHERE is_primary AND deleted_at IS NULL;

CREATE TRIGGER company_contacts_set_updated_at
  BEFORE UPDATE ON company_contacts FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ─── Quotations ─────────────────────────────────────────────────────────────
-- Precede contracts: a quotation converts into a contract.

CREATE TABLE quotations (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quotation_number TEXT UNIQUE NOT NULL,
  company_id       UUID NOT NULL REFERENCES companies(id),
  version          INT NOT NULL DEFAULT 1 CHECK (version >= 1),
  supersedes_id    UUID REFERENCES quotations(id) ON DELETE SET NULL,

  title       TEXT NOT NULL,
  description TEXT,
  capacity_kw NUMERIC(12,3) CHECK (capacity_kw >= 0),
  panel_type    TEXT,
  inverter_type TEXT,

  subtotal        NUMERIC(14,2) NOT NULL DEFAULT 0,
  discount_amount NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (discount_amount >= 0),
  gst_percent     NUMERIC(6,3)  NOT NULL DEFAULT 18,
  gst_amount      NUMERIC(14,2) NOT NULL DEFAULT 0,
  total_amount    NUMERIC(14,2)
    GENERATED ALWAYS AS (subtotal - discount_amount + gst_amount) STORED,

  warranty_terms TEXT,
  payment_terms  TEXT,
  terms          TEXT,
  valid_until    DATE,

  status TEXT NOT NULL DEFAULT 'draft'
         CHECK (status IN ('draft','sent','approved','rejected','expired','converted')),
  approved_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  notes       TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  deleted_at TIMESTAMPTZ
);

CREATE INDEX idx_quotations_company ON quotations(company_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_quotations_status  ON quotations(status)     WHERE deleted_at IS NULL;

CREATE TRIGGER quotations_set_updated_at
  BEFORE UPDATE ON quotations FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE quotation_items (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quotation_id UUID NOT NULL REFERENCES quotations(id) ON DELETE CASCADE,
  section      TEXT NOT NULL DEFAULT 'material'
               CHECK (section IN ('material','installation','transport','labour','other')),
  description  TEXT NOT NULL,
  hsn_sac_code TEXT,
  unit         TEXT NOT NULL DEFAULT 'nos',
  quantity     NUMERIC(14,3) NOT NULL CHECK (quantity > 0),
  unit_price   NUMERIC(14,2) NOT NULL CHECK (unit_price >= 0),
  line_total   NUMERIC(14,2) GENERATED ALWAYS AS (quantity * unit_price) STORED,
  sort_order   INT NOT NULL DEFAULT 0
);

CREATE INDEX idx_quotation_items_quotation ON quotation_items(quotation_id);

COMMENT ON COLUMN quotation_items.section IS
  'Groups lines on the printed quotation: material, installation, transport, labour.';

-- ─── Contracts ──────────────────────────────────────────────────────────────

CREATE TABLE contracts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_number TEXT UNIQUE NOT NULL,
  company_id      UUID NOT NULL REFERENCES companies(id),
  quotation_id    UUID REFERENCES quotations(id) ON DELETE SET NULL,

  title             TEXT NOT NULL,
  scope_description TEXT,
  contract_value    NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (contract_value >= 0),
  total_capacity_kw NUMERIC(12,3) CHECK (total_capacity_kw >= 0),

  start_date      DATE,
  deadline_date   DATE,
  actual_end_date DATE,

  payment_terms_days  INT NOT NULL DEFAULT 30 CHECK (payment_terms_days >= 0),
  retention_percent   NUMERIC(6,3) NOT NULL DEFAULT 0
                      CHECK (retention_percent BETWEEN 0 AND 100),
  penalty_per_day     NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (penalty_per_day >= 0),
  penalty_cap_percent NUMERIC(6,3)  NOT NULL DEFAULT 10 CHECK (penalty_cap_percent >= 0),

  status TEXT NOT NULL DEFAULT 'draft'
         CHECK (status IN ('draft','active','on_hold','completed','closed','cancelled')),
  notes  TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  deleted_at TIMESTAMPTZ,

  CONSTRAINT contract_dates_sane
    CHECK (deadline_date IS NULL OR start_date IS NULL OR deadline_date >= start_date)
);

CREATE INDEX idx_contracts_company  ON contracts(company_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_contracts_status   ON contracts(status)     WHERE deleted_at IS NULL;
CREATE INDEX idx_contracts_deadline ON contracts(deadline_date)
  WHERE deleted_at IS NULL AND actual_end_date IS NULL;

CREATE TRIGGER contracts_set_updated_at
  BEFORE UPDATE ON contracts FOR EACH ROW EXECUTE FUNCTION set_updated_at();

COMMENT ON TABLE contracts IS
  'An award from a client company. Fans out into many sites.';

CREATE TABLE contract_milestones (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id UUID NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
  sequence_no INT  NOT NULL CHECK (sequence_no >= 1),
  title       TEXT NOT NULL,
  trigger_type TEXT NOT NULL DEFAULT 'manual'
    CHECK (trigger_type IN ('manual','date','site_count','capacity','percent_complete')),
  trigger_value NUMERIC(14,3),
  amount      NUMERIC(14,2) NOT NULL CHECK (amount >= 0),
  due_date    DATE,
  status      TEXT NOT NULL DEFAULT 'pending'
              CHECK (status IN ('pending','achieved','invoiced','paid')),
  achieved_date DATE,
  notes       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at  TIMESTAMPTZ,
  UNIQUE (contract_id, sequence_no)
);

CREATE INDEX idx_milestones_contract ON contract_milestones(contract_id)
  WHERE deleted_at IS NULL;

CREATE TRIGGER contract_milestones_set_updated_at
  BEFORE UPDATE ON contract_milestones FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ─── Projects (optional grouping) ───────────────────────────────────────────
-- The business hierarchy names Project as optional between Contract and Site,
-- e.g. phases or regional batches of a large award. Nullable on sites; no code
-- path requires it.

CREATE TABLE projects (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id  UUID NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  description  TEXT,
  sequence_no  INT NOT NULL DEFAULT 1,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at   TIMESTAMPTZ
);

CREATE INDEX idx_projects_contract ON projects(contract_id) WHERE deleted_at IS NULL;

CREATE TRIGGER projects_set_updated_at
  BEFORE UPDATE ON projects FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ─── Site stages ────────────────────────────────────────────────────────────
-- A lookup table, not a CHECK: the business will refine this pipeline and
-- doing so must not require a migration.

CREATE TABLE site_stages (
  code        TEXT PRIMARY KEY,
  label       TEXT NOT NULL,
  sequence_no INT  NOT NULL UNIQUE,
  is_terminal BOOLEAN NOT NULL DEFAULT false,
  color       TEXT
);

INSERT INTO site_stages (code, label, sequence_no, is_terminal, color) VALUES
  ('planning',           'Planning',           1, false, 'bg-stone-500'),
  ('material_ordered',   'Material Ordered',   2, false, 'bg-amber-500'),
  ('material_delivered', 'Material Delivered', 3, false, 'bg-orange-500'),
  ('installation',       'Installation',       4, false, 'bg-blue-500'),
  ('testing',            'Testing',            5, false, 'bg-indigo-500'),
  ('commissioned',       'Commissioned',       6, false, 'bg-violet-500'),
  ('completed',          'Completed',          7, true,  'bg-emerald-500');

-- ─── Sites ──────────────────────────────────────────────────────────────────

CREATE TABLE sites (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_code   TEXT UNIQUE NOT NULL,
  contract_id UUID NOT NULL REFERENCES contracts(id),
  project_id  UUID REFERENCES projects(id) ON DELETE SET NULL,
  -- Denormalised from contract, maintained by trigger. Lets every cost row
  -- roll up to a company with one indexed join instead of three.
  company_id  UUID NOT NULL REFERENCES companies(id),

  name     TEXT NOT NULL,
  address  TEXT,
  district TEXT,
  state    TEXT,
  pincode  TEXT,
  gps_lat  NUMERIC(10,7) CHECK (gps_lat BETWEEN -90 AND 90),
  gps_lng  NUMERIC(10,7) CHECK (gps_lng BETWEEN -180 AND 180),
  geofence_radius_m INT NOT NULL DEFAULT 500 CHECK (geofence_radius_m > 0),

  capacity_kw   NUMERIC(12,3) CHECK (capacity_kw >= 0),
  panel_count   INT CHECK (panel_count >= 0),
  panel_type    TEXT,
  inverter_type TEXT,

  site_engineer_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  supervisor_id    UUID REFERENCES profiles(id) ON DELETE SET NULL,
  client_contact_id UUID REFERENCES company_contacts(id) ON DELETE SET NULL,

  stage TEXT NOT NULL DEFAULT 'planning' REFERENCES site_stages(code),
  progress_percent INT NOT NULL DEFAULT 0
    CHECK (progress_percent BETWEEN 0 AND 100),

  planned_start_date DATE,
  planned_end_date   DATE,
  actual_start_date  DATE,
  actual_end_date    DATE,

  -- This site's share of the parent contract value. Drives per-site revenue.
  allocated_value  NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (allocated_value >= 0),
  workers_required INT CHECK (workers_required >= 0),

  status TEXT NOT NULL DEFAULT 'active'
         CHECK (status IN ('active','on_hold','completed','cancelled')),
  notes  TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  deleted_at TIMESTAMPTZ,

  CONSTRAINT site_dates_sane
    CHECK (planned_end_date IS NULL OR planned_start_date IS NULL
           OR planned_end_date >= planned_start_date)
);

CREATE INDEX idx_sites_contract ON sites(contract_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_sites_company  ON sites(company_id)  WHERE deleted_at IS NULL;
CREATE INDEX idx_sites_stage    ON sites(stage)       WHERE deleted_at IS NULL;
CREATE INDEX idx_sites_engineer ON sites(site_engineer_id);
CREATE INDEX idx_sites_supervisor ON sites(supervisor_id);
CREATE INDEX idx_sites_overdue  ON sites(planned_end_date)
  WHERE deleted_at IS NULL AND actual_end_date IS NULL;
CREATE INDEX idx_sites_name_trgm ON sites USING gin (name gin_trgm_ops);

CREATE TRIGGER sites_set_updated_at
  BEFORE UPDATE ON sites FOR EACH ROW EXECUTE FUNCTION set_updated_at();

COMMENT ON TABLE sites IS
  'The unit of execution. Every cost, worker, photo and material movement belongs to one.';
COMMENT ON COLUMN sites.company_id IS
  'Denormalised from contract by trigger. Never set this directly.';

-- Keep sites.company_id consistent with its contract.
CREATE OR REPLACE FUNCTION sync_site_company()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  SELECT c.company_id INTO NEW.company_id
  FROM contracts c WHERE c.id = NEW.contract_id;

  IF NEW.company_id IS NULL THEN
    RAISE EXCEPTION 'Contract % does not exist', NEW.contract_id;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER sites_sync_company
  BEFORE INSERT OR UPDATE OF contract_id ON sites
  FOR EACH ROW EXECUTE FUNCTION sync_site_company();

-- ─── Site assignments ───────────────────────────────────────────────────────

CREATE TABLE site_assignments (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id     UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  role_on_site TEXT NOT NULL DEFAULT 'worker'
    CHECK (role_on_site IN
      ('engineer','supervisor','electrician','helper','worker','driver')),
  assigned_date DATE NOT NULL DEFAULT CURRENT_DATE,
  removed_date  DATE,
  is_active     BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by    UUID REFERENCES profiles(id) ON DELETE SET NULL,
  deleted_at    TIMESTAMPTZ
);

-- One active assignment per person per site.
CREATE UNIQUE INDEX site_assignments_unique_active
  ON site_assignments (site_id, employee_id)
  WHERE is_active AND deleted_at IS NULL;

CREATE INDEX idx_site_assignments_site     ON site_assignments(site_id)
  WHERE is_active AND deleted_at IS NULL;
CREATE INDEX idx_site_assignments_employee ON site_assignments(employee_id)
  WHERE is_active AND deleted_at IS NULL;

CREATE TRIGGER site_assignments_set_updated_at
  BEFORE UPDATE ON site_assignments FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ─── Site-scoped access ─────────────────────────────────────────────────────
--
-- The previous schema's supervisor policies checked only that the user held
-- the supervisor role, never that they were assigned to the site in question.
-- Any supervisor could mark attendance for any worker at any site — a direct
-- payroll-fraud vector. This function is the fix, and every site-scoped policy
-- in migration 0005 uses it.

CREATE OR REPLACE FUNCTION auth_can_access_site(p_site_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT
    auth_has_role('owner','manager','accountant')
    OR EXISTS (
      SELECT 1 FROM site_assignments sa
      WHERE sa.site_id = p_site_id
        AND sa.employee_id = auth.uid()
        AND sa.is_active
        AND sa.deleted_at IS NULL
    )
    OR EXISTS (
      SELECT 1 FROM sites s
      WHERE s.id = p_site_id
        AND s.deleted_at IS NULL
        AND (s.site_engineer_id = auth.uid() OR s.supervisor_id = auth.uid())
    );
$$;

COMMENT ON FUNCTION auth_can_access_site IS
  'True when the caller is back-office, assigned to the site, or is its engineer/supervisor.';

-- ─── Lineage stamping ───────────────────────────────────────────────────────
--
-- The keystone for profitability. Every financial row carries site_id,
-- contract_id and company_id, filled in here at write time. Roll-ups become a
-- single indexed aggregation instead of a three-level join across millions of
-- attendance and expense rows.

CREATE OR REPLACE FUNCTION stamp_site_lineage()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.site_id IS NOT NULL THEN
    SELECT s.contract_id, s.company_id
      INTO NEW.contract_id, NEW.company_id
    FROM sites s WHERE s.id = NEW.site_id;
  ELSE
    NEW.contract_id := NULL;
    NEW.company_id  := NULL;
  END IF;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION stamp_site_lineage IS
  'Denormalises contract_id/company_id from site_id. Attach BEFORE INSERT OR UPDATE OF site_id.';

-- ─── Site timeline ──────────────────────────────────────────────────────────
-- Append-only. The business requirement is explicit: never delete events.

CREATE TABLE site_events (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id    UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK (event_type IN
    ('stage_change','check_in','check_out','material_arrived','material_issued',
     'photo_uploaded','work_logged','inspection','issue_raised','issue_resolved',
     'expense_recorded','invoice_raised','payment_received','note','completed')),
  title       TEXT NOT NULL,
  description TEXT,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  actor_id    UUID REFERENCES profiles(id) ON DELETE SET NULL,
  reference_table TEXT,
  reference_id    UUID,
  metadata    JSONB,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_site_events_site ON site_events(site_id, occurred_at DESC);
CREATE INDEX idx_site_events_type ON site_events(event_type);

COMMENT ON TABLE site_events IS
  'Append-only site timeline. No UPDATE or DELETE policy is granted.';

CREATE TABLE site_stage_history (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id    UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  from_stage TEXT REFERENCES site_stages(code),
  to_stage   TEXT NOT NULL REFERENCES site_stages(code),
  changed_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  changed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  notes      TEXT
);

CREATE INDEX idx_stage_history_site ON site_stage_history(site_id, changed_at DESC);

-- Record every stage transition, and mirror it onto the timeline.
CREATE OR REPLACE FUNCTION record_site_stage_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_label TEXT;
BEGIN
  -- Nothing to record when the stage did not actually move.
  IF TG_OP = 'UPDATE' AND NEW.stage IS NOT DISTINCT FROM OLD.stage THEN
    RETURN NEW;
  END IF;

  SELECT label INTO v_label FROM site_stages WHERE code = NEW.stage;

  INSERT INTO site_stage_history (site_id, from_stage, to_stage, changed_by)
  VALUES (NEW.id,
          CASE WHEN TG_OP = 'UPDATE' THEN OLD.stage ELSE NULL END,
          NEW.stage, auth.uid());

  INSERT INTO site_events (site_id, event_type, title, actor_id,
                           reference_table, reference_id)
  VALUES (NEW.id, 'stage_change',
          format('Stage changed to %s', COALESCE(v_label, NEW.stage)),
          auth.uid(), 'sites', NEW.id);

  RETURN NEW;
END;
$$;

CREATE TRIGGER sites_record_stage_change
  AFTER INSERT OR UPDATE OF stage ON sites
  FOR EACH ROW EXECUTE FUNCTION record_site_stage_change();

-- ─── Site photos ────────────────────────────────────────────────────────────

CREATE TABLE site_photos (
  id       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id  UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  phase    TEXT NOT NULL CHECK (phase IN ('before','during','after','issue','inspection')),
  stage    TEXT REFERENCES site_stages(code),
  photo_url     TEXT NOT NULL,
  thumbnail_url TEXT,
  caption  TEXT,
  gps_lat  NUMERIC(10,7),
  gps_lng  NUMERIC(10,7),
  taken_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  uploaded_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at  TIMESTAMPTZ
);

CREATE INDEX idx_site_photos_site ON site_photos(site_id, phase)
  WHERE deleted_at IS NULL;
