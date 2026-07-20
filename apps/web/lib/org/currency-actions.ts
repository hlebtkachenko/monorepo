"use server"

import { and, eq } from "drizzle-orm"
import { withOrganization } from "@workspace/db"
import { org_currency } from "@workspace/db/schema"

import { resolveMembership } from "@/lib/org/resolve"
import { getRequestSession } from "@/lib/org/session"

export interface SetCurrencyEnabledResult {
  ok: boolean
  /** The currency's enablement state after the write. */
  enabled?: boolean
}

/**
 * Enable or disable one ISO 4217 currency for the caller's organization on the
 * Měny reference page.
 *
 * Tenancy is derived server-side (never from the client): `userId` from the
 * session, `organizationId` from `resolveMembership({ slug, userId })` — so only
 * an org the caller belongs to resolves. The write runs under `withOrganization`,
 * binding `app.organization_id` (+ `app.user_id`) so the `org_currency`
 * FORCE-RLS `organization_isolation` policy is the tenant boundary; the explicit
 * `organization_id` filter on delete is defense-in-depth.
 *
 * Enable = idempotent insert (`ON CONFLICT DO NOTHING` on the per-org UNIQUE);
 * disable = delete. This never touches the org's functional currency, which lives
 * on `accounting_period.accounting_currency` and is always available regardless.
 */
export async function setCurrencyEnabled(input: {
  slug: string
  code: string
  enabled: boolean
}): Promise<SetCurrencyEnabledResult> {
  const code = input.code.trim().toUpperCase()
  if (code.length !== 3) return { ok: false }

  const session = await getRequestSession()
  const userId = session?.user?.id
  if (!userId) return { ok: false }

  const membership = await resolveMembership({ slug: input.slug, userId })
  if (!membership) return { ok: false }

  const { organizationId } = membership

  const enabled = await withOrganization(organizationId, userId, async (db) => {
    if (input.enabled) {
      await db
        .insert(org_currency)
        .values({
          organization_id: organizationId,
          currency_code: code,
          enabled_by_user_id: userId,
        })
        .onConflictDoNothing({
          target: [org_currency.organization_id, org_currency.currency_code],
        })
      return true
    }
    await db
      .delete(org_currency)
      .where(
        and(
          eq(org_currency.organization_id, organizationId),
          eq(org_currency.currency_code, code),
        ),
      )
    return false
  })

  return { ok: true, enabled }
}
