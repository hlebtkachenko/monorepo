/**
 * posting (= ucetni_zapis) — the shared posting header (§12), made on the basis of a
 * doklad (§6/2). §5.2. Regime spine. Append-only (R8; no updated_at).
 *
 * Mirrors: packages/db/migrations/0029_accounting_posting.sql (CREATE TABLE posting)
 *   + the deferred depreciation_plan_id / inventory_count_id FKs activated in
 *     0030_accounting_supporting.sql (ALTER TABLE posting ADD CONSTRAINT …).
 *
 * Organization-scoped (FORCE RLS + organization_isolation, applied in 0034).
 * regime_code is pinned == accounting_period.regime_code via the composite regime-spine
 * FK; lines reference (id, organization_id, regime_code). Self-FK corrects_posting_id
 * mirrored below. Triggers / RLS / CHECK constraints (correction-pair, append-only,
 * period guard) live in the migration, not this DSL.
 */
import {
  boolean,
  date,
  foreignKey,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"
import { correctionType, postingKind } from "./_enums"
import { accounting_event } from "./accounting_event"
import { accounting_period } from "./accounting_period"
import { app_user } from "./app_user"
import { depreciation_plan } from "./depreciation_plan"
import { inventory_count } from "./inventory_count"
import { summary_record } from "./summary_record"

export const posting = pgTable(
  "posting",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`uuidv7()`),
    organization_id: uuid("organization_id").notNull(),
    period_id: uuid("period_id").notNull(), // obdobi_id (§5.2); regime spine
    regime_code: text("regime_code").notNull(), // pinned == accounting_period.regime_code via composite FK
    summary_record_id: uuid("summary_record_id").notNull(), // doklad_id (§5.2, R2)
    accounting_event_id: uuid("accounting_event_id").notNull(), // pripad_id (§5.2, R2)
    depreciation_plan_id: uuid("depreciation_plan_id"), // odpisovy_plan_id (§5.2/§6); FK activated in 0030
    inventory_count_id: uuid("inventory_count_id"), // inventura_id (§5.2/§6); FK activated in 0030
    posting_date: date("posting_date").notNull(), // datum (§5.2) — deník order + period membership
    posting_kind: postingKind("posting_kind").notNull(), // druh (§5.2): SIMPLE | COMPOUND
    responsible_user_id: uuid("responsible_user_id")
      .notNull()
      .references(() => app_user.id), // odpovedna_osoba (§5.2, R10)
    posted_at: timestamp("posted_at", { withTimezone: true }).notNull(), // okamzik_zauctovani (§5.2)
    corrects_posting_id: uuid("corrects_posting_id"), // opravuje_zapis_id (R8/§35) — self-FK
    correction_type: correctionType("correction_type"), // set iff corrects_posting_id set
    is_opening: boolean("is_opening").notNull().default(false), // B2: 701 počáteční-stav opening posting
    is_closing: boolean("is_closing").notNull().default(false), // 702 konečný účet rozvažný close posting (read-model-neutral)
    created_at: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    // Provenance: approved gated write this posting landed from (NULL = human).
    // BARE uuid, NO FK — org-only table; FK to workspace inbox_item bypasses RLS.
    inbox_id: uuid("inbox_id"),
  },
  (t) => [
    unique("posting_id_org_unique").on(t.id, t.organization_id),
    unique("posting_id_period_unique").on(t.id, t.period_id),
    unique("posting_id_org_regime_unique").on(
      t.id,
      t.organization_id,
      t.regime_code,
    ),
    foreignKey({
      name: "posting_period_regime_fk",
      columns: [t.period_id, t.organization_id, t.regime_code],
      foreignColumns: [
        accounting_period.id,
        accounting_period.organization_id,
        accounting_period.regime_code,
      ],
    }),
    foreignKey({
      name: "posting_summary_fk",
      columns: [t.summary_record_id, t.organization_id],
      foreignColumns: [summary_record.id, summary_record.organization_id],
    }),
    foreignKey({
      name: "posting_event_fk",
      columns: [t.accounting_event_id, t.organization_id],
      foreignColumns: [accounting_event.id, accounting_event.organization_id],
    }),
    // posting_correction_fk (corrects_posting_id, organization_id, regime_code) -> posting:
    // a composite SELF-FK. Kept in the migration (authoritative); omitted from the DSL to
    // avoid drizzle's self-referential circular type inference.
    // Deferred FKs activated in 0030_accounting_supporting.sql:
    foreignKey({
      name: "posting_depreciation_plan_fk",
      columns: [t.depreciation_plan_id, t.organization_id],
      foreignColumns: [depreciation_plan.id, depreciation_plan.organization_id],
    }),
    foreignKey({
      name: "posting_inventory_count_fk",
      columns: [t.inventory_count_id, t.organization_id],
      foreignColumns: [inventory_count.id, inventory_count.organization_id],
    }),
  ],
)
