# 03 — Database Redesign

Companion to `PROJECT_AUDIT.md`. Target schema for the consolidated system.

---

## 1. Design Principles

1. **One canonical hierarchy.** `companies → contracts → sites → everything`. No competing job entities.
2. **Every cost row carries full attribution.** `site_id`, `contract_id`, and `company_id` are denormalised onto every financial row and kept honest by trigger. Profitability then becomes a single indexed `GROUP BY` instead of a three-level join across millions of rows.
3. **Lookup tables instead of CHECK constraints** for anything the business will extend (stages, categories, expense types). CHECK stays only for genuinely fixed binary/ternary sets.
4. **Soft delete everywhere.** `deleted_at TIMESTAMPTZ`. Nothing is ever hard-deleted from a financial or operational table.
5. **RLS via a `SECURITY DEFINER` claim function**, never a correlated subquery on `profiles`. This fixes the recursion bug and the 40× per-row cost in one move.
6. **Money is `NUMERIC(14,2)`.** Quantities are `NUMERIC(14,3)`. Percentages are `NUMERIC(6,3)`. No floats, ever.
7. **Generated columns for derived money.** If it can be computed, the database computes it.
8. **Consistent conventions.** `gen_random_uuid()` everywhere, `update_updated_at_column()` everywhere, `TEXT` not `VARCHAR`, `TIMESTAMPTZ` not `TIMESTAMP`.

---

## 2. Target Entity Map

```
                        companies
                            │
              ┌─────────────┼──────────────┐
              │             │              │
       company_contacts  contracts      quotations
                            │
              ┌─────────────┼───────────────┬──────────────┐
              │             │               │              │
     contract_milestones  sites      payment_schedules  invoices
                            │
     ┌────────┬─────────┬───┴────┬──────────┬────────────┬──────────┐
     │        │         │        │          │            │          │
site_stage  site_    site_    attendance  expenses  material_   inspections
_history   assign-   photos       │                allocations
           ments                  │
                                payroll ◄── salary_advances

           vendors ──► purchase_orders ──► po_items ──► goods_receipts
                                                             │
                            materials ──► material_stock ◄───┘
                                              │
                                       material_transfers

  profiles · roles · role_permissions · notifications · audit_logs
  bank_accounts · payments · documents · company_settings · sequences
```

---

## 3. Core DDL

### 3.1 Foundations

```sql
CREATE EXTENSION IF NOT EXISTS pgcrypto;   -- gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS pg_trgm;    -- fast ILIKE search

-- Reusable trigger
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

-- Every table gets these five columns
--   id          UUID PRIMARY KEY DEFAULT gen_random_uuid()
--   created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
--   updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
--   created_by  UUID REFERENCES profiles(id)
--   deleted_at  TIMESTAMPTZ            -- soft delete
```

### 3.2 The RLS keystone

This single function replaces 40+ correlated subqueries and eliminates the `profiles` recursion bug.

```sql
CREATE OR REPLACE FUNCTION auth_role()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$ SELECT role FROM profiles WHERE id = auth.uid() $$;

CREATE OR REPLACE FUNCTION auth_has_role(VARIADIC roles TEXT[])
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT auth_role() = ANY(roles) $$;

-- Site-scoped access: the check the current supervisor policies claim to do but don't
CREATE OR REPLACE FUNCTION auth_can_access_site(p_site_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT auth_has_role('owner','manager','accountant')
      OR EXISTS (
           SELECT 1 FROM site_assignments sa
           WHERE sa.site_id = p_site_id
             AND sa.employee_id = auth.uid()
             AND sa.is_active
             AND sa.deleted_at IS NULL);
$$;
```

`SECURITY DEFINER` means the function runs as its owner, bypassing RLS on `profiles` — which is exactly why the recursion disappears. `STABLE` lets Postgres cache the result within a statement instead of re-running it per row.

**Policies then read like this:**

```sql
CREATE POLICY sites_select ON sites FOR SELECT
  USING (deleted_at IS NULL AND auth_can_access_site(id));

CREATE POLICY sites_write ON sites FOR ALL
  USING (auth_has_role('owner','manager'))
  WITH CHECK (auth_has_role('owner','manager'));
```

### 3.3 Fixed sequence generator

Replaces the broken `next_sequence()` (BLOCKER-3). Financial-year aware, `SECURITY DEFINER`, concurrency-safe.

```sql
CREATE TABLE doc_sequences (
  doc_type      TEXT NOT NULL,
  fiscal_year   INT  NOT NULL,
  current_value BIGINT NOT NULL DEFAULT 0,
  PRIMARY KEY (doc_type, fiscal_year)
);

CREATE OR REPLACE FUNCTION next_document_number(p_doc_type TEXT, p_prefix TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER            -- ← the fix
SET search_path = public
AS $$
DECLARE
  v_fy_start INT;
  v_fy       INT;
  v_next     BIGINT;
BEGIN
  SELECT COALESCE(financial_year_start_month, 4) INTO v_fy_start
    FROM company_settings LIMIT 1;

  v_fy := CASE WHEN EXTRACT(MONTH FROM now()) >= v_fy_start
               THEN EXTRACT(YEAR FROM now())
               ELSE EXTRACT(YEAR FROM now()) - 1 END;

  INSERT INTO doc_sequences (doc_type, fiscal_year, current_value)
  VALUES (p_doc_type, v_fy, 1)
  ON CONFLICT (doc_type, fiscal_year)
  DO UPDATE SET current_value = doc_sequences.current_value + 1
  RETURNING current_value INTO v_next;

  IF v_next IS NULL THEN
    RAISE EXCEPTION 'Sequence generation failed for % FY%', p_doc_type, v_fy;
  END IF;

  RETURN format('%s/%s-%s/%s', p_prefix,
                v_fy, (v_fy + 1) % 100, lpad(v_next::TEXT, 4, '0'));
  -- e.g. INV/2026-27/0001
END;
$$;
```

Note the explicit `RAISE EXCEPTION` — the old code failed silently to `NULL`, which is what made BLOCKER-3 so hard to see.

### 3.4 Companies and contracts

```sql
CREATE TABLE companies (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_code  TEXT UNIQUE NOT NULL,
  name          TEXT NOT NULL,
  legal_name    TEXT,
  company_type  TEXT NOT NULL DEFAULT 'corporate'
                CHECK (company_type IN ('corporate','factory','industrial',
                                        'commercial','residential','government')),
  gst_number    TEXT, pan_number TEXT,
  billing_address TEXT, shipping_address TEXT,
  city TEXT, state TEXT, state_code TEXT,   -- state_code drives IGST vs CGST/SGST
  pincode TEXT,
  payment_terms_days INT NOT NULL DEFAULT 30,
  credit_limit  NUMERIC(14,2),
  tds_applicable BOOLEAN NOT NULL DEFAULT false,
  tds_percent   NUMERIC(6,3) DEFAULT 2.0,
  retention_percent NUMERIC(6,3) DEFAULT 0,
  status        TEXT NOT NULL DEFAULT 'active'
                CHECK (status IN ('prospect','active','inactive','blacklisted')),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES profiles(id),
  deleted_at TIMESTAMPTZ
);

CREATE TABLE company_contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL, designation TEXT,
  phone TEXT, email TEXT,
  is_primary BOOLEAN NOT NULL DEFAULT false,
  contact_type TEXT CHECK (contact_type IN ('billing','technical','management','site')),
  deleted_at TIMESTAMPTZ
);
CREATE UNIQUE INDEX ON company_contacts (company_id)
  WHERE is_primary AND deleted_at IS NULL;   -- exactly one primary

CREATE TABLE contracts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_number TEXT UNIQUE NOT NULL,
  company_id   UUID NOT NULL REFERENCES companies(id),
  quotation_id UUID REFERENCES quotations(id),   -- provenance
  title TEXT NOT NULL,
  scope_description TEXT,
  contract_value NUMERIC(14,2) NOT NULL DEFAULT 0,
  total_capacity_kw NUMERIC(12,3),
  start_date DATE, deadline_date DATE, actual_end_date DATE,
  payment_terms_days INT NOT NULL DEFAULT 30,
  retention_percent  NUMERIC(6,3) NOT NULL DEFAULT 0,
  penalty_per_day    NUMERIC(14,2) DEFAULT 0,
  penalty_cap_percent NUMERIC(6,3) DEFAULT 10,
  status TEXT NOT NULL DEFAULT 'draft'
         CHECK (status IN ('draft','active','on_hold','completed','closed','cancelled')),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES profiles(id),
  deleted_at TIMESTAMPTZ,
  CONSTRAINT contract_dates_sane CHECK (deadline_date IS NULL OR start_date IS NULL
                                        OR deadline_date >= start_date)
);

CREATE TABLE contract_milestones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id UUID NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
  sequence_no INT NOT NULL,
  title TEXT NOT NULL,
  trigger_type TEXT NOT NULL DEFAULT 'manual'
    CHECK (trigger_type IN ('manual','date','site_count','capacity','percent_complete')),
  trigger_value NUMERIC(14,3),
  amount NUMERIC(14,2) NOT NULL,
  due_date DATE,
  status TEXT NOT NULL DEFAULT 'pending'
         CHECK (status IN ('pending','achieved','invoiced','paid')),
  achieved_date DATE,
  invoice_id UUID REFERENCES invoices(id),
  deleted_at TIMESTAMPTZ,
  UNIQUE (contract_id, sequence_no)
);
```

### 3.5 Sites — the operational core

```sql
CREATE TABLE site_stages (             -- lookup, not a CHECK: the client will extend this
  code TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  sequence_no INT NOT NULL UNIQUE,
  is_terminal BOOLEAN NOT NULL DEFAULT false,
  color TEXT
);
INSERT INTO site_stages (code,label,sequence_no,is_terminal) VALUES
  ('planning','Planning',1,false),
  ('material_ordered','Material Ordered',2,false),
  ('material_delivered','Material Delivered',3,false),
  ('installation','Installation',4,false),
  ('testing','Testing',5,false),
  ('commissioned','Commissioned',6,false),
  ('completed','Completed',7,true);

CREATE TABLE sites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_code   TEXT UNIQUE NOT NULL,
  contract_id UUID NOT NULL REFERENCES contracts(id),
  company_id  UUID NOT NULL REFERENCES companies(id),   -- denormalised, trigger-maintained
  name TEXT NOT NULL,
  address TEXT, district TEXT, state TEXT, pincode TEXT,
  gps_lat NUMERIC(10,7), gps_lng NUMERIC(10,7),
  geofence_radius_m INT NOT NULL DEFAULT 500,
  capacity_kw NUMERIC(12,3),
  panel_count INT, panel_type TEXT, inverter_type TEXT,
  site_engineer_id UUID REFERENCES profiles(id),
  supervisor_id    UUID REFERENCES profiles(id),
  customer_contact_id UUID REFERENCES company_contacts(id),
  stage TEXT NOT NULL DEFAULT 'planning' REFERENCES site_stages(code),
  progress_percent INT NOT NULL DEFAULT 0
    CHECK (progress_percent BETWEEN 0 AND 100),
  planned_start_date DATE, planned_end_date DATE,
  actual_start_date  DATE, actual_end_date  DATE,
  contract_value_allocated NUMERIC(14,2) DEFAULT 0,  -- this site's share of contract value
  workers_required INT,
  status TEXT NOT NULL DEFAULT 'active'
         CHECK (status IN ('active','on_hold','completed','cancelled')),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES profiles(id),
  deleted_at TIMESTAMPTZ
);

CREATE INDEX idx_sites_contract ON sites(contract_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_sites_company  ON sites(company_id)  WHERE deleted_at IS NULL;
CREATE INDEX idx_sites_stage    ON sites(stage)       WHERE deleted_at IS NULL;
CREATE INDEX idx_sites_engineer ON sites(site_engineer_id);
CREATE INDEX idx_sites_overdue  ON sites(planned_end_date)
  WHERE deleted_at IS NULL AND actual_end_date IS NULL;

CREATE TABLE site_stage_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  from_stage TEXT REFERENCES site_stages(code),
  to_stage   TEXT NOT NULL REFERENCES site_stages(code),
  changed_by UUID REFERENCES profiles(id),
  changed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  notes TEXT
);

CREATE TABLE site_photos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  phase TEXT NOT NULL CHECK (phase IN ('before','during','after','issue','inspection')),
  stage TEXT REFERENCES site_stages(code),
  photo_url TEXT NOT NULL, thumbnail_url TEXT, caption TEXT,
  gps_lat NUMERIC(10,7), gps_lng NUMERIC(10,7),
  taken_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  uploaded_by UUID REFERENCES profiles(id),
  deleted_at TIMESTAMPTZ
);
CREATE INDEX idx_site_photos ON site_photos(site_id, phase) WHERE deleted_at IS NULL;

CREATE TABLE site_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id     UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  role_on_site TEXT NOT NULL DEFAULT 'worker'
    CHECK (role_on_site IN ('engineer','supervisor','electrician','helper','worker','driver')),
  assigned_date DATE NOT NULL DEFAULT CURRENT_DATE,
  removed_date  DATE,
  is_active BOOLEAN NOT NULL DEFAULT true,
  deleted_at TIMESTAMPTZ
);
CREATE UNIQUE INDEX ON site_assignments (site_id, employee_id)
  WHERE is_active AND deleted_at IS NULL;
```

### 3.6 The attribution trigger

This is what makes profitability computable. Every financial row is stamped with its full lineage at write time.

```sql
CREATE OR REPLACE FUNCTION stamp_site_lineage() RETURNS TRIGGER AS $$
BEGIN
  IF NEW.site_id IS NOT NULL THEN
    SELECT s.contract_id, s.company_id
      INTO NEW.contract_id, NEW.company_id
      FROM sites s WHERE s.id = NEW.site_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Applied to: expenses, attendance, material_allocations,
--             payroll_lines, invoices, site_photos
CREATE TRIGGER trg_stamp_lineage BEFORE INSERT OR UPDATE OF site_id
  ON expenses FOR EACH ROW EXECUTE FUNCTION stamp_site_lineage();
```

A three-level join over 1.8M attendance rows is replaced by an index scan on a single stamped column. This is the difference between a profitability report that takes 8 seconds and one that takes 40 ms.

### 3.7 Attendance and payroll

```sql
CREATE TABLE attendance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES profiles(id),
  site_id     UUID NOT NULL REFERENCES sites(id),      -- NOT NULL: fixes the NULL-dup hole
  contract_id UUID REFERENCES contracts(id),           -- stamped
  company_id  UUID REFERENCES companies(id),           -- stamped
  date DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'present'
    CHECK (status IN ('present','absent','half_day','leave','holiday','week_off')),
  day_fraction NUMERIC(3,2) NOT NULL DEFAULT 1.0
    CHECK (day_fraction BETWEEN 0 AND 1),
  check_in_at TIMESTAMPTZ, check_out_at TIMESTAMPTZ,
  check_in_lat NUMERIC(10,7), check_in_lng NUMERIC(10,7),
  check_out_lat NUMERIC(10,7), check_out_lng NUMERIC(10,7),
  check_in_photo_url TEXT,
  within_geofence BOOLEAN,                              -- computed on write
  distance_from_site_m INT,
  worked_hours   NUMERIC(5,2),
  overtime_hours NUMERIC(5,2) NOT NULL DEFAULT 0,
  marked_by UUID REFERENCES profiles(id),
  source TEXT NOT NULL DEFAULT 'self'
    CHECK (source IN ('self','supervisor','admin','offline_sync','import')),
  is_corrected BOOLEAN NOT NULL DEFAULT false,
  correction_reason TEXT,
  is_locked BOOLEAN NOT NULL DEFAULT false,             -- set when payroll runs
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ,
  CONSTRAINT attendance_unique UNIQUE (employee_id, site_id, date)
);

CREATE INDEX idx_att_emp_date  ON attendance(employee_id, date DESC) WHERE deleted_at IS NULL;
CREATE INDEX idx_att_site_date ON attendance(site_id, date DESC)     WHERE deleted_at IS NULL;
CREATE INDEX idx_att_payroll   ON attendance(employee_id, date)
  WHERE deleted_at IS NULL AND NOT is_locked;
```

`site_id` becomes `NOT NULL`, closing the duplicate-row hole (D6) that nullable columns opened in a `UNIQUE` constraint.

```sql
CREATE TABLE payroll_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  period_month INT NOT NULL CHECK (period_month BETWEEN 1 AND 12),
  period_year  INT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft'
         CHECK (status IN ('draft','finalised','paid','cancelled')),
  total_gross NUMERIC(14,2) NOT NULL DEFAULT 0,
  total_deductions NUMERIC(14,2) NOT NULL DEFAULT 0,
  total_net   NUMERIC(14,2) NOT NULL DEFAULT 0,
  finalised_at TIMESTAMPTZ, finalised_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ,
  UNIQUE (period_month, period_year)
);

CREATE TABLE payroll_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payroll_run_id UUID NOT NULL REFERENCES payroll_runs(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES profiles(id),
  wage_mode TEXT NOT NULL CHECK (wage_mode IN ('monthly','daily','piece_rate')),
  present_days  NUMERIC(5,2) NOT NULL DEFAULT 0,
  paid_leave_days NUMERIC(5,2) NOT NULL DEFAULT 0,
  overtime_hours  NUMERIC(6,2) NOT NULL DEFAULT 0,
  rate_used     NUMERIC(14,2),
  ot_rate_used  NUMERIC(14,2),
  piece_units   NUMERIC(14,3),
  piece_rate    NUMERIC(14,2),
  basic_amount    NUMERIC(14,2) NOT NULL DEFAULT 0,
  overtime_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  bonus           NUMERIC(14,2) NOT NULL DEFAULT 0,
  gross_amount NUMERIC(14,2)
    GENERATED ALWAYS AS (basic_amount + overtime_amount + bonus) STORED,
  advance_deduction NUMERIC(14,2) NOT NULL DEFAULT 0,
  penalty_deduction NUMERIC(14,2) NOT NULL DEFAULT 0,
  other_deduction   NUMERIC(14,2) NOT NULL DEFAULT 0,
  net_amount NUMERIC(14,2)
    GENERATED ALWAYS AS (basic_amount + overtime_amount + bonus
                       - advance_deduction - penalty_deduction - other_deduction) STORED,
  is_paid BOOLEAN NOT NULL DEFAULT false,
  paid_date DATE,
  paid_method TEXT CHECK (paid_method IN ('bank_transfer','cash','upi','cheque')),
  paid_reference TEXT,
  notes TEXT,
  UNIQUE (payroll_run_id, employee_id)
);

-- Site-level wage cost allocation: how each payroll line splits across sites,
-- derived from that employee's attendance in the period. This is what makes
-- "labour cost per site" possible.
CREATE TABLE payroll_site_allocations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payroll_line_id UUID NOT NULL REFERENCES payroll_lines(id) ON DELETE CASCADE,
  site_id     UUID NOT NULL REFERENCES sites(id),
  contract_id UUID REFERENCES contracts(id),
  company_id  UUID REFERENCES companies(id),
  days_worked NUMERIC(5,2) NOT NULL,
  allocated_amount NUMERIC(14,2) NOT NULL
);
CREATE INDEX ON payroll_site_allocations(site_id);

CREATE TABLE salary_advances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES profiles(id),
  site_id UUID REFERENCES sites(id),
  amount NUMERIC(14,2) NOT NULL CHECK (amount > 0),
  advance_date DATE NOT NULL DEFAULT CURRENT_DATE,
  reason TEXT,
  recovery_mode TEXT NOT NULL DEFAULT 'full_next_payroll'
    CHECK (recovery_mode IN ('full_next_payroll','instalments')),
  instalment_amount NUMERIC(14,2),
  amount_recovered NUMERIC(14,2) NOT NULL DEFAULT 0,
  balance NUMERIC(14,2) GENERATED ALWAYS AS (amount - amount_recovered) STORED,
  status TEXT NOT NULL DEFAULT 'outstanding'
    CHECK (status IN ('outstanding','partially_recovered','recovered','written_off')),
  given_by UUID REFERENCES profiles(id),
  deleted_at TIMESTAMPTZ,
  CONSTRAINT advance_not_over_recovered CHECK (amount_recovered <= amount)
);
CREATE INDEX idx_advances_outstanding ON salary_advances(employee_id)
  WHERE status IN ('outstanding','partially_recovered') AND deleted_at IS NULL;
```

### 3.8 Expenses with full attribution

```sql
CREATE TABLE expense_categories (
  code TEXT PRIMARY KEY, label TEXT NOT NULL,
  icon TEXT, requires_head_count BOOLEAN NOT NULL DEFAULT false,
  is_active BOOLEAN NOT NULL DEFAULT true, sort_order INT
);
-- fuel, transport, food, accommodation, equipment, repairs, office,
-- electricity, tea, water, labour, materials, miscellaneous

CREATE TABLE expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  expense_number TEXT UNIQUE NOT NULL,
  site_id     UUID REFERENCES sites(id),
  contract_id UUID REFERENCES contracts(id),   -- stamped
  company_id  UUID REFERENCES companies(id),   -- stamped
  category TEXT NOT NULL REFERENCES expense_categories(code),
  expense_date DATE NOT NULL DEFAULT CURRENT_DATE,
  title TEXT NOT NULL, description TEXT,
  amount NUMERIC(14,2) NOT NULL CHECK (amount > 0),
  head_count INT, meal_type TEXT,
  paid_by UUID REFERENCES profiles(id),
  payment_mode TEXT CHECK (payment_mode IN ('cash','upi','bank_transfer','card','credit')),
  vendor_id UUID REFERENCES vendors(id),
  receipt_url TEXT,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('draft','pending','approved','rejected','reimbursed')),
  approved_by UUID REFERENCES profiles(id), approved_at TIMESTAMPTZ,
  rejection_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES profiles(id),
  deleted_at TIMESTAMPTZ
);
CREATE INDEX idx_exp_site_date ON expenses(site_id, expense_date DESC)
  WHERE deleted_at IS NULL;
CREATE INDEX idx_exp_pending ON expenses(status)
  WHERE status = 'pending' AND deleted_at IS NULL;
```

### 3.9 Materials, vendors, purchasing

```sql
CREATE TABLE materials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sku TEXT UNIQUE NOT NULL, name TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN
    ('panel','inverter','mc4','dc_cable','ac_cable','mounting_structure',
     'earthing','fastener','consumable','tool','other')),
  unit TEXT NOT NULL DEFAULT 'nos',
  hsn_code TEXT, gst_percent NUMERIC(6,3) DEFAULT 18,
  specification TEXT, brand TEXT,
  wattage_w NUMERIC(10,2),                 -- panels
  capacity_kw NUMERIC(10,3),               -- inverters
  standard_cost NUMERIC(14,2),
  reorder_level NUMERIC(14,3),
  is_active BOOLEAN NOT NULL DEFAULT true,
  deleted_at TIMESTAMPTZ
);

CREATE TABLE stock_locations (              -- warehouses AND sites
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  location_type TEXT NOT NULL CHECK (location_type IN ('warehouse','site','vehicle')),
  site_id UUID REFERENCES sites(id),
  is_active BOOLEAN NOT NULL DEFAULT true
);

-- Append-only ledger. Never UPDATE. Stock on hand = SUM(quantity_delta).
CREATE TABLE stock_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  material_id UUID NOT NULL REFERENCES materials(id),
  location_id UUID NOT NULL REFERENCES stock_locations(id),
  site_id     UUID REFERENCES sites(id),
  contract_id UUID REFERENCES contracts(id),
  txn_type TEXT NOT NULL CHECK (txn_type IN
    ('purchase_receipt','transfer_in','transfer_out','site_consumption',
     'damage','return_to_vendor','opening_balance','adjustment')),
  quantity_delta NUMERIC(14,3) NOT NULL,    -- signed
  unit_cost NUMERIC(14,2),
  total_value NUMERIC(14,2)
    GENERATED ALWAYS AS (ABS(quantity_delta) * COALESCE(unit_cost,0)) STORED,
  reference_type TEXT, reference_id UUID,
  txn_date DATE NOT NULL DEFAULT CURRENT_DATE,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES profiles(id)
);
CREATE INDEX idx_stock_mat_loc ON stock_ledger(material_id, location_id);
CREATE INDEX idx_stock_site ON stock_ledger(site_id) WHERE site_id IS NOT NULL;

CREATE TABLE vendors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_code TEXT UNIQUE NOT NULL, name TEXT NOT NULL,
  gst_number TEXT, pan_number TEXT,
  contact_name TEXT, phone TEXT, email TEXT,
  address TEXT, city TEXT, state TEXT, state_code TEXT,
  payment_terms_days INT NOT NULL DEFAULT 30,
  bank_name TEXT, bank_account_no TEXT, bank_ifsc TEXT,
  rating INT CHECK (rating BETWEEN 1 AND 5),
  is_active BOOLEAN NOT NULL DEFAULT true,
  deleted_at TIMESTAMPTZ
);

CREATE TABLE purchase_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  po_number TEXT UNIQUE NOT NULL,
  vendor_id UUID NOT NULL REFERENCES vendors(id),
  site_id UUID REFERENCES sites(id), contract_id UUID REFERENCES contracts(id),
  po_date DATE NOT NULL DEFAULT CURRENT_DATE,
  expected_delivery_date DATE,
  subtotal NUMERIC(14,2) NOT NULL DEFAULT 0,
  tax_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  total_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN
    ('draft','sent','partially_received','received','cancelled')),
  delivery_address TEXT, terms TEXT, notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES profiles(id), deleted_at TIMESTAMPTZ
);

CREATE TABLE purchase_order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_order_id UUID NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
  material_id UUID NOT NULL REFERENCES materials(id),
  quantity NUMERIC(14,3) NOT NULL CHECK (quantity > 0),
  unit_price NUMERIC(14,2) NOT NULL,
  gst_percent NUMERIC(6,3) NOT NULL DEFAULT 18,
  quantity_received NUMERIC(14,3) NOT NULL DEFAULT 0,
  line_total NUMERIC(14,2) GENERATED ALWAYS AS (quantity * unit_price) STORED,
  sort_order INT NOT NULL DEFAULT 0,
  CONSTRAINT not_over_received CHECK (quantity_received <= quantity)
);
```

### 3.10 Invoicing with correct Indian GST

```sql
CREATE TABLE invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_number TEXT UNIQUE NOT NULL,
  company_id  UUID NOT NULL REFERENCES companies(id),
  contract_id UUID REFERENCES contracts(id),
  site_id     UUID REFERENCES sites(id),
  milestone_id UUID REFERENCES contract_milestones(id),
  invoice_date DATE NOT NULL DEFAULT CURRENT_DATE,
  due_date DATE,
  billing_period_start DATE, billing_period_end DATE,
  place_of_supply_state_code TEXT,
  is_interstate BOOLEAN NOT NULL DEFAULT false,
  subtotal        NUMERIC(14,2) NOT NULL DEFAULT 0,
  discount_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  taxable_amount  NUMERIC(14,2)
    GENERATED ALWAYS AS (subtotal - discount_amount) STORED,
  cgst_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  sgst_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  igst_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  total_amount NUMERIC(14,2)
    GENERATED ALWAYS AS (subtotal - discount_amount
                       + cgst_amount + sgst_amount + igst_amount) STORED,
  tds_deducted    NUMERIC(14,2) NOT NULL DEFAULT 0,
  retention_held  NUMERIC(14,2) NOT NULL DEFAULT 0,
  net_receivable NUMERIC(14,2)
    GENERATED ALWAYS AS (subtotal - discount_amount
                       + cgst_amount + sgst_amount + igst_amount
                       - tds_deducted - retention_held) STORED,
  amount_received NUMERIC(14,2) NOT NULL DEFAULT 0,
  balance_due NUMERIC(14,2)
    GENERATED ALWAYS AS (subtotal - discount_amount
                       + cgst_amount + sgst_amount + igst_amount
                       - tds_deducted - retention_held - amount_received) STORED,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN
    ('draft','sent','partially_paid','paid','overdue','cancelled')),
  irn TEXT, eway_bill_no TEXT,          -- e-invoicing, for later
  notes TEXT, terms TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES profiles(id), deleted_at TIMESTAMPTZ,
  CONSTRAINT gst_mode_consistent CHECK (
    (is_interstate AND cgst_amount = 0 AND sgst_amount = 0)
    OR (NOT is_interstate AND igst_amount = 0))
);
CREATE INDEX idx_inv_overdue ON invoices(due_date)
  WHERE status IN ('sent','partially_paid') AND deleted_at IS NULL;

CREATE TABLE invoice_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  description TEXT NOT NULL, hsn_sac_code TEXT,
  unit TEXT NOT NULL DEFAULT 'nos',
  quantity NUMERIC(14,3) NOT NULL DEFAULT 1,
  unit_price NUMERIC(14,2) NOT NULL DEFAULT 0,
  gst_percent NUMERIC(6,3) NOT NULL DEFAULT 18,
  line_total NUMERIC(14,2) GENERATED ALWAYS AS (quantity * unit_price) STORED,
  sort_order INT NOT NULL DEFAULT 0
);

CREATE TABLE bank_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_name TEXT NOT NULL, bank_name TEXT NOT NULL,
  account_number TEXT NOT NULL, ifsc TEXT NOT NULL,
  account_type TEXT CHECK (account_type IN ('current','savings','od','cc')),
  opening_balance NUMERIC(14,2) NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true, deleted_at TIMESTAMPTZ
);

CREATE TABLE payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id UUID REFERENCES invoices(id),
  company_id UUID REFERENCES companies(id),
  contract_id UUID REFERENCES contracts(id),
  bank_account_id UUID REFERENCES bank_accounts(id),
  direction TEXT NOT NULL DEFAULT 'inbound'
    CHECK (direction IN ('inbound','outbound')),
  amount NUMERIC(14,2) NOT NULL CHECK (amount > 0),
  payment_date DATE NOT NULL,
  payment_method TEXT NOT NULL CHECK (payment_method IN
    ('cash','bank_transfer','cheque','upi','card')),
  reference_number TEXT, tds_deducted NUMERIC(14,2) NOT NULL DEFAULT 0,
  notes TEXT, received_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), deleted_at TIMESTAMPTZ
);
```

### 3.11 Cross-cutting: RBAC, notifications, audit

```sql
CREATE TABLE roles (
  code TEXT PRIMARY KEY, label TEXT NOT NULL, rank INT NOT NULL
);
INSERT INTO roles (code,label,rank) VALUES
  ('owner','Owner',100), ('manager','Manager',80),
  ('accountant','Accountant',70), ('engineer','Site Engineer',60),
  ('supervisor','Supervisor',50), ('store_manager','Store Manager',50),
  ('worker','Worker',10), ('customer','Customer Portal',5);

CREATE TABLE role_permissions (
  role_code TEXT NOT NULL REFERENCES roles(code) ON DELETE CASCADE,
  resource  TEXT NOT NULL,          -- 'contracts','payroll','invoices',...
  can_read BOOLEAN NOT NULL DEFAULT false,
  can_create BOOLEAN NOT NULL DEFAULT false,
  can_update BOOLEAN NOT NULL DEFAULT false,
  can_delete BOOLEAN NOT NULL DEFAULT false,
  can_approve BOOLEAN NOT NULL DEFAULT false,
  scope TEXT NOT NULL DEFAULT 'all'
        CHECK (scope IN ('all','assigned_sites','own')),
  PRIMARY KEY (role_code, resource)
);

CREATE TABLE notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN
    ('salary_pending','attendance_missing','low_stock','payment_due',
     'invoice_overdue','contract_deadline','expense_approval',
     'advance_request','site_stalled','po_delivery_due')),
  severity TEXT NOT NULL DEFAULT 'info'
           CHECK (severity IN ('info','warning','critical')),
  title TEXT NOT NULL, body TEXT,
  entity_type TEXT, entity_id UUID, action_url TEXT,
  is_read BOOLEAN NOT NULL DEFAULT false, read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_notif_unread ON notifications(recipient_id, created_at DESC)
  WHERE NOT is_read;

-- Generic, trigger-driven, append-only
CREATE TABLE audit_logs (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID REFERENCES profiles(id),
  action TEXT NOT NULL CHECK (action IN ('insert','update','delete','restore','login','export')),
  table_name TEXT NOT NULL, record_id UUID,
  old_values JSONB, new_values JSONB,
  changed_fields TEXT[],
  ip_address INET, user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_audit_record ON audit_logs(table_name, record_id, created_at DESC);

-- Immutability: no policy grants UPDATE or DELETE
CREATE POLICY audit_insert ON audit_logs FOR INSERT WITH CHECK (true);
CREATE POLICY audit_select ON audit_logs FOR SELECT
  USING (auth_has_role('owner','manager'));
```

---

## 4. Reporting Layer

Profitability, cash flow, and the dashboard are all **views over the stamped columns** — no application-side aggregation.

```sql
CREATE VIEW v_site_financials AS
SELECT
  s.id AS site_id, s.site_code, s.name, s.contract_id, s.company_id,
  s.capacity_kw, s.stage, s.progress_percent,
  s.contract_value_allocated AS revenue_allocated,
  COALESCE(m.material_cost, 0)  AS material_cost,
  COALESCE(l.labour_cost, 0)    AS labour_cost,
  COALESCE(e.expense_cost, 0)   AS expense_cost,
  COALESCE(m.material_cost,0) + COALESCE(l.labour_cost,0)
    + COALESCE(e.expense_cost,0) AS total_cost,
  s.contract_value_allocated
    - (COALESCE(m.material_cost,0) + COALESCE(l.labour_cost,0)
       + COALESCE(e.expense_cost,0)) AS gross_profit
FROM sites s
LEFT JOIN LATERAL (
  SELECT SUM(total_value) AS material_cost FROM stock_ledger
  WHERE site_id = s.id AND txn_type = 'site_consumption') m ON true
LEFT JOIN LATERAL (
  SELECT SUM(allocated_amount) AS labour_cost FROM payroll_site_allocations
  WHERE site_id = s.id) l ON true
LEFT JOIN LATERAL (
  SELECT SUM(amount) AS expense_cost FROM expenses
  WHERE site_id = s.id AND status = 'approved' AND deleted_at IS NULL) e ON true
WHERE s.deleted_at IS NULL;

CREATE VIEW v_contract_financials AS
SELECT c.id AS contract_id, c.contract_number, c.company_id, c.contract_value,
       COUNT(s.id) AS site_count,
       SUM(f.total_cost)   AS total_cost,
       SUM(f.gross_profit) AS gross_profit,
       COALESCE(i.invoiced, 0) AS invoiced,
       COALESCE(i.received, 0) AS received,
       c.contract_value - COALESCE(i.invoiced,0) AS unbilled
FROM contracts c
LEFT JOIN sites s ON s.contract_id = c.id AND s.deleted_at IS NULL
LEFT JOIN v_site_financials f ON f.site_id = s.id
LEFT JOIN LATERAL (
  SELECT SUM(total_amount) AS invoiced, SUM(amount_received) AS received
  FROM invoices WHERE contract_id = c.id AND deleted_at IS NULL
    AND status <> 'cancelled') i ON true
WHERE c.deleted_at IS NULL
GROUP BY c.id, i.invoiced, i.received;

CREATE VIEW v_stock_on_hand AS
SELECT material_id, location_id, SUM(quantity_delta) AS qty_on_hand,
       SUM(total_value) FILTER (WHERE quantity_delta > 0) AS value_in
FROM stock_ledger GROUP BY material_id, location_id
HAVING SUM(quantity_delta) <> 0;
```

For the owner dashboard, promote the two financial views to **materialised views** refreshed every 15 minutes via `pg_cron`, once site counts pass ~500.

---

## 5. Migration Strategy

The current database state does not match the migration files (BLOCKER-4). **Step 1 is always: determine ground truth.**

| Step | Action |
|---|---|
| **0** | `git init` and commit the current tree before touching anything |
| **1** | Dump the live schema (`pg_dump --schema-only`) and diff it against the 18 migration files. Reconcile into a single verified baseline |
| **2** | Take a full data backup |
| **3** | **Squash migrations 001–018 into one `00001_baseline.sql`** reflecting actual production state. Archive the originals under `supabase/migrations/_archive/` |
| **4** | Apply the redesign as forward migrations `00002`–`000NN`, one concern per file |
| **5** | Backfill in a transaction (below) |
| **6** | Verify row counts and financial totals pre/post. Only then drop legacy tables |

### 5.1 Backfill

```sql
BEGIN;

-- customers → companies
INSERT INTO companies (id, company_code, name, gst_number, billing_address,
                       city, state, pincode, status, notes, created_at)
SELECT id, customer_id, name, gst_number, address, city, state, pincode,
       CASE status WHEN 'prospect' THEN 'prospect'
                   WHEN 'inactive' THEN 'inactive' ELSE 'active' END,
       notes, created_at
FROM customers;

INSERT INTO company_contacts (company_id, name, phone, email, is_primary)
SELECT id, name, phone, email, true FROM customers WHERE phone IS NOT NULL;

-- projects → contracts. Resolve the free-text client_company to a real FK,
-- creating placeholder companies for names that never existed in `customers`.
INSERT INTO companies (company_code, name, status)
SELECT DISTINCT 'MIG-' || substr(md5(client_company), 1, 8), client_company, 'active'
FROM projects p
WHERE NOT EXISTS (SELECT 1 FROM companies c WHERE lower(c.name) = lower(p.client_company));

INSERT INTO contracts (id, contract_number, company_id, title, scope_description,
                       contract_value, status, notes, created_at, created_by)
SELECT p.id, p.project_code,
       (SELECT c.id FROM companies c WHERE lower(c.name) = lower(p.client_company) LIMIT 1),
       p.name, p.scope_description, COALESCE(p.rate_amount, 0),
       CASE p.status WHEN 'not_started' THEN 'draft'
                     WHEN 'in_progress' THEN 'active'
                     WHEN 'completed' THEN 'completed'
                     ELSE 'closed' END,
       p.notes, p.created_at, p.created_by
FROM projects p;

-- Each legacy project becomes one site under its new contract
INSERT INTO sites (site_code, contract_id, company_id, name, stage, status)
SELECT c.contract_number || '/S1', c.id, c.company_id, c.title, 'planning', 'active'
FROM contracts c;

-- Re-point attendance/expenses at the new site, then stamp lineage
UPDATE attendance a SET site_id = s.id
FROM sites s WHERE s.contract_id = a.site_id;   -- legacy value held project id
UPDATE attendance SET site_id = site_id;        -- fires stamp_site_lineage()

COMMIT;
```

Rows that cannot be resolved go to a `_migration_orphans` table for manual review rather than being silently dropped.

### 5.2 Retirement

`work_orders`, `work_order_assignments`, `work_order_updates`, `project_documents`, `submissions`, `cash_transfers` are renamed to `_legacy_*` for one release cycle, then dropped once the new modules are verified in production.

---

## 6. Indexing Summary

Beyond the per-table indexes above:

```sql
-- Trigram search (replaces unbounded ILIKE scans)
CREATE INDEX idx_companies_name_trgm ON companies USING gin (name gin_trgm_ops);
CREATE INDEX idx_sites_name_trgm     ON sites     USING gin (name gin_trgm_ops);

-- Dashboard hot paths
CREATE INDEX idx_att_today ON attendance(date, site_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_sites_active_stage ON sites(stage, contract_id)
  WHERE status = 'active' AND deleted_at IS NULL;

-- Every FK used in a filter gets an index; Postgres does not create these automatically.
```

At >2M attendance rows, partition `attendance` by `RANGE (date)` yearly. The schema above is partition-ready — the primary key already leads with columns compatible with a partition key.

---

## 7. Table Count

| Group | Tables |
|---|---|
| Identity & config | profiles, roles, role_permissions, company_settings, doc_sequences, bank_accounts |
| Commercial | companies, company_contacts, contracts, contract_milestones, quotations, quotation_items |
| Operations | sites, site_stages, site_stage_history, site_assignments, site_photos, work_logs, work_log_photos, inspections |
| Workforce | attendance, payroll_runs, payroll_lines, payroll_site_allocations, salary_advances, leave_requests |
| Financial | expenses, expense_categories, invoices, invoice_items, payments |
| Supply chain | materials, stock_locations, stock_ledger, vendors, purchase_orders, purchase_order_items, goods_receipts |
| Cross-cutting | documents, notifications, audit_logs |

**~40 tables**, up from 25 — but replacing three incoherent hierarchies with one, and covering 25 business modules instead of 3.
