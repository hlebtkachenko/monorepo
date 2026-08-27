import { notFound } from "next/navigation"

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"

import { getBetaTranslations } from "@/i18n/translations-server"
import { filingsForScope } from "@/lib/data/filings"
import { obligationsForScope } from "@/lib/data/obligations"
import { payrollScope } from "@/lib/data/payroll"

import { FilingTable } from "@/app/_components/filing-table"
import { ObligationGroupCard } from "@/app/_components/obligation-group-card"

import { PageHeader } from "../../../../_components/page-header"

import { resolveOrgScope } from "../../_lib/org-scope"

/**
 * Platby a termíny (spec §2.6): "payroll obligations + filings filtered
 * (odvody 20., záloha 20., JMHZ 1.–20.)".
 *
 * TWO ALREADY-BUILT READS, NO NEW QUERY. "Payroll obligations" is the `cssz_zp`
 * creditor group `obligationsForScope` (Finance › Dluhy a platby, PR 18)
 * already buckets — `prehled_cssz`/`prehled_zp`/`jmhz` map to it in
 * `beta_filing_obligation_group` (migration 0005's own comment explains why
 * `vyuctovani_dane` does not: its creditor is the FÚ, not ČSSZ/ZP, despite
 * being a payroll FILING). "Filings filtered" is `filingsForScope`'s
 * `mzdove_odvody` family — the exact filter Daně › Mzdové odvody a hlášení
 * already runs. This page reads both and renders the SAME two components
 * those two surfaces do; nothing here is a third read of the same rows.
 *
 * `mzdove_odvody` IS NOT VAT-GATED (`visibleFilingFamiliesForScope` only ever
 * excludes `dph`), but `filingsForScope` and `obligationsForScope` ARE
 * visible to every role elsewhere in this application (Daně, Finance) — the
 * management-only gate that hides this page from a guest is `payrollScope`,
 * checked explicitly here rather than assumed from `mzdy/layout.tsx` (see that
 * file's own page-level comment for why the check is repeated).
 */
export default async function PlatbyATerminyPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>
}) {
  const { orgSlug } = await params
  const scope = await resolveOrgScope(orgSlug)
  if (payrollScope(scope).kind !== "all") notFound()

  const [t, obligations, filings] = await Promise.all([
    getBetaTranslations(),
    obligationsForScope(scope),
    filingsForScope(scope, { family: "mzdove_odvody" }),
  ])

  const payrollObligations = obligations.groups.find(
    (group) => group.group === "cssz_zp",
  )

  return (
    <div className="grid gap-6">
      <PageHeader title={t("mzdy.platbyTitle")} intro={t("mzdy.platbyIntro")} />

      {payrollObligations ? (
        <ObligationGroupCard group={payrollObligations} />
      ) : (
        <Card>
          <CardContent className="py-6 text-sm text-muted-foreground">
            {t("mzdy.platbyObligationsEmpty")}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="font-heading text-lg">
            {t("dane.familyMzdoveOdvody")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <FilingTable
            orgSlug={orgSlug}
            filings={filings}
            emptyMessageKey="dane.familyEmpty"
          />
        </CardContent>
      </Card>
    </div>
  )
}
