/**
 * Role bootstrap for testcontainer environments.
 *
 * Replicates the init.d/*.sql files from infra/compose/postgres/init.d/ against
 * a freshly started testcontainer Postgres instance. The docker-entrypoint-initdb.d
 * pipeline does not run when the testcontainer starts (the image already has an
 * initialized data directory). We apply the same SQL via postgres.unsafe().
 *
 * Single source of truth: the SQL files in infra/compose/postgres/init.d/ are
 * the canonical role bootstrap. This module reads them and applies each in
 * dictionary order (00-roles.sql, 01-grants.sql, ...) so dev compose and
 * testcontainer environments stay in sync automatically.
 *
 * psql meta-commands (backslash directives like `\set ON_ERROR_STOP on`,
 * `\connect`, `\i`) cannot be executed by postgres-js. We strip them before
 * sending the SQL to the server. This is intentional and documented here:
 *
 *   - `\set ON_ERROR_STOP on`: psql behavior flag. The postgres-js client
 *     already stops on any error by default (it throws on the first failing
 *     statement). Safe to strip.
 *   - `\connect <db>`: testcontainer is already connected to the right DB.
 *     Safe to strip.
 *   - `\i <file>`: file include. Not used in our init.d files. If encountered,
 *     the stripped result is a no-op (no sql sent).
 */

import { readdir, readFile } from "node:fs/promises"
import { resolve } from "node:path"
import postgres from "postgres"

/**
 * Strip psql meta-command lines (lines starting with `\`) from a SQL string.
 * Returns only the SQL that postgres-js can execute.
 */
function stripPsqlMeta(sql: string): string {
  return sql
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("\\"))
    .join("\n")
}

/**
 * Apply role bootstrap SQL files from initdDir against the given superuser
 * connection URL. Files are applied in dictionary order (00-, 01-, ...).
 *
 * After roles are created this function also applies the per-role GUC defaults
 * required by the last-owner-demotion trigger (ADR-0010):
 *
 *   ALTER ROLE app_user  SET app.app_user_role_name = 'app_user'
 *   ALTER ROLE app_owner SET app.app_user_role_name = 'app_owner'
 *
 * These are already present in 00-roles.sql, so the ALTER ROLE lines run as
 * part of the normal file apply loop. No additional ALTER ROLE is needed here
 * unless the init.d files are missing them.
 */
export async function applyRoleBootstrap(
  adminUrl: string,
  initdDir: string,
): Promise<void> {
  const client = postgres(adminUrl, {
    prepare: false,
    max: 1,
    onnotice: () => {},
  })

  try {
    const entries = await readdir(initdDir)
    const sqlFiles = entries.filter((f) => f.endsWith(".sql")).sort()

    for (const file of sqlFiles) {
      const raw = await readFile(resolve(initdDir, file), "utf8")
      const sql = stripPsqlMeta(raw).trim()
      if (sql.length === 0) continue
      await client.unsafe(sql)
    }
  } finally {
    await client.end({ timeout: 5 })
  }
}
