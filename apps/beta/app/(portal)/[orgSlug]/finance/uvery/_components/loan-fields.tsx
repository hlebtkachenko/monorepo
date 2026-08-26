import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
import {
  NativeSelect,
  NativeSelectOption,
} from "@workspace/ui/components/native-select"
import { Textarea } from "@workspace/ui/components/textarea"

import {
  LOAN_INSTALLMENT_PERIOD_LABEL_KEY,
  LOAN_KIND_LABEL_KEY,
} from "@/lib/loan-labels"
import type { LoanView } from "@/lib/data/projections"
import type { BetaMessageKey } from "@/i18n/messages"
import type { BetaLoanInstallmentPeriod, BetaLoanKind } from "@/db/schema"

const LOAN_KINDS: readonly BetaLoanKind[] = ["loan", "lease", "overdraft"]
const INSTALLMENT_PERIODS: readonly BetaLoanInstallmentPeriod[] = [
  "monthly",
  "quarterly",
  "semiannual",
  "annual",
]

/**
 * The field set both Úvěry writes share — handed to the client
 * `LoanActionForm` as children, so the create form and every row's edit form
 * stay one definition. Passing `loan` pre-fills it for the edit case.
 *
 * SYNCHRONOUS, and `t` arrives as a PROP rather than being awaited here. The
 * page already resolved the translator once; a per-row `await
 * getBetaTranslations()` would resolve it again for every contract in the book,
 * and an async component nested inside a Client Component's children is a tree
 * `renderToStaticMarkup` cannot resolve — which is what the page's own smoke
 * test renders.
 *
 * `idPrefix` exists because the edit forms are rendered one per table row: the
 * `<label for>` / `<input id>` pairing is document-global, so a second form
 * reusing `id="institution"` would silently point every label at the first row's
 * field.
 */
export function LoanFields({
  t,
  idPrefix,
  loan,
}: {
  t: (key: BetaMessageKey) => string
  idPrefix: string
  loan?: LoanView
}) {
  const id = (name: string) => `${idPrefix}-${name}`

  return (
    <>
      <div className="grid gap-2">
        <Label htmlFor={id("institution")}>{t("uvery.fieldInstitution")}</Label>
        <Input
          id={id("institution")}
          name="institution"
          required
          autoComplete="off"
          defaultValue={loan?.institution ?? ""}
        />
      </div>

      <div className="grid gap-2">
        <Label htmlFor={id("loanKind")}>{t("uvery.fieldKind")}</Label>
        <NativeSelect
          id={id("loanKind")}
          name="loanKind"
          required
          defaultValue={loan?.loanKind ?? ""}
        >
          <NativeSelectOption value="" disabled>
            —
          </NativeSelectOption>
          {LOAN_KINDS.map((kind) => (
            <NativeSelectOption key={kind} value={kind}>
              {t(LOAN_KIND_LABEL_KEY[kind])}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      </div>

      <div className="grid gap-2">
        <Label htmlFor={id("principal")}>{t("uvery.fieldPrincipal")}</Label>
        <Input
          id={id("principal")}
          name="principal"
          inputMode="decimal"
          required
          defaultValue={loan?.principal ?? ""}
        />
      </div>

      <div className="grid gap-2">
        <Label htmlFor={id("balance")}>{t("uvery.fieldBalance")}</Label>
        <Input
          id={id("balance")}
          name="balance"
          inputMode="decimal"
          defaultValue={loan?.balance ?? ""}
        />
      </div>

      <div className="grid gap-2">
        <Label htmlFor={id("balanceAsOf")}>{t("uvery.fieldBalanceAsOf")}</Label>
        <Input
          id={id("balanceAsOf")}
          name="balanceAsOf"
          type="date"
          defaultValue={loan?.balanceAsOf ?? ""}
        />
      </div>

      <div className="grid gap-2">
        <Label htmlFor={id("installment")}>{t("uvery.fieldInstallment")}</Label>
        <Input
          id={id("installment")}
          name="installment"
          inputMode="decimal"
          defaultValue={loan?.installment ?? ""}
        />
      </div>

      <div className="grid gap-2">
        <Label htmlFor={id("installmentPeriod")}>
          {t("uvery.fieldInstallmentPeriod")}
        </Label>
        <NativeSelect
          id={id("installmentPeriod")}
          name="installmentPeriod"
          defaultValue={loan?.installmentPeriod ?? ""}
        >
          <NativeSelectOption value="">—</NativeSelectOption>
          {INSTALLMENT_PERIODS.map((period) => (
            <NativeSelectOption key={period} value={period}>
              {t(LOAN_INSTALLMENT_PERIOD_LABEL_KEY[period])}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      </div>

      <div className="grid gap-2">
        <Label htmlFor={id("interestRatePct")}>
          {t("uvery.fieldInterestRatePct")}
        </Label>
        <Input
          id={id("interestRatePct")}
          name="interestRatePct"
          inputMode="decimal"
          defaultValue={loan?.interestRatePct ?? ""}
        />
      </div>

      <div className="grid gap-2">
        <Label htmlFor={id("endsOn")}>{t("uvery.fieldEndsOn")}</Label>
        <Input
          id={id("endsOn")}
          name="endsOn"
          type="date"
          defaultValue={loan?.endsOn ?? ""}
        />
      </div>

      <div className="grid gap-2 sm:col-span-2">
        <Label htmlFor={id("noteClient")}>{t("uvery.fieldNoteClient")}</Label>
        <Textarea
          id={id("noteClient")}
          name="noteClient"
          rows={2}
          defaultValue={loan?.noteClient ?? ""}
        />
      </div>
    </>
  )
}
