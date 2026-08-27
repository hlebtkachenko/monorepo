import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
import { Textarea } from "@workspace/ui/components/textarea"

import type { BetaMessageKey } from "@/i18n/messages"

/**
 * The twelve fields a "start a manual payroll batch" `EntrySheet` posts
 * (manual-entry plan §3, W4) — every one of them optional (spec §0.4: an
 * unknown is not a zero), matching `PayrollSummaryInput` field for field.
 *
 * SINGLE-USE, unlike `LoanFields`/`EmployeeFields`: only `mzdy/page.tsx`'s
 * "start" `EntrySheet` renders this, since a payroll batch's summary is
 * written once, at creation — there is no "edit the summary" action (the
 * plan names none), a wrong figure means discarding the draft and starting
 * again, the same as every other dataset's manual start.
 *
 * SYNCHRONOUS, `t` as a plain prop — the same reasoning `LoanFields` and
 * `EmployeeFields` both state: the page already resolved the translator once,
 * and an async component nested inside a Client Component's children is a
 * tree `renderToStaticMarkup` cannot resolve.
 */
export function PayrollSummaryFields({
  t,
  idPrefix,
}: {
  t: (key: BetaMessageKey) => string
  idPrefix: string
}) {
  const id = (name: string) => `${idPrefix}-${name}`

  const moneyField = (name: string, labelKey: BetaMessageKey) => (
    <div className="grid gap-2" key={name}>
      <Label htmlFor={id(name)}>{t(labelKey)}</Label>
      <Input id={id(name)} name={name} inputMode="decimal" />
    </div>
  )

  const headcountField = (name: string, labelKey: BetaMessageKey) => (
    <div className="grid gap-2" key={name}>
      <Label htmlFor={id(name)}>{t(labelKey)}</Label>
      <Input id={id(name)} name={name} inputMode="numeric" />
    </div>
  )

  return (
    <>
      {moneyField("grossTotal", "mzdyZadani.fieldGrossTotal")}
      {moneyField("employerSocial", "mzdyZadani.fieldEmployerSocial")}
      {moneyField("employerHealth", "mzdyZadani.fieldEmployerHealth")}
      {moneyField("employerCostTotal", "mzdyZadani.fieldEmployerCostTotal")}
      {moneyField(
        "employeeWithholdingsTotal",
        "mzdyZadani.fieldEmployeeWithholdingsTotal",
      )}
      {moneyField("incomeTaxAdvance", "mzdyZadani.fieldIncomeTaxAdvance")}
      {moneyField("netPaidTotal", "mzdyZadani.fieldNetPaidTotal")}

      <div className="grid gap-2">
        <Label htmlFor={id("paymentDueDate")}>
          {t("mzdyZadani.fieldPaymentDueDate")}
        </Label>
        <Input id={id("paymentDueDate")} name="paymentDueDate" type="date" />
      </div>

      <div className="grid grid-cols-3 gap-4">
        {headcountField("headcountHpp", "mzdyZadani.fieldHeadcountHpp")}
        {headcountField("headcountDpc", "mzdyZadani.fieldHeadcountDpc")}
        {headcountField("headcountDpp", "mzdyZadani.fieldHeadcountDpp")}
      </div>

      <div className="grid gap-2">
        <Label htmlFor={id("noteClient")}>
          {t("mzdyZadani.fieldNoteClient")}
        </Label>
        <Textarea id={id("noteClient")} name="noteClient" rows={2} />
      </div>
    </>
  )
}
