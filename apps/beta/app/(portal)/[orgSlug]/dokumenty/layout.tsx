import type { ReactNode } from "react"

import { getBetaTranslations } from "@/i18n/translations-server"

import { resolveOrgScope } from "../_lib/org-scope"

import { DokumentyNavTabs } from "./_components/dokumenty-nav-tabs"

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
  await resolveOrgScope(orgSlug)
  const t = await getBetaTranslations()

  return (
    <div className="flex flex-col">
      <header className="grid gap-1 px-6 pt-6">
        <h1 className="font-heading text-xl font-semibold">
          {t("dokumenty.title")}
        </h1>
        <p className="text-sm text-muted-foreground">{t("dokumenty.intro")}</p>
      </header>
      <DokumentyNavTabs orgSlug={orgSlug} />
      <div className="grid gap-6 p-6">{children}</div>
    </div>
  )
}
