import "server-only"

import { drizzle } from "drizzle-orm/postgres-js"
import postgres from "postgres"
import * as schema from "./schema"

/**
 * The beta portal's Drizzle client.
 *
 * `import "server-only"` is the import-surface lock: pulling this module into a
 * client component is a build error, not a runtime surprise. Nothing under
 * `app/` should import it directly either — the org-scoped seam of PR 07 wraps
 * it, and that wrapper is what feature code will consume. Keeping the raw
 * handle in one module is what makes that lockdown enforceable.
 *
 * Connection shape (plan Part 1 + infra/cdk/lib/beta-app-stack.ts):
 *   - DATABASE_URL is composed by the ECS task command from the RDS secret, so
 *     the password never lands in a task-definition environment variable.
 *   - No pgbouncer in this environment: one task, trivial connection count.
 *     `max: 10` is therefore a per-task cap against a runaway route, not a pool
 *     shared with anything else.
 *   - `prepare: false` mirrors the main app; it costs nothing on a direct
 *     connection and keeps the client safe if a pooler is ever put in front.
 *
 * There is no RLS in this database (spec / plan Part 4): the outer wall is the
 * dedicated `beta` database on its own RDS instance, and the inner wall is the
 * application scope seam. Do not add `SET LOCAL` GUC plumbing here.
 */
const MAX_CONNECTIONS = 10

export type BetaDatabase = ReturnType<typeof createBetaDb>

export function createBetaDb(connectionString: string) {
  const sql = postgres(connectionString, {
    prepare: false,
    max: MAX_CONNECTIONS,
    onnotice: () => {},
  })
  return drizzle(sql, { schema, casing: "snake_case" })
}

export function readDatabaseUrl(): string {
  const url = process.env["DATABASE_URL"]
  if (!url) {
    throw new Error(
      "DATABASE_URL is not set. The beta container composes it from the RDS " +
        "secret in its task command (infra/cdk/lib/beta-app-stack.ts); locally " +
        "it comes from the dev environment.",
    )
  }
  return url
}

let cached: BetaDatabase | undefined

/**
 * Lazily-built process-wide handle. Lazy on purpose: a module-level connection
 * would be opened during `next build`, where DATABASE_URL is a placeholder.
 */
export function betaDb(): BetaDatabase {
  cached ??= createBetaDb(readDatabaseUrl())
  return cached
}
