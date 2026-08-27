import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"

import type { BetaMessageKey } from "@/i18n/messages"

/**
 * The period half of a "start a manual batch" `EntrySheet` (manual-entry plan
 * §3, W1) — month and year. `periodKind` is fixed to `"month"` by the
 * caller's own hidden field, the same way `CsvUploadForm` fixes it: a
 * uzávěrka is monthly, and a period-kind selector would be one more control
 * for a case this fallback does not have.
 *
 * SHARED, in the org-level `_components/`, because TWO trigger call sites
 * (Finance › Pohledávky a závazky, Pro účetní › Měsíční uzávěrka) post through
 * it — the same reasoning that put `EntrySheet` itself here (plan §2.1).
 *
 * SYNCHRONOUS, `t` as a plain prop — `LoanFields`' own reasoning: the page
 * already resolved the translator once, and an async component nested inside
 * a Client Component's children is a tree `renderToStaticMarkup` cannot
 * resolve, which is what this component's own test renders.
 */
export function ManualBatchPeriodFields({
  t,
  idPrefix,
  defaultMonth,
  defaultYear,
}: {
  t: (key: BetaMessageKey) => string
  idPrefix: string
  defaultMonth: number
  defaultYear: number
}) {
  const id = (name: string) => `${idPrefix}-${name}`

  return (
    <div className="grid grid-cols-2 gap-4">
      <div className="grid gap-2">
        <Label htmlFor={id("month")}>{t("uzaverka.fieldMonth")}</Label>
        <Input
          id={id("month")}
          name="month"
          inputMode="numeric"
          required
          defaultValue={String(defaultMonth)}
        />
      </div>

      <div className="grid gap-2">
        <Label htmlFor={id("year")}>{t("uzaverka.fieldYear")}</Label>
        <Input
          id={id("year")}
          name="year"
          inputMode="numeric"
          required
          defaultValue={String(defaultYear)}
        />
      </div>
    </div>
  )
}
