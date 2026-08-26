import "server-only"

import { count, eq, sql } from "drizzle-orm"

import {
  app_user,
  organization,
  organization_membership,
  user_setup_token,
} from "@/db/schema"

import type { OfficeScope } from "../scope"

import { officeDb } from "./db"

/**
 * Provoz — the small read-only picture of the deployment (spec §3.5:
 * "healthz, env, seed non-prod").
 *
 * SEEDING IS NOT HERE. The demo seed is PR 36, and it needs the modules whose
 * tables do not exist yet; a "seed" button now would either do nothing or write
 * an organization the /admin create form already writes better. The env block
 * is deliberately a PRESENCE check over a fixed list of NAMES — never a value —
 * because a page that prints `process.env` is a page that prints
 * `BETTER_AUTH_SECRET` the day someone adds a loop over its keys.
 */
export type OfficeOperationsSummary = {
  organizations: number
  archivedOrganizations: number
  users: number
  staffUsers: number
  disabledUsers: number
  activeMemberships: number
  liveSetupLinks: number
}

export async function officeOperationsSummary(
  office: OfficeScope,
): Promise<OfficeOperationsSummary> {
  const db = officeDb(office)

  // Table-qualified literals rather than interpolated Drizzle columns, for the
  // reason spelled out in `organizations.ts`: interpolation emits a bare column
  // name, which is a bug waiting for the day one of these grows a join.
  const [organizations] = await db
    .select({
      total: count(),
      archived: sql<number>`count(*) FILTER (WHERE organization.archived_at IS NOT NULL)::int`,
    })
    .from(organization)

  const [users] = await db
    .select({
      total: count(),
      staff: sql<number>`count(*) FILTER (WHERE app_user.is_staff)::int`,
      disabled: sql<number>`count(*) FILTER (WHERE app_user.disabled_at IS NOT NULL)::int`,
    })
    .from(app_user)

  const [memberships] = await db
    .select({ total: count() })
    .from(organization_membership)
    .where(eq(organization_membership.active, true))

  const [links] = await db
    .select({ total: count() })
    .from(user_setup_token)
    .where(
      sql`user_setup_token.consumed_at IS NULL
          AND user_setup_token.revoked_at IS NULL
          AND user_setup_token.expires_at > now()`,
    )

  return {
    organizations: organizations?.total ?? 0,
    archivedOrganizations: organizations?.archived ?? 0,
    users: users?.total ?? 0,
    staffUsers: users?.staff ?? 0,
    disabledUsers: users?.disabled ?? 0,
    activeMemberships: memberships?.total ?? 0,
    liveSetupLinks: links?.total ?? 0,
  }
}

/**
 * A fixed list of variable NAMES and whether each is set. No values, ever, and
 * no iteration over `process.env` — the list is written out so adding a secret
 * to the environment cannot add it to this page by accident.
 *
 * `BETTER_AUTH_URL` is the one value shown, because it IS the site's own public
 * origin: it is in every link the app emits and in the address bar already.
 */
const REQUIRED_ENV = [
  "DATABASE_URL",
  "BETTER_AUTH_SECRET",
  "BETTER_AUTH_URL",
] as const

export type OfficeEnvironmentReport = {
  nodeEnv: string
  buildVersion: string | null
  baseUrl: string | null
  variables: readonly { name: string; present: boolean }[]
}

export function officeEnvironmentReport(
  office: OfficeScope,
): OfficeEnvironmentReport {
  // Same fail-closed re-assert the data functions get, for a function that
  // reads no database but is just as staff-only.
  officeDb(office)

  return {
    nodeEnv: process.env.NODE_ENV,
    buildVersion: process.env["BUILD_VERSION"]?.trim() || null,
    baseUrl: process.env["BETTER_AUTH_URL"]?.trim() || null,
    variables: REQUIRED_ENV.map((name) => ({
      name,
      present: (process.env[name]?.trim().length ?? 0) > 0,
    })),
  }
}
