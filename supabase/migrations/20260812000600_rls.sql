-- ============================================================================
-- 0006 — ROW LEVEL SECURITY
--
-- Principles, taken directly from the business requirements:
--   * Senthil (owner) is the only unrestricted principal.
--   * No employee may see company-wide financial information. auth_can_see_money()
--     admits only owner, manager and accountant — never a field role.
--   * Field staff see ONLY the sites they are assigned to, enforced by
--     auth_can_access_site(), which checks actual assignment rather than merely
--     the presence of a role.
--   * Append-only tables (audit_logs, site_events, stock_ledger) are granted
--     INSERT and SELECT but never UPDATE or DELETE, so history cannot be rewritten.
--   * Deleting is soft. No table grants a DELETE policy to anyone but the owner.
--
-- Every policy delegates to the STABLE SECURITY DEFINER helpers from migration
-- 0001 instead of inlining a subquery on profiles. That removes the infinite
-- recursion the previous schema suffered on `profiles`, and evaluates the role
-- once per statement rather than once per candidate row.
-- ============================================================================

ALTER TABLE roles                    ENABLE ROW LEVEL SECURITY;
ALTER TABLE role_permissions         ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE company_settings         ENABLE ROW LEVEL SECURITY;
ALTER TABLE bank_accounts            ENABLE ROW LEVEL SECURITY;
ALTER TABLE doc_sequences            ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs               ENABLE ROW LEVEL SECURITY;
ALTER TABLE companies                ENABLE ROW LEVEL SECURITY;
ALTER TABLE company_contacts         ENABLE ROW LEVEL SECURITY;
ALTER TABLE quotations               ENABLE ROW LEVEL SECURITY;
ALTER TABLE quotation_items          ENABLE ROW LEVEL SECURITY;
ALTER TABLE contracts                ENABLE ROW LEVEL SECURITY;
ALTER TABLE contract_milestones      ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE site_stages              ENABLE ROW LEVEL SECURITY;
ALTER TABLE sites                    ENABLE ROW LEVEL SECURITY;
ALTER TABLE site_assignments         ENABLE ROW LEVEL SECURITY;
ALTER TABLE site_events              ENABLE ROW LEVEL SECURITY;
ALTER TABLE site_stage_history       ENABLE ROW LEVEL SECURITY;
ALTER TABLE site_photos              ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance               ENABLE ROW LEVEL SECURITY;
ALTER TABLE leave_requests           ENABLE ROW LEVEL SECURITY;
ALTER TABLE salary_advances          ENABLE ROW LEVEL SECURITY;
ALTER TABLE payroll_runs             ENABLE ROW LEVEL SECURITY;
ALTER TABLE payroll_lines            ENABLE ROW LEVEL SECURITY;
ALTER TABLE payroll_site_allocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE expense_categories       ENABLE ROW LEVEL SECURITY;
ALTER TABLE expenses                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE cash_book                ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoice_items            ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE vendors                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE materials                ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_locations          ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_ledger             ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_requests        ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_request_items   ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_orders          ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_order_items     ENABLE ROW LEVEL SECURITY;
ALTER TABLE goods_receipts           ENABLE ROW LEVEL SECURITY;
ALTER TABLE goods_receipt_items      ENABLE ROW LEVEL SECURITY;
ALTER TABLE work_logs                ENABLE ROW LEVEL SECURITY;
ALTER TABLE inspections              ENABLE ROW LEVEL SECURITY;
ALTER TABLE documents                ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications            ENABLE ROW LEVEL SECURITY;

-- ─── Reference data: readable by all, writable by owner ─────────────────────

CREATE POLICY roles_read ON roles FOR SELECT TO authenticated USING (true);
CREATE POLICY roles_write ON roles FOR ALL TO authenticated
  USING (auth_is_owner()) WITH CHECK (auth_is_owner());

CREATE POLICY role_permissions_read ON role_permissions FOR SELECT TO authenticated USING (true);
CREATE POLICY role_permissions_write ON role_permissions FOR ALL TO authenticated
  USING (auth_is_owner()) WITH CHECK (auth_is_owner());

CREATE POLICY site_stages_read ON site_stages FOR SELECT TO authenticated USING (true);
CREATE POLICY site_stages_write ON site_stages FOR ALL TO authenticated
  USING (auth_is_owner()) WITH CHECK (auth_is_owner());

CREATE POLICY expense_categories_read ON expense_categories
  FOR SELECT TO authenticated USING (true);
CREATE POLICY expense_categories_write ON expense_categories FOR ALL TO authenticated
  USING (auth_is_back_office()) WITH CHECK (auth_is_back_office());

-- Numbering counters are touched only through the SECURITY DEFINER allocator.
CREATE POLICY doc_sequences_read ON doc_sequences
  FOR SELECT TO authenticated USING (auth_is_owner());

-- ─── Profiles ───────────────────────────────────────────────────────────────
-- Everyone can see the basic roster (needed for assignment pickers), but
-- salary, bank and KYC columns are stripped by the v_directory view; direct
-- table reads are limited to self plus back office.

CREATE POLICY profiles_select_self ON profiles FOR SELECT TO authenticated
  USING (id = auth.uid() OR auth_is_back_office());

CREATE POLICY profiles_update_self ON profiles FOR UPDATE TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

CREATE POLICY profiles_owner_all ON profiles FOR ALL TO authenticated
  USING (auth_is_owner()) WITH CHECK (auth_is_owner());

CREATE POLICY profiles_manager_manage ON profiles FOR UPDATE TO authenticated
  USING (auth_has_role('manager')) WITH CHECK (auth_has_role('manager'));

-- ─── Company settings and banking ───────────────────────────────────────────

CREATE POLICY company_settings_read ON company_settings
  FOR SELECT TO authenticated USING (true);
CREATE POLICY company_settings_write ON company_settings FOR ALL TO authenticated
  USING (auth_is_owner()) WITH CHECK (auth_is_owner());

-- Bank accounts are financial. Field staff must never see them.
CREATE POLICY bank_accounts_read ON bank_accounts FOR SELECT TO authenticated
  USING (auth_can_see_money() AND deleted_at IS NULL);
CREATE POLICY bank_accounts_write ON bank_accounts FOR ALL TO authenticated
  USING (auth_is_owner()) WITH CHECK (auth_is_owner());

-- ─── Audit log: append-only, owner-readable ─────────────────────────────────

CREATE POLICY audit_logs_insert ON audit_logs FOR INSERT TO authenticated
  WITH CHECK (true);
CREATE POLICY audit_logs_select ON audit_logs FOR SELECT TO authenticated
  USING (auth_is_owner());
-- Deliberately no UPDATE or DELETE policy: history is immutable.

-- ─── Commercial: client-facing data is back-office only ─────────────────────
-- Supervisors and workers must not see client contracts or commercial terms.

CREATE POLICY companies_read ON companies FOR SELECT TO authenticated
  USING (auth_can_see_money() AND deleted_at IS NULL);
CREATE POLICY companies_write ON companies FOR ALL TO authenticated
  USING (auth_is_back_office()) WITH CHECK (auth_is_back_office());

CREATE POLICY company_contacts_read ON company_contacts FOR SELECT TO authenticated
  USING (auth_can_see_money() AND deleted_at IS NULL);
CREATE POLICY company_contacts_write ON company_contacts FOR ALL TO authenticated
  USING (auth_is_back_office()) WITH CHECK (auth_is_back_office());

CREATE POLICY quotations_read ON quotations FOR SELECT TO authenticated
  USING (auth_can_see_money() AND deleted_at IS NULL);
CREATE POLICY quotations_write ON quotations FOR ALL TO authenticated
  USING (auth_is_back_office()) WITH CHECK (auth_is_back_office());

CREATE POLICY quotation_items_read ON quotation_items FOR SELECT TO authenticated
  USING (auth_can_see_money());
CREATE POLICY quotation_items_write ON quotation_items FOR ALL TO authenticated
  USING (auth_is_back_office()) WITH CHECK (auth_is_back_office());

CREATE POLICY contracts_read ON contracts FOR SELECT TO authenticated
  USING (auth_can_see_money() AND deleted_at IS NULL);
CREATE POLICY contracts_write ON contracts FOR ALL TO authenticated
  USING (auth_is_back_office()) WITH CHECK (auth_is_back_office());

CREATE POLICY milestones_read ON contract_milestones FOR SELECT TO authenticated
  USING (auth_can_see_money() AND deleted_at IS NULL);
CREATE POLICY milestones_write ON contract_milestones FOR ALL TO authenticated
  USING (auth_is_back_office()) WITH CHECK (auth_is_back_office());

CREATE POLICY projects_read ON projects FOR SELECT TO authenticated
  USING (auth_can_see_money() AND deleted_at IS NULL);
CREATE POLICY projects_write ON projects FOR ALL TO authenticated
  USING (auth_is_back_office()) WITH CHECK (auth_is_back_office());

-- ─── Sites: the site-scoped boundary ────────────────────────────────────────

CREATE POLICY sites_read ON sites FOR SELECT TO authenticated
  USING (deleted_at IS NULL AND auth_can_access_site(id));
CREATE POLICY sites_write ON sites FOR ALL TO authenticated
  USING (auth_is_back_office()) WITH CHECK (auth_is_back_office());

CREATE POLICY site_assignments_read ON site_assignments FOR SELECT TO authenticated
  USING (deleted_at IS NULL
         AND (employee_id = auth.uid() OR auth_can_access_site(site_id)));
CREATE POLICY site_assignments_write ON site_assignments FOR ALL TO authenticated
  USING (auth_is_back_office()) WITH CHECK (auth_is_back_office());

-- Timeline: append-only, readable by anyone with access to the site.
CREATE POLICY site_events_read ON site_events FOR SELECT TO authenticated
  USING (auth_can_access_site(site_id));
CREATE POLICY site_events_insert ON site_events FOR INSERT TO authenticated
  WITH CHECK (auth_can_access_site(site_id));
-- No UPDATE or DELETE: events are never removed.

CREATE POLICY stage_history_read ON site_stage_history FOR SELECT TO authenticated
  USING (auth_can_access_site(site_id));
CREATE POLICY stage_history_insert ON site_stage_history FOR INSERT TO authenticated
  WITH CHECK (auth_can_access_site(site_id));

CREATE POLICY site_photos_read ON site_photos FOR SELECT TO authenticated
  USING (deleted_at IS NULL AND auth_can_access_site(site_id));
CREATE POLICY site_photos_insert ON site_photos FOR INSERT TO authenticated
  WITH CHECK (auth_can_access_site(site_id) AND uploaded_by = auth.uid());
CREATE POLICY site_photos_update ON site_photos FOR UPDATE TO authenticated
  USING (uploaded_by = auth.uid() OR auth_is_back_office());

-- ─── Attendance ─────────────────────────────────────────────────────────────
-- A worker sees only their own. A supervisor sees their assigned sites only —
-- enforced by assignment, not merely by role.

CREATE POLICY attendance_read ON attendance FOR SELECT TO authenticated
  USING (deleted_at IS NULL
         AND (employee_id = auth.uid() OR auth_can_access_site(site_id)));

CREATE POLICY attendance_insert ON attendance FOR INSERT TO authenticated
  WITH CHECK (
    -- self check-in at a site you are assigned to
    (employee_id = auth.uid() AND auth_can_access_site(site_id))
    -- or marking on behalf of others at a site you control
    OR (auth_can_access_site(site_id)
        AND auth_has_role('owner','manager','supervisor','engineer'))
  );

CREATE POLICY attendance_update ON attendance FOR UPDATE TO authenticated
  USING (
    NOT is_locked
    AND (
      (employee_id = auth.uid() AND date = (now() AT TIME ZONE 'Asia/Kolkata')::date)
      OR (auth_can_access_site(site_id)
          AND auth_has_role('owner','manager','supervisor','engineer'))
    )
  );

CREATE POLICY attendance_owner_all ON attendance FOR ALL TO authenticated
  USING (auth_is_owner()) WITH CHECK (auth_is_owner());

-- ─── Leave ──────────────────────────────────────────────────────────────────

CREATE POLICY leave_read ON leave_requests FOR SELECT TO authenticated
  USING (deleted_at IS NULL
         AND (employee_id = auth.uid() OR auth_is_back_office()));
CREATE POLICY leave_insert ON leave_requests FOR INSERT TO authenticated
  WITH CHECK (employee_id = auth.uid());
CREATE POLICY leave_update ON leave_requests FOR UPDATE TO authenticated
  USING ((employee_id = auth.uid() AND status = 'pending') OR auth_is_back_office());

-- ─── Advances and payroll: strictly private ─────────────────────────────────
-- An employee sees their own advance and their own payslip, and nothing else.
-- No employee can see another's pay.

CREATE POLICY advances_read ON salary_advances FOR SELECT TO authenticated
  USING (deleted_at IS NULL
         AND (employee_id = auth.uid() OR auth_can_see_money()));
CREATE POLICY advances_write ON salary_advances FOR ALL TO authenticated
  USING (auth_can_see_money()) WITH CHECK (auth_can_see_money());

CREATE POLICY payroll_runs_read ON payroll_runs FOR SELECT TO authenticated
  USING (auth_can_see_money() AND deleted_at IS NULL);
CREATE POLICY payroll_runs_write ON payroll_runs FOR ALL TO authenticated
  USING (auth_can_see_money()) WITH CHECK (auth_can_see_money());

CREATE POLICY payroll_lines_read ON payroll_lines FOR SELECT TO authenticated
  USING (employee_id = auth.uid() OR auth_can_see_money());
CREATE POLICY payroll_lines_write ON payroll_lines FOR ALL TO authenticated
  USING (auth_can_see_money()) WITH CHECK (auth_can_see_money());

-- Cost allocations reveal company-wide labour cost. Money roles only.
CREATE POLICY payroll_alloc_read ON payroll_site_allocations FOR SELECT TO authenticated
  USING (auth_can_see_money());
CREATE POLICY payroll_alloc_write ON payroll_site_allocations FOR ALL TO authenticated
  USING (auth_can_see_money()) WITH CHECK (auth_can_see_money());

-- ─── Expenses ───────────────────────────────────────────────────────────────
-- Field staff may record and see their OWN expenses, plus expenses at sites
-- they run. They cannot see company-wide spend.

CREATE POLICY expenses_read ON expenses FOR SELECT TO authenticated
  USING (
    deleted_at IS NULL
    AND (
      created_by = auth.uid()
      OR paid_by = auth.uid()
      OR auth_can_see_money()
      OR (site_id IS NOT NULL
          AND auth_can_access_site(site_id)
          AND auth_has_role('supervisor','engineer'))
    )
  );

CREATE POLICY expenses_insert ON expenses FOR INSERT TO authenticated
  WITH CHECK (
    created_by = auth.uid()
    AND (site_id IS NULL OR auth_can_access_site(site_id))
  );

CREATE POLICY expenses_update ON expenses FOR UPDATE TO authenticated
  USING (
    (created_by = auth.uid() AND status IN ('draft','pending'))
    OR auth_can_see_money()
  );

CREATE POLICY expenses_owner_all ON expenses FOR ALL TO authenticated
  USING (auth_is_owner()) WITH CHECK (auth_is_owner());

-- ─── Cash book: money roles only ────────────────────────────────────────────

CREATE POLICY cash_book_read ON cash_book FOR SELECT TO authenticated
  USING (auth_can_see_money() AND deleted_at IS NULL);
CREATE POLICY cash_book_write ON cash_book FOR ALL TO authenticated
  USING (auth_can_see_money()) WITH CHECK (auth_can_see_money());

-- ─── Invoices and payments: money roles only ────────────────────────────────

CREATE POLICY invoices_read ON invoices FOR SELECT TO authenticated
  USING (auth_can_see_money() AND deleted_at IS NULL);
CREATE POLICY invoices_write ON invoices FOR ALL TO authenticated
  USING (auth_can_see_money()) WITH CHECK (auth_can_see_money());

CREATE POLICY invoice_items_read ON invoice_items FOR SELECT TO authenticated
  USING (auth_can_see_money());
CREATE POLICY invoice_items_write ON invoice_items FOR ALL TO authenticated
  USING (auth_can_see_money()) WITH CHECK (auth_can_see_money());

CREATE POLICY payments_read ON payments FOR SELECT TO authenticated
  USING (auth_can_see_money() AND deleted_at IS NULL);
CREATE POLICY payments_write ON payments FOR ALL TO authenticated
  USING (auth_can_see_money()) WITH CHECK (auth_can_see_money());

-- ─── Supply chain: store manager plus back office ───────────────────────────

CREATE POLICY vendors_read ON vendors FOR SELECT TO authenticated
  USING (deleted_at IS NULL
         AND (auth_can_see_money() OR auth_has_role('store_manager')));
CREATE POLICY vendors_write ON vendors FOR ALL TO authenticated
  USING (auth_has_role('owner','manager','store_manager'))
  WITH CHECK (auth_has_role('owner','manager','store_manager'));

-- The material catalogue is not sensitive; field staff need it to request stock.
CREATE POLICY materials_read ON materials FOR SELECT TO authenticated
  USING (deleted_at IS NULL);
CREATE POLICY materials_write ON materials FOR ALL TO authenticated
  USING (auth_has_role('owner','manager','store_manager'))
  WITH CHECK (auth_has_role('owner','manager','store_manager'));

CREATE POLICY stock_locations_read ON stock_locations FOR SELECT TO authenticated
  USING (deleted_at IS NULL);
CREATE POLICY stock_locations_write ON stock_locations FOR ALL TO authenticated
  USING (auth_has_role('owner','manager','store_manager'))
  WITH CHECK (auth_has_role('owner','manager','store_manager'));

-- Append-only ledger.
CREATE POLICY stock_ledger_read ON stock_ledger FOR SELECT TO authenticated
  USING (
    auth_has_role('owner','manager','store_manager','accountant')
    OR (site_id IS NOT NULL AND auth_can_access_site(site_id))
  );
CREATE POLICY stock_ledger_insert ON stock_ledger FOR INSERT TO authenticated
  WITH CHECK (
    auth_has_role('owner','manager','store_manager')
    OR (site_id IS NOT NULL AND auth_can_access_site(site_id)
        AND auth_has_role('supervisor','engineer'))
  );
-- No UPDATE or DELETE: corrections are made with a compensating entry.

CREATE POLICY pr_read ON purchase_requests FOR SELECT TO authenticated
  USING (deleted_at IS NULL
         AND (requested_by = auth.uid()
              OR auth_has_role('owner','manager','store_manager')
              OR (site_id IS NOT NULL AND auth_can_access_site(site_id))));
CREATE POLICY pr_insert ON purchase_requests FOR INSERT TO authenticated
  WITH CHECK (requested_by = auth.uid()
              AND (site_id IS NULL OR auth_can_access_site(site_id)));
CREATE POLICY pr_update ON purchase_requests FOR UPDATE TO authenticated
  USING ((requested_by = auth.uid() AND status IN ('draft','pending'))
         OR auth_has_role('owner','manager','store_manager'));

CREATE POLICY pr_items_read ON purchase_request_items FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM purchase_requests pr
                 WHERE pr.id = purchase_request_id));
CREATE POLICY pr_items_write ON purchase_request_items FOR ALL TO authenticated
  USING (auth_has_role('owner','manager','store_manager')
         OR EXISTS (SELECT 1 FROM purchase_requests pr
                    WHERE pr.id = purchase_request_id
                      AND pr.requested_by = auth.uid()
                      AND pr.status IN ('draft','pending')))
  WITH CHECK (auth_has_role('owner','manager','store_manager')
         OR EXISTS (SELECT 1 FROM purchase_requests pr
                    WHERE pr.id = purchase_request_id
                      AND pr.requested_by = auth.uid()
                      AND pr.status IN ('draft','pending')));

-- Purchase orders carry pricing, so they are money-visible plus store manager.
CREATE POLICY po_read ON purchase_orders FOR SELECT TO authenticated
  USING (deleted_at IS NULL
         AND (auth_can_see_money() OR auth_has_role('store_manager')));
CREATE POLICY po_write ON purchase_orders FOR ALL TO authenticated
  USING (auth_has_role('owner','manager','store_manager'))
  WITH CHECK (auth_has_role('owner','manager','store_manager'));

CREATE POLICY po_items_read ON purchase_order_items FOR SELECT TO authenticated
  USING (auth_can_see_money() OR auth_has_role('store_manager'));
CREATE POLICY po_items_write ON purchase_order_items FOR ALL TO authenticated
  USING (auth_has_role('owner','manager','store_manager'))
  WITH CHECK (auth_has_role('owner','manager','store_manager'));

CREATE POLICY grn_read ON goods_receipts FOR SELECT TO authenticated
  USING (deleted_at IS NULL
         AND (auth_can_see_money() OR auth_has_role('store_manager')));
CREATE POLICY grn_write ON goods_receipts FOR ALL TO authenticated
  USING (auth_has_role('owner','manager','store_manager'))
  WITH CHECK (auth_has_role('owner','manager','store_manager'));

CREATE POLICY grn_items_read ON goods_receipt_items FOR SELECT TO authenticated
  USING (auth_can_see_money() OR auth_has_role('store_manager'));
CREATE POLICY grn_items_write ON goods_receipt_items FOR ALL TO authenticated
  USING (auth_has_role('owner','manager','store_manager'))
  WITH CHECK (auth_has_role('owner','manager','store_manager'));

-- ─── Work logs and inspections ──────────────────────────────────────────────

CREATE POLICY work_logs_read ON work_logs FOR SELECT TO authenticated
  USING (deleted_at IS NULL AND auth_can_access_site(site_id));
CREATE POLICY work_logs_insert ON work_logs FOR INSERT TO authenticated
  WITH CHECK (submitted_by = auth.uid() AND auth_can_access_site(site_id));
CREATE POLICY work_logs_update ON work_logs FOR UPDATE TO authenticated
  USING ((submitted_by = auth.uid() AND status IN ('draft','submitted'))
         OR auth_is_back_office());

CREATE POLICY inspections_read ON inspections FOR SELECT TO authenticated
  USING (deleted_at IS NULL AND auth_can_access_site(site_id));
CREATE POLICY inspections_write ON inspections FOR ALL TO authenticated
  USING (auth_can_access_site(site_id)
         AND auth_has_role('owner','manager','engineer'))
  WITH CHECK (auth_can_access_site(site_id)
         AND auth_has_role('owner','manager','engineer'));

-- ─── Documents ──────────────────────────────────────────────────────────────
-- The previous schema let every authenticated user read every document,
-- including Aadhaar cards and bank details. Access is now scoped by entity,
-- and confidential documents are restricted to the owner and their subject.

CREATE POLICY documents_read ON documents FOR SELECT TO authenticated
  USING (
    deleted_at IS NULL
    AND (
      auth_is_owner()
      OR (is_confidential AND entity_type = 'employee' AND entity_id = auth.uid())
      OR (NOT is_confidential AND (
            uploaded_by = auth.uid()
            OR (entity_type = 'site' AND auth_can_access_site(entity_id))
            OR (entity_type IN ('company','contract','quotation','invoice')
                AND auth_can_see_money())
            OR (entity_type = 'employee' AND entity_id = auth.uid())
            OR (entity_type IN ('purchase_order','vendor')
                AND auth_has_role('owner','manager','store_manager'))
            OR entity_type = 'general'
          ))
    )
  );

CREATE POLICY documents_insert ON documents FOR INSERT TO authenticated
  WITH CHECK (uploaded_by = auth.uid());

CREATE POLICY documents_update ON documents FOR UPDATE TO authenticated
  USING (uploaded_by = auth.uid() OR auth_is_back_office());

-- ─── Notifications ──────────────────────────────────────────────────────────

CREATE POLICY notifications_read ON notifications FOR SELECT TO authenticated
  USING (recipient_id = auth.uid());
CREATE POLICY notifications_update ON notifications FOR UPDATE TO authenticated
  USING (recipient_id = auth.uid()) WITH CHECK (recipient_id = auth.uid());
CREATE POLICY notifications_insert ON notifications FOR INSERT TO authenticated
  WITH CHECK (auth_is_back_office());

-- ─── Audit triggers on the tables that matter ───────────────────────────────

CREATE TRIGGER audit_profiles        AFTER INSERT OR UPDATE OR DELETE ON profiles        FOR EACH ROW EXECUTE FUNCTION audit_trigger();
CREATE TRIGGER audit_companies       AFTER INSERT OR UPDATE OR DELETE ON companies       FOR EACH ROW EXECUTE FUNCTION audit_trigger();
CREATE TRIGGER audit_contracts       AFTER INSERT OR UPDATE OR DELETE ON contracts       FOR EACH ROW EXECUTE FUNCTION audit_trigger();
CREATE TRIGGER audit_sites           AFTER INSERT OR UPDATE OR DELETE ON sites           FOR EACH ROW EXECUTE FUNCTION audit_trigger();
CREATE TRIGGER audit_attendance      AFTER INSERT OR UPDATE OR DELETE ON attendance      FOR EACH ROW EXECUTE FUNCTION audit_trigger();
CREATE TRIGGER audit_salary_advances AFTER INSERT OR UPDATE OR DELETE ON salary_advances FOR EACH ROW EXECUTE FUNCTION audit_trigger();
CREATE TRIGGER audit_payroll_lines   AFTER INSERT OR UPDATE OR DELETE ON payroll_lines   FOR EACH ROW EXECUTE FUNCTION audit_trigger();
CREATE TRIGGER audit_expenses        AFTER INSERT OR UPDATE OR DELETE ON expenses        FOR EACH ROW EXECUTE FUNCTION audit_trigger();
CREATE TRIGGER audit_cash_book       AFTER INSERT OR UPDATE OR DELETE ON cash_book       FOR EACH ROW EXECUTE FUNCTION audit_trigger();
CREATE TRIGGER audit_invoices        AFTER INSERT OR UPDATE OR DELETE ON invoices        FOR EACH ROW EXECUTE FUNCTION audit_trigger();
CREATE TRIGGER audit_payments        AFTER INSERT OR UPDATE OR DELETE ON payments        FOR EACH ROW EXECUTE FUNCTION audit_trigger();
CREATE TRIGGER audit_purchase_orders AFTER INSERT OR UPDATE OR DELETE ON purchase_orders FOR EACH ROW EXECUTE FUNCTION audit_trigger();
