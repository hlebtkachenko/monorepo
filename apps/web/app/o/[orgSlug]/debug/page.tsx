import type { Metadata } from "next"
import { notFound } from "next/navigation"

import { getTranslations } from "@workspace/i18n/server"

import { resolveMembership } from "@/lib/org/resolve"
import { getRequestSession } from "@/lib/org/session"

import { hasDebugModuleAccess } from "./access"

/**
 * Debug module → Overview.
 *
 * Dev/admin-only: the module is gated so it renders ONLY on a development build
 * OR for a member of an allowlisted workspace (see `./access`). A normal
 * production user who deep-links here fails closed to a 404 — the same decision
 * the rail uses to hide the module.
 *
 * Intentionally EMPTY body. Like every page in the rebuilt tree it carries no
 * demo / placeholder content: the shell renders around an empty content panel
 * until a real Debug surface is designed.
 */
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("org.titles")
  return { title: t("debug") }
}

export default async function DebugOverviewPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>
}) {
  const { orgSlug } = await params

  // The layout already guarantees a session + org membership; re-resolve here
  // only to read the workspace id the allowlist gate keys on, and fail closed.
  const session = await getRequestSession()
  const membership = session
    ? await resolveMembership({ slug: orgSlug, userId: session.user.id })
    : null
  if (!membership || !(await hasDebugModuleAccess(membership.workspaceId))) {
    notFound()
  }

  return null
}
