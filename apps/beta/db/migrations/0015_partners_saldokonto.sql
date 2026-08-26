-- Migration 0015: the partner registry and the saldokonto dataset behind
-- Finance › Pohledávky a závazky.
--
-- Scope (spec `.context/beta-afframe/40-beta-structure.md` §2.4 "Pohledávky a
-- závazky" + "Dluhy a platby", §3.2 the saldokonto ingestion dataset, §4 data
-- model):
--
--   partner        the counterparty registry — auto-fed from the saldokonto
--                  import, edited by the office, ARES-prefilled later (PR 29)
--   partner_saldo  one partner's receivable / payable totals for ONE published
--                  period, carried by an `import_batch` like every other
--                  office-fed dataset
--   document.partner_id / liability.partner_id — the nullable links spec §4
--                  puts in this migration's own bullet
--
-- SALDOKONTO IS A BATCH DATASET, NOT AN UPSERT. Spec §4 already lists
-- `saldokonto` among `import_batch.kind`'s five values and 0007 declared it
-- there; §3.2's publish semantics ("draft → published → superseded batches, one
-- published per (org, period, kind), atomic, idempotent, rollback") are
-- therefore the contract this table inherits, and it inherits it by carrying an
-- `import_batch_id` exactly as `statement_line` and `trial_balance_line` do.
-- The alternative — upserting a partner's saldo in place, per period — would
-- have no answer to "what did the client see before the correction?" and no
-- rollback, which is the whole reason the spine exists.
--
-- `partner` IS NOT PART OF THE BATCH, and the split is the point. A saldo row is
-- a MEASUREMENT of one period and is superseded wholesale when the office
-- re-publishes; a partner is an IDENTITY that outlives every period it appears
-- in, carries office-typed notes and (PR 29) an ARES stamp. Putting the identity
-- inside the batch would delete the office's own edits every time a month was
-- re-imported. So the import upserts identities and publishes measurements, and
-- only the measurements are versioned.
--
-- WHAT THIS FILE DOES NOT DO. It computes nothing (spec §0.2). `receivable_
-- total`, `payable_total` and `oldest_due` are figures the office's own
-- saldokonto produced; there is no netting of the two sides, no ageing column
-- and no "days overdue" — the aging bucket Pohledávky renders is derived at read
-- time from `oldest_due` against CURRENT_DATE, the same way §2.4's "Po
-- splatnosti" is, and must never become a stored column that goes wrong at
-- midnight.
--
-- Money precision is `numeric(14,2)` (spec §0.7). Requires PostgreSQL 18+:
-- `uuidv7()`.
--
-- NO `BEGIN;` / `COMMIT;` in this file — see the header of 0000_init.sql.

-- 1. Enums ---------------------------------------------------------------------

-- Spec §4's `partner_role`, and §2.4's Partneři column "role".
--
-- English identifiers, like `beta_asset_category` and unlike `beta_filing_kind`:
-- this is a classification this application invented, not the legal name of a
-- document. Czech labels live in `messages/cs.json` via `lib/partner-labels.ts`.
--
-- `both` exists because it is the ordinary case in construction — the same
-- company supplies material on one site and buys work on another — and a
-- registry that forced a choice would make the Pohledávky page's two columns
-- disagree with the role chip beside them.
CREATE TYPE beta_partner_role AS ENUM (
  'supplier',
  'customer',
  'both',
  'other'
);

-- Spec §4, verbatim: "source manual|saldokonto".
--
-- It records the row's ORIGIN and is frozen (trigger below). A partner the
-- office typed by hand and a partner the import created are different in one way
-- that matters operationally — the second one will be re-stated by every future
-- import and the first one never will — and an origin that changed under an
-- import would make "where did this row come from?" unanswerable.
CREATE TYPE beta_partner_source AS ENUM ('manual', 'saldokonto');

-- 2. partner -------------------------------------------------------------------
--
-- Spec §4: "partner (org, name, ico, dic, partner_role, email, phone, street,
-- house_number, orientation_number, city, postal_code, country_code,
-- legal_form_csu_code, registry_file_number, ares_fetched_at, note_client,
-- note_internal, source manual|saldokonto)".
--
-- The address is DECOMPOSED, mirroring `organization`'s own registered address
-- (0000): a Czech address is street / číslo popisné / číslo orientační / obec /
-- PSČ and cannot be validated or ARES-matched once it has been joined into one
-- line. `lib/format/identity.ts` is where the parts become a printed address.
CREATE TABLE partner (
  id                     uuid                PRIMARY KEY DEFAULT uuidv7(),
  organization_id        uuid                NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  name                   text                NOT NULL,
  -- IČO / DIČ as the office states them. Both nullable: a foreign supplier has
  -- neither, a natural person may have neither, and §0.4's "empty beats stale"
  -- applies at field granularity.
  ico                    varchar(8),
  dic                    varchar(14),
  partner_role           beta_partner_role   NOT NULL DEFAULT 'other',
  email                  text,
  phone                  text,
  street                 text,
  house_number           varchar(16),
  orientation_number     varchar(16),
  city                   text,
  -- varchar(10) and no regex, matching `organization.registered_postal_code`:
  -- a foreign partner's postal code is legitimately not five Czech digits.
  postal_code            varchar(10),
  country_code           char(2)             NOT NULL DEFAULT 'CZ',
  -- ČSÚ právní forma code and the spisová značka, both as ARES states them
  -- (PR 29 fills these; nothing writes them here).
  legal_form_csu_code    varchar(4),
  registry_file_number   text,
  -- The §2.10 ARES cache stamp, per partner. NULL until PR 29's batch prefill.
  ares_fetched_at        timestamptz,
  -- Client-visible note. Rendered on the Partneři detail (PR 29).
  note_client            text,
  -- Office-internal note (§2.4: "client-visible note (internal note
  -- office-only)"). NEVER serialized to a client — `note_internal` is already on
  -- CLIENT_FORBIDDEN_COLUMNS.
  note_internal          text,
  source                 beta_partner_source NOT NULL DEFAULT 'manual',
  -- The office system's own id — the upsert match key, exactly as on filing /
  -- liability / asset / client_task (0011 §4). See the ingest's own header for
  -- the match ORDER (external_ref, then IČO, and never a name).
  external_ref           text,
  created_at             timestamptz         NOT NULL DEFAULT now(),
  -- The §2.4 freshness stamp of the registry itself, distinct from the saldo
  -- batch's `published_at`.
  updated_at             timestamptz         NOT NULL DEFAULT now(),

  -- The target of `partner_saldo`'s, `document`'s and `liability`'s composite,
  -- tenancy-carrying FKs below.
  CONSTRAINT partner_id_organization_unique UNIQUE (id, organization_id),
  CONSTRAINT partner_name_present
    CHECK (length(btrim(name)) BETWEEN 1 AND 255),
  -- Eight digits, like `organization.ico`. A malformed IČO is refused rather
  -- than stored, because it is a MATCH KEY (see the unique index below): a
  -- seven-digit value that the office's export left unpadded would create a
  -- second partner for a company that already has one.
  CONSTRAINT partner_ico_shape
    CHECK (ico IS NULL OR ico ~ '^[0-9]{8}$'),
  -- `dic` is deliberately NOT regex-constrained, exactly as
  -- `organization.dic` is not: a foreign partner's VAT id is legitimately
  -- non-CZ-shaped, and a CHECK that guessed wrong would refuse a real supplier.
  CONSTRAINT partner_country_code_shape
    CHECK (country_code ~ '^[A-Z]{2}$'),
  CONSTRAINT partner_external_ref_shape
    CHECK (external_ref IS NULL OR length(btrim(external_ref)) BETWEEN 1 AND 200)
);

-- Partial unique, same contract as `filing_external_ref_idx` (0011): rows the
-- office typed by hand keep `external_ref IS NULL` and are never claimed by an
-- import run.
CREATE UNIQUE INDEX partner_external_ref_idx
  ON partner (organization_id, external_ref)
  WHERE external_ref IS NOT NULL;

-- ONE IČO, ONE PARTNER, per book.
--
-- This is a genuine natural key rather than a content-matching heuristic: an
-- IČO identifies a legal person, so two partners carrying the same one in the
-- same book ARE the same counterparty and their saldi must not be split across
-- two rows of Pohledávky. It is also what lets an import ADOPT a partner the
-- office typed by hand — see the ingest's match order — instead of shadowing it
-- with a duplicate.
--
-- A NAME IS DELIBERATELY NOT UNIQUE and is never a match key. Two real
-- counterparties can share a name, one counterparty is spelled three ways across
-- exports, and a merge on either would be the read model guessing at identity —
-- the same rule `lib/data/agent-ingest.ts` states for every other registry.
CREATE UNIQUE INDEX partner_ico_idx
  ON partner (organization_id, ico)
  WHERE ico IS NOT NULL;

-- The Partneři list (PR 29) and the saldo join's own ordering.
CREATE INDEX partner_organization_name_idx ON partner (organization_id, name);

CREATE TRIGGER partner_touch_updated_at
  BEFORE UPDATE ON partner
  FOR EACH ROW EXECUTE FUNCTION beta_touch_updated_at();

-- A partner never changes books. Same floor as every other org-scoped table:
-- there is no RLS in this database, so the tenant column is guarded by the
-- application seam alone and this is the backstop for the one write that would
-- move a row across the wall rather than merely read across it.
CREATE TRIGGER partner_freeze_organization_id
  BEFORE UPDATE ON partner
  FOR EACH ROW EXECUTE FUNCTION beta_freeze_organization_id();

-- `source` is the row's ORIGIN and is immutable — see the enum's comment.
CREATE OR REPLACE FUNCTION beta_partner_freeze_source()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.source <> OLD.source THEN
    RAISE EXCEPTION 'partner.source records the row origin and is immutable (partner %)',
      OLD.id
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER partner_freeze_source
  BEFORE UPDATE ON partner
  FOR EACH ROW EXECUTE FUNCTION beta_partner_freeze_source();

-- 3. partner_saldo -------------------------------------------------------------
--
-- Spec §4: "partner_saldo (org, partner, period_id, receivable_total,
-- payable_total, oldest_due)", plus the `import_batch_id` the batch contract
-- requires (section 0 of this header).
--
-- WHAT THE THREE FIGURES MEAN, exactly as the office's saldokonto states them:
--   receivable_total  what this partner owes the client  ("dlužné nám", §2.4)
--   payable_total     what the client owes this partner  ("dlužíme")
--   oldest_due        the oldest unpaid splatnost among this partner's open
--                     items — ONE date, as spec §4 names it, covering whichever
--                     side is older. It is the splatnost the `dodavatele` arm of
--                     the obligations read model (§2.4) shows for a payable, and
--                     for a partner who is both customer and supplier it may be
--                     the older RECEIVABLE's date. The spec models one column and
--                     this follows it; the office agent decides what it means by
--                     "oldest".
--
-- BOTH TOTALS ARE NULLABLE AND NEITHER IS A ZERO. An export that states only the
-- payable side leaves the other NULL, and §0.4's "empty beats stale" applies at
-- cell granularity: rendering an unstated receivable as "0 Kč" would be a
-- measured zero the office never measured.
CREATE TABLE partner_saldo (
  id               uuid          PRIMARY KEY DEFAULT uuidv7(),
  organization_id  uuid          NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  import_batch_id  uuid          NOT NULL,
  partner_id       uuid          NOT NULL,
  -- Denormalised from the batch, as `statement_line` and `trial_balance_line`
  -- do, and kept honest by `beta_import_line_requires_draft_batch` (0007 §5),
  -- which refuses a row whose period differs from its batch's.
  period_id        uuid          NOT NULL,
  receivable_total numeric(14,2),
  payable_total    numeric(14,2),
  oldest_due       date,
  created_at       timestamptz   NOT NULL DEFAULT now(),
  -- No `updated_at`: a saldo row is written once inside a draft and frozen from
  -- there (0007 §5). A correction is a new batch published over the old one,
  -- which is the whole mechanism of §3.2.

  -- CASCADE, like the other two payload tables: a saldo row has no meaning apart
  -- from the batch that imported it, so a discarded draft takes its rows with it
  -- in one statement rather than leaving orphans for a later sweep.
  CONSTRAINT partner_saldo_batch_fk
    FOREIGN KEY (import_batch_id, organization_id)
    REFERENCES import_batch (id, organization_id)
    ON DELETE CASCADE,
  CONSTRAINT partner_saldo_period_fk
    FOREIGN KEY (period_id, organization_id)
    REFERENCES reporting_period (id, organization_id)
    ON DELETE RESTRICT,
  -- NO `ON DELETE` ACTION, and that is load-bearing rather than an omission —
  -- the same judgement `import_batch_supersession_fk` (0007) spells out. A
  -- partner that a published period's saldo points at must not be deletable out
  -- from under the number the client is looking at, but RESTRICT is checked
  -- IMMEDIATELY and would refuse "Smazat organizaci" (§2.10): that delete
  -- cascades into `partner` and `partner_saldo` independently, in an
  -- unspecified order. The default NO ACTION is checked at the END of the
  -- statement, by which time both rows are gone — it refuses a stray partner
  -- delete and permits the organization cascade, which is exactly the pair of
  -- behaviours wanted here.
  CONSTRAINT partner_saldo_partner_fk
    FOREIGN KEY (partner_id, organization_id)
    REFERENCES partner (id, organization_id),
  -- One row per partner per batch. Without it a re-run of a partial import would
  -- double a partner's saldo and the total the client reads would be exactly
  -- twice the truth.
  CONSTRAINT partner_saldo_identity_unique
    UNIQUE (organization_id, import_batch_id, partner_id),
  -- Money owed is never negative on either side. A negative receivable is a
  -- payable and vice versa; storing one as the other's negation would make the
  -- Pohledávky columns and the obligations union disagree about the same row,
  -- and the `dodavatele` arm would then hide a real debt behind a minus sign.
  CONSTRAINT partner_saldo_totals_nonnegative CHECK (
    (receivable_total IS NULL OR receivable_total >= 0)
    AND (payable_total IS NULL OR payable_total >= 0)
  ),
  -- A row that states NOTHING is not a fact about the partner; it is noise the
  -- import should not have sent, and it would render as an empty line in
  -- Pohledávky under a partner name.
  CONSTRAINT partner_saldo_states_something CHECK (
    receivable_total IS NOT NULL OR payable_total IS NOT NULL
  ),
  -- A STATED PAYABLE CARRIES THE DATE IT IS DUE.
  --
  -- The `dodavatele` arm of the obligations read model (§2.4) lists this row
  -- with `oldest_due` as its splatnost, and the union has no way to place a row
  -- with no date: it would be silently dropped from Dluhy a platby and from
  -- Přehled's Nejbližší termíny, and "hiding a debt is the worse error"
  -- (lib/data/obligations.ts). Refusing the row at the boundary turns that
  -- silent loss into a named 400 the office agent can fix.
  --
  -- A receivable-only row may leave `oldest_due` NULL: it owes nobody a deadline
  -- and Pohledávky renders the absence as an absence.
  CONSTRAINT partner_saldo_payable_has_oldest_due CHECK (
    payable_total IS NULL OR payable_total = 0 OR oldest_due IS NOT NULL
  )
);

-- The Pohledávky read: every partner of one batch, and the batch lookup behind
-- the obligations union's `dodavatele` arm.
CREATE INDEX partner_saldo_batch_idx
  ON partner_saldo (import_batch_id, partner_id);

-- One partner's saldo across periods — the per-partner history the Partneři
-- detail (PR 29) reads.
CREATE INDEX partner_saldo_partner_idx
  ON partner_saldo (organization_id, partner_id, period_id);

CREATE TRIGGER partner_saldo_freeze_organization_id
  BEFORE UPDATE ON partner_saldo
  FOR EACH ROW EXECUTE FUNCTION beta_freeze_organization_id();

-- The two 0007 §5 floors, applied to the third payload table: a row may only be
-- written into a DRAFT batch, and its denormalised period must equal the
-- batch's.
CREATE TRIGGER partner_saldo_requires_draft_batch
  BEFORE INSERT OR UPDATE ON partner_saldo
  FOR EACH ROW EXECUTE FUNCTION beta_import_line_requires_draft_batch();

-- ...and the payload table has to agree with the batch's `dataset`, or a
-- předvaha batch could quietly hold saldo rows and the completeness matrix
-- (§3.2) would report a dataset the client's page cannot find.
CREATE OR REPLACE FUNCTION beta_partner_saldo_matches_dataset()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  batch_dataset beta_import_dataset;
BEGIN
  SELECT b.dataset INTO batch_dataset
    FROM import_batch b
   WHERE b.id = NEW.import_batch_id;

  IF batch_dataset <> 'saldokonto' THEN
    RAISE EXCEPTION
      'partner_saldo does not belong to a % batch (batch %)',
      batch_dataset, NEW.import_batch_id
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER partner_saldo_matches_dataset
  BEFORE INSERT OR UPDATE ON partner_saldo
  FOR EACH ROW EXECUTE FUNCTION beta_partner_saldo_matches_dataset();

-- 4. document.partner_id / liability.partner_id --------------------------------
--
-- Spec §4, the same bullet that introduces the two tables above: "document.
-- partner_id + liability.partner_id nullable."
--
-- NULLABLE AND UNWRITTEN HERE, on purpose. `document.partner_id` is §2.2's
-- "protistrana" column, which the office sets from Pro účetní › Zpracování, and
-- the Partneři detail's "linked documents" reads back (PR 29);
-- `liability.partner_id` names the counterparty of a residual manual debt that
-- happens to be a known partner. Neither has a writer in this PR and neither
-- renders yet — an always-empty column in Dokumenty would be the placeholder
-- §0.3 forbids. What lands now is the RELATIONSHIP, so PR 29 adds a form field
-- rather than a migration that has to be reasoned about against published data.
--
-- COMPOSITE AND TENANCY-CARRYING, like every other FK in this schema: a document
-- must not be able to name another organization's partner. SET NULL rather than
-- RESTRICT or NO ACTION, because a partner is metadata ABOUT a document and a
-- document survives losing it — the opposite of `partner_saldo`, whose row IS a
-- measurement of the partner it names.
--
-- `SET NULL (partner_id)` names the column EXPLICITLY (PostgreSQL 15+). Without
-- the column list, SET NULL would null every referencing column of the key —
-- including `organization_id`, which is NOT NULL — so the action would fail at
-- the moment it fired rather than at the moment it was written.
ALTER TABLE document ADD COLUMN partner_id uuid;
ALTER TABLE document
  ADD CONSTRAINT document_partner_fk
  FOREIGN KEY (partner_id, organization_id)
  REFERENCES partner (id, organization_id)
  ON DELETE SET NULL (partner_id);

ALTER TABLE liability ADD COLUMN partner_id uuid;
ALTER TABLE liability
  ADD CONSTRAINT liability_partner_fk
  FOREIGN KEY (partner_id, organization_id)
  REFERENCES partner (id, organization_id)
  ON DELETE SET NULL (partner_id);

-- Partial: most documents have no partner, and the index that matters is "which
-- documents belong to this partner" (PR 29's detail page), not the reverse.
CREATE INDEX document_partner_idx
  ON document (organization_id, partner_id)
  WHERE partner_id IS NOT NULL;

CREATE INDEX liability_partner_idx
  ON liability (organization_id, partner_id)
  WHERE partner_id IS NOT NULL;
