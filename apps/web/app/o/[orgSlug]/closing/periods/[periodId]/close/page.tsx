import type { Metadata } from "next"
import { notFound } from "next/navigation"

import { getTranslations } from "@workspace/i18n/server"

import { getPeriodCloseReadiness } from "@/lib/org/period-readiness"

import { ClosingCloseWizard } from "../../../../_shell/app-body/app-content/content-body/closing-close-wizard"

/**
 * Closing → Účetní období → spuštění účetní závěrky.
 *
 * A dedicated page that runs the year-end close for one period. The server
 * resolves the close-readiness assessment (owner/admin gate + the BLOCKER /
 * WARNING checklist) once and hands it to the client wizard, which walks
 * Konfigurace → Kontrola → Spuštění and calls `closePeriodAction`. `notFound()`
 * when there is no session, membership, or the id is not a period (the layout
 * already guards membership; this is defense-in-depth). The entry button from
 * the Periods list is wired later (P10).
 */
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("org.closeWizard")
  return { title: t("title") }
}

export default async function ClosePeriodPage({
  params,
}: {
  params: Promise<{ orgSlug: string; periodId: string }>
}) {
  const { orgSlug, periodId } = await params

  const state = await getPeriodCloseReadiness({ slug: orgSlug, periodId })
  if (!state) notFound()

  return (
    <ClosingCloseWizard
      key={periodId}
      slug={orgSlug}
      periodId={periodId}
      readiness={state.readiness}
      canManage={state.canManage}
    />
  )
}
