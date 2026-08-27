import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
import {
  NativeSelect,
  NativeSelectOption,
} from "@workspace/ui/components/native-select"

import type { BetaMessageKey } from "@/i18n/messages"
import type {
  PayrollEmployeeLineView,
  PayrollEmployeeView,
} from "@/lib/data/projections"

/**
 * The field set both payroll line writes share (manual-entry plan §3, W4) —
 * handed to `EntrySheet` as children for both the batch preview's "Přidat
 * řádek" and each row's "Upravit" sheet, the same one-field-set-for-both
 * shape `LoanFields`/`EmployeeFields` already establish.
 *
 * THE EMPLOYEE IS PICKED BY ID, FROM THE REGISTER, NEVER TYPED. `employees`
 * is the W3 register (`payrollEmployeesForScope`) — the same discipline the
 * plan states for W2's saldo rows ("partner NativeSelect … by id — never a
 * typed name"): identity lives in one table, this form only points at a row
 * of it. The select stays editable on EDIT too, not just create — a mis-picked
 * row is repointed here rather than deleted and re-added, and the database's
 * own `payroll_employee_line_identity_unique` refuses a duplicate either way.
 */
export function PayrollLineFields({
  t,
  idPrefix,
  employees,
  line,
}: {
  t: (key: BetaMessageKey) => string
  idPrefix: string
  employees: readonly PayrollEmployeeView[]
  line?: PayrollEmployeeLineView
}) {
  const id = (name: string) => `${idPrefix}-${name}`

  return (
    <>
      <div className="grid gap-2">
        <Label htmlFor={id("payrollEmployeeId")}>
          {t("mzdyZadani.fieldEmployee")}
        </Label>
        <NativeSelect
          id={id("payrollEmployeeId")}
          name="payrollEmployeeId"
          required
          defaultValue={line?.employeeId ?? ""}
        >
          <NativeSelectOption value="" disabled>
            —
          </NativeSelectOption>
          {employees.map((employee) => (
            <NativeSelectOption key={employee.id} value={employee.id}>
              {employee.fullName}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      </div>

      <div className="grid gap-2">
        <Label htmlFor={id("gross")}>{t("mzdyZadani.fieldGross")}</Label>
        <Input
          id={id("gross")}
          name="gross"
          inputMode="decimal"
          defaultValue={line?.gross ?? ""}
        />
      </div>

      <div className="grid gap-2">
        <Label htmlFor={id("deductionsTotal")}>
          {t("mzdyZadani.fieldDeductionsTotal")}
        </Label>
        <Input
          id={id("deductionsTotal")}
          name="deductionsTotal"
          inputMode="decimal"
          defaultValue={line?.deductionsTotal ?? ""}
        />
      </div>

      <div className="grid gap-2">
        <Label htmlFor={id("net")}>{t("mzdyZadani.fieldNet")}</Label>
        <Input
          id={id("net")}
          name="net"
          inputMode="decimal"
          defaultValue={line?.net ?? ""}
        />
      </div>

      <div className="grid gap-2">
        <Label htmlFor={id("employerCost")}>
          {t("mzdyZadani.fieldEmployerCost")}
        </Label>
        <Input
          id={id("employerCost")}
          name="employerCost"
          inputMode="decimal"
          defaultValue={line?.employerCost ?? ""}
        />
      </div>
    </>
  )
}
