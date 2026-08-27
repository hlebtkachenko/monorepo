import { Checkbox } from "@workspace/ui/components/checkbox"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"

import type { BetaMessageKey } from "@/i18n/messages"
import type { BetaStatementKind } from "@/db/schema"
import type { StatementLineView } from "@/lib/data/projections"

/**
 * The výkazy row drawer's own field set (manual-entry plan §3, W5) — ozn,
 * číslo řádku, text, pořadí, odsazení, tučně, then the KIND-DEPENDENT money
 * columns. Consumed by both the "add a row" `EntrySheet` and every row's own
 * "edit" one, the same one-component-two-callers shape `SaldoRowFields`
 * already established.
 *
 * THE MONEY COLUMNS ARE A FUNCTION OF `kind`, mirroring the shared
 * `StatementTable`'s own `VALUE_COLUMNS` map and, underneath it,
 * `statement_line_column_shape` (migration 0007): rozvaha aktiva prints
 * brutto/korekce/netto/minulé, rozvaha pasiva and VZZ print běžné/minulé. The
 * CHECK is the floor — this component's only job is to never render the
 * wrong pair, so a well-behaved submit never reaches it.
 *
 * `kind` ITSELF IS NOT A FIELD ON THIS FORM. It travels as a fixed hidden
 * input the caller sets via `EntrySheet`'s own `hidden` prop (same place
 * `batchId`/`rowId` travel) — a row never moves between aktiva and pasiva by
 * editing it, so there is nothing here for the office to choose.
 *
 * `defaultSortOrder` IS ALWAYS PASSED, never read off `line`.
 * `StatementLineView` deliberately does not carry `sortOrder` (its own
 * comment: shipping it would invite a second, client-side re-sort of an
 * order the database already applied) — so the caller computes it instead:
 * `lines.length + 1` for a new row (append at end), or the row's own
 * position in the already-ordered array for an edit. Both are EDITABLE
 * starting points, not the literal stored value, which is exactly what the
 * plan asks for.
 *
 * SYNCHRONOUS, `t` as a plain prop — `SaldoRowFields`' own reasoning: an
 * async component nested inside a Client Component's (`EntrySheet`'s)
 * children is a tree `renderToStaticMarkup` cannot resolve.
 */
export function StatementRowFields({
  t,
  idPrefix,
  kind,
  defaultSortOrder,
  line,
}: {
  t: (key: BetaMessageKey) => string
  idPrefix: string
  kind: BetaStatementKind
  defaultSortOrder: number
  line?: StatementLineView
}) {
  const id = (name: string) => `${idPrefix}-${name}`
  const isAktiva = kind === "rozvaha_aktiva"

  return (
    <>
      <div className="grid gap-2">
        <Label htmlFor={id("ozn")}>{t("vykazy.columnOzn")}</Label>
        <Input id={id("ozn")} name="ozn" defaultValue={line?.ozn ?? ""} />
      </div>

      <div className="grid gap-2">
        <Label htmlFor={id("rowCode")}>{t("vykazy.columnRowCode")}</Label>
        <Input
          id={id("rowCode")}
          name="rowCode"
          required
          maxLength={10}
          defaultValue={line?.rowCode ?? ""}
        />
      </div>

      <div className="grid gap-2">
        <Label htmlFor={id("rowLabel")}>{t("vykazy.columnText")}</Label>
        <Input
          id={id("rowLabel")}
          name="rowLabel"
          required
          defaultValue={line?.rowLabel ?? ""}
        />
      </div>

      <div className="grid gap-2">
        <Label htmlFor={id("sortOrder")}>
          {t("vykazyZadani.fieldSortOrder")}
        </Label>
        <Input
          id={id("sortOrder")}
          name="sortOrder"
          type="number"
          min={1}
          max={9999}
          required
          defaultValue={defaultSortOrder}
        />
      </div>

      <div className="grid gap-2">
        <Label htmlFor={id("indent")}>{t("vykazyZadani.fieldIndent")}</Label>
        <Input
          id={id("indent")}
          name="indent"
          type="number"
          min={0}
          max={8}
          defaultValue={line?.indent ?? 0}
        />
      </div>

      <div className="flex items-center gap-2">
        <Checkbox
          id={id("isBold")}
          name="isBold"
          defaultChecked={line?.isBold ?? false}
        />
        <Label htmlFor={id("isBold")} className="font-normal">
          {t("vykazyZadani.fieldIsBold")}
        </Label>
      </div>

      {isAktiva ? (
        <>
          <div className="grid gap-2">
            <Label htmlFor={id("brutto")}>{t("vykazy.columnBrutto")}</Label>
            <Input
              id={id("brutto")}
              name="brutto"
              inputMode="decimal"
              defaultValue={line?.brutto ?? ""}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor={id("korekce")}>{t("vykazy.columnKorekce")}</Label>
            <Input
              id={id("korekce")}
              name="korekce"
              inputMode="decimal"
              defaultValue={line?.korekce ?? ""}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor={id("netto")}>{t("vykazy.columnNetto")}</Label>
            <Input
              id={id("netto")}
              name="netto"
              inputMode="decimal"
              defaultValue={line?.netto ?? ""}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor={id("minule")}>{t("vykazy.columnMinule")}</Label>
            <Input
              id={id("minule")}
              name="minule"
              inputMode="decimal"
              defaultValue={line?.minule ?? ""}
            />
          </div>
        </>
      ) : (
        <>
          <div className="grid gap-2">
            <Label htmlFor={id("bezne")}>{t("vykazy.columnBezne")}</Label>
            <Input
              id={id("bezne")}
              name="bezne"
              inputMode="decimal"
              defaultValue={line?.bezne ?? ""}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor={id("minule")}>{t("vykazy.columnMinule")}</Label>
            <Input
              id={id("minule")}
              name="minule"
              inputMode="decimal"
              defaultValue={line?.minule ?? ""}
            />
          </div>
        </>
      )}
    </>
  )
}
