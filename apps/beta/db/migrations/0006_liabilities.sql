-- Migration 0006: the manual liability residue.
--
-- Scope (spec `.context/beta-afframe/40-beta-structure.md` §2.4 Finance › Dluhy
-- a platby, §3.3 Zadávání dat, §4 data model — "liability (residual manual
-- only)"):
--
--   liability   the third and last source of the derived obligations read model
--
-- WHAT THIS TABLE IS FOR, AND WHAT IT IS NOT FOR. Spec §2.4 makes Dluhy a platby
-- a DERIVED read model over three sources and says why: Advisor defect F11 found
-- liabilities being typed THREE times — once as a manual row, once as a filing's
-- `amount_due`, once as an imported saldokonto payable — which costs the office
-- ten minutes a month and gives the client three numbers that disagree. This
-- table is the RESIDUE: what is left after the filing registry and the imported
-- saldokonto have each said everything they can say.
--
--   filing         a FORM with a statutory deadline and an amount   (0005, live)
--   partner_saldo  payables per partner, from the monthly import    (PR 28)
--   liability      everything neither of those can express          (HERE)
--
-- THE RESIDUE RULE, AS THIS MIGRATION READS IT. §2.4 writes the three sources
-- with their creditor groups in parentheses — "filings (FÚ / ČSSZ a ZP) ∪
-- partner_saldo payables (Dodavatelé) ∪ manual liability residue (Ostatní)" —
-- which is a PARTITION statement: each source owns its groups, so the union is
-- disjoint by construction and no row can be shown twice.
--
-- Two of the three fences are absolute and are enforced here:
--
--   1. `dodavatele` is REFUSED (`liability_group_is_residue`). That group belongs
--      wholly to the imported saldokonto, and a hand-typed supplier payable
--      standing next to its imported twin is literally F11. There is no case for
--      it: a supplier debt the import cannot see means the import is incomplete,
--      and the fix is the import.
--
--   2. A liability CANNOT NAME A FILING. There is no `filing_id` column and no
--      way to add one that would mean anything: a filing's money lives on the
--      filing row and the read model reads it there. So "the same debt from two
--      sources" is not a state the read model has to detect — it is a state the
--      schema cannot express.
--
-- The third case is a judgement, and it is why `creditor_group` is a real column
-- rather than the constant `'ostatni'` a maximally-literal reading of §2.4 would
-- make it: `fu` and `cssz_zp` stay enterable, because the residue that genuinely
-- exists in those two groups — penále, úrok z prodlení, a splátkový kalendář —
-- is NOT a form with a statutory deadline and therefore has no filing row to
-- duplicate. Filing the FÚ's penalty under "Ostatní" would be a heading that
-- lies. `ostatni` is the DEFAULT, and the ordinary case.
--
-- (If that judgement is ever overruled, it is one line: tighten
-- `liability_group_is_residue` to `= 'ostatni'`.)
--
-- NO `status` ENUM, unlike the pre-v4 sketch in `12-architecture-options.md`
-- (open | partially_paid | paid | written_off). `paid_at` alone carries the
-- state, exactly as it does on `filing`: an unpaid row is an obligation, a paid
-- one is closed, and "po splatnosti" is DERIVED against CURRENT_DATE (§2.4) and
-- never stored. `partially_paid` is deliberately not representable — a partial
-- payment changes the AMOUNT OUTSTANDING, and a status that says "partially"
-- without saying "how much" is a chip the client cannot act on.
--
-- Money precision is `numeric(14,2)` (spec §0.7), read as a string in TypeScript
-- and never parsed into a number. Do not "fix" it to numeric(19,4).
--
-- NOT IN THIS MIGRATION: `liability.partner_id` (spec §4 gives it to the partner
-- PR, 27/28, which introduces the table it points at — that PR adds its own
-- composite ALTER, the way 0005 added the two FKs 0004 left for it).
--
-- Requires PostgreSQL 18+: `uuidv7()`.
--
-- NO `BEGIN;` / `COMMIT;` in this file — see the header of 0000_init.sql.

-- 1. liability -----------------------------------------------------------------

CREATE TABLE liability (
  id               uuid                  PRIMARY KEY DEFAULT uuidv7(),
  organization_id  uuid                  NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  -- Who is owed, as the §2.4 grouping. See the residue rule in the header for
  -- why `dodavatele` is refused and why the other three are not.
  creditor_group   beta_obligation_group NOT NULL DEFAULT 'ostatni',
  -- The §2.4 row's "titul" — the one free-text field. There is deliberately no
  -- separate `creditor_name`: the read model's `Obligation` shape carries ONE
  -- free-text slot (`label`) shared by every source that has one, and the
  -- creditor a client reads is the GROUP heading the row sits under. A second
  -- text column would have to be composed into that one slot somewhere, and
  -- composing display text in SQL is how a read model stops being translatable.
  label            text                  NOT NULL,
  -- Strictly positive, and that is not the same rule as `filing.amount_due`.
  -- A filing's amount is SIGN-CARRYING because a nadměrný odpočet is an ordinary
  -- filing whose sign means the FÚ owes the client. A liability has no such
  -- case: money owed TO this company is a receivable, which is Pohledávky
  -- (PR 27), not a negative debt. NOT NULL for the same reason — a liability
  -- whose amount nobody has stated is not a residue, it is a note.
  amount           numeric(14,2)         NOT NULL,
  -- Splatnost. NOT NULL: every §2.4 row is ordered and marked overdue by it.
  due_on           date                  NOT NULL,
  paid_at          timestamptz,
  -- Variabilní symbol for the payment (§2.4 row shape), same shape as filing's.
  variable_symbol  varchar(10),
  -- Client-visible note. Rendered in the portal.
  note_client      text,
  -- Office-internal note (§3.1 pattern, mirrored from filing.note_internal).
  -- NEVER serialized to a client: `note_internal` is already on
  -- CLIENT_FORBIDDEN_COLUMNS and no projection in lib/data/projections.ts
  -- carries it.
  note_internal    text,
  created_at       timestamptz           NOT NULL DEFAULT now(),
  -- The freshness stamp of the manual source (§2.4: "Per-group stamp = the
  -- SOURCE's own stamp (filing edit / import period / manual edit)"), maintained
  -- by the touch trigger below.
  updated_at       timestamptz           NOT NULL DEFAULT now(),
  CONSTRAINT liability_group_is_residue
    CHECK (creditor_group <> 'dodavatele'),
  -- A row whose title is blank renders as an empty cell in a list whose whole
  -- job is to say what is owed. `btrim` so a spacebar does not pass.
  CONSTRAINT liability_label_present
    CHECK (length(btrim(label)) > 0),
  CONSTRAINT liability_amount_positive
    CHECK (amount > 0),
  CONSTRAINT liability_variable_symbol_digits
    CHECK (variable_symbol IS NULL OR variable_symbol ~ '^[0-9]{1,10}$')
);

CREATE INDEX liability_organization_due_idx
  ON liability (organization_id, due_on);
-- The obligations read model's own index: its predicate is exactly this one.
-- (`amount > 0` is not part of it, unlike `filing_unpaid_idx` — the CHECK above
-- makes every row satisfy it, so repeating it here would index nothing.)
CREATE INDEX liability_unpaid_idx
  ON liability (organization_id, due_on)
  WHERE paid_at IS NULL;

CREATE TRIGGER liability_touch_updated_at
  BEFORE UPDATE ON liability
  FOR EACH ROW EXECUTE FUNCTION beta_touch_updated_at();

-- A liability must never change books. There is no RLS in this database, so the
-- tenant column is guarded by the application seam alone (lib/data/scope.ts);
-- this is the floor under that seam for the one write that would move a row
-- across the wall rather than merely read across it. Same function migration
-- 0005 installed for `filing`.
CREATE TRIGGER liability_freeze_organization_id
  BEFORE UPDATE ON liability
  FOR EACH ROW EXECUTE FUNCTION beta_freeze_organization_id();
