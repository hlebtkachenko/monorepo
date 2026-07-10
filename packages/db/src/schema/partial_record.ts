/**
 * partial_record — dílčí úč. záznam = THE money level (taxable supplies only).
 *
 * Mirrors: packages/db/migrations/0027_accounting_capture.sql (CREATE TABLE partial_record)
 *
 * Organization-scoped (FORCE RLS + organization_isolation, applied in 0034).
 * §11/1c captured once; posting EXPANDS one row into N MD/D lines. Rounding lives on
 * summary_record.rounding_amount. ξ (koeficient) injected at posting time.
 * Triggers / RLS / CHECK constraints (vat-zero, qty*price, vat-tolerance) live in the
 * migration, not this DSL.
 */
import {
  boolean,
  char,
  foreignKey,
  numeric,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"
import { fxRateKind, vatMode } from "./_enums"
import { currency } from "./currency"
import { individual_record } from "./individual_record"
import { organization } from "./organization"

export const partial_record = pgTable(
  "partial_record",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`uuidv7()`),
    organization_id: uuid("organization_id")
      .notNull()
      .references(() => organization.id),
    individual_record_id: uuid("individual_record_id").notNull(),
    quantity: numeric("quantity", { precision: 19, scale: 4 }), // Množství
    measure_unit: text("measure_unit"), // m.j.
    unit_price: numeric("unit_price", { precision: 19, scale: 4 }), // cena za m.j.
    base_amount: numeric("base_amount", { precision: 19, scale: 4 }).notNull(), // základ daně
    vat_rate: numeric("vat_rate", { precision: 5, scale: 2 }), // 0/12/21…; null for OUTSIDE_VAT
    vat_mode: vatMode("vat_mode").notNull(), // DRIVES posting
    // Place-of-supply regime (ZDPH §16/§92/§102/§108). Splits ř.3/4 (EU
    // acquisition), ř.5/6 (EU §9(1) service), ř.10/11 (domestic §92 PDP), and
    // ř.12/13 (§108 residual — place of supply CZ, supplier not established) on
    // the DPH return; NULL = legacy/undistinguished. CHECK constraint lives in
    // migrations 0039 (base) + 0056 (SECTION_108), not this DSL.
    vat_jurisdiction: text("vat_jurisdiction"), // DOMESTIC|REVERSE_CHARGE|EU|IMPORT|EXEMPT|OUTSIDE_VAT|SECTION_108
    // Kind of supply (ZDPH §64/§9). Drives the souhrnné hlášení §102 kód plnění
    // (SERVICES -> 3 service; else -> 0 goods). NULL = legacy/undistinguished
    // (kód 0). CHECK constraint lives in migration 0043, not this DSL.
    supply_kind: text("supply_kind"), // GOODS|MATERIAL|SERVICES|UTILITY|RENT|INSURANCE|ASSET|ADVANCE|CREDIT_NOTE|OTHER
    // §92 kód předmětu plnění for kontrolní hlášení A.1/B.1 (domestic reverse
    // charge): '1' zlato §92b / '3' nemovitost §92d / '4' stavební-montážní §92e
    // / '5' příloha 5 §92c. NULL = not a §92 domestic PDP row (STANDARD/EU/
    // legacy). DISTINCT from supply_kind (that is the souhrnné-hlášení kód 0/3).
    // CHECK constraint lives in migration 0046, not this DSL.
    commodity_code: text("commodity_code"), // 1|3|4|5
    vat_deductible: boolean("vat_deductible").notNull().default(true), // false -> VAT folds into cost
    advance_settlement: boolean("advance_settlement").notNull().default(false), // daňový doklad k záloze (§37a)
    vat_amount: numeric("vat_amount", { precision: 19, scale: 4 })
      .notNull()
      .default("0"), // daň; 0 on reverse-charge/exempt docs
    currency_code: char("currency_code", { length: 3 })
      .notNull()
      .references(() => currency.code),
    fx_rate_kind: fxRateKind("fx_rate_kind"), // DAILY | REAL | FIXED
    fx_rate: numeric("fx_rate", { precision: 18, scale: 6 }), // to accounting currency; null when same
    vat_fx_rate: numeric("vat_fx_rate", { precision: 18, scale: 6 }), // §4/5 ČNB rate for the VAT base when <> fx_rate
    base_in_accounting_currency: numeric("base_in_accounting_currency", {
      precision: 19,
      scale: 4,
    }).notNull(), // frozen (target = period.accounting_currency)
    vat_in_accounting_currency: numeric("vat_in_accounting_currency", {
      precision: 19,
      scale: 4,
    })
      .notNull()
      .default("0"), // frozen
    created_at: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updated_at: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    foreignKey({
      name: "partial_record_line_fk",
      columns: [t.individual_record_id, t.organization_id],
      foreignColumns: [individual_record.id, individual_record.organization_id],
    }),
    unique("partial_record_id_org_unique").on(t.id, t.organization_id),
  ],
)
