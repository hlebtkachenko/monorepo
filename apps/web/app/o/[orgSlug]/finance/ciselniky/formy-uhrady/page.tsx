import type { Metadata } from "next"
import { notFound } from "next/navigation"

import { getTranslations } from "@workspace/i18n/server"
import type { TableSectionRow } from "@workspace/ui/blocks/content-panel"

import { isFavorited, toggleFavorite } from "@/lib/org/favorite-actions"
import { getPaymentForms } from "@/lib/org/payment-form-data"
import { resolveMembership } from "@/lib/org/resolve"
import { getRequestSession } from "@/lib/org/session"

import { PaymentFormsView } from "../../../_shell/app-body/app-content/content-body/payment-forms-view"

/**
 * Finance → Číselníky → Formy úhrady.
 *
 * The forma-úhrady reference surface: a read-only Table over the shared
 * `payment_form` register (the Czech payment-manner list — Dobírkou / Hotově /
 * Převodem / …). Display names + the instrumental invoice phrase resolve from
 * next-intl (`paymentFormNames` / `paymentFormPhrases`, keyed by code), so they are
 * localized here at the serialization boundary — the DB stores no Czech text. A
 * fixed reference register (Case-B), so read-only.
 */
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("org.titles")
  return { title: t("paymentMethods") }
}

export default async function PaymentFormsPage({
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
  const names = await getTranslations("paymentFormNames")
  const phrases = await getTranslations("paymentFormPhrases")
  const title = t("paymentMethods")
  const route = "finance/ciselniky/formy-uhrady"

  const [forms, active] = await Promise.all([
    getPaymentForms({
      organizationId: membership.organizationId,
      userId: session.user.id,
    }),
    isFavorited({ slug: orgSlug, route }),
  ])

  const rows: readonly TableSectionRow[] = forms.map((form) => {
    const key = form.code as Parameters<typeof names>[0]
    return {
      id: form.code,
      code: form.code,
      name: names.has(key) ? names(key) : form.code,
      phrase: phrases.has(key) ? phrases(key) : "",
      invoice: form.offerOnInvoice ? "yes" : "no",
      cashDesk: form.offerOnCashDesk ? "yes" : "no",
      pos: form.offerOnPos ? "yes" : "no",
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
    <PaymentFormsView
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
