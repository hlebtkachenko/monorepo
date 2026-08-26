/**
 * Drizzle pgEnum declarations for the beta portal database.
 *
 * Every declaration here MUST mirror `apps/beta/db/migrations/*.sql` exactly.
 * A future `ALTER TYPE ... ADD VALUE` migration updates this file in the same
 * PR. `db/schema-drift.test.ts` fails the build when the two drift apart.
 *
 * Names are `beta_`-prefixed on purpose. Beta runs on its own database, so a
 * runtime collision with the main app is impossible, but a bare `org_role`
 * would read in review as the main app's `organization_role` (owner | admin |
 * member | agent | guest) — a different enum with a different meaning.
 */
import { pgEnum } from "drizzle-orm/pg-core"

/**
 * Mirrors: 0000_init.sql — CREATE TYPE beta_org_role.
 *
 * The single role axis (plan Part 4, Hleb decision 2026-08-25):
 *   owner  — Účetní. Accounting data entry + office-internal layer + org
 *            settings + invites + org delete. Requires `app_user.is_staff`.
 *   admin  — Majitel společnosti. All client-visible data, uploads, and invites
 *            limited to admin | member | guest.
 *   member — Pracovník firmy (vedení). Uploads + views, no invites.
 *   guest  — Host. Read-only; also the employee seat when linked to a payroll
 *            employee row (PR 29+), which narrows it to own-payroll only.
 */
export const betaOrgRole = pgEnum("beta_org_role", [
  "owner",
  "admin",
  "member",
  "guest",
])

/** A membership role value, derived from the enum — never a hand-written union. */
export type BetaOrgRole = (typeof betaOrgRole.enumValues)[number]

/** Mirrors: 0000_init.sql — CREATE TYPE beta_vat_regime. */
export const betaVatRegime = pgEnum("beta_vat_regime", ["platce", "neplatce"])

export type BetaVatRegime = (typeof betaVatRegime.enumValues)[number]

/**
 * Mirrors: 0000_init.sql — CREATE TYPE beta_setup_token_purpose.
 *
 * Advisor blocker B4-4 splits the one-time link by purpose because the three
 * flows have different preconditions: `account_setup` only when no account
 * exists, `org_invite` only with an authenticated session on a matching email,
 * `password_reset` only when issued by office staff (and it revokes every
 * session on consume).
 */
export const betaSetupTokenPurpose = pgEnum("beta_setup_token_purpose", [
  "account_setup",
  "org_invite",
  "password_reset",
])

export type BetaSetupTokenPurpose =
  (typeof betaSetupTokenPurpose.enumValues)[number]
