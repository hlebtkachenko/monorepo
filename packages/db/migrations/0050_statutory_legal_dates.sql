-- 0050_statutory_legal_dates.sql
--
-- Separate Czech legal calendar dates from stored instants. accounting_event
-- keeps occurred_at for the precise §11/1e moment and gains occurred_on as the
-- timezone-independent period-membership date. summary_record gains the VAT
-- tax point and proven document-receipt dates required by ADR-0030.
--
-- Existing occurred_on and tax_point_date values preserve the previous
-- declared semantics: VAT outputs treated accounting_event.occurred_at as the
-- tax point. Legacy received_date remains NULL because no existing timestamp
-- proves when the recipient obtained the document.

BEGIN;

ALTER TABLE accounting_event
  ADD COLUMN IF NOT EXISTS occurred_on date;

UPDATE accounting_event
   SET occurred_on = (occurred_at AT TIME ZONE 'Europe/Prague')::date
 WHERE occurred_on IS NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_constraint
     WHERE conname = 'accounting_event_occurred_on_present'
       AND conrelid = 'accounting_event'::regclass
  ) THEN
    ALTER TABLE accounting_event
      ADD CONSTRAINT accounting_event_occurred_on_present
      CHECK (occurred_on IS NOT NULL) NOT VALID;
  END IF;
END;
$$;

ALTER TABLE accounting_event
  VALIDATE CONSTRAINT accounting_event_occurred_on_present;

-- PostgreSQL 12+ reuses the validated check and skips the table scan. Squawk
-- cannot infer that relationship, so this one statement is suppressed.
-- squawk-ignore adding-not-nullable-field
ALTER TABLE accounting_event
  ALTER COLUMN occurred_on SET NOT NULL;

ALTER TABLE accounting_event
  DROP CONSTRAINT accounting_event_occurred_on_present;

CREATE INDEX IF NOT EXISTS accounting_event_org_occurred_on_idx
  ON accounting_event (organization_id, occurred_on);

ALTER TABLE summary_record
  ADD COLUMN IF NOT EXISTS tax_point_date date,
  ADD COLUMN IF NOT EXISTS received_date date;

UPDATE summary_record sr
   SET tax_point_date = dates.tax_point_date
  FROM (
    SELECT ir.summary_record_id, MIN(ae.occurred_on) AS tax_point_date
      FROM individual_record ir
      JOIN accounting_event ae ON ae.id = ir.accounting_event_id
     GROUP BY ir.summary_record_id
  ) dates
 WHERE sr.id = dates.summary_record_id
   AND sr.type IN ('RECEIVED_INVOICE', 'ISSUED_INVOICE')
   AND sr.tax_point_date IS NULL;

CREATE INDEX IF NOT EXISTS summary_record_org_tax_point_date_idx
  ON summary_record (organization_id, tax_point_date)
  WHERE tax_point_date IS NOT NULL;

CREATE INDEX IF NOT EXISTS summary_record_org_received_date_idx
  ON summary_record (organization_id, received_date)
  WHERE received_date IS NOT NULL;

CREATE OR REPLACE FUNCTION app_event_period_guard()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.occurred_on IS NULL THEN
    NEW.occurred_on := (NEW.occurred_at AT TIME ZONE 'Europe/Prague')::date;
  END IF;
  PERFORM app_assert_period_writable(NEW.period_id, 'accounting_event', NEW.occurred_on);
  RETURN NEW;
END;
$$;
ALTER FUNCTION app_event_period_guard() OWNER TO app_owner;

COMMIT;
