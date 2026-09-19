-- ============================================================================
-- 0022 — Site creation: client comes first, a contract is optional
--
-- The owner's day-to-day flow is Client -> Site -> Quote -> Approve -> Work
-- -> Get Paid. A Contract is just the paperwork you attach when one client
-- hands you several sites under a single award at once — it was never meant
-- to be a gate you pass through before a site can exist at all.
--
-- sync_site_company() (0020, lightweight_site_flow) already let contract_id
-- be NULL, but still treated a *present* contract_id as authoritative,
-- silently overwriting whatever company_id was submitted. That matched the
-- old contract-first UI. With the form now asking for the client directly
-- every time, company_id is the one the caller actually chose — a contract,
-- if also given, is validated against it instead of overriding it.
-- ============================================================================

CREATE OR REPLACE FUNCTION sync_site_company()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_contract_company UUID;
BEGIN
  IF NEW.company_id IS NULL THEN
    RAISE EXCEPTION 'A site needs a client company.';
  END IF;

  IF NEW.contract_id IS NOT NULL THEN
    SELECT c.company_id INTO v_contract_company
    FROM contracts c WHERE c.id = NEW.contract_id;

    IF v_contract_company IS NULL THEN
      RAISE EXCEPTION 'Contract % does not exist', NEW.contract_id;
    END IF;

    IF v_contract_company <> NEW.company_id THEN
      RAISE EXCEPTION 'That contract belongs to a different client than the one selected.';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON COLUMN sites.company_id IS
  'Always supplied directly — the client the site is for. If contract_id is '
  'also set, sync_site_company() validates the two agree; it no longer '
  'derives company_id from the contract.';
