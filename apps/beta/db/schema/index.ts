/**
 * Beta portal schema barrel.
 *
 * Every table declared here mirrors a hand-written SQL migration under
 * `apps/beta/db/migrations/`. Generating or pushing schema with drizzle-kit is
 * forbidden repo-wide (ADR-0009): the SQL is the source of truth and this DSL is
 * the typed read of it. `db/schema-drift.test.ts` boots a real Postgres 18,
 * applies the migrations, and fails when the two disagree.
 */
export * from "./_enums"
export * from "./app_user"
export * from "./auth"
export * from "./organization"
export * from "./organization_membership"
export * from "./user_setup_token"
