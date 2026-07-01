-- 0037_accounting_nonprofit_account_groups.sql
--
-- v2 accounting — reference-data completion for the nonprofit regime (EPIC 3
-- finding). The 0025 reference seed loaded the entrepreneur směrná osnova
-- (Decree 500/2002) only. A nonprofit účetní jednotka (spolek / o.p.s. under
-- Vyhláška 504/2002 Sb., ČÚS 401–414) uses class 5/6 groups the 500/2002 seed
-- does not carry — notably 58 (poskytnuté příspěvky) and 68 (přijaté příspěvky).
-- account.group_code (GENERATED, class 5/6) has an FK to account_group.code, so
-- a nonprofit chart cannot be seeded until these rows exist. Surfaced by a
-- real-data stress test replaying a nonprofit spolek's deník.
--
-- Only 58 + 68 are required: class-9 nonprofit accounts (90x vlastní jmění, 91x
-- fondy, 93x výsledek hospodaření, 96x závěrkové) get a NULL group_code from the
-- generated column (left(number,1) IN ('8','9') → NULL) and therefore skip the
-- FK entirely — adding 9x group rows would be dead reference data.
--
-- Law frame: Vyhláška č. 504/2002 Sb. (účetní osnova pro nevýdělečné organizace)
-- + ČÚS 401–414. Additive reference data only; no DDL. Idempotent. Handwritten
-- SQL (ADR-0009); one whole-file transaction.

BEGIN;

INSERT INTO account_group
  (code, class, name_cs, name_en, nature, is_internal, is_valuation_adjustment,
   balance_sheet_line, balance_sheet_line_when_debit, balance_sheet_line_when_credit, income_statement_line)
VALUES
  ('58', 5, 'Poskytnuté příspěvky', 'Contributions Granted',  'EXPENSE', false, false, NULL, NULL, NULL, 'A.8'),
  ('68', 6, 'Přijaté příspěvky',    'Contributions Received', 'REVENUE', false, false, NULL, NULL, NULL, 'B.3')
ON CONFLICT (code) DO NOTHING;

COMMIT;
