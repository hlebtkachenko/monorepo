/**
 * oauth_pending_reference — transient per-user record of the organization
 * chosen on the `/select-organization` step of an OAuth authorize flow, read
 * back by `oauthProvider.postLogin.consentReferenceId` to bind the issued
 * token to exactly one organization (mirrors the api_key = one-org rule).
 *
 * NOT a Better Auth model — it is our own tenant-binding state, so it follows
 * the repo's snake_case-key convention. Only the server-side auth flow touches
 * it (via withAdminBypass, cross-user by design), so global-tier, NO RLS. The
 * row is last-choice-wins and safe to leave; `consentReferenceId` always
 * re-validates the choice against a live active membership before trusting it.
 *
 * Mirrors: packages/db/migrations/0066_oauth_provider.sql
 */
import { pgTable, timestamp, uuid } from "drizzle-orm/pg-core"
import { app_user } from "./app_user"
import { organization } from "./organization"

export const oauth_pending_reference = pgTable("oauth_pending_reference", {
  user_id: uuid("user_id")
    .primaryKey()
    .references(() => app_user.id, { onDelete: "cascade" }),
  organization_id: uuid("organization_id")
    .notNull()
    .references(() => organization.id, { onDelete: "cascade" }),
  updated_at: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
})
