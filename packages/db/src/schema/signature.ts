/**
 * signature — podpisový záznam (§33a + §11/1f). Append-only (triggers at migration).
 *
 * Mirrors: packages/db/migrations/0027_accounting_capture.sql (CREATE TABLE signature)
 *   + packages/db/migrations/0029_accounting_posting.sql (ALTER TABLE signature ADD COLUMN posting_id)
 *
 * Organization-scoped (FORCE RLS + organization_isolation, applied in 0034).
 * posting_id (FOR_POSTING role link, §5.6 / §33a/4) is added in 0029 once the
 * posting table exists; mirrored here in its final shape. The exactly-one-of
 * (event_id, posting_id) keyed-on-role CHECK lives in the migration, not this DSL.
 */
import { foreignKey, pgTable, timestamp, unique, uuid } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"
import { signatureRole } from "./_enums"
import { accounting_event } from "./accounting_event"
import { app_user } from "./app_user"
import { organization } from "./organization"
import { posting } from "./posting"

export const signature = pgTable(
  "signature",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`uuidv7()`),
    organization_id: uuid("organization_id")
      .notNull()
      .references(() => organization.id),
    role: signatureRole("role").notNull(), // FOR_EVENT (za případ) | FOR_POSTING (za zaúčtování)
    signer_id: uuid("signer_id")
      .notNull()
      .references(() => app_user.id),
    signed_at: timestamp("signed_at", { withTimezone: true }).notNull(), // okamžik podpisového záznamu (§33a)
    event_id: uuid("event_id"), // set when role = FOR_EVENT
    posting_id: uuid("posting_id"), // set when role = FOR_POSTING (added in 0029)
    created_at: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    foreignKey({
      name: "signature_event_fk",
      columns: [t.event_id, t.organization_id],
      foreignColumns: [accounting_event.id, accounting_event.organization_id],
    }),
    foreignKey({
      name: "signature_posting_fk",
      columns: [t.posting_id, t.organization_id],
      foreignColumns: [posting.id, posting.organization_id],
    }),
    unique("signature_id_org_unique").on(t.id, t.organization_id),
  ],
)
