import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"

import type { BetaMessageKey } from "@/i18n/messages"
import type { TrialBalanceLineView } from "@/lib/data/projections"

/**
 * The předvaha row drawer's own field set (manual-entry plan §3, W5) — účet,
 * název, and the four money columns `TrialBalanceTable` prints, in the same
 * order. Consumed by both the "add an account" `EntrySheet` and every row's
 * own "edit" one, the same shape `SaldoRowFields` / `StatementRowFields`
 * already establish.
 *
 * NO `kind` PROP, UNLIKE `StatementRowFields` — a předvaha has one column
 * shape, not three (`trial_balance_line`'s own schema comment: "no ozn, no
 * row order imposed by a vyhláška"), and no `sortOrder` field either: the
 * table is account-keyed and reads back ordered by `account_code`, so there
 * is no presentation order to state.
 *
 * SYNCHRONOUS, `t` as a plain prop — same reasoning as `SaldoRowFields`.
 */
export function TrialBalanceRowFields({
  t,
  idPrefix,
  line,
}: {
  t: (key: BetaMessageKey) => string
  idPrefix: string
  line?: TrialBalanceLineView
}) {
  const id = (name: string) => `${idPrefix}-${name}`

  return (
    <>
      <div className="grid gap-2">
        <Label htmlFor={id("accountCode")}>
          {t("vykazy.columnAccountCode")}
        </Label>
        <Input
          id={id("accountCode")}
          name="accountCode"
          required
          maxLength={20}
          defaultValue={line?.accountCode ?? ""}
        />
      </div>

      <div className="grid gap-2">
        <Label htmlFor={id("accountName")}>
          {t("vykazy.columnAccountName")}
        </Label>
        <Input
          id={id("accountName")}
          name="accountName"
          required
          defaultValue={line?.accountName ?? ""}
        />
      </div>

      <div className="grid gap-2">
        <Label htmlFor={id("openingBalance")}>
          {t("vykazy.columnOpeningBalance")}
        </Label>
        <Input
          id={id("openingBalance")}
          name="openingBalance"
          inputMode="decimal"
          defaultValue={line?.openingBalance ?? ""}
        />
      </div>

      <div className="grid gap-2">
        <Label htmlFor={id("turnoverDebit")}>
          {t("vykazy.columnTurnoverDebit")}
        </Label>
        <Input
          id={id("turnoverDebit")}
          name="turnoverDebit"
          inputMode="decimal"
          defaultValue={line?.turnoverDebit ?? ""}
        />
      </div>

      <div className="grid gap-2">
        <Label htmlFor={id("turnoverCredit")}>
          {t("vykazy.columnTurnoverCredit")}
        </Label>
        <Input
          id={id("turnoverCredit")}
          name="turnoverCredit"
          inputMode="decimal"
          defaultValue={line?.turnoverCredit ?? ""}
        />
      </div>

      <div className="grid gap-2">
        <Label htmlFor={id("closingBalance")}>
          {t("vykazy.columnClosingBalance")}
        </Label>
        <Input
          id={id("closingBalance")}
          name="closingBalance"
          inputMode="decimal"
          defaultValue={line?.closingBalance ?? ""}
        />
      </div>
    </>
  )
}
