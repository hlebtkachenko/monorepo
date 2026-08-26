import type { ReactNode } from "react"

import { getBetaTranslations } from "@/i18n/translations-server"

import { isEmployeeSeat } from "@/lib/data/scope"

import { PageHeader } from "../../../_components/page-header"

import { resolveOrgScope } from "../_lib/org-scope"

import { DokumentyNavTabs } from "./_components/dokumenty-nav-tabs"
import { DOKUMENTY_NAV, DOKUMENTY_SEAT_NAV } from "./_nav/dokumenty-nav"

/**
 * The Dokumenty tree (spec §2.2, PR 13): the module title, then a tab row
 * (Vše · Doklady firmy · Stavby) above whichever page is active underneath.
 *
 * OWNS WHAT USED TO BE `page.tsx`'S OWN HEADER. PR 12 shipped only "Vše" and
 * that page rendered its own `<h1>` + intro directly, because there was
 * nothing else in the tree to share it with. Now that Doklady firmy and
 * Stavby exist as SIBLING routes under this layout, the title belongs here —
 * one header for all three tabs, not three copies of the same two lines — the
 * same move `dane/layout.tsx` made for Souhrn plus its four families.
 *
 * `resolveOrgScope` here is the SAME `cache()`-wrapped call every page below
 * already makes for this request — proving a scope exists at all is the only
 * thing this layout needs it for, mirroring `DaneLayout`.
 */
export default async function DokumentyLayout({
  children,
  params,
}: {
  children: ReactNode
  params: Promise<{ orgSlug: string }>
}) {
  const { orgSlug } = await params
  const scope = await resolveOrgScope(orgSlug)
  const t = await getBetaTranslations()
  // THE EMPLOYEE SEAT KEEPS THIS MODULE (spec §2.6.1 gives it "Dokumenty (own)"
  // as one of its three rail entries) — it is the one org-tier module that is
  // NOT gated by `assertNotEmployeeSeat`, because the data layer narrows it
  // instead: filter 5 of `visibleDocuments` restricts every read here to rows
  // the viewer uploaded themselves. What varies is the tab row.
  const seat = isEmployeeSeat(scope)

  return (
    <div className="flex flex-col">
      <PageHeader
        className="px-6 pt-6"
        title={t("dokumenty.title")}
        intro={t("dokumenty.intro")}
      />
      <DokumentyNavTabs
        orgSlug={orgSlug}
        items={seat ? DOKUMENTY_SEAT_NAV : DOKUMENTY_NAV}
      />
      <div className="grid gap-6 p-6">{children}</div>
    </div>
  )
}
