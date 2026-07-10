-- 0056_accounting_section_108_jurisdiction.sql
--
-- v2 accounting — add the SECTION_108 value to the partial_record.vat_jurisdiction
-- domain so the DPH return can split the §108 residual self-assessment
-- (přijetí plnění, u kterých je povinnost přiznat daň při jejich přijetí — DPH
-- ř.12/13) from the domestic §92 PDP (ř.10/11). Both capture as vat_mode =
-- REVERSE_CHARGE with a jurisdiction that IS DISTINCT FROM 'EU', so without a
-- dedicated jurisdiction value the §108 residual collapses onto ř.10/11.
--
-- SECTION_108 marks: place of supply CZ + supplier NOT established in tuzemsko →
-- the recipient self-assesses under §108 ZDPH (gas/electricity §7a from a
-- non-established supplier, §10–§10d special-place-of-supply services incl.
-- short-term hire of a means of transport §10d, goods with assembly/installation
-- §7(6), other §108 goods from a non-established person). Distinct from 'EU'
-- (§16/§9(1) general rule, ř.3-6) and from 'REVERSE_CHARGE' (domestic §92,
-- ř.10/11). Received-side only.
--
-- Mirrors the decision layer's VatJurisdiction union (classify.ts). The change is
-- purely ADDITIVE: the value set only GROWS, every existing row already satisfies
-- the (superset) constraint, and no reader routes an existing row differently. A
-- CHECK constrains the domain; a text column (not a pgEnum) keeps this additive
-- and lock-light (no ALTER TYPE). The constraint is dropped + re-added (a CHECK
-- cannot have a value appended in place); idempotent via DROP … IF EXISTS.
--
-- Law frame: ZDPH 235/2004 Sb. §108 / §7a / §10 / §10d / §7(6) / §24. Additive
-- constraint change only; no data backfill. Idempotent. Handwritten SQL
-- (ADR-0009); one whole-file transaction.

BEGIN;

ALTER TABLE partial_record
  DROP CONSTRAINT IF EXISTS partial_record_vat_jurisdiction_chk;

ALTER TABLE partial_record
  ADD CONSTRAINT partial_record_vat_jurisdiction_chk
  CHECK (vat_jurisdiction IS NULL OR vat_jurisdiction IN
    ('DOMESTIC', 'REVERSE_CHARGE', 'EU', 'IMPORT', 'EXEMPT', 'OUTSIDE_VAT',
     'SECTION_108'));

COMMENT ON COLUMN partial_record.vat_jurisdiction IS
  'VAT place-of-supply regime (ZDPH §16/§92/§102/§108): DOMESTIC/REVERSE_CHARGE/EU/IMPORT/EXEMPT/OUTSIDE_VAT/SECTION_108. Splits ř.3/4 (EU acquisition), ř.5/6 (EU §9(1) service), ř.10/11 (domestic §92 PDP), and ř.12/13 (§108 residual — place of supply CZ, supplier not established) on the DPH return; NULL = legacy/undistinguished.';

-- Tighten the §92 kód-vs-jurisdiction coupling (migration 0046,
-- partial_record_commodity_code_rc_chk) to also exclude SECTION_108.
-- 'SECTION_108' IS DISTINCT FROM 'EU' is TRUE, so without this the 0046
-- constraint (written before SECTION_108 existed) would still let a
-- SECTION_108 received partial carry a non-NULL §92 commodity_code. That code
-- would then be part of reverseChargeRows()'s GROUP BY (kontrolni-hlaseni.ts)
-- and get emitted as `kod` onto a kontrolní hlášení A.2 row — but A.2 (§108
-- residual self-assessment) has no §92-kód field; a §92 kód only belongs on a
-- DOMESTIC §92 PDP row (A.1/B.1). SECTION_108 is brand-new as of this
-- migration (zero existing rows), so tightening the CHECK in place is safe.
-- Same DROP + re-ADD shape as the vat_jurisdiction_chk change above (a CHECK
-- cannot be altered in place); idempotent.
ALTER TABLE partial_record
  DROP CONSTRAINT IF EXISTS partial_record_commodity_code_rc_chk;

ALTER TABLE partial_record
  ADD CONSTRAINT partial_record_commodity_code_rc_chk
  CHECK (
    commodity_code IS NULL
    OR (
      vat_mode = 'REVERSE_CHARGE'
      AND vat_jurisdiction IS DISTINCT FROM 'EU'
      AND vat_jurisdiction IS DISTINCT FROM 'SECTION_108'
    )
  );

COMMIT;
