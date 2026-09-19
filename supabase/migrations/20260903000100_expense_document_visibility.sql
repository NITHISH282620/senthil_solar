-- ============================================================================
-- 0021 — Expense documents were invisible to the roles that approve expenses
--
-- REPRODUCED: as accountant or manager (auth_can_see_money() is true for both,
-- and manager approves expenses per ExpenseActions/expenses_update), reading
--   GET /rest/v1/documents?entity_type=eq.expense&entity_id=eq.<id>
-- for a bill photo uploaded by someone else (e.g. the owner, or a field
-- worker who filed the expense) returned zero rows. Only the uploader and the
-- owner could see it.
--
-- Cause: documents_read (migration 0006) lists which entity_type values a
-- non-owner may see beyond their own uploads — company/contract/quotation/
-- invoice (money roles), site (site access), employee (self),
-- purchase_order/vendor (store roles), general (everyone). 'expense' was
-- never added, despite being a valid entity_type (0005's CHECK constraint)
-- and despite this being exactly the photo-proof feature (rental/purchase
-- bills on equipment/materials expenses) the app encourages. This silently
-- broke both that feature and the pre-existing expense-approval flow: a
-- manager or accountant reviewing someone else's expense could not see its
-- receipt.
--
-- Fix: grant visibility to whoever can already see the underlying expense,
-- by delegating to expenses' own SELECT policy (expenses_read) via EXISTS
-- rather than re-deriving the rule here. That is also how the analogous
-- money-visible entity types are already justified (companies/contracts/etc
-- follow auth_can_see_money() because that's who can read those tables too),
-- so this keeps expense-document visibility in permanent lockstep with
-- expense visibility instead of two independent rules that can drift apart.
-- ============================================================================

ALTER POLICY documents_read ON documents
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
            OR (entity_type = 'expense'
                AND EXISTS (SELECT 1 FROM expenses e WHERE e.id = documents.entity_id))
            OR (entity_type = 'employee' AND entity_id = auth.uid())
            OR (entity_type IN ('purchase_order','vendor')
                AND auth_has_role('owner','manager','store_manager'))
            OR entity_type = 'general'
          ))
    )
  );

COMMENT ON POLICY documents_read ON documents IS
  'Access scoped by entity. Expense documents follow expenses_read exactly '
  '(EXISTS against expenses, which carries its own RLS) rather than a '
  'separately-maintained rule, so approvers can see the bill they are '
  'approving without over-widening who can see it.';
