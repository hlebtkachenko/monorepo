import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"

import { TrialBalanceTable } from "@/app/_components/trial-balance-table"
import { getBetaTranslations } from "@/i18n/translations-server"
import { trialBalanceLinesForBatch } from "@/lib/data/imports"

import { resolveOrgScope } from "../../_lib/org-scope"

import { DatasetHeader } from "../_components/dataset-header"
import { NothingPublished } from "../_components/nothing-published"
import { filterTrialBalance } from "../_lib/account-filter"
import { loadDataset } from "../_lib/load-dataset"
import { PERIOD_PARAM } from "../_lib/period-selection"
import { vykazyHref } from "../_nav/vykazy-nav"

/** The query-string key the account search writes. */
const SEARCH_PARAM = "ucet"

/**
 * Obratová předvaha (spec §2.5), from `trial_balance_line`.
 *
 * READ-ONLY, NO DRILLDOWN — spec §2.5 states it: "předvaha IS the drilldown".
 * There is nothing below an account to open.
 *
 * THE SEARCH IS A PLAIN GET FORM, so it works with no JavaScript and a
 * filtered view is a URL the office can send to the client. It carries the
 * period forward as a hidden field, because filtering must not silently move
 * the reader to a different period.
 */
export default async function PredvahaPage({
  params,
  searchParams,
}: {
  params: Promise<{ orgSlug: string }>
  searchParams: Promise<{ obdobi?: string; ucet?: string }>
}) {
  const { orgSlug } = await params
  const query = await searchParams
  const search = query[SEARCH_PARAM] ?? ""

  const [scope, t] = await Promise.all([
    resolveOrgScope(orgSlug),
    getBetaTranslations(),
  ])
  const view = await loadDataset(scope, "predvaha", query[PERIOD_PARAM])
  const lines = view.batch
    ? await trialBalanceLinesForBatch(scope, view.batch.id)
    : []
  const visible = filterTrialBalance(lines, search)

  return (
    <div className="grid gap-6">
      <DatasetHeader
        basePath={vykazyHref(orgSlug, "predvaha")}
        titleKey="vykazy.predvahaTitle"
        view={view}
      />

      {view.batch === null ? (
        <NothingPublished bodyKey="vykazy.emptyPredvaha" />
      ) : (
        <>
          <form
            method="get"
            action={vykazyHref(orgSlug, "predvaha")}
            className="flex flex-wrap items-end gap-2"
          >
            {view.period ? (
              <input type="hidden" name={PERIOD_PARAM} value={view.period.id} />
            ) : null}
            <div className="grid gap-2">
              <Label htmlFor={SEARCH_PARAM}>{t("vykazy.searchLabel")}</Label>
              <Input
                id={SEARCH_PARAM}
                name={SEARCH_PARAM}
                defaultValue={search}
                autoComplete="off"
                placeholder={t("vykazy.searchPlaceholder")}
              />
            </div>
            <Button type="submit" size="sm" variant="outline">
              {t("vykazy.searchSubmit")}
            </Button>
          </form>

          {visible.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {t("vykazy.searchNoMatch")}
            </p>
          ) : (
            <TrialBalanceTable lines={visible} />
          )}
        </>
      )}
    </div>
  )
}
