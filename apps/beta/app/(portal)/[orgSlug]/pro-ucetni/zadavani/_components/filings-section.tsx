"use client"

import { Badge } from "@workspace/ui/components/badge"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
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

import { useBetaTranslations } from "@/i18n/translations"
import type { BetaFilingKind, BetaFilingStatus } from "@/db/schema"
import type { FilingView } from "@/lib/data/projections"
import {
  FILING_KIND_LABEL_KEY,
  FILING_STATUS_LABEL_KEY,
} from "@/lib/filing-labels"
import { formatDate } from "@/lib/format/date"
import { formatAmount } from "@/lib/format/money"
import { formatReportingPeriodLabel } from "@/lib/format/period-label"

import { SectionTitle } from "../../../../../_components/page-header"

import {
  createFilingAction,
  deleteFilingAction,
  saveFilingAction,
  setFilingPaidAction,
} from "../../_actions/zadavani"
import { OfficeActionForm } from "../../_components/office-action-form"

/**
 * The select options, read off the LABEL MAPS rather than off the pgEnum.
 *
 * Two reasons, and neither is style. This is a Client Component, so importing
 * `betaFilingKind` would pull Drizzle's `pg-core` into the browser bundle for
 * the sake of a string array. And the label maps are `satisfies Record<Enum,
 * BetaMessageKey>`, so their key set IS the enum — a kind added to the migration
 * without a Czech name is already a compile error in `lib/filing-labels.ts`, and
 * one added WITH a name appears in this select automatically.
 */
const FILING_KINDS = Object.keys(FILING_KIND_LABEL_KEY) as BetaFilingKind[]
const FILING_STATUSES = Object.keys(
  FILING_STATUS_LABEL_KEY,
) as BetaFilingStatus[]

/**
 * Zadávání dat › Daňová podání (spec §3.3) — create, edit, mark paid, delete.
 *
 * A filing's `amount_due` and `paid_at` are what put it in (or take it out of)
 * Finance › Dluhy a platby, which is why this section leads with them: the
 * office is not filling in a form here, it is deciding what the client sees
 * they owe.
 *
 * THE CREATE FORM ASKS FOR THE PERIOD, NOT FOR A PERIOD ID. All four period
 * fields render at once — kind, year, month, quarter — and the action drops the
 * two that do not belong to the chosen kind before calling
 * `ensureReportingPeriod`. A conditional form would need client state for a
 * choice the server can make correctly anyway, and this page has to work
 * without JavaScript (see `OfficeActionForm`).
 *
 * `kind` and the period are ABSENT from the row's edit form on purpose:
 * `FilingPatch` does not carry them, because both are the row's identity — see
 * `lib/data/filings.ts`. A mistyped filing is deleted and re-entered.
 */
export function FilingsSection({
  filings,
  orgSlug,
}: {
  filings: readonly FilingView[]
  orgSlug: string
}) {
  const t = useBetaTranslations()

  return (
    <section className="grid gap-4">
      <Card>
        <CardHeader>
          <CardTitle className="font-heading text-base">
            {t("zadavani.filingCreateTitle")}
          </CardTitle>
          <CardDescription>{t("zadavani.filingCreateHint")}</CardDescription>
        </CardHeader>
        <CardContent>
          <OfficeActionForm
            action={createFilingAction}
            orgSlug={orgSlug}
            submitLabel={t("zadavani.create")}
            className="sm:grid-cols-3"
          >
            <div className="grid gap-2 sm:col-span-2">
              <Label htmlFor="filing-kind">{t("zadavani.fieldKind")}</Label>
              <NativeSelect
                id="filing-kind"
                name="kind"
                defaultValue="dph_priznani"
              >
                {FILING_KINDS.map((kind) => (
                  <NativeSelectOption key={kind} value={kind}>
                    {t(FILING_KIND_LABEL_KEY[kind])}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="filing-status">{t("zadavani.fieldStatus")}</Label>
              <NativeSelect
                id="filing-status"
                name="status"
                defaultValue="planned"
              >
                {FILING_STATUSES.map((status) => (
                  <NativeSelectOption key={status} value={status}>
                    {t(FILING_STATUS_LABEL_KEY[status])}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="filing-periodKind">
                {t("zadavani.fieldPeriodKind")}
              </Label>
              <NativeSelect
                id="filing-periodKind"
                name="periodKind"
                defaultValue="month"
              >
                <NativeSelectOption value="month">
                  {t("zadavani.periodMonth")}
                </NativeSelectOption>
                <NativeSelectOption value="quarter">
                  {t("zadavani.periodQuarter")}
                </NativeSelectOption>
                <NativeSelectOption value="year">
                  {t("zadavani.periodYear")}
                </NativeSelectOption>
              </NativeSelect>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="filing-year">{t("zadavani.fieldYear")}</Label>
              <Input
                id="filing-year"
                name="year"
                inputMode="numeric"
                required
                placeholder="2026"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="grid gap-2">
                <Label htmlFor="filing-month">{t("zadavani.fieldMonth")}</Label>
                <Input id="filing-month" name="month" inputMode="numeric" />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="filing-quarter">
                  {t("zadavani.fieldQuarter")}
                </Label>
                <Input id="filing-quarter" name="quarter" inputMode="numeric" />
              </div>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="filing-dueOn">{t("zadavani.fieldDueOn")}</Label>
              <Input id="filing-dueOn" name="dueOn" type="date" required />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="filing-filedOn">
                {t("zadavani.fieldFiledOn")}
              </Label>
              <Input id="filing-filedOn" name="filedOn" type="date" />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="filing-amountDue">
                {t("zadavani.fieldAmount")}
              </Label>
              <Input
                id="filing-amountDue"
                name="amountDue"
                inputMode="decimal"
                placeholder="0,00"
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="filing-variableSymbol">
                {t("zadavani.fieldVariableSymbol")}
              </Label>
              <Input
                id="filing-variableSymbol"
                name="variableSymbol"
                inputMode="numeric"
              />
            </div>
            <div className="grid gap-2 sm:col-span-2">
              <Label htmlFor="filing-noteClient">
                {t("zadavani.fieldNoteClient")}
              </Label>
              <Textarea id="filing-noteClient" name="noteClient" rows={2} />
            </div>
            <div className="grid gap-2 sm:col-span-3">
              <Label htmlFor="filing-noteInternal">
                {t("zadavani.fieldNoteInternal")}
              </Label>
              <Textarea id="filing-noteInternal" name="noteInternal" rows={2} />
            </div>
          </OfficeActionForm>
        </CardContent>
      </Card>

      <div className="grid gap-2">
        <SectionTitle>{t("zadavani.filingsTitle")}</SectionTitle>
        <p className="text-sm text-muted-foreground">
          {t("zadavani.filingsHint")}
        </p>
      </div>

      {filings.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("zadavani.noRows")}</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("zadavani.columnPeriod")}</TableHead>
              <TableHead>{t("zadavani.columnKind")}</TableHead>
              <TableHead>{t("zadavani.columnState")}</TableHead>
              <TableHead>{t("zadavani.columnActions")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filings.map((filing) => (
              <TableRow key={filing.id}>
                <TableCell className="font-mono text-xs whitespace-nowrap">
                  {formatReportingPeriodLabel(filing.period)}
                </TableCell>
                <TableCell className="font-medium">
                  {t(FILING_KIND_LABEL_KEY[filing.kind])}
                  <span className="block text-xs text-muted-foreground">
                    {formatDate(filing.dueOn)} ·{" "}
                    {filing.amountDue === null
                      ? t("zadavani.stateNoAmount")
                      : formatAmount(filing.amountDue)}
                  </span>
                </TableCell>
                <TableCell className="space-x-1 whitespace-nowrap">
                  <Badge variant="outline">
                    {t(FILING_STATUS_LABEL_KEY[filing.status])}
                  </Badge>
                  {filing.paidAt !== null ? (
                    <Badge variant="secondary">{t("zadavani.statePaid")}</Badge>
                  ) : filing.overdue ? (
                    <Badge variant="destructive">
                      {t("zadavani.stateOverdue")}
                    </Badge>
                  ) : null}
                </TableCell>
                <TableCell>
                  <div className="grid gap-2">
                    <OfficeActionForm
                      action={saveFilingAction}
                      orgSlug={orgSlug}
                      submitLabel={t("zadavani.save")}
                      submitVariant="outline"
                      layout="row"
                    >
                      <input type="hidden" name="filingId" value={filing.id} />
                      <Input
                        name="amountDue"
                        inputMode="decimal"
                        className="w-32"
                        defaultValue={filing.amountDue ?? ""}
                        aria-label={t("zadavani.fieldAmount")}
                      />
                      <Input
                        name="dueOn"
                        type="date"
                        className="w-40"
                        defaultValue={filing.dueOn}
                        aria-label={t("zadavani.fieldDueOn")}
                      />
                      <NativeSelect
                        name="status"
                        defaultValue={filing.status}
                        aria-label={t("zadavani.fieldStatus")}
                      >
                        {FILING_STATUSES.map((status) => (
                          <NativeSelectOption key={status} value={status}>
                            {t(FILING_STATUS_LABEL_KEY[status])}
                          </NativeSelectOption>
                        ))}
                      </NativeSelect>
                      <Input
                        name="filedOn"
                        type="date"
                        className="w-40"
                        defaultValue={filing.filedOn ?? ""}
                        aria-label={t("zadavani.fieldFiledOn")}
                      />
                    </OfficeActionForm>

                    <div className="flex flex-wrap gap-2">
                      <OfficeActionForm
                        action={setFilingPaidAction}
                        orgSlug={orgSlug}
                        submitLabel={
                          filing.paidAt === null
                            ? t("zadavani.markPaid")
                            : t("zadavani.markUnpaid")
                        }
                        submitVariant="outline"
                        layout="row"
                      >
                        <input
                          type="hidden"
                          name="filingId"
                          value={filing.id}
                        />
                        <input
                          type="hidden"
                          name="paid"
                          value={filing.paidAt === null ? "true" : "false"}
                        />
                      </OfficeActionForm>

                      <OfficeActionForm
                        action={deleteFilingAction}
                        orgSlug={orgSlug}
                        submitLabel={t("zadavani.delete")}
                        submitVariant="destructive"
                        layout="row"
                      >
                        <input
                          type="hidden"
                          name="filingId"
                          value={filing.id}
                        />
                      </OfficeActionForm>
                    </div>
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
