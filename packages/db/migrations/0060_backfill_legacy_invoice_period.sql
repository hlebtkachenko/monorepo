-- 0060_backfill_legacy_invoice_period.sql
--
-- Backfill HELD invoice proposals created before PR #723 normalized their
-- replay key from createInvoice to captureAccountingDocument. Those legacy
-- rows stored periodId at the top level of input_json.

BEGIN;

ALTER TABLE tool_call_log DISABLE TRIGGER tool_call_log_limited_update;

WITH candidates AS (
  SELECT
    tool_call_log.id,
    accounting_period.id AS period_id
  FROM tool_call_log
  JOIN accounting_period
    ON accounting_period.organization_id = tool_call_log.organization_id
   AND accounting_period.id::text = tool_call_log.input_json ->> 'periodId'
  WHERE tool_call_log.tool_name = 'createInvoice'
    AND tool_call_log.period_id IS NULL
    AND tool_call_log.input_json ->> 'periodId' ~
      '^[0-9A-Fa-f]{8}(-[0-9A-Fa-f]{4}){3}-[0-9A-Fa-f]{12}$'
)
UPDATE tool_call_log
SET period_id = candidates.period_id
FROM candidates
WHERE tool_call_log.id = candidates.id;

ALTER TABLE tool_call_log ENABLE TRIGGER tool_call_log_limited_update;

COMMIT;
