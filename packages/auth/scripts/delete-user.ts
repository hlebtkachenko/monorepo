#!/usr/bin/env tsx
/**
 * Dev CLI — nuke every row tied to a given email so testing can start
 * from scratch. Default: refuses unless DATABASE_DIRECT_URL points at the
 * local dev database (dev-compose port 54322 + loopback after DNS).
 * Override for intentional staging cleanup requires explicit flags and
 * still blocks production by typed env name.
 *
 * Connects directly as app_owner (SUPERUSER in dev compose) so the txn
 * can set `session_replication_role = replica` to bypass
 * `app_prevent_last_owner_demotion` for the cascade-delete of the sole
 * owner row. This is intentionally outside withAdminBypass (which
 * switches to app_admin BYPASSRLS NOLOGIN — not a superuser).
 *
 * Order matters because not every FK cascades from workspace/org:
 *   1. audit_event   — no cascade from organization / workspace
 *   2. organization  — cascades organization_membership, auth_invite,
 *                      permission_template
 *   3. workspace     — cascades workspace_membership, workspace_billing,
 *                      two_factor_policy, impersonation
 *   4. app_user      — cascades auth_account, auth_session, two_factor
 *   5. auth_verification rows matching the email (BA stores reset
 *      tokens here keyed on the identifier email; no FK to app_user).
 *
 * Usage:
 *   # local dev (default)
 *   pnpm tsx packages/auth/scripts/delete-user.ts --email direct@hleb.co
 *
 *   # intentional non-local (e.g. staging cleanup via SSM port-forward)
 *   pnpm tsx packages/auth/scripts/delete-user.ts \
 *     --email direct@hleb.co \
 *     --i-know-this-is-not-local \
 *     --typed-env-name staging
 */
import postgres from "postgres"

import { assertLocalDb } from "../src/local-db-guard"

function arg(flag: string): string | undefined {
  const i = process.argv.indexOf(flag)
  return i >= 0 ? process.argv[i + 1] : undefined
}

function hasFlag(flag: string): boolean {
  return process.argv.includes(flag)
}

async function main(): Promise<void> {
  const email = arg("--email")
  if (!email) {
    console.error("ERROR: --email <address> is required")
    process.exit(2)
  }

  const url = process.env.DATABASE_DIRECT_URL
  if (!url) {
    console.error("ERROR: DATABASE_DIRECT_URL is not set")
    process.exit(2)
  }

  let guard: Awaited<ReturnType<typeof assertLocalDb>>
  try {
    guard = await assertLocalDb(url, {
      iKnowThisIsNotLocal: hasFlag("--i-know-this-is-not-local"),
      typedEnvName: arg("--typed-env-name"),
    })
  } catch (err) {
    console.error(`ERROR: ${err instanceof Error ? err.message : String(err)}`)
    process.exit(2)
  }
  console.error(
    `[guard] branch=${guard.branch} host=${guard.host} port=${guard.port} resolved=${guard.resolvedAddress}`,
  )

  const sql = postgres(url, { max: 1, prepare: false })

  try {
    await sql.begin(async (tx) => {
      // Bypass the last-owner-demotion trigger so cascade-delete of the
      // workspace_membership owner row succeeds. app_owner is SUPERUSER
      // in the dev compose, so this is permitted.
      await tx.unsafe(`SET LOCAL session_replication_role = replica`)
      // Required by other triggers (e.g. app_prevent_last_owner_demotion
      // INSERT/UPDATE arm) when session_replication_role isn't honored
      // for some path — be defensive and set the GUC anyway.
      await tx.unsafe(`SET LOCAL app.app_user_role_name = 'app_owner'`)

      const userRows = await tx<{ id: string; email: string }[]>`
        SELECT id, email FROM app_user WHERE email = ${email} LIMIT 1
      `
      const user = userRows[0]

      if (!user) {
        console.log(`No app_user row with email ${email}; nothing to delete.`)
      } else {
        console.log(`Found app_user ${user.id} (${user.email})`)

        const wsRows = await tx<{ id: string }[]>`
          SELECT id FROM workspace WHERE created_by_user_id = ${user.id}
        `
        const workspaceIds = wsRows.map((r) => r.id)

        const orgIds: string[] = []
        for (const wsId of workspaceIds) {
          const rows = await tx<{ id: string }[]>`
            SELECT id FROM organization WHERE workspace_id = ${wsId}
          `
          for (const r of rows) orgIds.push(r.id)
        }

        console.log(
          `  workspaces: ${workspaceIds.length}, organizations: ${orgIds.length}`,
        )

        for (const id of orgIds) {
          await tx`DELETE FROM audit_event WHERE organization_id = ${id}`
        }
        for (const id of workspaceIds) {
          await tx`DELETE FROM audit_event WHERE workspace_id = ${id}`
        }
        for (const id of orgIds) {
          await tx`DELETE FROM organization WHERE id = ${id}`
        }
        for (const id of workspaceIds) {
          await tx`DELETE FROM workspace WHERE id = ${id}`
        }

        // app_user cascades auth_account, auth_session, two_factor.
        await tx`DELETE FROM app_user WHERE id = ${user.id}`
      }

      // auth_verification keys on identifier (email); not tied to user_id.
      const ver = await tx<{ id: string }[]>`
        DELETE FROM auth_verification WHERE identifier = ${email} RETURNING id
      `
      // auth_invite rows where this email is the *recipient* under other
      // people's orgs — revoke instead of delete to preserve audit trail.
      const inv = await tx<{ id: string }[]>`
        UPDATE auth_invite
        SET status = 'revoked'
        WHERE email = ${email} AND status = 'pending'
        RETURNING id
      `

      console.log(
        `  auth_verification rows wiped: ${ver.length}, pending invites revoked: ${inv.length}`,
      )
    })
    console.log("Done.")
  } finally {
    await sql.end()
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? (err.stack ?? err.message) : String(err))
  const cause = (err as { cause?: unknown }).cause
  if (cause) console.error("cause:", cause)
  process.exit(1)
})
