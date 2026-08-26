import type { ReactNode } from "react"

import { assertNotEmployeeSeat } from "@/lib/data/scope"

import { resolveOrgScope } from "../_lib/org-scope"

import { VykazyNavTabs } from "./_components/vykazy-nav-tabs"

/**
 * The Výkazy tree (spec §2.5): a tab row (Rozvaha · Výsledovka · Obratová
 * předvaha) above whichever statement is active underneath.
 *
 * `resolveOrgScope` here is the SAME `cache()`-wrapped call the org layout
 * already made for this request — proving a scope exists at all is the only
 * thing this layout needs it for, exactly as `dane/layout.tsx` does.
 *
 * NO ROLE GATE. A published statement is client-visible data, so every role
 * that holds a membership reads it (spec §5, and `publishedBatchFor` filters
 * drafts out in SQL rather than by caller convention). The owner-only surface
 * is Pro účetní › Měsíční uzávěrka, which is where publishing lives.
 */
/**
 * THE EMPLOYEE SEAT DOES NOT HAVE THIS MODULE (spec §2.6.1: its rail is Přehled ·
 * Dokumenty · Moje mzda, and "Everything else 404"). `assertNotEmployeeSeat` is
 * that sentence, applied once at the module root so every leaf beneath it
 * inherits the refusal — a Next layout renders for every nested route, which is
 * exactly the property a whitelist wants.
 *
 * `payroll-seat-fence.boundary.test.ts` fails if this call is ever removed.
 */
export default async function VykazyLayout({
  children,
  params,
}: {
  children: ReactNode
  params: Promise<{ orgSlug: string }>
}) {
  const { orgSlug } = await params
  assertNotEmployeeSeat(await resolveOrgScope(orgSlug))

  return (
    <div className="flex flex-col">
      <VykazyNavTabs orgSlug={orgSlug} />
      <div className="grid gap-6 p-6">{children}</div>
    </div>
  )
}
