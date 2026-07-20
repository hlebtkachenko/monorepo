/**
 * financial_account — the operational money-place entity for the Finance module:
 * a bank account, a cash desk (pokladna), or a cash-equivalent store (ceniny =
 * kind CASH_EQUIVALENT, surfaced via a filtered view). Net-new operational
 * identity distinct from the GL account (221/211/213 analytics) it links to; the
 * accounting layer knows only GL accounts and the bare posting_monetary_line
 * location CASH|BANK enum, never an operational bank account.
 *
 * Mirrors: packages/db/migrations/0071_financial_account.sql
 *
 * Organization-scoped (FORCE RLS + organization_isolation, applied in 0071).
 * One financial_account maps 1:1 to one analytic GL account (gl_account_number,
 * partial-unique per org) so a single account's balance is one
 * account_period_balance lookup. Composite UNIQUE(id, organization_id) is the
 * composite-FK target for future refs (money_transfer, statement_import).
 * number_series_id is a composite (id, organization_id) FK; currency_code and
 * responsible_user_id are single-col FKs to shared/global tables. The
 * partial-unique indexes (gl analytic, default payment account), the CHECKs and
 * the RLS policy live in the migration, not this DSL.
 */
import {
  boolean,
  char,
  date,
  foreignKey,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"
import { money } from "../columns"
import { financialAccountKind, financialAccountStatus } from "./_enums"
import { app_user } from "./app_user"
import { currency } from "./currency"
import { number_series } from "./number_series"
import { organization } from "./organization"

export const financial_account = pgTable(
  "financial_account",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`uuidv7()`),
    organization_id: uuid("organization_id")
      .notNull()
      .references(() => organization.id),
    kind: financialAccountKind("kind").notNull(),
    status: financialAccountStatus("status").notNull().default("DRAFT"),
    name: text("name").notNull(),
    code: text("code").notNull(),
    currency_code: char("currency_code", { length: 3 })
      .notNull()
      .references(() => currency.code),
    gl_account_number: text("gl_account_number"), // 1:1 analytic GL account
    // bank fields (kind = BANK) — inlined until financial_institution lands
    account_number: text("account_number"),
    bank_code: text("bank_code"),
    iban: text("iban"),
    bic: text("bic"),
    is_default_payment_account: boolean("is_default_payment_account")
      .notNull()
      .default(false),
    overdraft_limit: money("overdraft_limit"),
    opened_on: date("opened_on"),
    closed_on: date("closed_on"),
    // cash fields (kind = CASH / CASH_EQUIVALENT)
    location: text("location"),
    cash_limit: money("cash_limit"),
    number_series_id: uuid("number_series_id"),
    // common
    responsible_user_id: uuid("responsible_user_id").references(
      () => app_user.id,
    ),
    created_at: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updated_at: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    unique("financial_account_id_org_unique").on(t.id, t.organization_id),
    unique("financial_account_org_code_unique").on(t.organization_id, t.code),
    foreignKey({
      name: "financial_account_number_series_fk",
      columns: [t.number_series_id, t.organization_id],
      foreignColumns: [number_series.id, number_series.organization_id],
    }),
  ],
)
