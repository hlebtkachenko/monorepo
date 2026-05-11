/**
 * Migration runner for testcontainer environments.
 *
 * Applies the SQL files from packages/db/migrations/ in lexicographic order
 * against a superuser connection. Inline re-implementation of the
 * apply-migrations.ts logic — we do NOT shell out to that script because:
 *
 *   1. The script validates DATABASE_DIRECT_URL port != 6432. Testcontainer
 *      ports are ephemeral; the validation contract doesn't apply here.
 *   2. The script reads from process.env. Testcontainer helpers pass the URL
 *      directly, so we don't want to pollute process.env.
 *   3. The advisory lock and journal table are useful in production but add
 *      unnecessary complexity in isolated test containers.
 *
 * The SQL splitter is intentionally simple (same as apply-migrations.ts §B1).
 * If a migration requires CONCURRENTLY operations outside a transaction, the
 * test run will surface that early — a useful CI gate.
 */

import { readdir, readFile } from "node:fs/promises"
import { resolve } from "node:path"
import postgres from "postgres"

/**
 * Apply all migrations from migrationsDir against the given superuser URL.
 * Migrations are applied in lexicographic order inside individual transactions.
 *
 * Skips the advisory lock + journal (not needed for ephemeral testcontainers).
 * On any failure the error is re-thrown immediately — the container is
 * ephemeral so there is no state to recover.
 */
export async function applyMigrations(
  adminUrl: string,
  migrationsDir: string,
): Promise<void> {
  const client = postgres(adminUrl, {
    prepare: false,
    max: 1,
    onnotice: () => {},
  })

  try {
    const entries = await readdir(migrationsDir)
    const files = entries.filter((f) => f.endsWith(".sql")).sort()

    for (const file of files) {
      const body = await readFile(resolve(migrationsDir, file), "utf8")
      await client.unsafe(body)
    }
  } finally {
    await client.end({ timeout: 5 })
  }
}
