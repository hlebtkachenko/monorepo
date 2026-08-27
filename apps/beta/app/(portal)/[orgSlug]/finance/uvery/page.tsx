import { getFormatter } from "next-intl/server"

import { Badge } from "@workspace/ui/components/badge"
import { Card, CardContent } from "@workspace/ui/components/card"
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table"

import { getBetaTranslations } from "@/i18n/translations-server"
import { loansForScope } from "@/lib/data/loans"
import {
  LOAN_INSTALLMENT_PERIOD_LABEL_KEY,
  LOAN_KIND_LABEL_KEY,
} from "@/lib/loan-labels"

import { EntrySheet } from "../../_components/entry-sheet"
import { PageHeader } from "../../../../_components/page-header"
import { resolveOrgScope } from "../../_lib/org-scope"

import { createLoanAction, updateLoanAction } from "./_actions/loans"
import { UVERY_ACTION_IDLE } from "./_actions/state"
import { LoanActionForm } from "./_components/loan-action-form"
import { LoanFields } from "./_components/loan-fields"

/**
 * Finance › Úvěry a leasingy (spec §2.4) — the loan table.
 *
 * SHALLOW BY DESIGN: one table, no filters, no pagination, no detail route —
 * the depth map calls this "table + stamp suffices", and §2.4 gives the leaf a
 * single flat row shape with nothing underneath it. Each row's zůstatek is
 * printed WITH the date it is as of; a row that has none says so rather than
 * showing a figure the reader would date to today (§0.4).
 *
 * THE FOOTER SUMS JISTINA, AND SUMS ZŮSTATEK ONLY WHEN EVERY ROW HAS ONE.
 * `SUM` skips NULLs, so a book where three of ten contracts carry a stated
 * zůstatek would footer a number that is true of three and reads as true of
 * ten. It never sums SPLÁTKA at all: a monthly leasing splátka and a quarterly
 * úvěr splátka are denominated differently and do not add up to anything a
 * person could name (§0.2 — this product does not invent numbers).
 *
 * The write forms live HERE rather than on the cross-module Zadávání dat surface
 * of spec §3.3, following the precedent PR 34 (Majetek) set: a PR ships its own
 * domain's writes end to end. They render for the owner only — every other role
 * reads the same table without them (§3.3: client pages are read-only), and
 * `lib/data/loans.ts`'s writes take an `OwnerScope` regardless of what this page
 * renders.
 *
 * CREATE runs through `EntrySheet` (manual-entry plan §2.1/W0) — this page is
 * that primitive's first, reference conversion, in the header's `actions`
 * slot as the primary "Zadat ručně". EDIT stays the JS-free `<details>` +
 * `LoanActionForm` it always was: W0 converts one form, not every form (see
 * the plan's W7 note on why the no-JS property is worth keeping where it
 * already works).
 */
export default async function UveryPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>
}) {
  const { orgSlug } = await params

  const [scope, t, format] = await Promise.all([
    resolveOrgScope(orgSlug),
    getBetaTranslations(),
    getFormatter(),
  ])
  const { loans, totals } = await loansForScope(scope)

  const money = (value: string): string =>
    format.number(Number(value), "currency")
  const rate = (value: string): string =>
    `${format.number(Number(value), "rate")} %`
  const date = (value: string): string =>
    format.dateTime(new Date(value), "date")

  const isOwner = scope.role === "owner"
  const balanceTotalIsWhole =
    totals.loanCount > 0 && totals.balanceStatedCount === totals.loanCount

  return (
    <div className="grid gap-6 p-6">
      <PageHeader
        title={t("uvery.title")}
        intro={t("uvery.intro")}
        actions={
          isOwner ? (
            <EntrySheet
              action={createLoanAction}
              idle={UVERY_ACTION_IDLE}
              hidden={{ orgSlug }}
              triggerLabel={t("uvery.newLoanTitle")}
              triggerVariant="default"
              title={t("uvery.newLoanTitle")}
              description={t("uvery.newLoanDescription")}
              submitLabel={t("uvery.newLoanSubmit")}
            >
              <LoanFields t={t} idPrefix="new-loan" />
            </EntrySheet>
          ) : null
        }
      />

      {loans.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            <p className="font-medium text-foreground">
              {t("uvery.emptyHeading")}
            </p>
            <p>{t("uvery.emptyBody")}</p>
          </CardContent>
        </Card>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("uvery.columnInstitution")}</TableHead>
              <TableHead>{t("uvery.columnKind")}</TableHead>
              <TableHead className="text-right">
                {t("uvery.columnPrincipal")}
              </TableHead>
              <TableHead className="text-right">
                {t("uvery.columnBalance")}
              </TableHead>
              <TableHead className="text-right">
                {t("uvery.columnInstallment")}
              </TableHead>
              <TableHead className="text-right">
                {t("uvery.columnInterestRate")}
              </TableHead>
              <TableHead>{t("uvery.columnEndsOn")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loans.map((row) => (
              <TableRow key={row.id}>
                <TableCell>
                  <span className="font-medium">{row.institution}</span>
                  {row.noteClient ? (
                    <span className="block text-xs font-normal text-muted-foreground">
                      {row.noteClient}
                    </span>
                  ) : null}
                  {isOwner ? (
                    <details className="mt-2">
                      <summary className="cursor-pointer text-xs font-normal text-muted-foreground">
                        {t("uvery.editTitle")}
                      </summary>
                      <div className="pt-3">
                        <LoanActionForm
                          action={updateLoanAction}
                          submitLabel={t("uvery.editSubmit")}
                          className="sm:grid-cols-2"
                        >
                          <input type="hidden" name="orgSlug" value={orgSlug} />
                          <input type="hidden" name="loanId" value={row.id} />
                          <LoanFields
                            t={t}
                            idPrefix={`loan-${row.id}`}
                            loan={row}
                          />
                        </LoanActionForm>
                      </div>
                    </details>
                  ) : null}
                </TableCell>
                <TableCell>
                  <Badge variant="outline">
                    {t(LOAN_KIND_LABEL_KEY[row.loanKind])}
                  </Badge>
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {money(row.principal)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {row.balance === null || row.balanceAsOf === null ? (
                    <span className="text-muted-foreground">
                      {t("uvery.balanceNotProvided")}
                    </span>
                  ) : (
                    <>
                      {money(row.balance)}
                      <span className="block text-xs font-normal text-muted-foreground">
                        {t("uvery.balanceAsOfPrefix")} {date(row.balanceAsOf)}
                      </span>
                    </>
                  )}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {row.installment === null ||
                  row.installmentPeriod === null ? (
                    <span className="text-muted-foreground">
                      {t("uvery.installmentNotProvided")}
                    </span>
                  ) : (
                    <>
                      {money(row.installment)}
                      <span className="block text-xs font-normal text-muted-foreground">
                        {t(
                          LOAN_INSTALLMENT_PERIOD_LABEL_KEY[
                            row.installmentPeriod
                          ],
                        )}
                      </span>
                    </>
                  )}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {row.interestRatePct === null
                    ? "—"
                    : rate(row.interestRatePct)}
                </TableCell>
                <TableCell>
                  {row.endsOn === null ? (
                    <span className="text-muted-foreground">
                      {t("uvery.endsOnOpen")}
                    </span>
                  ) : (
                    date(row.endsOn)
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
          <TableFooter>
            <TableRow>
              <TableCell colSpan={2}>{t("uvery.footerTotal")}</TableCell>
              <TableCell className="text-right tabular-nums">
                {money(totals.principal)}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {balanceTotalIsWhole && totals.balance !== null ? (
                  money(totals.balance)
                ) : (
                  <span className="text-xs font-normal text-muted-foreground">
                    {t("uvery.balanceTotalPartial")}
                  </span>
                )}
              </TableCell>
              <TableCell className="text-right">
                <span className="text-xs font-normal text-muted-foreground">
                  {t("uvery.installmentNotSummed")}
                </span>
              </TableCell>
              <TableCell colSpan={2} />
            </TableRow>
          </TableFooter>
        </Table>
      )}
    </div>
  )
}
