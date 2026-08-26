-- Migration 0014: account_balance_map — which účet of the obratová předvaha is
-- a bank account, and which is the pokladna.
--
-- Scope (spec `.context/beta-afframe/40-beta-structure.md` §2.4 Finance › Účty a
-- hotovost, §3.3 Zadávání dat, §4 data model: "account_balance_map (org,
-- account_code, friendly_label, kind bank|cash, active)").
--
-- WHAT THIS TABLE IS, AND WHAT IT DELIBERATELY IS NOT. It is a NAMING TABLE.
-- It holds no money, no period and no balance: the balances live in
-- `trial_balance_line` (migration 0007), already published by the office's own
-- software, and Finance › Účty a hotovost reads them through this map. Spec
-- §2.4 states the whole design in three words — "zero extra entry" — and the
-- only way that stays true is if the office's monthly act is publishing a
-- předvaha and NOT typing a bank balance anywhere. Curating this map is a
-- one-off (§2.4: "auto-proposed from account names, curated once").
--
-- WHY A MAP AT ALL, RATHER THAN A HARDCODED `211*` / `221*` RULE. Because a
-- Czech účtový rozvrh is the účetní jednotka's own document. One client's bank
-- accounts are 221.01 / 221.02, another's are 221100 / 221200, a third keeps a
-- devizový účet on 221.90 and a spořicí on 221.95 — and the friendly name the
-- CLIENT recognises ("Fio běžný", "Pokladna Brno") exists nowhere in the
-- účtový rozvrh at all. A hardcoded prefix rule would produce cards labelled
-- "221.02" and would silently mis-file the first rozvrh that puts something
-- else on a 22x account.
--
-- TWO WAYS TO NAME THE ÚČTY ONE CARD COVERS (spec §4 says `account_code`; the
-- second mode is what makes it usable against a real analytic rozvrh):
--
--   exact   the card IS one účet.        221.01 → "Fio běžný účet"
--   prefix  the card is every účet whose code starts with this one.
--           221 → "Bankovní účty" covers 221.01, 221.02, 221100, ...
--
-- A prefix card's figure is `SUM(closing_balance)` over the matched účty —
-- presentation-level SQL over already-provided rows, which spec §0.2 allows in
-- so many words ("sums, cost − oprávky, grouping"). Nothing here derives an
-- accounting fact.
--
-- THE OVERLAP TRIGGER IS THE REASON "CELKEM" MEANS ANYTHING. Without it an
-- office could map prefix `221` AND exact `221.01`, and the same money would be
-- counted by two cards — so the page's total (§2.4: "celkem") would be a number
-- that is simply wrong, produced by a mapping mistake nobody could see. The
-- trigger makes the map a PARTITION of the účty it claims: every account feeds
-- at most one card, so the total is a sum over disjoint sets.
--
-- Money precision is not this table's concern — it stores none. The balances it
-- points at are `numeric(14,2)` (spec §0.7), read as strings, never parsed.
--
-- NO `BEGIN;` / `COMMIT;` in this file — see the header of 0000_init.sql.

-- 1. Enums ---------------------------------------------------------------------

-- Spec §4, verbatim: "kind bank|cash". Two values and no third — spec §7
-- rejects bank feeds and per-partner bank accounts, and a `card` or `crypto`
-- value would be a claim about a surface this product does not have. English
-- like `beta_asset_category`: a classification this application invented, not a
-- legal document name. Czech display labels live in `messages/cs.json`.
CREATE TYPE beta_account_kind AS ENUM ('bank', 'cash');

-- How `account_code` is matched against `trial_balance_line.account_code`.
-- See the file header for why both modes exist. `exact` is the default because
-- it is the mode that cannot surprise anyone: it claims exactly the účet it
-- names.
CREATE TYPE beta_account_match_kind AS ENUM ('exact', 'prefix');

-- 2. account_balance_map -------------------------------------------------------

CREATE TABLE account_balance_map (
  id               uuid                     PRIMARY KEY DEFAULT uuidv7(),
  organization_id  uuid                     NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  -- Syntetický or analytický účet, spelled as the office's software spells it.
  -- varchar(20) and no digit CHECK, mirroring `trial_balance_line.account_code`
  -- exactly: a map entry that could not be spelled the way the předvaha spells
  -- it would be a map entry that matches nothing.
  account_code     varchar(20)              NOT NULL,
  match_kind       beta_account_match_kind  NOT NULL DEFAULT 'exact',
  -- What the CLIENT calls this account ("Fio běžný účet", "Pokladna"). Spec §4
  -- names the column; it exists because the účtový rozvrh has no such name.
  friendly_label   text                     NOT NULL,
  kind             beta_account_kind        NOT NULL,
  -- The office's own card order (spec §2.4 renders cards, not a sorted table).
  -- A small integer rather than a float: the list is curated once and reordering
  -- it is a rare, deliberate act.
  sort_order       smallint                 NOT NULL DEFAULT 0,
  -- Spec §4, verbatim. A closed account is DEACTIVATED, never deleted: the
  -- předvahy of past periods still carry its balances, and a deleted map entry
  -- would silently drop that account out of every historical card.
  active           boolean                  NOT NULL DEFAULT true,
  created_at       timestamptz              NOT NULL DEFAULT now(),
  updated_at       timestamptz              NOT NULL DEFAULT now(),

  -- No leading or trailing whitespace, because the code is used as a literal
  -- PREFIX (`starts_with`) and a stray space would make a mapping match nothing
  -- while looking correct in every UI that renders it.
  CONSTRAINT account_balance_map_account_code_shape
    CHECK (
      account_code = btrim(account_code)
      AND length(account_code) BETWEEN 1 AND 20
    ),
  CONSTRAINT account_balance_map_label_present
    CHECK (length(btrim(friendly_label)) BETWEEN 1 AND 120),
  CONSTRAINT account_balance_map_sort_order_range
    CHECK (sort_order BETWEEN 0 AND 999)
);

-- ONE ENTRY PER ÚČET CODE, and it is also the ingestion API's upsert key.
--
-- The other agent-fed registries (filing, liability, asset, client_task) carry
-- an `external_ref` because they have NO natural key — two identical-looking
-- DPH advances can both be real. This table is the opposite case: the account
-- code IS the identity, it is what the office's rozvrh calls the row, and it is
-- unique within the book by construction. Adding an `external_ref` here would
-- create a SECOND match key, so a re-sent entry could match one key and collide
-- on the other; there is deliberately none.
CREATE UNIQUE INDEX account_balance_map_account_idx
  ON account_balance_map (organization_id, account_code);

-- The Účty a hotovost / Zadávání listing order.
CREATE INDEX account_balance_map_organization_idx
  ON account_balance_map (organization_id, sort_order, friendly_label);

CREATE TRIGGER account_balance_map_touch_updated_at
  BEFORE UPDATE ON account_balance_map
  FOR EACH ROW EXECUTE FUNCTION beta_touch_updated_at();

-- Reuses the generic guard 0005 defined for filing — a map entry must never
-- change books, and there is no RLS behind this seam to catch it otherwise.
CREATE TRIGGER account_balance_map_freeze_organization_id
  BEFORE UPDATE ON account_balance_map
  FOR EACH ROW EXECUTE FUNCTION beta_freeze_organization_id();

-- 3. The map is a PARTITION of the účty it claims -------------------------------
--
-- Two entries overlap when a single `trial_balance_line.account_code` could be
-- matched by both. With `exact` on both sides that is only possible for the
-- same code, which the unique index above already refuses. The remaining cases
-- all involve a prefix:
--
--   prefix 221  vs exact  221.01   → overlap (the exact code starts with it)
--   prefix 221  vs prefix 221.01   → overlap (one prefix contains the other)
--   exact  221  vs exact  221.01   → NO overlap (two distinct účty)
--
-- Stated as a trigger rather than an exclusion constraint because "one code is
-- a prefix of the other" is not an operator any GiST opclass in core offers, and
-- a hand-rolled one would be considerably more machinery than a five-line
-- lookup for a table that holds a dozen rows per book.
--
-- IT IGNORES `active`. A deactivated entry that overlaps a live one is a
-- mapping mistake waiting to be re-armed the day someone flips it back, and the
-- office would then be looking at a total that quietly double-counts.
CREATE OR REPLACE FUNCTION beta_account_balance_map_no_overlap()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  clashing text;
BEGIN
  SELECT m.account_code INTO clashing
    FROM account_balance_map m
   WHERE m.organization_id = NEW.organization_id
     AND m.id <> NEW.id
     AND (
       (NEW.match_kind = 'prefix' AND starts_with(m.account_code, NEW.account_code))
       OR (m.match_kind = 'prefix' AND starts_with(NEW.account_code, m.account_code))
     )
   LIMIT 1;

  IF clashing IS NOT NULL THEN
    RAISE EXCEPTION
      'account_balance_map: account % overlaps the existing mapping % in the same organization',
      NEW.account_code, clashing
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER account_balance_map_no_overlap
  BEFORE INSERT OR UPDATE ON account_balance_map
  FOR EACH ROW EXECUTE FUNCTION beta_account_balance_map_no_overlap();
