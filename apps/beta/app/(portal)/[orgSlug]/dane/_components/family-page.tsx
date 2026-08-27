import { notFound } from "next/navigation"

import { Card, CardContent } from "@workspace/ui/components/card"

import type { BetaFilingFamily } from "@/db/schema"
import { getBetaTranslations } from "@/i18n/translations-server"
import type { BetaMessageKey } from "@/i18n/messages"
import { filingsForScope } from "@/lib/data/filings"

import { FilingTable } from "@/app/_components/filing-table"

import { PageHeader } from "../../../../_components/page-header"

import { resolveOrgScope } from "../../_lib/org-scope"
import { resolveVisibleFilingFamilies } from "../_lib/dane-scope"

/**
 * The body every §2.3 family page shares — DPH, Daň z příjmů, Mzdové odvody a
 * hlášení, Ostatní all render this with a different `family` and `titleKey`;
 * nothing else differs between them (spec §2.3: "Family = constant mapping
 * over filing.kind").
 *
 * THE 404 GATE LIVES HERE, NOT ONLY IN THE TAB ROW. `DaneNavTabs` hiding the
 * DPH tab for a neplátce with no history is a UI convenience; a viewer who
 * still has the URL (bookmarked from before deregistering, or typed by hand)
 * must get the same 404 `requireScope` gives for a foreign organization —
 * §2.3's gate is a visibility rule, not a navigation rule, and checking it
 * only in the tab row would leave the route itself open. This check runs for
 * every family, not only `dph`: harmless for the other three (which
 * `visibleFilingFamiliesForScope` never excludes) and correct if that ever
 * changes.
 */
export async function FamilyFilingsPage({
  orgSlug,
  family,
  titleKey,
}: {
  orgSlug: string
  family: BetaFilingFamily
  titleKey: BetaMessageKey
}) {
  const visibleFamilies = await resolveVisibleFilingFamilies(orgSlug)
  if (!visibleFamilies.includes(family)) notFound()

  const [scope, t] = await Promise.all([
    resolveOrgScope(orgSlug),
    getBetaTranslations(),
  ])
  const filings = await filingsForScope(scope, { family })

  return (
    <>
      <PageHeader title={t(titleKey)} />

      <Card>
        <CardContent>
          <FilingTable
            orgSlug={orgSlug}
            filings={filings}
            emptyMessageKey="dane.familyEmpty"
          />
        </CardContent>
      </Card>
    </>
  )
}
