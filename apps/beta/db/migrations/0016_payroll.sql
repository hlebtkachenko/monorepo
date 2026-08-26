-- Migration 0016: Mzdy — the employee register and the payroll dataset.
--
-- Scope (spec `.context/beta-afframe/40-beta-structure.md` §2.6 Mzdy, §2.6.1
-- employee seat, §3.2 Měsíční uzávěrka publish semantics, §4 data model, §5
-- visibility):
--
--   payroll_employee       the office's employee register for one book —
--                          a REGISTRY, matched on `external_ref` like `asset`
--   payroll_summary        one period's payroll aggregates (Přehled mezd)
--   payroll_employee_line  one employee's figures for one period (Zaměstnanci)
--
-- plus the `document.payslip_employee_id` foreign key migration 0004 explicitly
-- deferred to this file (section 6).
--
-- IT COMPUTES NOTHING (spec §0.2). Every `numeric(14,2)` below is a figure the
-- office's own payroll software produced and the agent ingestion API handed over
-- verbatim. `employer_cost_total` is NOT `gross_total` plus the two employer
-- levies derived here, `net_paid_total` is NOT gross minus withholdings, and no
-- column is a percentage of another. The odvody rates the client sees on Přehled
-- mezd (zaměstnavatel 24,8 % + 9 %; sráženo 7,1 % + 4,5 % + záloha na daň) are
-- CONTEXT for reading the figures, never an arithmetic this database performs —
-- a portal that recomputed them would eventually disagree with the výplatní
-- páska the employee is holding.
--
-- THE WORD "superhrubá" APPEARS NOWHERE, and that is a naming rule, not a
-- squeamishness: superhrubá mzda was abolished for the 2021 tax year and using
-- it as the label for `employer_cost_total` would state a defunct tax base as if
-- it were the current one. Spec §2.6 spells the concept "celkové náklady na
-- zaměstnance"; the column follows.
--
-- ==========================================================================
-- THE ONE STRUCTURAL DECISION IN THIS FILE, AND WHY
-- ==========================================================================
--
-- Spec §4 gives `payroll_summary` "period_id unique" and `payroll_employee_line`
-- "unique employee+period", which reads as two tables UPSERTed per period. This
-- migration instead makes both of them PAYLOAD TABLES OF THE `payroll` BATCH,
-- exactly like `statement_line` and `trial_balance_line` — keyed per batch, with
-- `period_id` denormalised, frozen once the batch leaves draft, and CASCADEing
-- with it.
--
-- WHY. Spec §3.2 makes payroll one of the five uzávěrka DATASETS, and the whole
-- of §3.2's publish contract — draft → published → superseded, one published per
-- (org, period, dataset), atomic flip, "Vrátit poslední import" — is a property
-- of `import_batch`, not of a table. A per-period upsert would take the
-- ingestion path but not the semantics: rolling back a payroll batch would
-- unpublish the batch and LEAVE the newer figures in place, so the completeness
-- matrix would report 06/2026 as restored while Přehled mezd still showed the
-- numbers the office had just retracted. That is spec §0.4's confidently-wrong
-- data produced by the one mechanism built to prevent it.
--
-- THE SPEC'S TWO UNIQUENESS PROPERTIES STILL HOLD where they are about what the
-- client is looking at. `import_batch_one_published_idx` (migration 0007) allows
-- at most one PUBLISHED batch per (organization, period, `payroll`), and the two
-- keys below allow at most one summary and one line per employee inside a batch.
-- Composed, that is exactly "one live summary per period" and "one live line per
-- employee per period" — with the batch history behind it that a bare upsert
-- would have thrown away.
--
-- THE MANUAL PATH IS NOT LOST EITHER. Spec §3.3 lists "payroll_summary manual"
-- among the office's Zadávání forms; in this shape that form creates a batch
-- with `source = 'manual'`, which is the spine's own fallback channel (§3.2,
-- `import_batch_manual_has_filename`). One write path, two sources.
--
-- ==========================================================================
-- PERSONAL DATA: WHAT IS DELIBERATELY ABSENT
-- ==========================================================================
--
-- `payroll_employee` stores a NAME, an employment type, two employment dates and
-- an optional link to a portal account. It stores NO rodné číslo, NO date or
-- place of birth, NO address, NO bank account, NO health-insurance number and NO
-- dependants — none of which any surface in spec §2.6 renders, and each of which
-- would turn this table from "who was on the payroll" into a personnel file this
-- product has no lawful reason to hold. The office's own payroll software is the
-- controller of that data; beta receives the figures, not the people.
--
-- The office's own employee id travels as `external_ref` (the same column
-- migration 0011 added to filing / liability / asset / client_task), which is on
-- `CLIENT_FORBIDDEN_COLUMNS` and therefore never projected to any tier.
--
-- Money precision is `numeric(14,2)` (spec §0.7), the same as every other beta
-- table. Do not "fix" it to the main app's `numeric(19,4)`.
--
-- Requires PostgreSQL 18+: `uuidv7()`.
--
-- NO `BEGIN;` / `COMMIT;` in this file — see the header of 0000_init.sql.

-- 1. Enum ----------------------------------------------------------------------

-- Spec §2.6: "headcount HPP/DPČ/DPP". The three Czech employment contracts an
-- s.r.o. actually runs payroll for:
--
--   hpp  pracovní poměr (hlavní pracovní poměr)
--   dpc  dohoda o pracovní činnosti
--   dpp  dohoda o provedení práce
--
-- Spelled as the office spells them rather than translated, unlike
-- `beta_asset_category`: these are named legal instruments of the zákoník
-- práce, not a classification this application invented. Their Czech display
-- labels belong in `messages/cs.json`, and land with the Mzdy surfaces that
-- render them.
--
-- A CLOSED LIST, on purpose. A fourth arm (jednatel bez smlouvy, statutární
-- orgán) is a real thing the office may one day need, and it is an `ALTER TYPE`
-- together with the headcount column that would have to accompany it — not a
-- free-text field that quietly accumulates spellings.
CREATE TYPE beta_payroll_contract_type AS ENUM ('hpp', 'dpc', 'dpp');

-- 2. payroll_employee ----------------------------------------------------------
--
-- The employee register (spec §2.6 Zaměstnanci). NOT period-versioned: a person
-- is on the books across months, and their monthly figures live in
-- `payroll_employee_line` below. The same registry shape as `asset` — office
-- (or agent) written, matched on `external_ref`, never batch-owned.

CREATE TABLE payroll_employee (
  id              uuid                       PRIMARY KEY DEFAULT uuidv7(),
  organization_id uuid                       NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  -- Jméno a příjmení as the office's payroll software holds it. One column, not
  -- a first/last pair: nothing in spec §2.6 sorts or addresses by surname, and
  -- splitting a name is a guess that goes wrong on the first titul or the first
  -- compound surname.
  full_name       text                       NOT NULL,
  contract_type   beta_payroll_contract_type NOT NULL,
  -- Datum nástupu / datum ukončení. Both nullable: the office may register an
  -- employee before it has stated a start date, and an absent `ended_on` is the
  -- ordinary case for everyone still working.
  started_on      date,
  ended_on        date,
  -- Whether the row is part of the CURRENT register listing.
  --
  -- INDEPENDENT OF `ended_on`, AND THAT IS THE POINT (spec §2.6.1: the leaver's
  -- account is deactivated by one click, "never automatic — leaver needs last
  -- payslip"). A leaver keeps `active = true` for as long as the office is still
  -- producing their final výplatnice; `ended_on` is the employment fact, `active`
  -- is the office's own listing decision. Deriving either from the other here
  -- would be this database inventing an HR fact (spec §0.2), and it would make
  -- the Pro účetní warning "Zaměstnanec ukončen, účet aktivní" unstatable —
  -- that warning EXISTS precisely because the two can legitimately disagree.
  active          boolean                    NOT NULL DEFAULT true,
  -- The employee seat (spec §2.6.1): a `guest` membership whose account is
  -- linked to this row sees ONLY its own payroll.
  --
  -- THE LINK'S LIFECYCLE IS NOT THIS MIGRATION'S. Issuing the pre-bound invite,
  -- consuming it into (user + guest membership + link) in one transaction, and
  -- narrowing every payroll query through `payrollScope()` all belong to the
  -- employee-seat PR (spec §6 item 32). What ships here is the column, its
  -- foreign key and its uniqueness — so that PR is a write path and a scope
  -- narrowing rather than a migration over rows that already exist. The agent
  -- ingestion API deliberately CANNOT write this column (see
  -- `lib/data/payroll.ts`): binding a portal account to a person is not an
  -- accounting fact an office agent gets to state.
  --
  -- SET NULL rather than CASCADE: deleting the portal account must not delete
  -- the employee, whose payroll history is the office's record regardless of
  -- whether that person ever logged in.
  app_user_id     uuid                       REFERENCES app_user (id) ON DELETE SET NULL,
  -- The office payroll system's own employee id — the agent upsert match key.
  -- Same column, same semantics and same `CLIENT_FORBIDDEN_COLUMNS` entry as
  -- `filing.external_ref` (migration 0011).
  external_ref    text,
  created_at      timestamptz                NOT NULL DEFAULT now(),
  updated_at      timestamptz                NOT NULL DEFAULT now(),

  CONSTRAINT payroll_employee_full_name_present
    CHECK (length(btrim(full_name)) BETWEEN 1 AND 255),
  -- An employment cannot end before it began. The only ordering fact these two
  -- dates carry, and cheap enough to state.
  CONSTRAINT payroll_employee_employment_dates_ordered
    CHECK (started_on IS NULL OR ended_on IS NULL OR ended_on >= started_on),
  CONSTRAINT payroll_employee_external_ref_shape
    CHECK (external_ref IS NULL OR length(btrim(external_ref)) BETWEEN 1 AND 200),
  -- The target of `payroll_employee_line`'s and `document`'s composite,
  -- tenancy-carrying foreign keys — the same shape as
  -- `asset_id_organization_unique` (0008) and `document_id_organization_unique`
  -- (0005).
  CONSTRAINT payroll_employee_id_organization_unique
    UNIQUE (id, organization_id)
);

-- Spec §4: "partial unique org+app_user_id".
--
-- ONE SEAT PER ACCOUNT PER BOOK. Without it, two employee rows in one book could
-- both claim the same portal account and `payrollScope()` would have to pick one
-- — i.e. a person would see a colleague's payslips because of a data-entry
-- mistake nobody could see. Partial, because `app_user_id` is NULL for every
-- employee who has never been invited, which is most of them.
CREATE UNIQUE INDEX payroll_employee_app_user_idx
  ON payroll_employee (organization_id, app_user_id)
  WHERE app_user_id IS NOT NULL;

-- The agent upsert match key, partial for the reason 0011 gives: a row the
-- office typed by hand carries no `external_ref` and is therefore never touched
-- by an ingestion run.
CREATE UNIQUE INDEX payroll_employee_external_ref_idx
  ON payroll_employee (organization_id, external_ref)
  WHERE external_ref IS NOT NULL;

-- The Zaměstnanci listing order (spec §2.6), and the active/ended split the
-- register renders.
CREATE INDEX payroll_employee_organization_idx
  ON payroll_employee (organization_id, active, full_name);

CREATE TRIGGER payroll_employee_touch_updated_at
  BEFORE UPDATE ON payroll_employee
  FOR EACH ROW EXECUTE FUNCTION beta_touch_updated_at();

-- Reuses the generic guard 0005 defined for `filing`. An employee never changes
-- books, and there is no RLS behind this seam to catch it otherwise — which
-- matters more here than on most tables, because the row carries a name.
CREATE TRIGGER payroll_employee_freeze_organization_id
  BEFORE UPDATE ON payroll_employee
  FOR EACH ROW EXECUTE FUNCTION beta_freeze_organization_id();

-- 3. payroll_summary -----------------------------------------------------------
--
-- Přehled mezd (spec §2.6): one period's payroll totals, as the office stated
-- them. A batch payload table — see the file header for why.
--
-- EVERY FIGURE IS NULLABLE, including the ones the office almost always sends.
-- An absent total is not a zero (spec §0.4): a payroll run the office has not
-- broken down by levy must render "neuvedeno" on that line, not "0 Kč", because
-- 0 Kč of sociální pojištění is a claim about the client's obligations that this
-- product would be inventing.

CREATE TABLE payroll_summary (
  id                          uuid          PRIMARY KEY DEFAULT uuidv7(),
  organization_id             uuid          NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  import_batch_id             uuid          NOT NULL,
  -- Denormalised from the batch, as spec §4 specifies, so a period read does not
  -- have to join `import_batch`. Kept honest by
  -- `beta_import_line_requires_draft_batch` (0007), which refuses a row whose
  -- period differs from its batch's.
  period_id                   uuid          NOT NULL,
  -- Hrubé mzdy celkem.
  gross_total                 numeric(14,2),
  -- Odvody zaměstnavatele, split because spec §2.6 renders them as two lines
  -- (24,8 % sociální + 9 % zdravotní). STORED, never derived from `gross_total`
  -- — the rates are what the reader uses to check the figures, not what this
  -- database uses to produce them.
  employer_social             numeric(14,2),
  employer_health             numeric(14,2),
  -- "Celkové náklady na zaměstnance" (spec §2.6, verbatim). Never "superhrubá"
  -- — see the file header. Stored as the office stated it, not as
  -- gross + employer levies.
  employer_cost_total         numeric(14,2),
  -- Sráženo zaměstnancům (6,5 % / 7,1 % sociální + 4,5 % zdravotní), one total
  -- as spec §4 names it.
  employee_withholdings_total numeric(14,2),
  -- Záloha na daň z příjmů ze závislé činnosti.
  income_tax_advance          numeric(14,2),
  -- Advisor F14, bolded in spec §2.6 and §4: what actually LEFT the bank
  -- account. It is the one figure the client recognises from their own výpis,
  -- and it is not reconstructible from the others (srážky, exekuce and benefits
  -- all sit between gross and net), which is exactly why it is its own column.
  net_paid_total              numeric(14,2),
  -- Advisor F14's other half: the date the payroll payment is due. A date the
  -- office states, never `ends_on + 20 days` computed here — the client's own
  -- výplatní termín is a contract term this product does not hold.
  payment_due_date            date,
  -- Spec §2.6: "headcount HPP/DPČ/DPP". Three columns rather than a count over
  -- `payroll_employee_line`, because the office's stated headcount and the
  -- number of lines it sent can legitimately differ (an employee on unpaid leave
  -- has a headcount and no figures), and §0.2 says the office's number wins.
  headcount_hpp               integer,
  headcount_dpc               integer,
  headcount_dpp               integer,
  -- Spec §4 spells this `note`. Named `note_client` here because every other
  -- note in this database is one of an explicit PAIR (`note_client` /
  -- `note_internal`, see `asset` in 0008), and a bare `note` would be a third
  -- spelling whose visibility a reader has to infer. This one is the
  -- client-visible half; the office's own "why I re-imported" note lives on the
  -- batch (`import_batch.note_internal`).
  note_client                 text,
  created_at                  timestamptz   NOT NULL DEFAULT now(),
  -- No `updated_at`: a payload row is written once, inside the draft that will
  -- become a published batch, and section 5 freezes it from there. A correction
  -- is a new batch — the entire mechanism of spec §3.2.

  -- COMPOSITE, tenancy-carrying, CASCADE — the same shape and the same three
  -- reasons as `statement_line_batch_fk` (0007). A summary has no meaning apart
  -- from the batch that imported it.
  CONSTRAINT payroll_summary_batch_fk
    FOREIGN KEY (import_batch_id, organization_id)
    REFERENCES import_batch (id, organization_id)
    ON DELETE CASCADE,
  CONSTRAINT payroll_summary_period_fk
    FOREIGN KEY (period_id, organization_id)
    REFERENCES reporting_period (id, organization_id)
    ON DELETE RESTRICT,
  -- ONE SUMMARY PER BATCH. Composed with `import_batch_one_published_idx`, this
  -- is spec §4's "period_id unique" for every row a client can see.
  CONSTRAINT payroll_summary_batch_unique
    UNIQUE (import_batch_id),
  -- A headcount is a count of people. Negative is not a figure the office can
  -- have meant, and unlike a money column there is no correction month in which
  -- it could legitimately go below zero.
  CONSTRAINT payroll_summary_headcounts_nonnegative CHECK (
    (headcount_hpp IS NULL OR headcount_hpp >= 0)
    AND (headcount_dpc IS NULL OR headcount_dpc >= 0)
    AND (headcount_dpp IS NULL OR headcount_dpp >= 0)
  )
);

-- The Přehled mezd read: the summary of one period, and the 12-month trend
-- (spec §2.6) across periods.
CREATE INDEX payroll_summary_period_idx
  ON payroll_summary (organization_id, period_id);

CREATE TRIGGER payroll_summary_freeze_organization_id
  BEFORE UPDATE ON payroll_summary
  FOR EACH ROW EXECUTE FUNCTION beta_freeze_organization_id();

-- 4. payroll_employee_line -----------------------------------------------------
--
-- Spec §2.6 Zaměstnanci: "per-employee monthly lines (hrubá, srážky, čistá,
-- náklad), month picker". A batch payload table, same as the summary.
--
-- THIS IS THE TABLE THE EMPLOYEE SEAT NARROWS (spec §2.6.1, §5). Every read of
-- it goes through `payrollScope()` in `lib/data/payroll.ts`, which today answers
-- "all" for a management seat and "none" for an unlinked guest, and gains its
-- third arm — one `payroll_employee_id` — when the employee seat lands.

CREATE TABLE payroll_employee_line (
  id                  uuid          PRIMARY KEY DEFAULT uuidv7(),
  organization_id     uuid          NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  import_batch_id     uuid          NOT NULL,
  payroll_employee_id uuid          NOT NULL,
  period_id           uuid          NOT NULL,
  -- Hrubá mzda / srážky celkem / čistá mzda / náklad zaměstnavatele. All four
  -- as stated, none derived from the others — the same rule as the summary, one
  -- row per person instead of one per period.
  gross               numeric(14,2),
  deductions_total    numeric(14,2),
  net                 numeric(14,2),
  employer_cost       numeric(14,2),
  created_at          timestamptz   NOT NULL DEFAULT now(),

  CONSTRAINT payroll_employee_line_batch_fk
    FOREIGN KEY (import_batch_id, organization_id)
    REFERENCES import_batch (id, organization_id)
    ON DELETE CASCADE,
  -- RESTRICT, unlike the batch FK above: an employee who has payroll lines is a
  -- person this book has paid, and removing them out from under their own
  -- history is not a move this product offers. (Nothing deletes from
  -- `payroll_employee` today; stating it means nothing can start.)
  CONSTRAINT payroll_employee_line_employee_fk
    FOREIGN KEY (payroll_employee_id, organization_id)
    REFERENCES payroll_employee (id, organization_id)
    ON DELETE RESTRICT,
  CONSTRAINT payroll_employee_line_period_fk
    FOREIGN KEY (period_id, organization_id)
    REFERENCES reporting_period (id, organization_id)
    ON DELETE RESTRICT,
  -- ONE LINE PER EMPLOYEE PER BATCH. Composed with
  -- `import_batch_one_published_idx`, this is spec §4's "unique employee+period"
  -- for every row a client can see. Without it, a re-run of a partial import
  -- would double an employee's row inside one draft and the Zaměstnanci table
  -- would show exactly twice their salary.
  CONSTRAINT payroll_employee_line_identity_unique
    UNIQUE (import_batch_id, payroll_employee_id)
);

-- The Zaměstnanci month view: every line of one batch.
CREATE INDEX payroll_employee_line_batch_idx
  ON payroll_employee_line (import_batch_id, payroll_employee_id);

-- One person's history across periods — the per-employee read, and the one the
-- employee seat will run with a single `payroll_employee_id` bound.
CREATE INDEX payroll_employee_line_employee_idx
  ON payroll_employee_line (organization_id, payroll_employee_id, period_id);

CREATE TRIGGER payroll_employee_line_freeze_organization_id
  BEFORE UPDATE ON payroll_employee_line
  FOR EACH ROW EXECUTE FUNCTION beta_freeze_organization_id();

-- 5. Payload rows belong to a DRAFT, and to a `payroll` batch -------------------
--
-- Both guards are the ones 0007 wrote for `statement_line` and
-- `trial_balance_line`, applied to the two tables this migration adds. The first
-- function is reused verbatim (it reads only `import_batch_id` and `period_id`,
-- which both tables have); the second is new because it names a different
-- dataset.
--
-- The freeze half matters more here than anywhere else in the schema: a payslip
-- total that could be edited under a published batch would change what an
-- employee is looking at with no supersession recorded and nothing in the batch
-- history to explain it.

CREATE TRIGGER payroll_summary_requires_draft_batch
  BEFORE INSERT OR UPDATE ON payroll_summary
  FOR EACH ROW EXECUTE FUNCTION beta_import_line_requires_draft_batch();

CREATE TRIGGER payroll_employee_line_requires_draft_batch
  BEFORE INSERT OR UPDATE ON payroll_employee_line
  FOR EACH ROW EXECUTE FUNCTION beta_import_line_requires_draft_batch();

-- The payload table and the batch's `dataset` have to agree, or a rozvaha batch
-- could quietly hold payroll rows and the completeness matrix (§3.2) would
-- report a dataset the office never sent.
--
-- ONE function for both tables, unlike 0007's pair: neither of these rules needs
-- a column the other table lacks, so a single `TG_TABLE_NAME` in the message is
-- the whole difference between them.
CREATE OR REPLACE FUNCTION beta_payroll_row_matches_dataset()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  batch_dataset beta_import_dataset;
BEGIN
  SELECT b.dataset INTO batch_dataset
    FROM import_batch b
   WHERE b.id = NEW.import_batch_id;

  IF batch_dataset <> 'payroll' THEN
    RAISE EXCEPTION
      '% does not belong to a % batch (batch %)',
      TG_TABLE_NAME, batch_dataset, NEW.import_batch_id
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER payroll_summary_matches_dataset
  BEFORE INSERT OR UPDATE ON payroll_summary
  FOR EACH ROW EXECUTE FUNCTION beta_payroll_row_matches_dataset();

CREATE TRIGGER payroll_employee_line_matches_dataset
  BEFORE INSERT OR UPDATE ON payroll_employee_line
  FOR EACH ROW EXECUTE FUNCTION beta_payroll_row_matches_dataset();

-- THERE IS NO THIRD TENANCY GUARD ON `payroll_employee_line`, and that is a
-- deliberate absence rather than an omission: `payroll_employee_line_employee_fk`
-- and `payroll_employee_line_batch_fk` both carry `organization_id`, so a line
-- pointing at another book's employee or another book's batch is already
-- unrepresentable. `period_id` is the only denormalised column that needed one,
-- and `beta_import_line_requires_draft_batch` above is it.

-- 6. The foreign key migration 0004 left for this file -------------------------
--
-- Migration 0004 created `document` with `payslip_employee_id` and
-- `payslip_period_id` deliberately FK-less and said so in its own comment: "the
-- tables they point at do not exist yet — payroll_employee lands with PR 29 and
-- reporting_period with PR 16, and each of those PRs adds its own ALTER TABLE
-- document ADD CONSTRAINT ... FOREIGN KEY". Migration 0005 honoured the second
-- half (`document_payslip_period_fk`, still in place — verified). This is the
-- first half, and with it the hand-off 0004 opened is closed.
--
-- COMPOSITE, and RESTRICT, for the same two reasons `document_payslip_period_fk`
-- gives: carrying `organization_id` into the key makes a payslip stamped with
-- another organization's employee unrepresentable, and — the sharper half here —
-- an employee whose payslips are on file must not be deletable out from under
-- them. Spec §2.6.1 is explicit that a leaver keeps their documents ("a leaver
-- still needs their last payslip", 0000_init.sql §), and this is that rule at
-- the storage layer rather than in a code path someone can forget.
--
-- NOTE the columns are NOT constrained to travel together, and no CHECK ties
-- either of them to `doc_type = 'payslip'`. Spec §2.6 Podklady has the office
-- stamping docházka, nástupní dotazníky and ukončení to an employee and a month
-- — those are not payslips, and a coherence CHECK written for Výplatnice would
-- refuse them.
ALTER TABLE document
  ADD CONSTRAINT document_payslip_employee_fk
  FOREIGN KEY (payslip_employee_id, organization_id)
  REFERENCES payroll_employee (id, organization_id)
  ON DELETE RESTRICT;

-- Výplatnice per employee (spec §2.6), and the employee seat's own document
-- list. Partial: `payslip_employee_id` is NULL on every document that is not
-- stamped to a person, which is nearly all of them.
CREATE INDEX document_payslip_employee_idx
  ON document (organization_id, payslip_employee_id, payslip_period_id)
  WHERE payslip_employee_id IS NOT NULL;
