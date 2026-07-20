import type { Metadata } from "next"
import { notFound } from "next/navigation"

import { getTranslations } from "@workspace/i18n/server"
import type { TableSectionRow } from "@workspace/ui/blocks/content-panel"

import { isFavorited, toggleFavorite } from "@/lib/org/favorite-actions"
import { getFinancialInstitutions } from "@/lib/org/financial-institution-data"
import { resolveMembership } from "@/lib/org/resolve"
import { getRequestSession } from "@/lib/org/session"

import { FinancialInstitutionsView } from "../../../_shell/app-body/app-content/content-body/financial-institutions-view"

/**
 * Finance → Číselníky → Peněžní ústavy.
 *
 * The ČNB bank-code reference surface: a read-only Table over the shared
 * `financial_institution` register. Display names resolve from next-intl
 * (`bankNames`, keyed by bank_code), so the row's `name` is localized here at the
 * serialization boundary — the DB stores no name. A fixed reference register
 * (Case-B), so read-only.
 */
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("org.titles")
  return { title: t("financialInstitutions") }
}

export default async function FinancialInstitutionsPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>
}) {
  const { orgSlug } = await params

  const session = await getRequestSession()
  if (!session) notFound()
  const membership = await resolveMembership({
    slug: orgSlug,
    userId: session.user.id,
  })
  if (!membership) notFound()

  const t = await getTranslations("org.titles")
  const tf = await getTranslations("org.favorite")
  const names = await getTranslations("bankNames")
  const title = t("financialInstitutions")
  const route = "finance/ciselniky/penezni-ustavy"

  const [institutions, active] = await Promise.all([
    getFinancialInstitutions({
      organizationId: membership.organizationId,
      userId: session.user.id,
    }),
    isFavorited({ slug: orgSlug, route }),
  ])

  const rows: readonly TableSectionRow[] = institutions.map((inst) => {
    const key = inst.bankCode as Parameters<typeof names>[0]
    return {
      id: inst.bankCode,
      code: inst.bankCode,
      name: names.has(key) ? names(key) : inst.bankCode,
    }
  })

  async function onToggleFavorite() {
    "use server"
    const result = await toggleFavorite({
      slug: orgSlug,
      route,
      module: "finance",
      label: title,
    })
    if (!result.ok) throw new Error("favorite toggle failed")
    return result.favorited
  }

  return (
    <FinancialInstitutionsView
      key={orgSlug}
      slug={orgSlug}
      title={title}
      rows={rows}
      favorite={{
        initialActive: active,
        onToggle: onToggleFavorite,
        tooltip: tf("tooltip"),
        addLabel: tf("add"),
        removeLabel: tf("remove"),
      }}
    />
  )
}
