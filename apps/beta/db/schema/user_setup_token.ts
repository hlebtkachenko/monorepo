/**
 * user_setup_token — the one-time links that are the only way into the portal.
 *
 * Mirrors: apps/beta/db/migrations/0000_init.sql (CREATE TABLE
 * user_setup_token).
 *
 * Public signup is disabled (`disableSignUp`), so account creation, org invites
 * and password resets all flow through this table (Advisor blocker B4-4).
 *
 * SECURITY PROPERTIES (all enforced in the migration):
 *   - `token_hash` stores the sha256 hex of the link secret and nothing else.
 *     The raw token exists exactly once, in the email that carries it. A
 *     database read can never reconstruct a usable link. A CHECK pins the
 *     column to 64 lowercase hex characters so a raw token cannot be written
 *     into it by accident.
 *   - 72h TTL ceiling, checked against `created_at` (not `now()`, which would
 *     make the constraint non-immutable).
 *   - `(organization_id IS NULL) = (granted_role IS NULL)`: an org-scoped token
 *     always grants a role, an unscoped one never does.
 *   - `password_reset` is never org-scoped.
 *   - trigger `user_setup_token_issuer_guard`: only office staff may issue an
 *     owner grant, a password reset, or an account_setup link with no
 *     organization, and a non-staff issuer must hold an active owner|admin
 *     membership in the very organization the token targets (Advisor blockers
 *     B4-3 + B4-4, extended by SF-5 in migration 0001).
 *   - trigger `user_setup_token_immutable_grant` (migration 0001, SF-2, extended
 *     by 0019 to cover `payroll_employee_id`): the issuance fields are frozen
 *     after INSERT and every consume/revoke column is write-once, so a spent
 *     link can never be un-spent or re-stamped.
 *   - `user_setup_token_employee_seat_shape` + the composite FK
 *     `(payroll_employee_id, organization_id)` (migration 0019): a pre-bound
 *     employee-seat invite is always an `org_invite` granting `guest` into the
 *     very book the employee row lives in.
 *
 * CONSUME CONTRACT (implemented in `lib/auth/setup-token.ts`): one atomic
 * `UPDATE ... WHERE token_hash = $1 AND consumed_at IS NULL AND revoked_at IS
 * NULL AND expires_at > now() RETURNING ...`. Zero rows means expired / revoked
 * / already consumed / unknown, and the route answers all four with the same
 * uniform error. The sibling revoke (same purpose + email + org) runs in the
 * same transaction. The full statements are written out in the migration
 * header above this table.
 */
import {
  char,
  index,
  inet,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"
import { app_user } from "./app_user"
import { betaOrgRole, betaSetupTokenPurpose } from "./_enums"
import { organization } from "./organization"

export const user_setup_token = pgTable(
  "user_setup_token",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`uuidv7()`),
    purpose: betaSetupTokenPurpose("purpose").notNull(),
    /** sha256 hex of the raw link secret. NEVER the raw token. */
    token_hash: char("token_hash", { length: 64 }).notNull().unique(),
    /** Lowercased by the DB trigger, like app_user.email. */
    email: varchar("email", { length: 320 }).notNull(),
    organization_id: uuid("organization_id").references(() => organization.id, {
      onDelete: "cascade",
    }),
    granted_role: betaOrgRole("granted_role"),
    /**
     * The employee seat's pre-binding (spec §2.6.1, migration 0019).
     *
     * Non-null exactly on a seat invite: consuming the link creates the account,
     * grants the `guest` membership AND writes `payroll_employee.app_user_id` in
     * one transaction, so the account's payroll identity is decided by the
     * office at ISSUANCE and never by anything the invitee sends.
     *
     * NO DRIZZLE `references()` HERE. The real constraint is COMPOSITE —
     * `(payroll_employee_id, organization_id) → payroll_employee (id,
     * organization_id)` — which drizzle's column-level helper cannot express;
     * declaring a single-column reference instead would put a WEAKER constraint
     * in the schema mirror than the database actually holds, which is the one
     * kind of drift worth more than the convenience. The migration is the source
     * of truth, as it is for every other composite FK in this schema.
     */
    payroll_employee_id: uuid("payroll_employee_id"),
    issued_by_user_id: uuid("issued_by_user_id").references(() => app_user.id, {
      onDelete: "set null",
    }),
    /**
     * Issuance + consumption forensics (B4-3: "issuance/consume logged with
     * IP/UA"). `inet` rather than text: behind Cloudflare the value comes from
     * `cf-connecting-ip` and is always a well-formed address, so a strict type
     * turns a malformed value into a loud failure instead of a poisoned log.
     */
    issued_ip: inet("issued_ip"),
    issued_user_agent: text("issued_user_agent"),
    expires_at: timestamp("expires_at", { withTimezone: true }).notNull(),
    consumed_at: timestamp("consumed_at", { withTimezone: true }),
    consumed_ip: inet("consumed_ip"),
    consumed_user_agent: text("consumed_user_agent"),
    consumed_user_id: uuid("consumed_user_id").references(() => app_user.id, {
      onDelete: "set null",
    }),
    /** Set by the sibling-invalidation sweep on a successful consume. */
    revoked_at: timestamp("revoked_at", { withTimezone: true }),
    created_at: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("user_setup_token_email_idx").on(table.email)],
)
