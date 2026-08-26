-- Migration 0005: reporting periods + the filing registry.
--
-- Scope (spec `.context/beta-afframe/40-beta-structure.md` §2.3 Daně a podání,
-- §2.4 Finance › Dluhy a platby, §4 data model):
--
--   reporting_period  the period identity every stamped dataset points at
--   filing            ONE registry; the five Daně a podání sidebar entries are
--                     VIEWS over it, never separate tables
--   + two ALTER TABLEs on `document`: the composite UNIQUE that filing's
--     attachment FK targets, and the `payslip_period_id` foreign key that
--     migration 0004 explicitly left for this one (see section 2b).
--
-- The two mapping functions at the bottom of section 3 are the only place a
-- filing kind is turned into a family or a creditor. §2.3 says it in one line —
-- "Family = constant mapping over filing.kind" — and this file is that mapping's
-- single home: the TypeScript layer reads `beta_filing_family(kind)` back off
-- the query rather than keeping a second copy that could disagree.
--
-- WHAT THIS FILE DOES NOT DO. It stores no computed accounting number. Every
-- `amount_due` here is office-entered or agent-fed (spec §0.2: "the portal never
-- derives an accounting fact"), and every read model built on it does
-- presentation-level SQL only — sums, grouping, `due_on < CURRENT_DATE`.
--
-- Money precision is `numeric(14,2)`, deliberately diverging from the main app's
-- `numeric(19,4)` / `Money<Currency>` rule (spec §0.7). Do not "fix" it.
--
-- Requires PostgreSQL 18+: `uuidv7()` and `UNIQUE NULLS NOT DISTINCT`.
--
-- NO `BEGIN;` / `COMMIT;` in this file — see the header of 0000_init.sql.

-- 1. Enums ---------------------------------------------------------------------

-- Period shape. Spec §4 names `month|year`; `quarter` is added because §2.3
-- requires it twice over and neither case is expressible without it: DPH is
-- filed quarterly by small plátci, and the DPPO záloha schedule is quarterly
-- above 150 000 Kč of prior tax (15.3. / 15.6. / 15.9. / 15.12.). A quarter
-- modelled as three month rows would make "one filing per period" a lie and give
-- the Souhrn timeline three deadlines where the law has one.
CREATE TYPE beta_period_kind AS ENUM ('month', 'quarter', 'year');

-- Every filing type the beta scope covers, spelled as the Czech form's own name
-- (spec §2.3 + `11-product-research.md`). Czech here and English for `status`
-- below is not an inconsistency: these are the legal names of documents, the way
-- `platce` / `neplatce` are the legal names of a VAT regime, whereas a status is
-- a workflow state this application invented.
--
--   dph_priznani            Přiznání k DPH — monthly or quarterly, 25th
--   dph_kontrolni_hlaseni   Kontrolní hlášení — ALWAYS monthly for a s.r.o.,
--                           and the one with automatic 1k/10k/30k/50k penalties
--   dph_souhrnne_hlaseni    Souhrnné hlášení — EU supplies
--   dppo_priznani           Přiznání k dani z příjmů právnických osob
--   dppo_zaloha             Záloha na DPPO — a PAYMENT with no filing act, which
--                           is why `status` stays `planned` on these rows and
--                           `paid_at` is the only thing that ever moves
--   ucetni_zaverka          Účetní závěrka (the §2.3 "závěrka row")
--   vyuctovani_dane         Vyúčtování daně ze závislé činnosti
--   prehled_cssz            Přehled o výši pojistného — ČSSZ
--   prehled_zp              Přehled o platbě pojistného — zdravotní pojišťovna
--   jmhz                    Jednotné měsíční hlášení zaměstnavatele, mandatory
--                           from 04/2026. Groundwork only in this migration: it
--                           is one more value with one more due date, and this
--                           file deliberately encodes no start-date rule for it
--                           (that belongs to whoever schedules the rows).
--   silnicni_dan            Silniční daň — only for vehicles over 12 t, so most
--                           construction s.r.o. never get a row (spec §2.3:
--                           "data-driven")
--   ostatni                 Anything else the office has to track
CREATE TYPE beta_filing_kind AS ENUM (
  'dph_priznani',
  'dph_kontrolni_hlaseni',
  'dph_souhrnne_hlaseni',
  'dppo_priznani',
  'dppo_zaloha',
  'ucetni_zaverka',
  'vyuctovani_dane',
  'prehled_cssz',
  'prehled_zp',
  'jmhz',
  'silnicni_dan',
  'ostatni'
);

-- The four Daně a podání families (spec §2.3). `Souhrn` is NOT a value here: it
-- is the cross-family rollup view, not a bucket a filing can belong to.
CREATE TYPE beta_filing_family AS ENUM (
  'dph',
  'dan_z_prijmu',
  'mzdove_odvody',
  'ostatni'
);

-- Filing status. `overdue` is deliberately ABSENT — spec §2.4 makes "Po
-- splatnosti" a DERIVED fact (`due_on < CURRENT_DATE`), and a stored overdue
-- flag is a value that is wrong every night at midnight until someone runs a job
-- to fix it.
--
--   planned    the deadline is known, nothing has been filed yet
--   filed      podáno
--   confirmed  the EPO `-potvrzeni.p7s` receipt or the datová schránka
--              doručenka is in hand
--   corrective opravné / dodatečné podání
CREATE TYPE beta_filing_status AS ENUM (
  'planned',
  'filed',
  'confirmed',
  'corrective'
);

-- Creditor grouping for the derived obligations read model (spec §2.4:
-- "groups FÚ / ČSSZ a ZP ... Dodavatelé ... Ostatní").
--
-- `dodavatele` is produced by the partner_saldo source, which lands in PR 28 —
-- no filing kind maps to it and none ever will. It is declared now so the
-- read model's union contract is complete on the day the second source arrives
-- rather than being reshaped then.
CREATE TYPE beta_obligation_group AS ENUM (
  'fu',
  'cssz_zp',
  'dodavatele',
  'ostatni'
);

-- 2. reporting_period ----------------------------------------------------------
--
-- The period identity of spec §4: "every import/stamp references period_id".
-- Filings point at it today; import_batch, statement_line, trial_balance_line,
-- partner_saldo, payroll_summary and payroll_employee_line all point at it from
-- PR 23 onwards.
--
-- WHY THE BOUNDARIES ARE GENERATED AND NOT TYPED. `starts_on` / `ends_on` are a
-- pure function of (period_kind, year, month, quarter), and spec §2.4 / §2.5
-- stamp balances "k <period-end>". A typed pair would be a second source of
-- truth for the same fact and would eventually disagree with the label above it
-- — the exact failure mode §0.4 is written against. Generated STORED columns are
-- indexable, cost one write, and cannot drift.
--
-- WHY THE IDENTITY IS FROZEN (trigger below). A period row is pointed at by
-- every stamped dataset in the product. Editing `year` on an existing row would
-- silently re-stamp every filing, every statement and every payroll line that
-- references it — turning correct data into confidently-wrong data with no diff
-- anywhere. Periods are created, never renamed; a mistyped one is replaced.
CREATE TABLE reporting_period (
  id               uuid             PRIMARY KEY DEFAULT uuidv7(),
  organization_id  uuid             NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  period_kind      beta_period_kind NOT NULL,
  year             smallint         NOT NULL,
  -- Exactly one of these is set, per period_kind; see reporting_period_shape.
  month            smallint,
  quarter          smallint,
  starts_on        date             NOT NULL GENERATED ALWAYS AS (
    make_date(
      year::int,
      CASE period_kind
        WHEN 'month'   THEN month::int
        WHEN 'quarter' THEN quarter::int * 3 - 2
        ELSE 1
      END,
      1
    )
  ) STORED,
  ends_on          date             NOT NULL GENERATED ALWAYS AS (
    (
      make_date(
        year::int,
        CASE period_kind
          WHEN 'month'   THEN month::int
          WHEN 'quarter' THEN quarter::int * 3 - 2
          ELSE 1
        END,
        1
      )
      + CASE period_kind
          WHEN 'month'   THEN interval '1 month'
          WHEN 'quarter' THEN interval '3 months'
          ELSE interval '1 year'
        END
    )::date - 1
  ) STORED,
  created_at       timestamptz      NOT NULL DEFAULT now(),
  -- No `updated_at`: every non-generated column but `id` is frozen by
  -- reporting_period_freeze_identity, so there is nothing an UPDATE may change.
  CONSTRAINT reporting_period_year_range
    CHECK (year BETWEEN 2000 AND 2100),
  CONSTRAINT reporting_period_shape CHECK (
    (period_kind = 'month'   AND month BETWEEN 1 AND 12 AND quarter IS NULL) OR
    (period_kind = 'quarter' AND quarter BETWEEN 1 AND 4 AND month IS NULL) OR
    (period_kind = 'year'    AND month IS NULL AND quarter IS NULL)
  ),
  -- NULLS NOT DISTINCT (PG15+) is what makes this a real identity constraint:
  -- under the default NULLS DISTINCT, two `(org, 'year', 2026, NULL, NULL)` rows
  -- would both be accepted and the office would end up with two 2026s.
  CONSTRAINT reporting_period_identity_unique
    UNIQUE NULLS NOT DISTINCT (organization_id, period_kind, year, month, quarter),
  -- The target of filing's COMPOSITE foreign key. See filing_period_fk below for
  -- why a plain `REFERENCES reporting_period(id)` is not enough here.
  CONSTRAINT reporting_period_id_organization_unique
    UNIQUE (id, organization_id)
);

CREATE INDEX reporting_period_organization_ends_idx
  ON reporting_period (organization_id, ends_on DESC);

CREATE OR REPLACE FUNCTION beta_reporting_period_freeze_identity()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.organization_id <> OLD.organization_id
     OR NEW.period_kind   <> OLD.period_kind
     OR NEW.year          <> OLD.year
     OR NEW.month         IS DISTINCT FROM OLD.month
     OR NEW.quarter       IS DISTINCT FROM OLD.quarter THEN
    RAISE EXCEPTION
      'reporting_period identity is immutable (period %)', OLD.id
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER reporting_period_freeze_identity
  BEFORE UPDATE ON reporting_period
  FOR EACH ROW EXECUTE FUNCTION beta_reporting_period_freeze_identity();

-- 2b. The two foreign keys 0004 left for this migration ------------------------
--
-- Migration 0004 created `document` with `payslip_period_id` deliberately
-- FK-less and said so in its own comment: "the tables they point at do not
-- exist yet — payroll_employee lands with PR 29 and reporting_period with
-- PR 16, and each of those PRs adds its own ALTER TABLE document ADD CONSTRAINT
-- ... FOREIGN KEY". `reporting_period` now exists, twenty lines above, so this
-- is that hand-off being honoured rather than left as a stale comment pointing
-- at a merged PR. (`payslip_employee_id` stays FK-less; PR 29 owns it.)
--
-- The UNIQUE is the target of `filing_document_fk` in section 3 — a composite
-- FK needs a composite unique on the referenced side, exactly as
-- `reporting_period_id_organization_unique` above serves `filing_period_fk`. It
-- is added here rather than in 0004 because it exists to serve THIS migration's
-- foreign key, and 0004 has already been applied to a database.
ALTER TABLE document
  ADD CONSTRAINT document_id_organization_unique UNIQUE (id, organization_id);

-- COMPOSITE, and RESTRICT, for the same two reasons as `filing_period_fk`:
-- carrying `organization_id` into the key makes a payslip stamped with another
-- organization's period unrepresentable, and a period that anything has been
-- stamped with must not be deletable out from under it. Nothing in this product
-- deletes a reporting period (see the header of lib/data/reporting-periods.ts),
-- so RESTRICT costs nothing and states the rule.
ALTER TABLE document
  ADD CONSTRAINT document_payslip_period_fk
  FOREIGN KEY (payslip_period_id, organization_id)
  REFERENCES reporting_period (id, organization_id)
  ON DELETE RESTRICT;

-- 3. filing --------------------------------------------------------------------
--
-- ONE registry (spec §2.3: "families over one registry"). The Souhrn timeline,
-- the DPH tab, the Daň z příjmů tab, the Mzdové odvody tab and Ostatní are five
-- WHERE clauses over this table, and Finance › Dluhy a platby is a sixth.
--
-- NO UNIQUE (organization_id, kind, period_id), on purpose. An opravné or
-- dodatečné podání is a SECOND filing for a period that already has one — that
-- is what `status = 'corrective'` means — so a uniqueness constraint here would
-- forbid the correction the law requires.
CREATE TABLE filing (
  id               uuid               PRIMARY KEY DEFAULT uuidv7(),
  organization_id  uuid               NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  kind             beta_filing_kind   NOT NULL,
  period_id        uuid               NOT NULL,
  -- The statutory deadline. NOT NULL because a filing row with no deadline
  -- cannot appear in Nejbližší termíny (§2.1), the Souhrn timeline (§2.3) or
  -- Dluhy a platby (§2.4) — which is every surface this table exists to feed.
  due_on           date               NOT NULL,
  status           beta_filing_status NOT NULL DEFAULT 'planned',
  -- The day it was ACTUALLY filed. Separate from due_on on purpose: the whole
  -- value of the Souhrn timeline is "due vs filed" (§2.3), and a single date
  -- column collapses the two.
  filed_on         date,
  -- Sign-carrying: positive = the client owes it, negative = a refund is owed to
  -- the client (a DPH nadměrný odpočet is the ordinary case for a construction
  -- s.r.o. on reverse charge). NULL = the office has not stated an amount yet,
  -- which is NOT the same as zero — "empty beats stale" (§0.4). Only strictly
  -- positive rows become obligations.
  amount_due       numeric(14,2),
  paid_at          timestamptz,
  -- Variabilní symbol for the payment (§2.4 row shape).
  variable_symbol  varchar(10),
  -- Attachment linkage (§2.3: "attachments (p7s/PDF/XML)" — the submitted XML
  -- and the EPO -potvrzeni.p7s receipt). Constrained by `filing_document_fk`
  -- below.
  document_id      uuid,
  -- Client-visible note. Rendered in the portal.
  note_client      text,
  -- Office-internal note (§3.1 pattern, mirrored from document.internal_note).
  -- NEVER serialized to a client: `note_internal` is on
  -- CLIENT_FORBIDDEN_COLUMNS and no projection in lib/data/projections.ts
  -- carries it.
  note_internal    text,
  created_at       timestamptz        NOT NULL DEFAULT now(),
  -- The freshness stamp of the filing source (§2.4: "Per-group stamp = the
  -- SOURCE's own stamp (filing edit / ...)"), maintained by the touch trigger.
  updated_at       timestamptz        NOT NULL DEFAULT now(),
  -- COMPOSITE, not `REFERENCES reporting_period(id)`. A plain single-column FK
  -- would happily let a filing in organization A point at a period belonging to
  -- organization B: referential integrity says nothing about tenancy. Carrying
  -- organization_id into the FK makes the cross-tenant reference unrepresentable
  -- rather than merely unwritten. RESTRICT, not CASCADE: a period must not be
  -- deletable out from under the filings stamped with it.
  CONSTRAINT filing_period_fk
    FOREIGN KEY (period_id, organization_id)
    REFERENCES reporting_period (id, organization_id)
    ON DELETE RESTRICT,
  -- The attachment, same composite shape and the same tenancy reason: a filing
  -- must not be able to point at another organization's document.
  --
  -- SET NULL RATHER THAN RESTRICT, and that asymmetry with the period FK is the
  -- point. A document is SOFT-deleted in normal operation (`document.deleted_at`
  -- — 0004: "a soft-deleted row is never listed, never served"), so a hard
  -- DELETE of a document row is not the office detaching a receipt; it is an
  -- org cascade or PR 37's retention purge. In either case the filing is the
  -- record that has to survive — an accountant's proof that a přiznání was
  -- filed does not stop being true because its scan was purged. RESTRICT here
  -- would instead make the retention job unable to do its job.
  --
  -- `SET NULL (document_id)`, the column-list form (PG15+), NOT bare SET NULL.
  -- A bare SET NULL on a composite key nulls EVERY referencing column, which
  -- here would try to null `organization_id` — a NOT NULL column — and turn
  -- every such delete into a constraint violation.
  CONSTRAINT filing_document_fk
    FOREIGN KEY (document_id, organization_id)
    REFERENCES document (id, organization_id)
    ON DELETE SET NULL (document_id),
  -- `planned` means nothing has been filed, and every other status means
  -- something has. Without this a row can render the "Podáno" chip with no date
  -- under it, or carry a filing date while claiming nothing was filed.
  CONSTRAINT filing_filed_coherence
    CHECK ((status = 'planned') = (filed_on IS NULL)),
  -- A payment of an amount nobody has stated is not a fact anyone can check.
  -- (The converse is NOT constrained: a dppo_zaloha is paid without any filing
  -- act at all, so `planned` + `paid_at` is a legitimate, common row.)
  CONSTRAINT filing_paid_requires_amount
    CHECK (paid_at IS NULL OR amount_due IS NOT NULL),
  CONSTRAINT filing_variable_symbol_digits
    CHECK (variable_symbol IS NULL OR variable_symbol ~ '^[0-9]{1,10}$')
);

CREATE INDEX filing_organization_kind_idx     ON filing (organization_id, kind);
CREATE INDEX filing_organization_due_idx      ON filing (organization_id, due_on);
CREATE INDEX filing_organization_period_idx   ON filing (organization_id, period_id);
CREATE INDEX filing_document_idx              ON filing (document_id)
  WHERE document_id IS NOT NULL;
-- The obligations read model's own index: its predicate is exactly this one.
CREATE INDEX filing_unpaid_idx                ON filing (organization_id, due_on)
  WHERE paid_at IS NULL AND amount_due > 0;

CREATE TRIGGER filing_touch_updated_at
  BEFORE UPDATE ON filing
  FOR EACH ROW EXECUTE FUNCTION beta_touch_updated_at();

-- A filing must never change books. There is no RLS in this database, so the
-- tenant column is guarded by the application seam alone (lib/data/scope.ts);
-- this is the floor under that seam for the one write that would move a row
-- across the wall rather than merely read across it.
CREATE OR REPLACE FUNCTION beta_freeze_organization_id()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.organization_id <> OLD.organization_id THEN
    RAISE EXCEPTION
      '%.organization_id is immutable (row %)', TG_TABLE_NAME, OLD.id
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER filing_freeze_organization_id
  BEFORE UPDATE ON filing
  FOR EACH ROW EXECUTE FUNCTION beta_freeze_organization_id();

-- 4. The two constant mappings over filing.kind --------------------------------
--
-- Spec §2.3: "Family = constant mapping over filing.kind." This is that mapping,
-- and it lives here and nowhere else — `lib/data/filings.ts` selects
-- `beta_filing_family(kind)` back off the row instead of keeping a TypeScript
-- copy, because two copies of a constant mapping is one copy too many.
--
-- Neither function has an ELSE arm. A kind added to the enum without an arm here
-- returns NULL, which `db/filings.test.ts` fails on loudly (it asserts totality
-- over `enum_range`) — the alternative, `ELSE 'ostatni'`, would silently file a
-- new tax under Ostatní and nobody would notice until a client asked.
--
-- IMMUTABLE, and safely so: adding an arm for a NEW enum value never changes the
-- result for an existing one. Re-assigning an existing kind to a different
-- family would, and would need a REINDEX of anything built on these functions —
-- there is nothing today, and this note is why.
CREATE OR REPLACE FUNCTION beta_filing_family(p_kind beta_filing_kind)
RETURNS beta_filing_family
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT CASE p_kind
    WHEN 'dph_priznani'          THEN 'dph'
    WHEN 'dph_kontrolni_hlaseni' THEN 'dph'
    WHEN 'dph_souhrnne_hlaseni'  THEN 'dph'
    WHEN 'dppo_priznani'         THEN 'dan_z_prijmu'
    WHEN 'dppo_zaloha'           THEN 'dan_z_prijmu'
    WHEN 'ucetni_zaverka'        THEN 'dan_z_prijmu'
    WHEN 'vyuctovani_dane'       THEN 'mzdove_odvody'
    WHEN 'prehled_cssz'          THEN 'mzdove_odvody'
    WHEN 'prehled_zp'            THEN 'mzdove_odvody'
    WHEN 'jmhz'                  THEN 'mzdove_odvody'
    WHEN 'silnicni_dan'          THEN 'ostatni'
    WHEN 'ostatni'               THEN 'ostatni'
  END::beta_filing_family;
$$;

-- Who is owed the money, for the §2.4 grouping. Note that this is NOT the family
-- with different labels: `vyuctovani_dane` is a payroll FILING (family
-- mzdove_odvody) whose creditor is the finanční úřad, and `silnicni_dan` is
-- family Ostatní but also owed to the FÚ. The two mappings genuinely differ, so
-- they are two functions.
--
-- `ucetni_zaverka` maps to `fu` as the appendix to the DPPO filing it travels
-- with. It never carries an amount_due, so it never reaches the read model.
CREATE OR REPLACE FUNCTION beta_filing_obligation_group(p_kind beta_filing_kind)
RETURNS beta_obligation_group
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT CASE p_kind
    WHEN 'dph_priznani'          THEN 'fu'
    WHEN 'dph_kontrolni_hlaseni' THEN 'fu'
    WHEN 'dph_souhrnne_hlaseni'  THEN 'fu'
    WHEN 'dppo_priznani'         THEN 'fu'
    WHEN 'dppo_zaloha'           THEN 'fu'
    WHEN 'ucetni_zaverka'        THEN 'fu'
    WHEN 'vyuctovani_dane'       THEN 'fu'
    WHEN 'silnicni_dan'          THEN 'fu'
    -- JMHZ is submitted through ČSSZ as the single gateway, so it groups with
    -- the odvody rather than with the FÚ filings.
    WHEN 'prehled_cssz'          THEN 'cssz_zp'
    WHEN 'prehled_zp'            THEN 'cssz_zp'
    WHEN 'jmhz'                  THEN 'cssz_zp'
    WHEN 'ostatni'               THEN 'ostatni'
  END::beta_obligation_group;
$$;
