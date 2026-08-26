/**
 * partner — the counterparty registry behind Finance › Pohledávky a závazky and
 * Finance › Partneři (spec §2.4, §4).
 *
 * Mirrors: apps/beta/db/migrations/0015_partners_saldokonto.sql (CREATE TABLE
 * partner).
 *
 * AUTO-FED, NOT TYPED. Spec §2.4: "auto-fed from saldokonto + office edits +
 * ARES prefill". The saldokonto import creates the rows it needs as a side
 * effect of publishing a period, so the office never maintains a supplier list
 * by hand — `source` records which of the two produced a row, and it is frozen
 * (trigger), because an origin that changed under an import would make "where
 * did this row come from?" unanswerable.
 *
 * IDENTITY IS `external_ref` THEN `ico`, NEVER A NAME. `lib/data/partners.ts`
 * holds the match order and its reasoning; what the schema contributes is the
 * two partial unique indexes that make it enforceable — one IČO is one legal
 * person per book, so two rows carrying it would split one counterparty's saldo
 * across two lines of Pohledávky.
 *
 * DB-enforced invariants, all in the migration:
 *   - `partner_id_organization_unique` — the target of the composite FKs on
 *     `partner_saldo`, `document.partner_id` and `liability.partner_id`.
 *   - `partner_ico_shape` — eight digits or nothing; a short IČO would create a
 *     duplicate of a company that already has a row.
 *   - `partner_external_ref_idx` / `partner_ico_idx` — the two match keys.
 *   - trigger `partner_freeze_organization_id` — a partner never changes books.
 *   - trigger `partner_freeze_source` — the origin is immutable.
 *   - trigger `partner_touch_updated_at` — `updated_at` is the registry's own
 *     §2.4 freshness stamp, distinct from the saldo batch's `published_at`.
 */
import {
  char,
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"

import { betaPartnerRole, betaPartnerSource } from "./_enums"
import { organization } from "./organization"

export const partner = pgTable(
  "partner",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`uuidv7()`),
    organization_id: uuid("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    /** Eight digits (DB CHECK) or null — a foreign supplier has none. */
    ico: varchar("ico", { length: 8 }),
    /** Deliberately unconstrained in shape: a foreign DIČ is not CZ-shaped. */
    dic: varchar("dic", { length: 14 }),
    partner_role: betaPartnerRole("partner_role").notNull().default("other"),
    email: text("email"),
    phone: text("phone"),
    /** Sídlo, decomposed exactly as `organization`'s registered address is. */
    street: text("street"),
    house_number: varchar("house_number", { length: 16 }),
    orientation_number: varchar("orientation_number", { length: 16 }),
    city: text("city"),
    postal_code: varchar("postal_code", { length: 10 }),
    country_code: char("country_code", { length: 2 }).notNull().default("CZ"),
    /** ČSÚ právní forma + spisová značka, as ARES states them (PR 29). */
    legal_form_csu_code: varchar("legal_form_csu_code", { length: 4 }),
    registry_file_number: text("registry_file_number"),
    /** The §2.10 ARES cache stamp, per partner. Null until PR 29 fills it. */
    ares_fetched_at: timestamp("ares_fetched_at", { withTimezone: true }),
    /** Client-visible note (§2.4). Rendered on the Partneři detail. */
    note_client: text("note_client"),
    /**
     * Office-internal note (§2.4: "internal note office-only"). NEVER
     * serialized to a client — the name is on `CLIENT_FORBIDDEN_COLUMNS`.
     */
    note_internal: text("note_internal"),
    source: betaPartnerSource("source").notNull().default("manual"),
    /** Agent upsert match key — see `filing.external_ref` (migration 0011). */
    external_ref: text("external_ref"),
    created_at: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    /** The registry's own §2.4 freshness stamp. */
    updated_at: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("partner_external_ref_idx")
      .on(table.organization_id, table.external_ref)
      .where(sql`${table.external_ref} IS NOT NULL`),
    uniqueIndex("partner_ico_idx")
      .on(table.organization_id, table.ico)
      .where(sql`${table.ico} IS NOT NULL`),
    index("partner_organization_name_idx").on(
      table.organization_id,
      table.name,
    ),
  ],
)
