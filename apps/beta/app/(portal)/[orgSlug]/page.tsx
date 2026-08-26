import { getBetaTranslations } from "@/i18n/translations-server"
import { requireBetaSession } from "@/lib/auth/session"
import { formatBetaMoney } from "@/lib/format/money"
import { ORG_ROLE_LABEL_KEY } from "@/lib/role-labels"

import { ClientTaskList } from "./_components/client-task-list"
import { CompanyCard } from "./_components/company-card"
import { DataPresence } from "./_components/data-presence"
import { FirstMonthNotice } from "./_components/first-month-notice"
import { KpiTiles, type KpiTile } from "./_components/kpi-tiles"
import { RecentDocuments } from "./_components/recent-documents"
import { TurnoverWatch } from "./_components/turnover-watch"
import { UpcomingDeadlines } from "./_components/upcoming-deadlines"
import {
  hasObligationData,
  loadPrehled,
  obligationsAsOf,
} from "./_lib/load-prehled"
import { resolveOrgScope } from "./_lib/org-scope"

/**
 * Přehled — the org home (`/[orgSlug]`, spec §2.1; DEEP per the depth map).
 *
 * THE SECTIONS, IN §2.1's OWN ORDER:
 *   1. Co od vás potřebujeme      — `ClientTaskList` (open client_tasks)
 *   2. Nejbližší termíny          — `UpcomingDeadlines` (F25's unified list)
 *   3. KPI tiles                  — `KpiTiles`, on data presence only
 *      + data presence / freshness — `DataPresence` (§0.4, F24)
 *   4. Obrat watch                — `TurnoverWatch` (neplátce only, §5)
 *   5. Karta společnosti          — `CompanyCard`
 *   6. Poslední dokumenty         — `RecentDocuments`
 *
 * EVERY ROLE SEES ALL OF IT (§5: guest is an external VIEWER of client-visible
 * data, not a blinded one). The only role-dependent thing on the page is the
 * greeting's own label — and the page is READ-ONLY for every role including
 * owner, per §3.3: completing a task, editing a filing or correcting an amount
 * all happen in Pro účetní › Zadávání dat, and there is no affordance here for
 * any of them.
 *
 * WHAT THIS FILE DOES NOT DO: read a table, sum a number, or decide what
 * "present" means. `_lib/load-prehled.ts` holds the seven reads and the two
 * judgements (`firstMonth`, `hasObligationData`) so both are testable against
 * real rows rather than being conditions inside JSX. Every money value on the
 * page is a string Postgres produced, formatted once at the point of display.
 *
 * THE FIRST-MONTH BRANCH (F18) swaps sections 3 and 3b for one card. It is the
 * §0.3 no-placeholders rule at page level: a dashboard for a book with no
 * accounting data yet says so once, rather than drawing eight empty containers.
 */
export default async function OrgHomePage({
  params,
}: {
  params: Promise<{ orgSlug: string }>
}) {
  const { orgSlug } = await params
  const [scope, t, viewer] = await Promise.all([
    resolveOrgScope(orgSlug),
    getBetaTranslations(),
    requireBetaSession(),
  ])

  const data = await loadPrehled(scope)

  // §2.1 item 3: a tile EXISTS only where its feeder has spoken. Both
  // conditions below are presence questions, never `value > 0` — a genuine
  // zero is worth showing and an absence must not be shown as one.
  const tiles: KpiTile[] = []

  if (hasObligationData(data.obligations)) {
    const partnerSaldo = data.obligations.freshness.find(
      (source) => source.source === "partner_saldo",
    )
    tiles.push({
      key: "obligations",
      labelKey: "prehled.kpiObligations",
      value: data.obligations.totals.total,
      asOf: obligationsAsOf(data.obligations),
      // Two captions, and the second one is a correctness statement rather
      // than a nicety: until PR 28 lands the saldokonto, this total is every
      // debt EXCEPT supplier payables, and a client reading it as "everything
      // I owe" would be reading it wrong.
      caption: [
        `${formatBetaMoney(data.obligations.totals.overdue)} ${t("prehled.kpiObligationsOverdue")}`,
        partnerSaldo?.implemented === false
          ? t("prehled.kpiObligationsPartial")
          : null,
      ]
        .filter((part): part is string => part !== null)
        .join(" · "),
      href: `/${orgSlug}/finance/dluhy-a-platby`,
    })
  }

  // The asset tile renders only when EVERY in-use asset carries an oprávky
  // figure — see `assetResidualSummaryForScope` for why a partial sum is the
  // one number this tile must never show.
  if (
    data.assets.inUseCount > 0 &&
    data.assets.depreciatedCount === data.assets.inUseCount &&
    data.assets.residualTotal !== null
  ) {
    tiles.push({
      key: "assets",
      labelKey: "prehled.kpiAssets",
      value: data.assets.residualTotal,
      // F15: oprávky are stated AS OF a date and never interpolated to today.
      asOf: data.assets.depreciationAsOf,
      caption: `${data.assets.inUseCount} ${t("prehled.kpiAssetsCount")}`,
      href: `/${orgSlug}/majetek`,
    })
  }

  return (
    <div className="grid gap-4 p-6">
      <p className="text-sm text-muted-foreground">
        {t("org.greetingPrefix")}, {viewer.name || viewer.email}.{" "}
        {t("org.roleLabelPrefix")}: {t(ORG_ROLE_LABEL_KEY[scope.role])}.
      </p>

      <ClientTaskList orgSlug={orgSlug} tasks={data.tasks} />

      <UpcomingDeadlines orgSlug={orgSlug} deadlines={data.deadlines} />

      {data.firstMonth ? (
        <FirstMonthNotice />
      ) : (
        <>
          <KpiTiles tiles={tiles} />
          <DataPresence
            datasets={data.datasets}
            documents={{
              total: data.documents.total,
              newestUploadedAt: data.documents.newestUploadedAt,
            }}
            today={data.today}
          />
        </>
      )}

      <TurnoverWatch vatRegime={data.org.vatRegime} reading={data.turnover} />

      <CompanyCard org={data.org} />

      <RecentDocuments orgSlug={orgSlug} documents={data.documents.recent} />
    </div>
  )
}
