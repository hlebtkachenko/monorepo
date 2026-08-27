import type { ReactNode } from "react"
import Link from "next/link"
import { notFound } from "next/navigation"
import { getFormatter } from "next-intl/server"

import { ArrowLeft } from "@workspace/ui/lib/icons"
import { Badge } from "@workspace/ui/components/badge"
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
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table"
import { Textarea } from "@workspace/ui/components/textarea"

import type { BetaAssetCategory, BetaAssetEventKind } from "@/db/schema"
import { getBetaTranslations } from "@/i18n/translations-server"
import {
  ASSET_CATEGORY_LABEL_KEY,
  ASSET_EVENT_KIND_LABEL_KEY,
  ASSET_STATUS_LABEL_KEY,
} from "@/lib/asset-labels"
import { assetEventsForScope, assetForScope } from "@/lib/data/assets"

import { resolveOrgScope } from "../../_lib/org-scope"

import {
  addAssetEventAction,
  disposeAssetAction,
  updateAssetAction,
} from "../_actions/assets"
import { AssetActionForm } from "../_components/asset-action-form"

const ASSET_CATEGORIES: readonly BetaAssetCategory[] = [
  "machine",
  "vehicle",
  "tool",
  "real_estate",
  "other",
]

const ASSET_EVENT_KINDS: readonly BetaAssetEventKind[] = [
  "put_into_service",
  "improvement",
  "disposal",
]

/**
 * Karta majetku — one asset's detail, its event history, and (owner-only) the
 * edit / dispose / add-event forms (spec §2.7).
 *
 * PR 34 ships these forms directly on the Karta rather than deferring to the
 * cross-module Zadávání dat surface of spec §3.3 — see the note on the
 * Přehled page.
 */
export default async function MajetekDetailPage({
  params,
}: {
  params: Promise<{ orgSlug: string; assetId: string }>
}) {
  const { orgSlug, assetId } = await params

  const [scope, t, format] = await Promise.all([
    resolveOrgScope(orgSlug),
    getBetaTranslations(),
    getFormatter(),
  ])

  const item = await assetForScope(scope, assetId)
  if (!item) notFound()

  const events = await assetEventsForScope(scope, assetId)

  const money = (value: string): string =>
    format.number(Number(value), "currency")
  const date = (value: string | null): string | null =>
    value === null ? null : format.dateTime(new Date(value), "date")

  const isOwner = scope.role === "owner"

  return (
    <div className="grid gap-6 p-6">
      {/* The visible title is `CardTitle` below, sized for its card rather
          than the page (spec's Karta majetku is a detail card, not a
          PageHeader-scale surface) — this is the one real heading a screen
          reader's document outline needs, without a second, larger-looking
          title duplicating it. */}
      <h1 className="sr-only">{item.name}</h1>
      <div>
        <Link
          href={`/${orgSlug}/majetek`}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          {t("majetek.backToOverview")}
        </Link>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-2">
          <div>
            <CardTitle className="font-heading text-base">
              {item.name}
            </CardTitle>
          </div>
          <div className="flex items-center gap-2">
            {item.isMinor ? (
              <Badge variant="outline">{t("majetek.isMinorBadge")}</Badge>
            ) : null}
            <Badge
              variant={item.status === "disposed" ? "secondary" : "outline"}
            >
              {t(ASSET_STATUS_LABEL_KEY[item.status])}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Field label={t("majetek.fieldCategory")}>
            {t(ASSET_CATEGORY_LABEL_KEY[item.category])}
          </Field>
          <Field label={t("majetek.fieldAcquisitionCost")}>
            {money(item.acquisitionCost)}
          </Field>
          <Field label={t("majetek.fieldAcquiredOn")}>
            {date(item.acquiredOn) ?? "—"}
          </Field>
          <Field label={t("majetek.fieldPlacedInServiceOn")}>
            {date(item.placedInServiceOn) ?? "—"}
          </Field>
          <Field label={t("majetek.columnResidualValue")}>
            {item.isMinor ? (
              <span className="text-muted-foreground">
                {t("majetek.residualNotApplicable")}
              </span>
            ) : item.residualValue === null ? (
              <span className="text-muted-foreground">
                {t("majetek.residualNotProvided")}
              </span>
            ) : (
              <>
                {money(item.residualValue)}
                <span className="block text-xs font-normal text-muted-foreground">
                  {t("majetek.depreciationAsOfPrefix")}{" "}
                  {date(item.depreciationAsOf)}
                </span>
              </>
            )}
          </Field>
          <Field label={t("majetek.fieldSiteRef")}>{item.siteRef ?? "—"}</Field>
          {item.disposedOn ? (
            <Field label={t("majetek.disposedOnLabel")}>
              {date(item.disposedOn)}
            </Field>
          ) : null}
          {item.taxResidualValue !== null ? (
            <p className="text-xs text-muted-foreground sm:col-span-2">
              {t("majetek.taxResidualLabel")}: {money(item.taxResidualValue)}
            </p>
          ) : null}
          {item.noteClient ? (
            <p className="text-sm sm:col-span-2">{item.noteClient}</p>
          ) : null}
        </CardContent>
      </Card>

      {isOwner ? (
        <Card>
          <CardHeader>
            <CardTitle className="font-heading text-base">
              {t("majetek.editTitle")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <AssetActionForm
              action={updateAssetAction}
              submitLabel={t("majetek.editSubmit")}
              className="sm:grid-cols-2"
            >
              <input type="hidden" name="orgSlug" value={orgSlug} />
              <input type="hidden" name="assetId" value={item.id} />

              <div className="grid gap-2">
                <Label htmlFor="edit-name">{t("majetek.fieldName")}</Label>
                <Input
                  id="edit-name"
                  name="name"
                  defaultValue={item.name}
                  required
                  autoComplete="off"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="edit-category">
                  {t("majetek.fieldCategory")}
                </Label>
                <NativeSelect
                  id="edit-category"
                  name="category"
                  defaultValue={item.category}
                  required
                >
                  {ASSET_CATEGORIES.map((category) => (
                    <NativeSelectOption key={category} value={category}>
                      {t(ASSET_CATEGORY_LABEL_KEY[category])}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="edit-acquisitionCost">
                  {t("majetek.fieldAcquisitionCost")}
                </Label>
                <Input
                  id="edit-acquisitionCost"
                  name="acquisitionCost"
                  inputMode="decimal"
                  defaultValue={item.acquisitionCost}
                  required
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="edit-acquiredOn">
                  {t("majetek.fieldAcquiredOn")}
                </Label>
                <Input
                  id="edit-acquiredOn"
                  name="acquiredOn"
                  type="date"
                  defaultValue={item.acquiredOn ?? ""}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="edit-placedInServiceOn">
                  {t("majetek.fieldPlacedInServiceOn")}
                </Label>
                <Input
                  id="edit-placedInServiceOn"
                  name="placedInServiceOn"
                  type="date"
                  defaultValue={item.placedInServiceOn ?? ""}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="edit-siteRef">
                  {t("majetek.fieldSiteRef")}
                </Label>
                <Input
                  id="edit-siteRef"
                  name="siteRef"
                  defaultValue={item.siteRef ?? ""}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="edit-accumulatedDepreciation">
                  {t("majetek.fieldAccumulatedDepreciation")}
                </Label>
                <Input
                  id="edit-accumulatedDepreciation"
                  name="accumulatedDepreciation"
                  inputMode="decimal"
                  defaultValue={item.accumulatedDepreciation ?? ""}
                  disabled={item.isMinor}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="edit-depreciationAsOf">
                  {t("majetek.fieldDepreciationAsOf")}
                </Label>
                <Input
                  id="edit-depreciationAsOf"
                  name="depreciationAsOf"
                  type="date"
                  defaultValue={item.depreciationAsOf ?? ""}
                  disabled={item.isMinor}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="edit-taxResidualValue">
                  {t("majetek.fieldTaxResidualValue")}
                </Label>
                <Input
                  id="edit-taxResidualValue"
                  name="taxResidualValue"
                  inputMode="decimal"
                  defaultValue={item.taxResidualValue ?? ""}
                />
              </div>
              <div className="flex items-center gap-2 sm:col-span-2">
                <Checkbox
                  id="edit-isMinor"
                  name="isMinor"
                  defaultChecked={item.isMinor}
                />
                <Label htmlFor="edit-isMinor" className="font-normal">
                  {t("majetek.fieldIsMinor")}
                </Label>
              </div>
              <div className="grid gap-2 sm:col-span-2">
                <Label htmlFor="edit-noteClient">
                  {t("majetek.fieldNoteClient")}
                </Label>
                <Textarea
                  id="edit-noteClient"
                  name="noteClient"
                  rows={2}
                  defaultValue={item.noteClient ?? ""}
                />
              </div>
            </AssetActionForm>
          </CardContent>
        </Card>
      ) : null}

      {isOwner && item.status === "in_use" ? (
        <Card>
          <CardHeader>
            <CardTitle className="font-heading text-base">
              {t("majetek.disposeTitle")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <AssetActionForm
              action={disposeAssetAction}
              submitLabel={t("majetek.disposeSubmit")}
              submitVariant="destructive"
              layout="row"
            >
              <input type="hidden" name="orgSlug" value={orgSlug} />
              <input type="hidden" name="assetId" value={item.id} />
              <div className="grid gap-2">
                <Label htmlFor="disposedOn">
                  {t("majetek.fieldDisposedOn")}
                </Label>
                <Input id="disposedOn" name="disposedOn" type="date" required />
              </div>
            </AssetActionForm>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="font-heading text-base">
            {t("majetek.eventsTitle")}
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4">
          {events.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {t("majetek.noEvents")}
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("majetek.fieldEventKind")}</TableHead>
                  <TableHead>{t("majetek.fieldEventDate")}</TableHead>
                  <TableHead className="text-right">
                    {t("majetek.fieldEventAmount")}
                  </TableHead>
                  <TableHead>{t("majetek.fieldEventNote")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {events.map((event) => (
                  <TableRow key={event.id}>
                    <TableCell>
                      {t(ASSET_EVENT_KIND_LABEL_KEY[event.kind])}
                    </TableCell>
                    <TableCell>{date(event.eventDate)}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {event.amount === null ? "—" : money(event.amount)}
                    </TableCell>
                    <TableCell>{event.note ?? "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}

          {isOwner ? (
            <AssetActionForm
              action={addAssetEventAction}
              submitLabel={t("majetek.addEventSubmit")}
              className="border-t border-border pt-4 sm:grid-cols-2"
            >
              <input type="hidden" name="orgSlug" value={orgSlug} />
              <input type="hidden" name="assetId" value={item.id} />
              <div className="grid gap-2">
                <Label htmlFor="event-kind">
                  {t("majetek.fieldEventKind")}
                </Label>
                <NativeSelect
                  id="event-kind"
                  name="kind"
                  required
                  defaultValue=""
                >
                  <NativeSelectOption value="" disabled>
                    —
                  </NativeSelectOption>
                  {ASSET_EVENT_KINDS.map((kind) => (
                    <NativeSelectOption key={kind} value={kind}>
                      {t(ASSET_EVENT_KIND_LABEL_KEY[kind])}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="event-date">
                  {t("majetek.fieldEventDate")}
                </Label>
                <Input id="event-date" name="eventDate" type="date" required />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="event-amount">
                  {t("majetek.fieldEventAmount")}
                </Label>
                <Input id="event-amount" name="amount" inputMode="decimal" />
              </div>
              <div className="grid gap-2 sm:col-span-2">
                <Label htmlFor="event-note">
                  {t("majetek.fieldEventNote")}
                </Label>
                <Textarea id="event-note" name="note" rows={2} />
              </div>
            </AssetActionForm>
          ) : null}
        </CardContent>
      </Card>
    </div>
  )
}

function Field({
  label,
  children,
}: Readonly<{ label: string; children: ReactNode }>) {
  return (
    <div className="grid gap-0.5">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-sm font-medium">{children}</span>
    </div>
  )
}
