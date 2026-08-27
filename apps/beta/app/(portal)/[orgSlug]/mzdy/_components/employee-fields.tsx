import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
import {
  NativeSelect,
  NativeSelectOption,
} from "@workspace/ui/components/native-select"

import type { BetaMessageKey } from "@/i18n/messages"
import type { PayrollEmployeeView } from "@/lib/data/projections"
import { PAYROLL_CONTRACT_TYPE_LABEL_KEY } from "@/lib/payroll-labels"
import type { BetaPayrollContractType } from "@/db/schema"

const CONTRACT_TYPES: readonly BetaPayrollContractType[] = ["hpp", "dpc", "dpp"]

/**
 * The field set both Zaměstnanci writes share (manual-entry plan §3.3, W3) —
 * handed to `EntrySheet` as children for both the page-header "Přidat
 * zaměstnance" create sheet and each row's "Upravit" edit sheet, so the two
 * writes stay one field definition. Mirrors `finance/uvery/_components/loan-fields.tsx`:
 * `t` arrives as a plain synchronous prop, and `idPrefix` scopes every
 * `id`/`htmlFor` pair so one page rendering many rows' edit sheets never
 * collides on a shared id.
 *
 * `active` ALWAYS RENDERS AS AN EXPLICIT CHOICE, on create as well as edit —
 * unlike `zadavani`'s accounts table, which defaults a fresh row to active via
 * a hidden input and only exposes the select on edit. Here `active` and
 * `endedOn` are independent facts the office may state together on day one
 * (spec §2.6.1), so one field set states both rather than special-casing the
 * create path.
 *
 * NO FIELD FOR `external_ref` OR `app_user_id` — see `employees.ts`'s header
 * for why: a hand-typed row must stay outside the agent's match key, and the
 * seat link is bound only by consuming an invite, never by this form.
 */
export function EmployeeFields({
  t,
  idPrefix,
  employee,
}: {
  t: (key: BetaMessageKey) => string
  idPrefix: string
  employee?: PayrollEmployeeView
}) {
  const id = (name: string) => `${idPrefix}-${name}`

  return (
    <>
      <div className="grid gap-2">
        <Label htmlFor={id("fullName")}>
          {t("mzdy.zamestnanciFieldFullName")}
        </Label>
        <Input
          id={id("fullName")}
          name="fullName"
          required
          autoComplete="off"
          defaultValue={employee?.fullName ?? ""}
        />
      </div>

      <div className="grid gap-2">
        <Label htmlFor={id("contractType")}>
          {t("mzdy.zamestnanciFieldContractType")}
        </Label>
        <NativeSelect
          id={id("contractType")}
          name="contractType"
          required
          defaultValue={employee?.contractType ?? ""}
        >
          <NativeSelectOption value="" disabled>
            —
          </NativeSelectOption>
          {CONTRACT_TYPES.map((type) => (
            <NativeSelectOption key={type} value={type}>
              {t(PAYROLL_CONTRACT_TYPE_LABEL_KEY[type])}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      </div>

      <div className="grid gap-2">
        <Label htmlFor={id("startedOn")}>
          {t("mzdy.zamestnanciFieldStartedOn")}
        </Label>
        <Input
          id={id("startedOn")}
          name="startedOn"
          type="date"
          defaultValue={employee?.startedOn ?? ""}
        />
      </div>

      <div className="grid gap-2">
        <Label htmlFor={id("endedOn")}>
          {t("mzdy.zamestnanciFieldEndedOn")}
        </Label>
        <Input
          id={id("endedOn")}
          name="endedOn"
          type="date"
          defaultValue={employee?.endedOn ?? ""}
        />
      </div>

      <div className="grid gap-2">
        <Label htmlFor={id("active")}>{t("mzdy.zamestnanciFieldActive")}</Label>
        <NativeSelect
          id={id("active")}
          name="active"
          required
          defaultValue={(employee?.active ?? true) ? "true" : "false"}
        >
          <NativeSelectOption value="true">
            {t("mzdy.zamestnanciStateActive")}
          </NativeSelectOption>
          <NativeSelectOption value="false">
            {t("mzdy.zamestnanciStateInactive")}
          </NativeSelectOption>
        </NativeSelect>
      </div>
    </>
  )
}
