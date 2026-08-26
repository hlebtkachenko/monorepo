import Link from "next/link"
import { getFormatter } from "next-intl/server"

import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import { Checkbox } from "@workspace/ui/components/checkbox"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
import {
  NativeSelect,
  NativeSelectOption,
} from "@workspace/ui/components/native-select"
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table"
import { Textarea } from "@workspace/ui/components/textarea"

import { getBetaTranslations } from "@/i18n/translations-server"
import {
  ASSET_CATEGORY_LABEL_KEY,
  ASSET_STATUS_LABEL_KEY,
} from "@/lib/asset-labels"
import { assetsForScope, type AssetFilter } from "@/lib/data/assets"
import type { BetaAssetCategory } from "@/db/schema"

import { SectionTitle } from "../../../_components/page-header"

import { resolveOrgScope } from "../_lib/org-scope"

import { createAssetAction } from "./_actions/assets"
import { AssetActionForm } from "./_components/asset-action-form"

const ASSET_CATEGORIES: readonly BetaAssetCategory[] = [
  "machine",
  "vehicle",
  "tool",
  "real_estate",
  "other",
]

/**
 * Přehled majetku — the asset table (spec §2.7).
 *
 * SHALLOW BY DESIGN: one status filter (spec's plural "filters" is satisfied
 * with query-string links, no client state), one footer SUM, no pagination —
 * the depth map calls this "table + stamp suffices". The zůstatková cena
 * column pairs `residualValue` with `depreciationAsOf` on every row that has
 * one (spec: "freshness = depreciation_as_of shown per row"); a row with none
 * says so rather than showing a stale or interpolated figure (§0.4).
 *
 * The "Nový majetek" create form lives HERE rather than waiting for the
 * cross-module Zadávání dat surface of spec §3.3 (unbuilt): PR 34 ships its
 * own domain's writes end to end, the same way PR 16 shipped
 * `createFiling` / `updateFiling` ahead of that surface too.
 */
export default async function MajetekOverviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ orgSlug: string }>
  searchParams: Promise<{ status?: string }>
}) {
  const { orgSlug } = await params
  const { status: statusParam } = await searchParams
  const status: AssetFilter["status"] =
    statusParam === "in_use" || statusParam === "disposed"
      ? statusParam
      : undefined

  const [scope, t, format] = await Promise.all([
    resolveOrgScope(orgSlug),
    getBetaTranslations(),
    getFormatter(),
  ])
  const { assets, totals } = await assetsForScope(scope, { status })

  const money = (value: string): string =>
    format.number(Number(value), "currency")
  const date = (value: string | null): string | null =>
    value === null ? null : format.dateTime(new Date(value), "date")

  return (
    <div className="grid gap-6 p-6">
      {scope.role === "owner" ? (
        <Card>
          <CardHeader>
            <CardTitle className="font-heading text-base">
              {t("majetek.newAssetTitle")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <AssetActionForm
              action={createAssetAction}
              submitLabel={t("majetek.newAssetSubmit")}
              className="sm:grid-cols-2"
            >
              <input type="hidden" name="orgSlug" value={orgSlug} />

              <div className="grid gap-2">
                <Label htmlFor="name">{t("majetek.fieldName")}</Label>
                <Input id="name" name="name" required autoComplete="off" />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="category">{t("majetek.fieldCategory")}</Label>
                <NativeSelect
                  id="category"
                  name="category"
                  required
                  defaultValue=""
                >
                  <NativeSelectOption value="" disabled>
                    —
                  </NativeSelectOption>
                  {ASSET_CATEGORIES.map((category) => (
                    <NativeSelectOption key={category} value={category}>
                      {t(ASSET_CATEGORY_LABEL_KEY[category])}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="acquisitionCost">
                  {t("majetek.fieldAcquisitionCost")}
                </Label>
                <Input
                  id="acquisitionCost"
                  name="acquisitionCost"
                  inputMode="decimal"
                  required
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="acquiredOn">
                  {t("majetek.fieldAcquiredOn")}
                </Label>
                <Input id="acquiredOn" name="acquiredOn" type="date" />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="placedInServiceOn">
                  {t("majetek.fieldPlacedInServiceOn")}
                </Label>
                <Input
                  id="placedInServiceOn"
                  name="placedInServiceOn"
                  type="date"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="siteRef">{t("majetek.fieldSiteRef")}</Label>
                <Input id="siteRef" name="siteRef" />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="accumulatedDepreciation">
                  {t("majetek.fieldAccumulatedDepreciation")}
                </Label>
                <Input
                  id="accumulatedDepreciation"
                  name="accumulatedDepreciation"
                  inputMode="decimal"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="depreciationAsOf">
                  {t("majetek.fieldDepreciationAsOf")}
                </Label>
                <Input
                  id="depreciationAsOf"
                  name="depreciationAsOf"
                  type="date"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="taxResidualValue">
                  {t("majetek.fieldTaxResidualValue")}
                </Label>
                <Input
                  id="taxResidualValue"
                  name="taxResidualValue"
                  inputMode="decimal"
                />
              </div>
              <div className="flex items-center gap-2 sm:col-span-2">
                <Checkbox id="isMinor" name="isMinor" />
                <Label htmlFor="isMinor" className="font-normal">
                  {t("majetek.fieldIsMinor")}
                </Label>
              </div>
              <div className="grid gap-2 sm:col-span-2">
                <Label htmlFor="noteClient">
                  {t("majetek.fieldNoteClient")}
                </Label>
                <Textarea id="noteClient" name="noteClient" rows={2} />
              </div>
            </AssetActionForm>
          </CardContent>
        </Card>
      ) : null}

      <section className="grid gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <SectionTitle>{t("majetek.overviewTitle")}</SectionTitle>
          <div className="flex gap-2">
            <Link href={`/${orgSlug}/majetek`}>
              <Button
                variant={status === undefined ? "secondary" : "outline"}
                size="sm"
              >
                {t("majetek.filterAll")}
              </Button>
            </Link>
            <Link href={`/${orgSlug}/majetek?status=in_use`}>
              <Button
                variant={status === "in_use" ? "secondary" : "outline"}
                size="sm"
              >
                {t("majetek.filterInUse")}
              </Button>
            </Link>
            <Link href={`/${orgSlug}/majetek?status=disposed`}>
              <Button
                variant={status === "disposed" ? "secondary" : "outline"}
                size="sm"
              >
                {t("majetek.filterDisposed")}
              </Button>
            </Link>
          </div>
        </div>

        {assets.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center text-sm text-muted-foreground">
              <p className="font-medium text-foreground">
                {t("majetek.emptyHeading")}
              </p>
              <p>{t("majetek.emptyBody")}</p>
            </CardContent>
          </Card>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("majetek.columnName")}</TableHead>
                <TableHead>{t("majetek.columnCategory")}</TableHead>
                <TableHead className="text-right">
                  {t("majetek.columnAcquisitionCost")}
                </TableHead>
                <TableHead>{t("majetek.columnPlacedInService")}</TableHead>
                <TableHead className="text-right">
                  {t("majetek.columnResidualValue")}
                </TableHead>
                <TableHead>{t("majetek.columnSite")}</TableHead>
                <TableHead>{t("majetek.columnStatus")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {assets.map((row) => (
                <TableRow key={row.id}>
                  <TableCell>
                    <Link
                      href={`/${orgSlug}/majetek/${row.id}`}
                      className="font-medium hover:underline"
                    >
                      {row.name}
                    </Link>
                    {row.isMinor ? (
                      <Badge variant="outline" className="ml-2">
                        {t("majetek.isMinorBadge")}
                      </Badge>
                    ) : null}
                  </TableCell>
                  <TableCell>
                    {t(ASSET_CATEGORY_LABEL_KEY[row.category])}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {money(row.acquisitionCost)}
                  </TableCell>
                  <TableCell>{date(row.placedInServiceOn) ?? "—"}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {row.isMinor ? (
                      <span className="text-muted-foreground">
                        {t("majetek.residualNotApplicable")}
                      </span>
                    ) : row.residualValue === null ? (
                      <span className="text-muted-foreground">
                        {t("majetek.residualNotProvided")}
                      </span>
                    ) : (
                      <>
                        {money(row.residualValue)}
                        <span className="block text-xs font-normal text-muted-foreground">
                          {t("majetek.depreciationAsOfPrefix")}{" "}
                          {date(row.depreciationAsOf)}
                        </span>
                      </>
                    )}
                  </TableCell>
                  <TableCell>{row.siteRef ?? "—"}</TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        row.status === "disposed" ? "secondary" : "outline"
                      }
                    >
                      {t(ASSET_STATUS_LABEL_KEY[row.status])}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
            <TableFooter>
              <TableRow>
                <TableCell colSpan={2}>{t("majetek.footerTotal")}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {money(totals.acquisitionCost)}
                </TableCell>
                <TableCell />
                <TableCell className="text-right tabular-nums">
                  {money(totals.residualValue)}
                </TableCell>
                <TableCell colSpan={2} />
              </TableRow>
            </TableFooter>
          </Table>
        )}
      </section>
    </div>
  )
}
