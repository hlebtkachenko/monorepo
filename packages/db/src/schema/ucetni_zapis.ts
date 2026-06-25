// ucetni_zapis — posting header (§12). Mirrors: packages/db/migrations/0025_accounting_posting.sql
import { date, pgTable, timestamp, uuid } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"
import {
  accountingRegime,
  ucetniZapisDruh,
  ucetniZapisOpravaTyp,
} from "./_enums"

export const ucetni_zapis = pgTable("ucetni_zapis", {
  id: uuid("id")
    .primaryKey()
    .default(sql`uuidv7()`),
  organization_id: uuid("organization_id").notNull(),
  jednotka_id: uuid("jednotka_id").notNull(),
  obdobi_id: uuid("obdobi_id").notNull(),
  doklad_id: uuid("doklad_id").notNull(),
  pripad_id: uuid("pripad_id").notNull(),
  odpisovy_plan_id: uuid("odpisovy_plan_id"),
  inventura_id: uuid("inventura_id"),
  opravuje_zapis_id: uuid("opravuje_zapis_id"),
  oprava_typ: ucetniZapisOpravaTyp("oprava_typ"),
  datum: date("datum").notNull(),
  regime: accountingRegime("regime").notNull(),
  druh: ucetniZapisDruh("druh").notNull(),
  odpovedna_osoba: uuid("odpovedna_osoba").notNull(),
  okamzik_zauctovani: timestamp("okamzik_zauctovani", {
    withTimezone: true,
  }).notNull(),
  // No updated_at: append-only (R8); corrections are new rows.
  created_at: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
})
