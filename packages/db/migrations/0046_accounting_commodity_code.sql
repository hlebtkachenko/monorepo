-- 0046_accounting_commodity_code.sql
--
-- v2 accounting — persist the §92 KÓD PŘEDMĚTU PLNĚNÍ (commodity code) of a
-- domestic reverse-charge supply on partial_record so kontrolní hlášení A.1
-- (dodavatel) and B.1 (odběratel) can emit it. Today a §92 reverse_charge
-- partial_record carries only the vat_mode + jurisdiction, not WHICH commodity
-- the PDP covers, so KhRow has no `kod` and A.1/B.1 cannot report the code the
-- form requires (kontrolni-hlaseni.ts).
--
-- DISTINCT from supply_kind (migration 0043): that is the SOUHRNNÉ hlášení §102
-- goods-vs-service kód (0/3) — a different taxonomy on a different report. This
-- column is the §92 domestic-PDP subject-of-supply code and lives ONLY on the
-- kontrolní hlášení A.1/B.1.
--
-- Code domain (Pokyny k vyplnění kontrolního hlášení, A.1/B.1):
--   1  zlato (§92b)
--   3  dodání nemovité věci (§92d)
--   4  stavební nebo montážní práce (§92e)
--   5  zboží uvedené v příloze č. 5 (§92c)
-- (The remaining KH commodity codes — 6, 7, 11–21, i.e. §92da / §92ea / §92f
-- příloha 6 — are not modelled yet; see the classify.ts and kontrolni-hlaseni.ts
-- module docs; extend the CHECK + the classifier together.)
--
-- NULLABLE — a partial_record that is not a domestic §92 PDP supply (STANDARD /
-- EU / IMPORT / EXEMPT / legacy) stays NULL, and every reader treats NULL as
-- "no §92 kód" (the KhRow.kod is null on those rows). Strictly additive: no
-- pre-existing report row moves. Two CHECKs: one constrains the code domain, one
-- couples the code to a reverse-charge line (a §92 kód is meaningless off PDP —
-- the same invariant classify.ts enforces, made DB-authoritative). A text column
-- (not a pgEnum) keeps the migration additive and lock-light (no ALTER TYPE).
--
-- Law frame: ZDPH 235/2004 Sb. §92b/§92c/§92d/§92e (přenesená daňová povinnost),
-- §101c–101i (kontrolní hlášení). Additive column only; no data backfill.
-- Idempotent. Handwritten SQL (ADR-0009); one whole-file transaction.

BEGIN;

ALTER TABLE partial_record
  ADD COLUMN IF NOT EXISTS commodity_code text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'partial_record_commodity_code_chk'
  ) THEN
    ALTER TABLE partial_record
      ADD CONSTRAINT partial_record_commodity_code_chk
      CHECK (commodity_code IS NULL OR commodity_code IN ('1', '3', '4', '5'));
  END IF;
END$$;

-- A §92 kód předmětu plnění only exists on a DOMESTIC reverse-charge line
-- (kontrolní hlášení A.1/B.1). Forbid it everywhere else at the DB — both on
-- non-PDP modes (STANDARD/EXEMPT/IMPORT/OUTSIDE_VAT) and on an EU acquisition
-- (which is self-assessed → vat_mode REVERSE_CHARGE too, but belongs on souhrnné
-- hlášení, not KH A.1/B.1). The predicate is exactly the emitter's DOMESTIC
-- filter (vat_jurisdiction IS DISTINCT FROM 'EU'), so the write side is
-- authoritative and the reader never has to mask a §92 kód: making the invalid
-- state unrepresentable, not compensated on read. classify.ts's gate stays as
-- the UX layer that explains the drop in `reasoning`. Existing rows all have
-- commodity_code NULL → passes unchanged; a legacy NULL-jurisdiction PDP row
-- (NULL IS DISTINCT FROM 'EU' = true) still passes.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'partial_record_commodity_code_rc_chk'
  ) THEN
    ALTER TABLE partial_record
      ADD CONSTRAINT partial_record_commodity_code_rc_chk
      CHECK (
        commodity_code IS NULL
        OR (vat_mode = 'REVERSE_CHARGE' AND vat_jurisdiction IS DISTINCT FROM 'EU')
      );
  END IF;
END$$;

COMMENT ON COLUMN partial_record.commodity_code IS
  '§92 kód předmětu plnění for kontrolní hlášení A.1/B.1 (domestic reverse charge): 1 zlato §92b / 3 nemovitost §92d / 4 stavební-montážní §92e / 5 příloha 5 §92c. NULL = not a §92 domestic PDP row (STANDARD/EU/IMPORT/EXEMPT/legacy).';

COMMIT;
