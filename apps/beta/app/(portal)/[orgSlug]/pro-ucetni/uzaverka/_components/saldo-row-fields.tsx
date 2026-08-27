import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
import {
  NativeSelect,
  NativeSelectOption,
} from "@workspace/ui/components/native-select"

import type { BetaMessageKey } from "@/i18n/messages"
import type { PartnerSaldoLineView, PartnerView } from "@/lib/data/projections"

/**
 * The saldokonto row drawer's own field set (manual-entry plan §3, W2) —
 * partner, dlužné nám, dlužíme, nejstarší splatnost, in the same order
 * `PartnerSaldoBatchTable` prints them. Consumed by BOTH the "add a partner"
 * `EntrySheet` and every row's own "edit" one — the same one-component-two-
 * callers shape `LoanFields` and `EmployeeFields` already established.
 *
 * THE PARTNER IS PICKED BY ID, NEVER TYPED. Identity lives in
 * `lib/data/partners.ts` alone — a saldo row names a partner the office
 * already registered (Zadávání dat, or a prior saldokonto import), and a free
 * text field here would let two spellings of the same counterparty split one
 * supplier's saldo across two rows, exactly the defect the registry exists to
 * prevent. `partners` is `partnersForOwner`'s own return, already ordered by
 * name.
 *
 * `idPrefix` scopes every `id`/`htmlFor` pair, for the same reason
 * `LoanFields` states it: the edit form renders once per row, and a shared id
 * would silently point every label at the first row's field.
 *
 * SYNCHRONOUS, `t` as a plain prop — `LoanFields`' own reasoning: the page
 * already resolved the translator once, and an async component nested inside
 * a Client Component's (`EntrySheet`'s) children is a tree
 * `renderToStaticMarkup` cannot resolve, which is what this component's own
 * test renders.
 */
export function SaldoRowFields({
  t,
  idPrefix,
  partners,
  line,
}: {
  t: (key: BetaMessageKey) => string
  idPrefix: string
  partners: readonly PartnerView[]
  line?: PartnerSaldoLineView
}) {
  const id = (name: string) => `${idPrefix}-${name}`

  return (
    <>
      <div className="grid gap-2">
        <Label htmlFor={id("partnerId")}>
          {t("uzaverka.saldoFieldPartner")}
        </Label>
        <NativeSelect
          id={id("partnerId")}
          name="partnerId"
          required
          defaultValue={line?.partnerId ?? ""}
        >
          <NativeSelectOption value="" disabled>
            —
          </NativeSelectOption>
          {partners.map((partner) => (
            <NativeSelectOption key={partner.id} value={partner.id}>
              {partner.name}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      </div>

      <div className="grid gap-2">
        <Label htmlFor={id("receivableTotal")}>
          {t("uzaverka.saldoFieldReceivable")}
        </Label>
        <Input
          id={id("receivableTotal")}
          name="receivableTotal"
          inputMode="decimal"
          defaultValue={line?.receivableTotal ?? ""}
        />
      </div>

      <div className="grid gap-2">
        <Label htmlFor={id("payableTotal")}>
          {t("uzaverka.saldoFieldPayable")}
        </Label>
        <Input
          id={id("payableTotal")}
          name="payableTotal"
          inputMode="decimal"
          defaultValue={line?.payableTotal ?? ""}
        />
      </div>

      <div className="grid gap-2">
        <Label htmlFor={id("oldestDue")}>
          {t("uzaverka.saldoFieldOldestDue")}
        </Label>
        <Input
          id={id("oldestDue")}
          name="oldestDue"
          type="date"
          defaultValue={line?.oldestDue ?? ""}
        />
      </div>
    </>
  )
}
