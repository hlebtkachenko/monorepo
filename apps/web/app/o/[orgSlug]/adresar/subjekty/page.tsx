import type { Metadata } from "next"
import { notFound } from "next/navigation"

import { getTranslations } from "@workspace/i18n/server"
import type { TableSectionRow } from "@workspace/ui/blocks/content-panel"

import { getPartyRegister } from "@/lib/org/directory"
import { isFavorited, toggleFavorite } from "@/lib/org/favorite-actions"
import { resolveMembership } from "@/lib/org/resolve"
import { getRequestSession } from "@/lib/org/session"

import { SubjektyView } from "../../_shell/app-body/app-content/content-body/adresar-subjekty-view"

/**
 * Adresář → Subjekty (Všechny subjekty).
 *
 * The party register — every workspace-shared counterparty with this org's
 * relationship overlay and the derived supplier/customer role. Read-only Table
 * archetype wired to `listParties` (@workspace/accounting) via the
 * `getPartyRegister` app-edge. party_kind + the derived role are localized here at
 * the serialization boundary (the DB stores a code, not a label). Archived parties
 * are hidden (activeOnly).
 */
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("org.titles")
  return { title: t("subjects") }
}

export default async function SubjektyPage({
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
  const td = await getTranslations("org.directory")
  const title = t("subjects")
  const route = "adresar/subjekty"

  const [parties, active] = await Promise.all([
    getPartyRegister({
      organizationId: membership.organizationId,
      userId: session.user.id,
    }),
    isFavorited({ slug: orgSlug, route }),
  ])

  const rows: readonly TableSectionRow[] = parties.map((party) => {
    const kindKey = party.partyKindCode
      ? (`subjects.kind.${party.partyKindCode}` as Parameters<typeof td>[0])
      : null
    const kind =
      kindKey && td.has(kindKey) ? td(kindKey) : (party.partyKindCode ?? "")
    const role = [
      party.isSupplier ? td("subjects.role.supplier") : null,
      party.isCustomer ? td("subjects.role.customer") : null,
    ]
      .filter(Boolean)
      .join(" · ")
    return {
      id: party.id,
      name: party.name,
      kind,
      ico: party.ico ?? "",
      dic: party.dic ?? "",
      country: party.countryCode ?? "",
      role,
    }
  })

  async function onToggleFavorite() {
    "use server"
    const result = await toggleFavorite({
      slug: orgSlug,
      route,
      module: "directory",
      label: title,
    })
    if (!result.ok) throw new Error("favorite toggle failed")
    return result.favorited
  }

  return (
    <SubjektyView
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
