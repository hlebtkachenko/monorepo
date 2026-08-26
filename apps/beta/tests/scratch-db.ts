/**
 * Helpers for the `db` vitest project.
 *
 * The shared database booted by `tests/global-setup.ts` is already migrated;
 * tests that need a genuinely empty database (the migration runner's own tests)
 * create a scratch one on the same container instead of paying for a second
 * container boot.
 */
import postgres from "postgres"

/** Connection URL of the shared, already-migrated database. */
export function sharedDatabaseUrl(): string {
  const url = process.env["DATABASE_URL"]
  if (!url) {
    throw new Error(
      "DATABASE_URL is not set — tests/global-setup.ts did not run",
    )
  }
  return url
}

/** Same server, different database name. */
function databaseUrlFor(name: string): string {
  const url = new URL(sharedDatabaseUrl())
  url.pathname = `/${name}`
  return url.toString()
}

/**
 * Create an empty database on the test server, hand its URL to `fn`, then drop
 * it. `name` must be a plain identifier — it is interpolated into DDL, which
 * Postgres does not parameterize.
 */
export async function withScratchDatabase<T>(
  name: string,
  fn: (url: string) => Promise<T>,
): Promise<T> {
  if (!/^[a-z][a-z0-9_]*$/.test(name)) {
    throw new Error(`scratch database name must be a plain identifier: ${name}`)
  }
  const admin = postgres(sharedDatabaseUrl(), { max: 1, onnotice: () => {} })
  try {
    await admin.unsafe(`DROP DATABASE IF EXISTS ${name}`)
    await admin.unsafe(`CREATE DATABASE ${name}`)
  } finally {
    await admin.end({ timeout: 5 })
  }

  try {
    return await fn(databaseUrlFor(name))
  } finally {
    const cleanup = postgres(sharedDatabaseUrl(), {
      max: 1,
      onnotice: () => {},
    })
    try {
      await cleanup.unsafe(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`)
    } finally {
      await cleanup.end({ timeout: 5 })
    }
  }
}

/** A unique-per-call suffix so parallel-safe fixtures never collide. */
let counter = 0
export function unique(prefix: string): string {
  counter += 1
  return `${prefix}${Date.now().toString(36)}${counter}`
}
