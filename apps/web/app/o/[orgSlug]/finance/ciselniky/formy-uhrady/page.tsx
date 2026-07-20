import type { Metadata } from "next"
import { notFound } from "next/navigation"

import { getTranslations } from "@workspace/i18n/server"
import type { TableSectionRow } from "@workspace/ui/blocks/content-panel"

import { isFavorited, toggleFavorite } from "@/lib/org/favorite-actions"
import { getPaymentMethods } from "@/lib/org/payment-method-data"
import { resolveMembership } from "@/lib/org/resolve"
import { getRequestSession } from "@/lib/org/session"

import { PaymentMethodsView } from "../../../_shell/app-body/app-content/content-body/payment-methods-view"

/**
 * Finance → Číselníky → Formy úhrady.
 *
 * The forma-úhrady reference surface: a read-only Table over the shared
 * `payment_method` vocabulary (cash | transfer | card | other). Display names
 * resolve from next-intl (`org.paymentMethods.names`, keyed by code), so the
 * row's `name` is localized here at the serialization boundary — the DB stores
 * no name. A fixed platform vocabulary (Case-B), so read-only.
 */
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("org.titles")
  return { title: t("paymentMethods") }
}

export default async function PaymentMethodsPage({
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
  const names = await getTranslations("org.paymentMethods.names")
  const title = t("paymentMethods")
  const route = "finance/ciselniky/formy-uhrady"

  const [methods, active] = await Promise.all([
    getPaymentMethods({
      organizationId: membership.organizationId,
      userId: session.user.id,
    }),
    isFavorited({ slug: orgSlug, route }),
  ])

  const rows: readonly TableSectionRow[] = methods.map((m) => {
    const key = m.code as Parameters<typeof names>[0]
    return {
      id: m.code,
      code: m.code,
      name: names.has(key) ? names(key) : m.code,
      cash: m.isCash ? "yes" : "no",
      bankDetail: m.requiresBankDetail ? "yes" : "no",
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
    <PaymentMethodsView
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
