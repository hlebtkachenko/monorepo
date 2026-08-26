import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"

import { formatAmount } from "@/i18n/format-values"
import { getBetaTranslations } from "@/i18n/translations-server"
import { obligationsForScope } from "@/lib/data/obligations"

import { ObligationGroupCard } from "@/app/_components/obligation-group-card"

import { resolveOrgScope } from "../../_lib/org-scope"

import { SourceFreshness } from "./_components/source-freshness"

/**
 * Finance › Dluhy a platby (spec §2.4) — the derived obligations view.
 *
 * READ-ONLY FOR EVERY ROLE, guest included (§5: guest is an external viewer of
 * the same client-visible data). There is no write on this page and no
 * "Upravit" affordance either: §3.3 puts every non-document edit in Pro účetní ›
 * Zadávání dat, which only the owner can even see.
 *
 * NOTHING IS COMPUTED HERE. The bucketing, the ordering, the overdue flags and
 * every sum come out of `obligationsForScope` — the sums as SQL window functions
 * over exactly the rows returned. This page picks Czech words and a layout; the
 * one number it touches, the page total, it renders as the string Postgres
 * produced.
 *
 * EMPTY BEATS STALE (§0.4). With nothing outstanding the read model returns no
 * groups at all, and the page says so in one sentence instead of drawing four
 * empty headings over "0 Kč" — a measured zero and an absence look identical
 * once you print the zero, and only one of them is true here. The per-source
 * freshness strip still renders underneath, so an empty page can still say WHEN
 * it was last fed and which feed is not connected yet.
 */
export default async function DluhyAPlatbyPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>
}) {
  const { orgSlug } = await params
  const scope = await resolveOrgScope(orgSlug)

  const [t, model] = await Promise.all([
    getBetaTranslations(),
    obligationsForScope(scope),
  ])

  return (
    <div className="grid gap-4 p-6">
      <header className="grid gap-1">
        <h1 className="font-heading text-xl font-semibold">
          {t("finance.dluhyTitle")}
        </h1>
        <p className="text-sm text-muted-foreground">
          {t("finance.dluhyIntro")}
        </p>
      </header>

      {model.groups.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="font-heading text-base">
              {t("finance.emptyHeading")}
            </CardTitle>
            <CardDescription>{t("finance.emptyBody")}</CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <>
          <Card>
            <CardContent className="flex flex-wrap gap-8 pt-6">
              <div className="grid gap-1">
                <span className="text-xs text-muted-foreground">
                  {t("finance.totalAll")}
                </span>
                <span className="font-heading text-2xl tabular-nums">
                  {formatAmount(model.totals.total)}
                </span>
              </div>
              <div className="grid gap-1">
                <span className="text-xs text-muted-foreground">
                  {t("finance.totalOverdue")}
                </span>
                <span className="font-heading text-2xl text-destructive tabular-nums">
                  {formatAmount(model.totals.overdue)}
                </span>
              </div>
            </CardContent>
          </Card>

          {model.groups.map((group) => (
            <ObligationGroupCard key={group.group} group={group} />
          ))}
        </>
      )}

      <SourceFreshness freshness={model.freshness} />
    </div>
  )
}
