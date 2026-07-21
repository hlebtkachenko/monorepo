/**
 * party_relationship — how one ORG book relates to a workspace-shared party:
 * per-org posting defaults, a coarse relationship_type, risk/blocked flags.
 * Supplier/customer stay DERIVED from open_item.direction; only curated defaults
 * live here.
 *
 * Mirrors: packages/db/migrations/0089_party_relationship.sql
 *
 * ORG-scoped (organization_isolation, FORCE RLS in the migration). Carries
 * workspace_id ONLY to close the cross-tier FK-bypass hole via TWO composite FKs
 * sharing it — (organization_id, workspace_id) -> organization and
 * (counterparty_id, workspace_id) -> counterparty — plus (default_bank_account_id,
 * workspace_id) -> party_bank_account. CHECK constraints live in the migration.
 */
import {
  boolean,
  char,
  date,
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"
import { counterparty } from "./counterparty"
import { organization } from "./organization"
import { party_bank_account } from "./party_bank_account"
import { workspace } from "./workspace"

export const party_relationship = pgTable(
  "party_relationship",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`uuidv7()`),
    organization_id: uuid("organization_id").notNull(),
    workspace_id: uuid("workspace_id").notNull(),
    counterparty_id: uuid("counterparty_id").notNull(),
    relationship_type: text("relationship_type"),
    valid_from: date("valid_from"),
    valid_to: date("valid_to"),
    active: boolean("active").notNull().default(true),
    source: text("source").notNull().default("MANUAL"),
    default_currency: char("default_currency", { length: 3 }),
    default_payment_terms: integer("default_payment_terms"),
    default_bank_account_id: uuid("default_bank_account_id"),
    accounting_profile: jsonb("accounting_profile"),
    risk_status: text("risk_status"),
    blocked: boolean("blocked").notNull().default(false),
    created_at: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updated_at: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    unique("party_relationship_org_counterparty_unique").on(
      t.organization_id,
      t.counterparty_id,
    ),
    foreignKey({
      name: "party_relationship_org_fk",
      columns: [t.organization_id, t.workspace_id],
      foreignColumns: [organization.id, organization.workspace_id],
    }),
    foreignKey({
      name: "party_relationship_counterparty_fk",
      columns: [t.counterparty_id, t.workspace_id],
      foreignColumns: [counterparty.id, counterparty.workspace_id],
    }),
    foreignKey({
      name: "party_relationship_bank_account_fk",
      columns: [t.default_bank_account_id, t.counterparty_id],
      foreignColumns: [
        party_bank_account.id,
        party_bank_account.counterparty_id,
      ],
    }),
    index("party_relationship_bank_account_idx").on(t.default_bank_account_id),
  ],
)
