/**
 * accounting_event — the economic fact / účetní případ (§6/1). Both parties.
 *
 * Mirrors: packages/db/migrations/0027_accounting_capture.sql (CREATE TABLE accounting_event)
 *
 * Organization-scoped (FORCE RLS + organization_isolation, applied in 0034).
 * party_id = us (self counterparty), counterparty_id = them. workspace_id is the
 * composite-FK key to the workspace-shared counterparty (FK bypasses RLS, so tenancy
 * rides through (counterparty_id, workspace_id)). Composite FKs mirrored below.
 * Triggers / RLS / CHECK constraints live in the migration, not this DSL.
 */
import {
  bigint,
  date,
  foreignKey,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"
import { accounting_period } from "./accounting_period"
import { app_user } from "./app_user"
import { counterparty } from "./counterparty"
import { inbox_item } from "./inbox_item"
import { number_series } from "./number_series"
import { organization } from "./organization"

export const accounting_event = pgTable(
  "accounting_event",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`uuidv7()`),
    organization_id: uuid("organization_id").notNull(),
    workspace_id: uuid("workspace_id").notNull(),
    period_id: uuid("period_id").notNull(), // the case's účetní období (occurred_on ∈ period)
    number_series_id: uuid("number_series_id").notNull(), // Označení series (entity_type = EVENT)
    sequence_number: bigint("sequence_number", { mode: "number" }).notNull(), // gapless position in the série
    designation: text("designation").notNull(), // FROZEN Označení string (gov/audit id)
    party_id: uuid("party_id"), // OUR side (counterparty)
    counterparty_id: uuid("counterparty_id"), // THEIR side (counterparty)
    description: text("description").notNull(), // obsah úč. případu (§11/1b)
    content: text("content"), // optional longer detail
    occurred_at: timestamp("occurred_at", { withTimezone: true }).notNull(), // okamžik uskutečnění (§11/1e)
    occurred_on: date("occurred_on").notNull(), // Czech legal calendar date; period-membership anchor
    responsible_user_id: uuid("responsible_user_id")
      .notNull()
      .references(() => app_user.id), // osoba odp. za případ (§11/1f, R10)
    created_at: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updated_at: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    // Provenance: the approved gated write this row landed from (NULL = human).
    // Composite (inbox_id, workspace_id) FK — RLS-safe (both workspace-scoped).
    inbox_id: uuid("inbox_id"),
  },
  (t) => [
    foreignKey({
      name: "accounting_event_inbox_fk",
      columns: [t.inbox_id, t.workspace_id],
      foreignColumns: [inbox_item.id, inbox_item.workspace_id],
    }),
    foreignKey({
      name: "accounting_event_org_fk",
      columns: [t.organization_id, t.workspace_id],
      foreignColumns: [organization.id, organization.workspace_id],
    }),
    foreignKey({
      name: "accounting_event_period_fk",
      columns: [t.period_id, t.organization_id],
      foreignColumns: [accounting_period.id, accounting_period.organization_id],
    }),
    foreignKey({
      name: "accounting_event_party_fk",
      columns: [t.party_id, t.workspace_id],
      foreignColumns: [counterparty.id, counterparty.workspace_id],
    }),
    foreignKey({
      name: "accounting_event_counterparty_fk",
      columns: [t.counterparty_id, t.workspace_id],
      foreignColumns: [counterparty.id, counterparty.workspace_id],
    }),
    foreignKey({
      name: "accounting_event_series_fk",
      columns: [t.number_series_id, t.organization_id],
      foreignColumns: [number_series.id, number_series.organization_id],
    }),
    unique("accounting_event_id_org_unique").on(t.id, t.organization_id),
    unique("accounting_event_oznaceni_unique").on(
      t.number_series_id,
      t.sequence_number,
    ),
  ],
)
