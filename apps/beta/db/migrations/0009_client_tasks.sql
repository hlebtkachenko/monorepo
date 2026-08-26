-- Migration 0009: client_task — Pro účetní › Úkoly klientovi (spec §3.4, §4).
--
-- Scope (spec `.context/beta-afframe/40-beta-structure.md` §2.1 "Co od vás
-- potřebujeme", §3.4 Úkoly klientovi, §4 data model):
--
--   client_task   ONE table for both a real task AND a task TEMPLATE
--                 (`is_template`), the same "one table, several shapes"
--                 discipline `filing` already uses for its five families.
--
-- WHY ONE TABLE AND NOT TWO. Spec §4 lists `client_task` with `is_template` as
-- one of its own columns, not a separate `task_template` table — a template is
-- a client_task that has not been dated yet, and "Vytvořit měsíční sadu úkolů"
-- (§3.4) turns one template into one dated task per chosen month. Two tables
-- would need a second CRUD surface, a second set of triggers and a foreign key
-- between them for no reason the spec asks for.
--
-- THE TWO SHAPES, ENFORCED BY CHECK, NOT BY CONVENTION.
--   A TEMPLATE (`is_template = true`)   has NO `due_date` (it is not dated to
--     any calendar month yet) and MAY carry `template_due_day` — which day of
--     the chosen month the generated task should fall on.
--   A TASK (`is_template = false`)      has a real `due_date` and NEVER a
--     `template_due_day` — that field only means something before a date
--     exists.
-- `client_task_due_date_shape` and `client_task_template_due_day_scope` are the
-- floor under that split; nothing above the database has to re-check it.
--
-- IDEMPOTENT MONTHLY-SET, BY A PARTIAL UNIQUE INDEX. A generated task carries
-- `source_template_id` (which template produced it) and `source_period_id`
-- (which month). `client_task_source_unique` is UNIQUE on
-- (organization_id, source_template_id, source_period_id) wherever
-- `source_template_id IS NOT NULL`, so `lib/data/client-tasks.ts`'s
-- `createMonthlyTaskSet` is one `INSERT ... SELECT ... ON CONFLICT DO NOTHING`:
-- running it twice for the same month inserts the second time's rows zero
-- times, by construction, rather than by an application-side existence check
-- that could race.
--
-- WHO CAN COMPLETE A TASK. Spec §3.3 is explicit: "Client pages are read-only
-- for every role; owner gets 'Upravit' deep-links into these forms" — and
-- `client_task` is named in that same list. `owner` is the accountant (the
-- office), not the client company (`db/schema/_enums.ts`'s note on
-- `beta_org_role`), so this table has no client-writable path at all: every
-- write in `lib/data/client-tasks.ts` takes an `OwnerScope`, and the client
-- surface (`app/(portal)/[orgSlug]/_components/client-task-list.tsx`) only ever
-- reads.
--
-- Money precision / numeric rules do not apply here — this table carries no
-- amount. Requires PostgreSQL 18+: `uuidv7()`.
--
-- NO `BEGIN;` / `COMMIT;` in this file — see the header of 0000_init.sql.

-- 1. Enums ---------------------------------------------------------------------

-- `done` rather than a third value: a template is never `done` (see
-- `client_task_template_never_done` below), so this is a real task's own
-- lifecycle only, and it has exactly two states — spec §2.1's "open
-- client_tasks" is precisely `status = 'open'`.
CREATE TYPE beta_client_task_status AS ENUM ('open', 'done');

-- The coarse in-app destination a task's own "link" (spec §2.1: "open
-- client_tasks (text, due, link)") points at, when it points anywhere at all.
-- Deliberately NOT a foreign key to a specific record — the office is asking
-- the client to go DO something in a module ("go upload the missing invoice"),
-- not pointing at a row that may not exist yet. Deliberately a CLOSED list of
-- modules that already have a route in this app: `financial`, `mzdy`,
-- `majetek` etc. are not members yet because their routes do not exist —
-- adding a value here without the route behind it is exactly the "dead link"
-- the nav conventions forbid, so each future module adds its own value
-- together with its route, the same discipline `betaRailNav` documents for the
-- rail itself.
CREATE TYPE beta_client_task_link_kind AS ENUM ('none', 'dokumenty', 'dane');

-- 2. client_task -----------------------------------------------------------

CREATE TABLE client_task (
  id                  uuid                        PRIMARY KEY DEFAULT uuidv7(),
  organization_id     uuid                        NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  is_template         boolean                     NOT NULL DEFAULT false,
  -- The free text the office writes and the client reads (spec §2.1's "text").
  title               text                        NOT NULL,
  description         text,
  -- Set iff is_template = false — see client_task_due_date_shape.
  due_date            date,
  -- Set only when is_template = true — see client_task_template_due_day_scope.
  -- The day of the chosen month "Vytvořit měsíční sadu úkolů" stamps the
  -- generated task with; clamped to the target month's real last day at
  -- generation time (lib/data/client-tasks.ts), so a template due on the 31st
  -- lands on the 28th/29th/30th in a shorter month rather than erroring.
  template_due_day    smallint,
  link_kind           beta_client_task_link_kind  NOT NULL DEFAULT 'none',
  status              beta_client_task_status     NOT NULL DEFAULT 'open',
  -- Coherent with status — see client_task_status_done_at_coherence.
  done_at             timestamptz,
  -- Which template generated this row, and for which month — both set
  -- together (client_task_source_pair) and only on a generated, non-template
  -- row (client_task_source_scope). This pair is the idempotency key: see
  -- client_task_source_unique below.
  source_template_id  uuid,
  source_period_id    uuid,
  created_by          uuid                        REFERENCES app_user(id) ON DELETE SET NULL,
  created_at          timestamptz                 NOT NULL DEFAULT now(),
  updated_at          timestamptz                 NOT NULL DEFAULT now(),
  -- The target of the self-referencing composite FK below — the same shape
  -- reporting_period_id_organization_unique / document_id_organization_unique
  -- already serve their own referencing tables' composite FKs.
  CONSTRAINT client_task_id_organization_unique
    UNIQUE (id, organization_id),
  CONSTRAINT client_task_due_date_shape CHECK (
    (is_template = true  AND due_date IS NULL) OR
    (is_template = false AND due_date IS NOT NULL)
  ),
  CONSTRAINT client_task_template_due_day_scope CHECK (
    is_template = true OR template_due_day IS NULL
  ),
  CONSTRAINT client_task_template_due_day_range CHECK (
    template_due_day IS NULL OR template_due_day BETWEEN 1 AND 31
  ),
  CONSTRAINT client_task_source_pair CHECK (
    (source_template_id IS NULL) = (source_period_id IS NULL)
  ),
  CONSTRAINT client_task_source_scope CHECK (
    is_template = false OR
    (source_template_id IS NULL AND source_period_id IS NULL)
  ),
  CONSTRAINT client_task_status_done_at_coherence CHECK (
    (status = 'done') = (done_at IS NOT NULL)
  ),
  -- A template is a pattern, not a piece of work — it has no "done" state of
  -- its own. Only the tasks it generates do.
  CONSTRAINT client_task_template_never_done CHECK (
    is_template = false OR status = 'open'
  ),
  -- COMPOSITE and self-referencing, same reasoning as every other tenancy-
  -- carrying FK in this app: a plain REFERENCES client_task(id) would happily
  -- let a task in organization A point at a "template" belonging to
  -- organization B. SET NULL (the column-list form, PG15+) rather than
  -- RESTRICT: deleting a template must not be blocked by the tasks it already
  -- generated — those rows are the historical record of work asked for, and
  -- they survive their template exactly as a filing survives its purged
  -- attachment (see filing_document_fk's own comment for the same trade-off).
  CONSTRAINT client_task_source_template_fk
    FOREIGN KEY (source_template_id, organization_id)
    REFERENCES client_task (id, organization_id)
    ON DELETE SET NULL (source_template_id),
  -- RESTRICT, not CASCADE/SET NULL: nothing in this product deletes a
  -- reporting_period (see lib/data/reporting-periods.ts's own header), so this
  -- never fires — it states the rule rather than relying on it never being
  -- tested.
  CONSTRAINT client_task_source_period_fk
    FOREIGN KEY (source_period_id, organization_id)
    REFERENCES reporting_period (id, organization_id)
    ON DELETE RESTRICT
);

-- The client list's own read: open, non-template tasks, due-date order (spec
-- §2.1: "open client_tasks ... Positive empty state"). A handful of rows per
-- org, so one index covers the office's "all tasks" read too (the extra
-- status/is_template filtering is cheap at this scale — the same "an office
-- runs a handful of client books, not a warehouse" argument
-- lib/data/documents-office.ts makes for its own queue limit).
CREATE INDEX client_task_organization_due_idx
  ON client_task (organization_id, due_date)
  WHERE is_template = false;

CREATE INDEX client_task_organization_template_idx
  ON client_task (organization_id)
  WHERE is_template = true;

-- THE IDEMPOTENCY MECHANISM for "Vytvořit měsíční sadu úkolů" (spec §3.4).
-- `createMonthlyTaskSet` (lib/data/client-tasks.ts) inserts one row per active
-- template with this exact (organization_id, source_template_id,
-- source_period_id) conflict target and `DO NOTHING` — so applying the same
-- month twice is a no-op the SECOND time, enforced by Postgres rather than by
-- an application-side "does a row already exist" check that could race under
-- concurrent clicks.
CREATE UNIQUE INDEX client_task_source_unique
  ON client_task (organization_id, source_template_id, source_period_id)
  WHERE source_template_id IS NOT NULL;

CREATE TRIGGER client_task_touch_updated_at
  BEFORE UPDATE ON client_task
  FOR EACH ROW EXECUTE FUNCTION beta_touch_updated_at();

-- Defined in 0005_filings.sql; reused verbatim — see that file's own comment
-- on why every tenant-scoped table gets this same trigger rather than relying
-- on the application seam alone.
CREATE TRIGGER client_task_freeze_organization_id
  BEFORE UPDATE ON client_task
  FOR EACH ROW EXECUTE FUNCTION beta_freeze_organization_id();
