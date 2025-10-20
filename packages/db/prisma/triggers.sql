
-- Enforce per-entry balance (Σ debits == Σ credits) with a deferred constraint trigger

CREATE OR REPLACE FUNCTION enforce_entry_balance() RETURNS TRIGGER AS $$
DECLARE
  total_debit NUMERIC;
  total_credit NUMERIC;
  target_entry_id TEXT;
BEGIN
  -- If NEW is null (DELETE), use OLD.entryId
  target_entry_id := COALESCE(NEW."entryId", OLD."entryId");

  SELECT COALESCE(SUM(debit),0), COALESCE(SUM(credit),0)
    INTO total_debit, total_credit
  FROM "Posting" WHERE "entryId" = target_entry_id;

  IF total_debit <> total_credit THEN
    RAISE EXCEPTION 'Entry % not balanced: debits % != credits %', target_entry_id, total_debit, total_credit;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_enforce_entry_balance ON "Posting";
CREATE CONSTRAINT TRIGGER trg_enforce_entry_balance
AFTER INSERT OR UPDATE OR DELETE ON "Posting"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION enforce_entry_balance();
