"use server"

import { requireBetaSession } from "@/lib/auth/session"
import { setEmailNotificationsEnabled } from "@/lib/data/notification-prefs"

/**
 * Nastavení › Účet's email-notifications toggle (spec §2.10, §2.11).
 *
 * TOP-LEVEL `app/_actions/`, NOT `app/(portal)/[orgSlug]/nastaveni/_actions/`
 * — that route does not exist yet (PR 21/22 builds Nastavení). This action is
 * ACCOUNT-scoped, not organization-scoped (the toggle is one flag on
 * `app_user`, migration 0012's own header), so it has no natural home under an
 * `[orgSlug]` route anyway: it sits beside `app/_components/` and `app/_nav/`,
 * the same top-level, cross-route grouping those two already use.
 *
 * `requireBetaSession()` — not a caller-supplied user id — is what proves the
 * caller IS the account being changed; a Server Action is a public POST
 * endpoint reachable without ever rendering the page that will eventually
 * hold this toggle's form (`documents-office.ts`'s `_actions` files state the
 * same reasoning for re-deriving their own scope).
 */
export async function setEmailNotificationsEnabledAction(
  enabled: boolean,
): Promise<{ ok: true }> {
  const session = await requireBetaSession()
  await setEmailNotificationsEnabled(session.userId, enabled)
  return { ok: true }
}
