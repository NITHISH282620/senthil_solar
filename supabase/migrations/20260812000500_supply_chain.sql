-- ============================================================================
-- 0005 — SUPPLY CHAIN
-- Vendors, materials, an append-only stock ledger, procurement, and documents.
--
-- Stock on hand is ALWAYS derived as SUM(quantity_delta) over the ledger. There
-- is deliberately no mutable "quantity_on_hand" counter: counters drift, lose
-- updates under concurrency, and cannot be audited or reconstructed.
--
-- Rollback: supabase/rollback/0005_supply_chain.down.sql
-- ============================================================================

-- ─── Vendors ────────────────────────────────────────────────────────────────

CREATE TABLE vendors (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_code TEXT UNIQUE NOT NULL,
  name        TEXT NOT NULL,
  gst_number  TEXT,
  pan_number  TEXT,
  contact_name TEXT,
  phone        TEXT,
  email        TEXT,
  address TEXT,
  city    TEXT,
  state   TEXT,
  state_code TEXT,
  pincode TEXT,
  payment_terms_days INT NOT NULL DEFAULT 30 CHECK (payment_terms_days >= 0),
  bank_name       TEXT,
  bank_account_no TEXT,
  bank_ifsc       TEXT,
  rating   INT CHECK (rating BETWEEN 1 AND 5),
  notes    TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  deleted_at TIMESTAMPTZ
);

CREATE INDEX idx_vendors_name_trgm ON vendors USING gin (name gin_trgm_ops);
CREATE INDEX idx_vendors_active ON vendors(is_active) WHERE deleted_at IS NULL;

CREATE TRIGGER vendors_set_updated_at
  BEFORE UPDATE ON vendors FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ─── Material master ────────────────────────────────────────────────────────

CREATE TABLE materials (
  id       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sku      TEXT UNIQUE NOT NULL,
  name     TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN
    ('panel','inverter','mc4','dc_cable','ac_cable','mounting_structure',
     'earthing','fastener','consumable','tool','other')),
  unit     TEXT NOT NULL DEFAULT 'nos',
  hsn_code TEXT,
  gst_percent NUMERIC(6,3) NOT NULL DEFAULT 18 CHECK (gst_percent >= 0),

  specification TEXT,
  brand   TEXT,
  model   TEXT,
  wattage_w   NUMERIC(10,2) CHECK (wattage_w >= 0),   -- panels
  capacity_kw NUMERIC(10,3) CHECK (capacity_kw >= 0), -- inverters

  standard_cost NUMERIC(14,2) CHECK (standard_cost >= 0),
  reorder_level NUMERIC(14,3) CHECK (reorder_level >= 0),

  is_active  BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  deleted_at TIMESTAMPTZ
);

CREATE INDEX idx_materials_category ON materials(category) WHERE deleted_at IS NULL;
CREATE INDEX idx_materials_name_trgm ON materials USING gin (name gin_trgm_ops);

CREATE TRIGGER materials_set_updated_at
  BEFORE UPDATE ON materials FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ─── Stock locations ────────────────────────────────────────────────────────
-- Warehouses, sites and vehicles are all stock-holding locations, which is what
-- lets the ledger express Warehouse -> Vehicle -> Transit -> Site as ordinary
-- transfers rather than special cases.

CREATE TABLE stock_locations (
  id   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  location_type TEXT NOT NULL CHECK (location_type IN ('warehouse','site','vehicle')),
  site_id UUID REFERENCES sites(id) ON DELETE CASCADE,
  address TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ,
  CONSTRAINT stock_location_site_required
    CHECK (location_type <> 'site' OR site_id IS NOT NULL)
);

CREATE UNIQUE INDEX stock_locations_one_per_site
  ON stock_locations(site_id) WHERE location_type = 'site' AND deleted_at IS NULL;

CREATE TRIGGER stock_locations_set_updated_at
  BEFORE UPDATE ON stock_locations FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ─── Stock ledger (append-only) ─────────────────────────────────────────────

CREATE TABLE stock_ledger (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  material_id UUID NOT NULL REFERENCES materials(id),
  location_id UUID NOT NULL REFERENCES stock_locations(id),
  site_id     UUID REFERENCES sites(id) ON DELETE SET NULL,
  contract_id UUID REFERENCES contracts(id) ON DELETE SET NULL,
  company_id  UUID REFERENCES companies(id) ON DELETE SET NULL,

  txn_type TEXT NOT NULL CHECK (txn_type IN
    ('opening_balance','purchase_receipt','transfer_in','transfer_out',
     'site_consumption','installed','damaged','scrapped','returned_to_vendor',
     'adjustment')),
  -- Signed: positive adds to the location, negative removes.
  quantity_delta NUMERIC(14,3) NOT NULL CHECK (quantity_delta <> 0),
  unit_cost   NUMERIC(14,2) CHECK (unit_cost >= 0),
  total_value NUMERIC(14,2)
    GENERATED ALWAYS AS (ABS(quantity_delta) * COALESCE(unit_cost, 0)) STORED,

  reference_table TEXT,
  reference_id    UUID,
  transfer_group_id UUID,   -- pairs the out/in legs of one transfer

  txn_date   DATE NOT NULL DEFAULT CURRENT_DATE,
  notes      TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL
);

CREATE INDEX idx_stock_material_location ON stock_ledger(material_id, location_id);
CREATE INDEX idx_stock_site      ON stock_ledger(site_id) WHERE site_id IS NOT NULL;
CREATE INDEX idx_stock_date      ON stock_ledger(txn_date DESC);
CREATE INDEX idx_stock_transfer  ON stock_ledger(transfer_group_id)
  WHERE transfer_group_id IS NOT NULL;

CREATE TRIGGER stock_ledger_stamp_lineage
  BEFORE INSERT OR UPDATE OF site_id ON stock_ledger
  FOR EACH ROW EXECUTE FUNCTION stamp_site_lineage();

COMMENT ON TABLE stock_ledger IS
  'Append-only. Stock on hand = SUM(quantity_delta). Never mutate rows.';

-- ─── Procurement ────────────────────────────────────────────────────────────

CREATE TABLE purchase_requests (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_number TEXT UNIQUE NOT NULL,
  site_id    UUID REFERENCES sites(id) ON DELETE SET NULL,
  contract_id UUID REFERENCES contracts(id) ON DELETE SET NULL,
  company_id UUID REFERENCES companies(id) ON DELETE SET NULL,
  requested_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  needed_by  DATE,
  justification TEXT,
  status TEXT NOT NULL DEFAULT 'pending'
         CHECK (status IN ('draft','pending','approved','rejected','ordered')),
  approved_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  approved_at TIMESTAMPTZ,
  rejection_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

CREATE INDEX idx_pr_status ON purchase_requests(status) WHERE deleted_at IS NULL;
CREATE INDEX idx_pr_site   ON purchase_requests(site_id) WHERE deleted_at IS NULL;

CREATE TRIGGER purchase_requests_set_updated_at
  BEFORE UPDATE ON purchase_requests FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER purchase_requests_stamp_lineage
  BEFORE INSERT OR UPDATE OF site_id ON purchase_requests
  FOR EACH ROW EXECUTE FUNCTION stamp_site_lineage();

CREATE TABLE purchase_request_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_request_id UUID NOT NULL REFERENCES purchase_requests(id) ON DELETE CASCADE,
  material_id UUID NOT NULL REFERENCES materials(id),
  quantity NUMERIC(14,3) NOT NULL CHECK (quantity > 0),
  notes TEXT,
  sort_order INT NOT NULL DEFAULT 0
);

CREATE INDEX idx_pr_items_request ON purchase_request_items(purchase_request_id);

CREATE TABLE purchase_orders (
  id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  po_number TEXT UNIQUE NOT NULL,
  vendor_id UUID NOT NULL REFERENCES vendors(id),
  purchase_request_id UUID REFERENCES purchase_requests(id) ON DELETE SET NULL,
  site_id     UUID REFERENCES sites(id) ON DELETE SET NULL,
  contract_id UUID REFERENCES contracts(id) ON DELETE SET NULL,
  company_id  UUID REFERENCES companies(id) ON DELETE SET NULL,

  po_date DATE NOT NULL DEFAULT CURRENT_DATE,
  expected_delivery_date DATE,
  delivery_address TEXT,

  subtotal     NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (subtotal >= 0),
  gst_amount   NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (gst_amount >= 0),
  total_amount NUMERIC(14,2)
    GENERATED ALWAYS AS (subtotal + gst_amount) STORED,
  amount_paid  NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (amount_paid >= 0),

  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN
    ('draft','sent','partially_received','received','cancelled')),
  terms TEXT,
  notes TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  deleted_at TIMESTAMPTZ
);

CREATE INDEX idx_po_vendor ON purchase_orders(vendor_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_po_status ON purchase_orders(status)    WHERE deleted_at IS NULL;
CREATE INDEX idx_po_pending_delivery ON purchase_orders(expected_delivery_date)
  WHERE status IN ('sent','partially_received') AND deleted_at IS NULL;

CREATE TRIGGER purchase_orders_set_updated_at
  BEFORE UPDATE ON purchase_orders FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER purchase_orders_stamp_lineage
  BEFORE INSERT OR UPDATE OF site_id ON purchase_orders
  FOR EACH ROW EXECUTE FUNCTION stamp_site_lineage();

CREATE TABLE purchase_order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_order_id UUID NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
  material_id UUID NOT NULL REFERENCES materials(id),
  quantity    NUMERIC(14,3) NOT NULL CHECK (quantity > 0),
  unit_price  NUMERIC(14,2) NOT NULL CHECK (unit_price >= 0),
  gst_percent NUMERIC(6,3)  NOT NULL DEFAULT 18 CHECK (gst_percent >= 0),
  quantity_received NUMERIC(14,3) NOT NULL DEFAULT 0 CHECK (quantity_received >= 0),
  line_total  NUMERIC(14,2) GENERATED ALWAYS AS (quantity * unit_price) STORED,
  sort_order  INT NOT NULL DEFAULT 0,
  CONSTRAINT po_item_not_over_received CHECK (quantity_received <= quantity)
);

CREATE INDEX idx_po_items_po ON purchase_order_items(purchase_order_id);

CREATE TABLE goods_receipts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  grn_number TEXT UNIQUE NOT NULL,
  purchase_order_id UUID NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
  location_id UUID NOT NULL REFERENCES stock_locations(id),
  received_date DATE NOT NULL DEFAULT CURRENT_DATE,
  received_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  vehicle_number TEXT,
  invoice_number TEXT,
  qc_status TEXT NOT NULL DEFAULT 'pending'
            CHECK (qc_status IN ('pending','passed','failed','partial')),
  qc_notes  TEXT,
  notes     TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

CREATE INDEX idx_grn_po ON goods_receipts(purchase_order_id) WHERE deleted_at IS NULL;

CREATE TRIGGER goods_receipts_set_updated_at
  BEFORE UPDATE ON goods_receipts FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE goods_receipt_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  goods_receipt_id UUID NOT NULL REFERENCES goods_receipts(id) ON DELETE CASCADE,
  purchase_order_item_id UUID NOT NULL REFERENCES purchase_order_items(id),
  material_id UUID NOT NULL REFERENCES materials(id),
  quantity_received NUMERIC(14,3) NOT NULL CHECK (quantity_received > 0),
  quantity_rejected NUMERIC(14,3) NOT NULL DEFAULT 0 CHECK (quantity_rejected >= 0),
  unit_cost NUMERIC(14,2) CHECK (unit_cost >= 0),
  notes TEXT
);

CREATE INDEX idx_grn_items_grn ON goods_receipt_items(goods_receipt_id);

-- ─── Work logs ──────────────────────────────────────────────────────────────

CREATE TABLE work_logs (
  id      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  contract_id UUID REFERENCES contracts(id) ON DELETE SET NULL,
  company_id  UUID REFERENCES companies(id) ON DELETE SET NULL,
  log_date DATE NOT NULL,
  submitted_by UUID NOT NULL REFERENCES profiles(id),
  work_description TEXT NOT NULL,
  work_category TEXT NOT NULL DEFAULT 'other' CHECK (work_category IN
    ('civil','structure','panel_installation','electrical','testing','other')),
  workers_present_count INT CHECK (workers_present_count >= 0),
  materials_used TEXT,
  problems TEXT,
  weather TEXT CHECK (weather IN ('good','rainy','extreme_heat')),
  remarks TEXT,
  status TEXT NOT NULL DEFAULT 'draft'
         CHECK (status IN ('draft','submitted','approved','locked')),
  approved_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ,
  UNIQUE (site_id, log_date)
);

CREATE INDEX idx_work_logs_site_date ON work_logs(site_id, log_date DESC)
  WHERE deleted_at IS NULL;

CREATE TRIGGER work_logs_set_updated_at
  BEFORE UPDATE ON work_logs FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER work_logs_stamp_lineage
  BEFORE INSERT OR UPDATE OF site_id ON work_logs
  FOR EACH ROW EXECUTE FUNCTION stamp_site_lineage();

-- ─── Inspections ────────────────────────────────────────────────────────────

CREATE TABLE inspections (
  id      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  inspection_type TEXT NOT NULL DEFAULT 'internal'
    CHECK (inspection_type IN ('internal','client','statutory','discom','safety')),
  stage TEXT REFERENCES site_stages(code),
  scheduled_date DATE,
  inspected_at TIMESTAMPTZ,
  inspector_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  inspector_name TEXT,          -- external inspectors have no profile
  result TEXT CHECK (result IN ('pass','fail','conditional','pending')),
  findings TEXT,
  corrective_actions TEXT,
  certificate_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

CREATE INDEX idx_inspections_site ON inspections(site_id) WHERE deleted_at IS NULL;

CREATE TRIGGER inspections_set_updated_at
  BEFORE UPDATE ON inspections FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ─── Documents ──────────────────────────────────────────────────────────────

CREATE TABLE documents (
  id   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  file_path TEXT NOT NULL,        -- storage object path, not a public URL
  file_type TEXT,
  file_size BIGINT CHECK (file_size >= 0),
  category  TEXT NOT NULL DEFAULT 'other' CHECK (category IN
    ('id_proof','agreement','work_order','drawing','permit','photo','report',
     'invoice','purchase_order','completion_certificate','warranty','other')),
  entity_type TEXT NOT NULL CHECK (entity_type IN
    ('company','contract','site','employee','quotation','invoice','expense',
     'purchase_order','vendor','general')),
  entity_id UUID,
  -- Employee KYC and bank documents must never be readable by other staff.
  is_confidential BOOLEAN NOT NULL DEFAULT false,
  uploaded_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

CREATE INDEX idx_documents_entity ON documents(entity_type, entity_id)
  WHERE deleted_at IS NULL;

COMMENT ON COLUMN documents.is_confidential IS
  'Restricts visibility to the owner and the document subject. Set for KYC and bank documents.';

-- ─── Notifications ──────────────────────────────────────────────────────────

CREATE TABLE notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN
    ('salary_pending','attendance_missing','low_stock','payment_due',
     'invoice_overdue','contract_deadline','expense_approval','advance_request',
     'site_stalled','po_delivery_due','leave_request','inspection_due')),
  severity TEXT NOT NULL DEFAULT 'info'
           CHECK (severity IN ('info','warning','critical')),
  title TEXT NOT NULL,
  body  TEXT,
  entity_type TEXT,
  entity_id   UUID,
  action_url  TEXT,
  is_read BOOLEAN NOT NULL DEFAULT false,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_notifications_unread
  ON notifications(recipient_id, created_at DESC) WHERE NOT is_read;
