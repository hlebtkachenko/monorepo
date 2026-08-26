-- Migration 0007: the import spine — dataset batches and their payload rows.
--
-- Scope (spec `.context/beta-afframe/40-beta-structure.md` §0.2 import-first,
-- §0.4 freshness per dataset, §3.2 Měsíční uzávěrka publish semantics, §4 data
-- model; Advisor `34-advisor-part5.md` F7/F8 statement fidelity, F10 batch
-- semantics, F24 freshness):
--
--   import_batch        one office-fed dataset for one period, in one of three
--                       states: draft → published → superseded
--   statement_line      rozvaha (aktiva + pasiva) and VZZ rows, with the FIVE
--                       statutory value columns of the ColKey model
--   trial_balance_line  obratová předvaha, account-keyed
--
-- WHY BATCHES EXIST AT ALL. Spec §0.2 makes every number in this product
-- office-provided, and §3.2 makes the month-end publish the ritual that provides
-- them. A dataset that was simply UPSERTed per period would have no answer to
-- the two questions the office actually asks — "what did the client see before I
-- re-imported?" and "undo that" — and a half-finished import would be visible to
-- the client the moment its first row landed. A batch is the unit that makes an
-- import atomic from the reader's point of view: rows accumulate in a `draft`
-- nobody reads, and ONE statement flips which batch the whole product means by
-- "the rozvaha for 07/2026".
--
-- THE INVARIANT THIS FILE EXISTS TO ENFORCE (spec §3.2): at most ONE published
-- batch per (organization, period, dataset). It is a partial unique index, not
-- an application rule — see `import_batch_one_published_idx`. Two offices (or
-- two tabs, or the agent and a human) publishing the same key concurrently is a
-- race the database resolves, not one the caller has to remember to handle.
--
-- WHAT THIS FILE DOES NOT DO. It computes nothing. Every `numeric(14,2)` below
-- is a figure the office's own software produced and the agent ingestion API of
-- PR 24 handed over verbatim (spec §0.2: "the portal never derives an accounting
-- fact"). There is no total, no cross-foot, no netto = brutto − korekce
-- derivation: the statutory netto column is STORED as imported, because the
-- office's software is the authority on it and a portal that recomputed it would
-- eventually disagree with the PDF the client was sent.
--
-- Money precision is `numeric(14,2)`, deliberately diverging from the main app's
-- `numeric(19,4)` / `Money<Currency>` rule (spec §0.7). Do not "fix" it.
--
-- Requires PostgreSQL 18+: `uuidv7()`.
--
-- NO `BEGIN;` / `COMMIT;` in this file — see the header of 0000_init.sql.

-- 1. Enums ---------------------------------------------------------------------

-- The datasets that arrive as BATCHES. Spec §4 names exactly these five.
--
-- All five are declared now and only three are implemented in this PR: §3.2
-- makes the publish contract the deep investment, and a dataset added to the
-- enum later is an `ALTER TYPE` that every partial index and every read model
-- has to be re-reasoned against. Declaring the axis once means PR 27
-- (saldokonto) and PR 29 (payroll) add a table and a write path, not a new
-- publish semantic.
--
--   predvaha    obratová předvaha → trial_balance_line          (HERE)
--   rozvaha     rozvaha aktiva + pasiva → statement_line        (HERE)
--   vzz         výkaz zisku a ztráty → statement_line           (HERE)
--   saldokonto  per-partner receivables/payables → partner_saldo (PR 27)
--   payroll     payroll_summary + payroll_employee_line          (PR 29)
--
-- NOT here, on purpose: filings, liabilities, client tasks, assets, indicators
-- and the account_balance_map. Spec §3.2 lists them as ingestion ENDPOINTS, but
-- none of them is a period-versioned snapshot — they are registries the office
-- edits row by row, and a batch wrapper around an UPSERT would give them a
-- publish state nobody can act on.
CREATE TYPE beta_import_dataset AS ENUM (
  'predvaha',
  'rozvaha',
  'vzz',
  'saldokonto',
  'payroll'
);

-- Spec §3.2: "draft → published → superseded batches".
--
-- `superseded` is not "deleted": the office's answer to "what did the client see
-- last month before the correction?" is the superseded batch, still whole, still
-- queryable. Nothing in this product hard-deletes a published batch.
CREATE TYPE beta_import_status AS ENUM ('draft', 'published', 'superseded');

-- Who fed the batch (spec §3.2: "Feeding channel = accountant-side agent" with a
-- "manual file-drop fallback ... for when the agent is unavailable").
--
-- Recorded because the two have different failure modes and the completeness
-- matrix in Pro účetní has to be able to say which one produced a period: an
-- agent-fed batch that looks wrong is a bug in the office agent, a manual one is
-- a mapping mistake, and the office triages them differently.
CREATE TYPE beta_import_source AS ENUM ('agent', 'manual');

-- The three statutory statements, spelled as spec §4 spells them.
--
-- Aktiva and pasiva are SEPARATE kinds rather than one `rozvaha` with a side
-- flag, because they do not share a column shape: aktiva carries
-- brutto/korekce/netto/minule and pasiva carries bezne/minule (verified against
-- the monorepo's own builder, `apps/web/app/vykazy/_lib/types.ts` — the ColKey
-- union). One kind with a flag would make `statement_line_column_shape` below
-- unstatable.
CREATE TYPE beta_statement_kind AS ENUM (
  'rozvaha_aktiva',
  'rozvaha_pasiva',
  'vzz'
);

-- 2. import_batch --------------------------------------------------------------

CREATE TABLE import_batch (
  id                     uuid                PRIMARY KEY DEFAULT uuidv7(),
  organization_id        uuid                NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  period_id              uuid                NOT NULL,
  -- Spec §4 spells this column `kind`. It is `dataset` here because a batch
  -- query already joins `statement_line.statement_kind` and reaches
  -- `filing.kind` in the same read model, and three columns called `kind` in
  -- one statement is how the wrong one ends up in a WHERE clause. The spec's
  -- own freshness contract (§0.4) says "per DATASET"; this is that word.
  dataset                beta_import_dataset NOT NULL,
  status                 beta_import_status  NOT NULL DEFAULT 'draft',
  source                 beta_import_source  NOT NULL,
  -- Provenance of a manual file drop. NULL for an agent-fed batch, which has no
  -- file: the office agent reads Money S3 on the office side and posts rows
  -- (spec §3.2, "the former hard input is void").
  filename               text,
  sha256                 char(64),
  -- Payload size as WRITTEN, maintained by the write path in the same
  -- transaction as the rows. Not a trigger-maintained counter: the rows of a
  -- published batch are frozen (section 5), so this number cannot drift after
  -- the one transaction that sets it, and a counter trigger would fire once per
  -- line of a 300-row předvaha to compute a constant.
  row_count              integer             NOT NULL DEFAULT 0,
  -- The office mapping used by a manual CSV drop (spec §4). Office-internal;
  -- never projected to a client.
  mapping                jsonb,
  -- Office-internal note — "why I re-imported". Named to match
  -- `filing.note_internal`, and on CLIENT_FORBIDDEN_COLUMNS for the same reason.
  note_internal          text,
  imported_by_user_id    uuid                REFERENCES app_user (id) ON DELETE SET NULL,
  imported_at            timestamptz         NOT NULL DEFAULT now(),
  -- The §0.4 freshness stamp of this dataset. NULL until the batch is published,
  -- and CLEARED again by a rollback: "empty beats stale" means a dataset with no
  -- published batch must have no as-of date, not a stale one.
  published_at           timestamptz,
  published_by_user_id   uuid                REFERENCES app_user (id) ON DELETE SET NULL,
  superseded_at          timestamptz,
  -- The FORWARD pointer of spec §4 (`superseded_by_batch_id`): "the batch that
  -- replaced me". Rollback walks it BACKWARDS — the predecessor of the current
  -- published batch is the row that points at it — which is well-defined
  -- because `import_batch_supersession_injective_idx` below makes at most one
  -- row point at any batch.
  superseded_by_batch_id uuid,
  created_at             timestamptz         NOT NULL DEFAULT now(),
  updated_at             timestamptz         NOT NULL DEFAULT now(),
  -- COMPOSITE, tenancy-carrying, RESTRICT — the same three reasons as
  -- `filing_period_fk` in 0005: referential integrity says nothing about
  -- tenancy, so `organization_id` rides in the key and a batch stamped with
  -- another organization's period becomes unrepresentable; and a period that
  -- anything has been stamped with must not be deletable out from under it.
  CONSTRAINT import_batch_period_fk
    FOREIGN KEY (period_id, organization_id)
    REFERENCES reporting_period (id, organization_id)
    ON DELETE RESTRICT,
  -- The target of the two payload tables' composite FKs, and of this table's own
  -- supersession FK below.
  CONSTRAINT import_batch_id_organization_unique UNIQUE (id, organization_id),
  -- Self-reference, composite for the same tenancy reason: a batch must not be
  -- able to claim it was superseded by another organization's batch.
  --
  -- NO `ON DELETE` ACTION, and that is load-bearing rather than an omission.
  -- Deleting an organization CASCADEs into this table and removes the whole
  -- chain in one command; `RESTRICT` is checked immediately and would refuse
  -- that delete (the referenced row is still there when the referencing row
  -- goes), while the default NO ACTION is checked at the end of the statement,
  -- by which time both rows are gone. `SET NULL` would be worse still: it would
  -- leave a `superseded` row with no superseder and violate the coherence CHECK
  -- below. NO ACTION is the only one of the four that is right here.
  CONSTRAINT import_batch_supersession_fk
    FOREIGN KEY (superseded_by_batch_id, organization_id)
    REFERENCES import_batch (id, organization_id),
  CONSTRAINT import_batch_no_self_supersession
    CHECK (superseded_by_batch_id IS NULL OR superseded_by_batch_id <> id),
  CONSTRAINT import_batch_sha256_hex
    CHECK (sha256 IS NULL OR sha256 ~ '^[0-9a-f]{64}$'),
  CONSTRAINT import_batch_row_count_nonnegative
    CHECK (row_count >= 0),
  -- A manual batch came from a file; an agent batch did not. Stated so the
  -- completeness matrix (§3.2) can trust `source` instead of sniffing whether a
  -- filename happens to be set.
  CONSTRAINT import_batch_manual_has_filename
    CHECK ((source = 'manual') OR (filename IS NULL AND sha256 IS NULL)),
  -- The three states, spelled out. Without this, a rollback that forgot to clear
  -- `published_at` would leave a draft carrying a publication date — and the
  -- §0.4 freshness read, which is `max(published_at)`, would keep stamping the
  -- surface with an import nobody can see any more. That is the exact
  -- confidently-wrong failure the batch model exists to prevent.
  CONSTRAINT import_batch_status_coherence CHECK (
    CASE status
      WHEN 'draft' THEN
        published_at IS NULL
        AND published_by_user_id IS NULL
        AND superseded_at IS NULL
        AND superseded_by_batch_id IS NULL
      WHEN 'published' THEN
        published_at IS NOT NULL
        AND superseded_at IS NULL
        AND superseded_by_batch_id IS NULL
      WHEN 'superseded' THEN
        published_at IS NOT NULL
        AND superseded_at IS NOT NULL
        AND superseded_by_batch_id IS NOT NULL
    END
  )
);

-- THE CORE INVARIANT (spec §3.2: "one published per (org, period, kind)").
--
-- A partial unique index rather than an application check, because the thing it
-- prevents is a RACE: two publishes of the same key, from two connections, both
-- reading "nothing published yet" before either writes. The write path takes an
-- explicit row lock so that the ordinary concurrent case serialises into a clean
-- supersession instead of an error (see lib/data/imports.ts), but the lock is an
-- optimisation of the failure MESSAGE — this index is what makes two published
-- batches for one key impossible, including for a future caller that forgets the
-- lock.
CREATE UNIQUE INDEX import_batch_one_published_idx
  ON import_batch (organization_id, period_id, dataset)
  WHERE status = 'published';

-- Supersession is INJECTIVE: at most one batch is superseded BY any given batch.
--
-- That is what makes the backward walk rollback needs — "which batch did the
-- current published one replace?" — a function rather than a guess. It holds
-- naturally, because a publish supersedes only the single row the index above
-- allows to be published; this states it so a future write path cannot quietly
-- fan the chain out and leave rollback picking one predecessor at random.
CREATE UNIQUE INDEX import_batch_supersession_injective_idx
  ON import_batch (superseded_by_batch_id)
  WHERE superseded_by_batch_id IS NOT NULL;

-- Batch history for one dataset of one organization (spec §3.2 "batch history").
CREATE INDEX import_batch_organization_dataset_idx
  ON import_batch (organization_id, dataset, period_id);

-- The completeness matrix and the §0.4 freshness read: newest publication per
-- dataset.
CREATE INDEX import_batch_published_idx
  ON import_batch (organization_id, dataset, published_at DESC)
  WHERE status = 'published';

CREATE TRIGGER import_batch_touch_updated_at
  BEFORE UPDATE ON import_batch
  FOR EACH ROW EXECUTE FUNCTION beta_touch_updated_at();

-- A batch never changes books. Same floor as `filing_freeze_organization_id`
-- (0005 §3): there is no RLS in this database, so the tenant column is guarded
-- by the application seam alone and this is the backstop for the one write that
-- would move a row across the wall rather than merely read across it.
CREATE TRIGGER import_batch_freeze_organization_id
  BEFORE UPDATE ON import_batch
  FOR EACH ROW EXECUTE FUNCTION beta_freeze_organization_id();

-- The identity of a batch is frozen too, and for a sharper reason than tenancy:
-- `dataset` and `period_id` are what the partial unique index above is computed
-- over. Re-pointing a PUBLISHED batch at another period would move it out from
-- under the index without any supersession being recorded — two batches could
-- then be published for one key with no constraint ever having been violated.
CREATE OR REPLACE FUNCTION beta_import_batch_freeze_identity()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.period_id <> OLD.period_id OR NEW.dataset <> OLD.dataset THEN
    RAISE EXCEPTION
      'import_batch identity (period, dataset) is immutable (batch %)', OLD.id
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER import_batch_freeze_identity
  BEFORE UPDATE ON import_batch
  FOR EACH ROW EXECUTE FUNCTION beta_import_batch_freeze_identity();

-- 3. statement_line ------------------------------------------------------------
--
-- The rozvaha and the výkaz zisku a ztráty, one row per řádek of the statutory
-- form (vyhláška č. 500/2002 Sb.).
--
-- THE FIVE VALUE COLUMNS ARE THE POINT (Advisor F7/F8, binding). An earlier
-- draft of this schema had `value_current` / `value_previous`, and that shape
-- cannot hold a Czech rozvaha at all: aktiva is printed in FOUR columns — brutto,
-- korekce, netto, minulé období — and pasiva in two. Storing netto alone loses
-- the oprávky the client's auditor asks about; storing "current" loses which of
-- the four it was. So all five ColKey columns exist and each statement kind
-- fills its own, enforced by `statement_line_column_shape` below.
--
-- `value_netto` IS STORED, not derived. It is arithmetically brutto − korekce,
-- and this application still does not compute it (spec §0.2): the office's own
-- software printed a number into that column and that number is what the client
-- is entitled to see. A derived netto would silently "correct" a source the
-- portal is not the authority on.
--
-- EVERY VALUE COLUMN IS NULLABLE, including the ones its kind uses. A blank cell
-- on a statutory form is not a zero — §0.4's "empty beats stale" applies at cell
-- granularity — and the rozvaha's own korekce column is printed as "x" (not
-- applicable) on many lines.
CREATE TABLE statement_line (
  id              uuid                PRIMARY KEY DEFAULT uuidv7(),
  organization_id uuid                NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  import_batch_id uuid                NOT NULL,
  statement_kind  beta_statement_kind NOT NULL,
  -- Denormalised from the batch, as spec §4 specifies, so a period read does not
  -- have to join `import_batch`. Kept honest by
  -- `beta_import_line_requires_draft_batch`, which refuses a line whose period
  -- differs from its batch's — the one thing a denormalised column can get wrong.
  period_id       uuid                NOT NULL,
  -- Označení, column (a) of the printed form: "B.II.", "A.1.", "*", "**",
  -- "***", or blank on a spacer row. Nullable because blank is a legitimate
  -- value there.
  ozn             varchar(16),
  -- Číslo řádku, unique within one statement of one batch. The form's own
  -- identifier for a line — "001".."100" — and therefore the join key any
  -- period-over-period comparison in Výkazy (PR 25) uses. Text, not an integer:
  -- the printed form zero-pads and a future form may not be purely numeric.
  row_code        varchar(10)         NOT NULL,
  -- Column (b): the Czech label as printed. Stored rather than looked up from a
  -- form taxonomy, because the batch has to render exactly what the office
  -- published even after the vyhláška's wording changes.
  row_label       text                NOT NULL,
  sort_order      integer             NOT NULL,
  indent          smallint            NOT NULL DEFAULT 0,
  is_bold         boolean             NOT NULL DEFAULT false,
  value_brutto    numeric(14,2),
  value_korekce   numeric(14,2),
  value_netto     numeric(14,2),
  value_bezne     numeric(14,2),
  value_minule    numeric(14,2),
  created_at      timestamptz         NOT NULL DEFAULT now(),
  -- No `updated_at`: a line is written once, inside the draft that will become a
  -- published batch, and section 5 freezes it from there. A correction is a new
  -- batch, which is the entire mechanism of §3.2.
  --
  -- CASCADE, unlike every other FK in this schema. A statement line has no
  -- meaning apart from the batch that imported it — it is not a record that
  -- survives its source the way a filing survives its attachment — so a deleted
  -- draft takes its rows with it in one statement rather than leaving orphans
  -- for a later sweep.
  CONSTRAINT statement_line_batch_fk
    FOREIGN KEY (import_batch_id, organization_id)
    REFERENCES import_batch (id, organization_id)
    ON DELETE CASCADE,
  CONSTRAINT statement_line_period_fk
    FOREIGN KEY (period_id, organization_id)
    REFERENCES reporting_period (id, organization_id)
    ON DELETE RESTRICT,
  CONSTRAINT statement_line_row_code_present
    CHECK (btrim(row_code) <> ''),
  CONSTRAINT statement_line_indent_range
    CHECK (indent BETWEEN 0 AND 8),
  -- One line per řádek per statement per batch. Without it a re-run of a partial
  -- import would double every row of a draft and the totals the client reads
  -- would be exactly twice the truth.
  CONSTRAINT statement_line_identity_unique
    UNIQUE (import_batch_id, statement_kind, row_code),
  -- ADVISOR F7/F8, IN THE DATABASE. Aktiva is the only kind with a
  -- brutto/korekce/netto triplet; pasiva and VZZ are two-column statements. A
  -- row that carried both shapes would render a rozvaha pasiva with a korekce
  -- column that does not exist on the form.
  CONSTRAINT statement_line_column_shape CHECK (
    CASE statement_kind
      WHEN 'rozvaha_aktiva' THEN value_bezne IS NULL
      ELSE value_brutto IS NULL
       AND value_korekce IS NULL
       AND value_netto IS NULL
    END
  )
);

-- The read path of Výkazy (PR 25): every line of one statement of one batch, in
-- printed order.
CREATE INDEX statement_line_batch_idx
  ON statement_line (import_batch_id, statement_kind, sort_order);

CREATE TRIGGER statement_line_freeze_organization_id
  BEFORE UPDATE ON statement_line
  FOR EACH ROW EXECUTE FUNCTION beta_freeze_organization_id();

-- 4. trial_balance_line --------------------------------------------------------
--
-- Obratová předvaha (spec §2.5): účet, název, počáteční stav, obraty MD/D,
-- konečný zůstatek. Account-keyed rather than form-keyed, which is why it is its
-- own table and not a fourth `statement_kind` (Advisor F7): a předvaha has no
-- ozn, no row order imposed by a vyhláška and no brutto/korekce pair — it has an
-- account number, and the account number is its identity.
--
-- IT IS ALSO THE FEEDER FOR Finance › Účty a hotovost (spec §2.4): the balances
-- of účty 211/221 are read from here through `account_balance_map` (PR 26), so
-- the office types no bank balance anywhere. "Zero extra entry" is only true if
-- this table holds the closing balance verbatim.
CREATE TABLE trial_balance_line (
  id               uuid        PRIMARY KEY DEFAULT uuidv7(),
  organization_id  uuid        NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  import_batch_id  uuid        NOT NULL,
  period_id        uuid        NOT NULL,
  -- Syntetický nebo analytický účet as the office's software spells it: "211",
  -- "221", "311100", "343.01". Deliberately NOT constrained to digits — Czech
  -- účtové rozvrhy carry analytics with separators, and a CHECK that guessed
  -- wrong would refuse a real client's real předvaha at month end, which is the
  -- worst possible moment for this product to be clever.
  account_code     varchar(20) NOT NULL,
  account_name     text        NOT NULL,
  -- Počáteční stav / obraty MD a D / konečný zůstatek, all as imported. Nullable
  -- because a předvaha may omit a column, and an omitted column is not a zero
  -- (§0.4).
  opening_balance  numeric(14,2),
  turnover_debit   numeric(14,2),
  turnover_credit  numeric(14,2),
  closing_balance  numeric(14,2),
  created_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT trial_balance_line_batch_fk
    FOREIGN KEY (import_batch_id, organization_id)
    REFERENCES import_batch (id, organization_id)
    ON DELETE CASCADE,
  CONSTRAINT trial_balance_line_period_fk
    FOREIGN KEY (period_id, organization_id)
    REFERENCES reporting_period (id, organization_id)
    ON DELETE RESTRICT,
  CONSTRAINT trial_balance_line_account_code_present
    CHECK (btrim(account_code) <> ''),
  -- Spec §4: "unique org+batch+account".
  CONSTRAINT trial_balance_line_identity_unique
    UNIQUE (organization_id, import_batch_id, account_code)
);

CREATE INDEX trial_balance_line_batch_idx
  ON trial_balance_line (import_batch_id, account_code);

-- The PR 26 read: one account's balance across periods, for the Účty sparkline.
CREATE INDEX trial_balance_line_account_idx
  ON trial_balance_line (organization_id, account_code, period_id);

CREATE TRIGGER trial_balance_line_freeze_organization_id
  BEFORE UPDATE ON trial_balance_line
  FOR EACH ROW EXECUTE FUNCTION beta_freeze_organization_id();

-- 5. Payload rows belong to a DRAFT ---------------------------------------------
--
-- A published batch is what the client is looking at. If a row could be inserted
-- into it or edited under it, "published" would stop meaning anything: the
-- rozvaha on screen would change with no supersession recorded, no new
-- `published_at`, and nothing in the batch history to explain it — spec §0.4's
-- confidently-wrong data, produced by the one mechanism built to prevent it.
--
-- A correction is a NEW batch, published over the old one. That is the whole of
-- §3.2, and this trigger is what makes it the only available move.
--
-- INSERT AND UPDATE ONLY, DELIBERATELY. A DELETE guard would have to answer what
-- happens when the batch row is disappearing in the same command (an
-- organization cascade), where the lookup below finds nothing; the honest arm is
-- "let it through", which is most of the guard gone anyway. Deleting a published
-- batch's lines without deleting the batch is not reachable from any code path —
-- `deleteDraftBatch` filters on `status = 'draft'` and nothing else deletes here
-- — and buying that hypothetical would cost a trigger that can break "Smazat
-- organizaci" (§2.10). The row_count column is safe either way: it is written
-- once, in the same transaction as the rows.
CREATE OR REPLACE FUNCTION beta_import_line_requires_draft_batch()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  batch record;
BEGIN
  SELECT b.status, b.period_id
    INTO batch
    FROM import_batch b
   WHERE b.id = NEW.import_batch_id;

  IF NOT FOUND THEN
    -- Unreachable behind the composite FK; stated rather than assumed, because
    -- a silent pass here would be a hole in the freeze above.
    RAISE EXCEPTION
      '%: import batch % does not exist', TG_TABLE_NAME, NEW.import_batch_id
      USING ERRCODE = 'check_violation';
  END IF;

  IF batch.status <> 'draft' THEN
    RAISE EXCEPTION
      '% rows are frozen once the batch leaves draft (batch %, status %)',
      TG_TABLE_NAME, NEW.import_batch_id, batch.status
      USING ERRCODE = 'check_violation';
  END IF;

  -- The floor under the denormalised `period_id`. Both FKs carry
  -- `organization_id`, so a line can only reference a period of its own
  -- organization — but nothing stops it referencing the WRONG period of that
  -- organization, and a rozvaha row stamped 06/2026 inside the 07/2026 batch
  -- would surface under whichever period the reader happened to query by.
  IF NEW.period_id <> batch.period_id THEN
    RAISE EXCEPTION
      '%.period_id must equal its batch period (batch %)',
      TG_TABLE_NAME, NEW.import_batch_id
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER statement_line_requires_draft_batch
  BEFORE INSERT OR UPDATE ON statement_line
  FOR EACH ROW EXECUTE FUNCTION beta_import_line_requires_draft_batch();

CREATE TRIGGER trial_balance_line_requires_draft_batch
  BEFORE INSERT OR UPDATE ON trial_balance_line
  FOR EACH ROW EXECUTE FUNCTION beta_import_line_requires_draft_batch();

-- The payload table and the batch's `dataset` have to agree, or a předvaha batch
-- could quietly hold rozvaha rows and the Výkazy period picker — which lists
-- published periods PER STATEMENT KIND (§2.5) — would offer a rozvaha that the
-- completeness matrix reports as a předvaha.
--
-- Two functions rather than one with a `TG_TABLE_NAME` switch: each states one
-- rule, and neither has to reference a column the other table does not have.
CREATE OR REPLACE FUNCTION beta_statement_line_matches_dataset()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  batch_dataset beta_import_dataset;
BEGIN
  SELECT b.dataset INTO batch_dataset
    FROM import_batch b
   WHERE b.id = NEW.import_batch_id;

  IF NOT (
    (batch_dataset = 'rozvaha' AND NEW.statement_kind IN ('rozvaha_aktiva', 'rozvaha_pasiva'))
    OR (batch_dataset = 'vzz' AND NEW.statement_kind = 'vzz')
  ) THEN
    RAISE EXCEPTION
      'statement_kind % does not belong to a % batch (batch %)',
      NEW.statement_kind, batch_dataset, NEW.import_batch_id
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER statement_line_matches_dataset
  BEFORE INSERT OR UPDATE ON statement_line
  FOR EACH ROW EXECUTE FUNCTION beta_statement_line_matches_dataset();

CREATE OR REPLACE FUNCTION beta_trial_balance_line_matches_dataset()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  batch_dataset beta_import_dataset;
BEGIN
  SELECT b.dataset INTO batch_dataset
    FROM import_batch b
   WHERE b.id = NEW.import_batch_id;

  IF batch_dataset <> 'predvaha' THEN
    RAISE EXCEPTION
      'trial_balance_line does not belong to a % batch (batch %)',
      batch_dataset, NEW.import_batch_id
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trial_balance_line_matches_dataset
  BEFORE INSERT OR UPDATE ON trial_balance_line
  FOR EACH ROW EXECUTE FUNCTION beta_trial_balance_line_matches_dataset();
