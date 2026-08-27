"use client"

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table"

import { useBetaTranslations } from "@/i18n/translations"
import type { IndicatorView } from "@/lib/data/projections"
import { formatBetaDate } from "@/lib/format/date"
import { formatBetaMoney } from "@/lib/format/money"
import { INDICATOR_KIND_LABEL_KEY } from "@/lib/indicator-labels"

import { EntrySheet } from "../../../_components/entry-sheet"
import {
  deleteIndicatorAction,
  saveIndicatorAction,
} from "../../_actions/ukazatele"
import { PRO_UCETNI_ACTION_IDLE } from "../../_actions/state"
import { OfficeActionForm } from "../../_components/office-action-form"

import { IndicatorFields } from "./indicator-fields"

/**
 * Zadávání dat › Ukazatele — the office's home for the figures that are not a
 * line of any statement, and today that is exactly one: obrat.
 *
 * WHY THIS SECTION IS HERE AND NOT ON A CLIENT PAGE. §3.3 is the home for
 * cross-module office facts, and obrat belongs to no module: it is displayed on
 * Přehled's Obrat watch and nowhere else, it is neither imported nor derived,
 * and it is the one figure this product must never compute (§0.2 — it decides
 * whether a company has a DPH registration duty).
 *
 * THE HINT UNDER THE HEADING IS LOAD-BEARING, the same way Účty a hotovost's is:
 * an accountant looking for "where does the portal get obrat from" has to be
 * told, here, that it does not get it from anywhere — this section IS the
 * source, and the client's card says "Obrat zatím nemáme" until a row exists.
 *
 * ONE FORM FOR STATING AND CORRECTING. `(kind, as_of)` is unique, so re-stating
 * a date corrects that reading rather than adding a contradictory second one.
 * The per-row sheet therefore carries the pair as hidden fields and offers only
 * the figure and the note — see `IndicatorFields` for why the date is not
 * editable in place.
 *
 * DELETE IS OFFERED NEXT TO IT because the client card shows the reading with
 * the newest `as_of`: a figure typed as of 2036 would hide every correct one
 * behind it, and that typo has no history worth keeping.
 */
export function IndicatorsSection({
  indicators,
  orgSlug,
}: {
  indicators: readonly (IndicatorView & { readonly noteInternal: string })[]
  orgSlug: string
}) {
  const t = useBetaTranslations()

  return (
    <section className="grid gap-4">
      <Card>
        <CardHeader>
          <CardTitle className="font-heading text-base">
            {t("ukazatele.createTitle")}
          </CardTitle>
          <CardDescription>{t("ukazatele.hint")}</CardDescription>
        </CardHeader>
        <CardContent>
          <EntrySheet
            action={saveIndicatorAction}
            idle={PRO_UCETNI_ACTION_IDLE}
            hidden={{ orgSlug }}
            triggerLabel={t("ukazatele.createTitle")}
            title={t("ukazatele.createTitle")}
            description={t("ukazatele.createDescription")}
            submitLabel={t("ukazatele.submit")}
          >
            <IndicatorFields t={t} idPrefix="new-indicator" />
          </EntrySheet>
        </CardContent>
      </Card>

      <h2 className="font-heading text-base font-semibold">
        {t("ukazatele.title")}
      </h2>

      {indicators.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("zadavani.noRows")}</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("ukazatele.columnKind")}</TableHead>
              <TableHead className="text-right">
                {t("ukazatele.fieldAmount")}
              </TableHead>
              <TableHead>{t("ukazatele.fieldAsOf")}</TableHead>
              <TableHead>{t("zadavani.columnActions")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {indicators.map((row) => (
              <TableRow key={row.id}>
                <TableCell className="font-medium">
                  {t(INDICATOR_KIND_LABEL_KEY[row.kind])}
                  {row.noteInternal.length > 0 ? (
                    <span className="block text-xs text-muted-foreground">
                      {row.noteInternal}
                    </span>
                  ) : null}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatBetaMoney(row.amount)}
                </TableCell>
                <TableCell className="whitespace-nowrap">
                  {formatBetaDate(row.asOf)}
                </TableCell>
                <TableCell>
                  <div className="flex flex-wrap items-center gap-2">
                    <EntrySheet
                      action={saveIndicatorAction}
                      idle={PRO_UCETNI_ACTION_IDLE}
                      hidden={{ orgSlug }}
                      triggerLabel={t("zadavani.save")}
                      title={t("ukazatele.editTitle")}
                      description={t("ukazatele.editDescription")}
                      submitLabel={t("zadavani.save")}
                    >
                      <IndicatorFields
                        t={t}
                        idPrefix={`indicator-${row.id}`}
                        indicator={row}
                      />
                    </EntrySheet>

                    <OfficeActionForm
                      action={deleteIndicatorAction}
                      orgSlug={orgSlug}
                      submitLabel={t("zadavani.delete")}
                      submitVariant="destructive"
                      layout="row"
                    >
                      <input type="hidden" name="indicatorId" value={row.id} />
                    </OfficeActionForm>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </section>
  )
}
