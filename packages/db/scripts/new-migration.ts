/**
 * new-migration.ts
 *
 * Scaffold the next-numbered handwritten SQL migration (ADR-0009: migrations
 * are handwritten, drizzle-kit generate/push is forbidden). Emits
 * `packages/db/migrations/NNNN_<name>.sql` with NNNN = highest existing
 * number + 1, matching the `NNNN_<snake>.sql` format enforced by the
 * lefthook `db-smoke` hook and db-tests.yml.
 *
 * Usage: pnpm --filter @workspace/db db:new-migration <snake_case_name>
 */

import { readdir, writeFile } from "node:fs/promises"
import { fileURLToPath } from "node:url"
import { dirname, resolve } from "node:path"

const name = process.argv[2]
if (!name || !/^[a-z][a-z0-9_]*$/.test(name)) {
  console.error(
    "Usage: pnpm --filter @workspace/db db:new-migration <snake_case_name>",
  )
  console.error(
    "Name must match ^[a-z][a-z0-9_]*$ — full words, no abbreviated prefixes (lefthook db-smoke enforces NNNN_<snake>.sql).",
  )
  process.exit(1)
}

const migrationsDir = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "migrations",
)
const entries = await readdir(migrationsDir)
const numbers = entries
  .map((f) => /^(\d{4})_[a-z][a-z0-9_]*\.sql$/.exec(f)?.[1])
  .filter((n): n is string => n !== undefined)
  .map(Number)

const next = String(Math.max(0, ...numbers) + 1).padStart(4, "0")
const filename = `${next}_${name}.sql`
const path = resolve(migrationsDir, filename)

// `wx` makes the existence check and the write one atomic operation —
// no separate existsSync (check-then-act race).
try {
  await writeFile(
    path,
    `-- ${filename}
--
-- <What this migration does and why.>
--
-- Conventions (ADR-0009): handwritten SQL, snake_case, full words only.
-- Tenant-scoped tables need organization_id + a FORCE RLS pgPolicy using
-- current_setting('app.organization_id').
`,
    { flag: "wx" },
  )
} catch (err) {
  if ((err as NodeJS.ErrnoException).code === "EEXIST") {
    console.error(`${filename} already exists — refusing to overwrite.`)
    process.exit(1)
  }
  throw err
}

console.log(`created packages/db/migrations/${filename}`)
console.log("After writing the SQL:")
console.log(
  "  1. pnpm --filter @workspace/db db:migrate          (apply locally)",
)
console.log(
  "  2. pnpm --filter @workspace/db db:schema-snapshot  (requires local Postgres; commit the snapshot with the migration)",
)
