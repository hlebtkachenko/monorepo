import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
import {
  NativeSelect,
  NativeSelectOption,
} from "@workspace/ui/components/native-select"
import { Textarea } from "@workspace/ui/components/textarea"

import type { BetaMessageKey } from "@/i18n/messages"
import type { IndicatorView } from "@/lib/data/projections"
import {
  INDICATOR_KINDS,
  INDICATOR_KIND_LABEL_KEY,
} from "@/lib/indicator-labels"
import { formatBetaDate } from "@/lib/format/date"

/**
 * The field set both Ukazatele writes share — handed to `EntrySheet` as
 * children, so stating a reading and correcting one are one definition (the
 * shape `loan-fields.tsx` established in W0).
 *
 * SYNCHRONOUS, and `t` arrives as a PROP: the page resolved the translator once,
 * and an async component nested inside a Client Component's children is a tree
 * `renderToStaticMarkup` cannot resolve — which is what this page's own smoke
 * test renders.
 *
 * `idPrefix` exists because the edit sheets are rendered one per table row: the
 * `<label for>` / `<input id>` pairing is document-global, so a second form
 * reusing `id="amount"` would point every label at the first row's field.
 *
 * WHAT THE EDIT ARM WILL NOT LET YOU CHANGE, and why. `(kind, as_of)` is the
 * row's identity — the unique key both this form and the agent API upsert on —
 * so re-pointing an existing reading at a different date would not MOVE it, it
 * would state a second one and leave the first behind. On an existing row the
 * pair is therefore printed as text with hidden inputs carrying it, never as a
 * disabled control (a disabled input is a control that looks like it ought to
 * work). A mis-dated reading is deleted and re-entered — the same call
 * `AccountsSection` makes about a mis-typed account code.
 */
export function IndicatorFields({
  t,
  idPrefix,
  indicator,
}: {
  t: (key: BetaMessageKey) => string
  idPrefix: string
  /**
   * The row being corrected, with the office's own note. `noteInternal` is
   * required on the edit arm rather than optional, because the sheet submits
   * EVERY field and `formOptionalText` reads an empty box as the office clearing
   * it — an unprefilled textarea would wipe the note on every amount fix.
   */
  indicator?: IndicatorView & { readonly noteInternal: string }
}) {
  const id = (name: string) => `${idPrefix}-${name}`

  return (
    <>
      {indicator ? (
        <>
          <input type="hidden" name="kind" value={indicator.kind} />
          <input type="hidden" name="asOf" value={indicator.asOf} />
          <p className="text-sm">
            <span className="font-medium">
              {t(INDICATOR_KIND_LABEL_KEY[indicator.kind])}
            </span>
            <span className="block text-xs text-muted-foreground">
              {t("ukazatele.fieldAsOf")}: {formatBetaDate(indicator.asOf)}
            </span>
          </p>
        </>
      ) : (
        <>
          <div className="grid gap-2">
            <Label htmlFor={id("kind")}>{t("ukazatele.fieldKind")}</Label>
            <NativeSelect
              id={id("kind")}
              name="kind"
              required
              defaultValue={INDICATOR_KINDS[0]}
            >
              {INDICATOR_KINDS.map((kind) => (
                <NativeSelectOption key={kind} value={kind}>
                  {t(INDICATOR_KIND_LABEL_KEY[kind])}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </div>

          <div className="grid gap-2">
            <Label htmlFor={id("asOf")}>{t("ukazatele.fieldAsOf")}</Label>
            <Input id={id("asOf")} name="asOf" type="date" required />
          </div>
        </>
      )}

      <div className="grid gap-2">
        <Label htmlFor={id("amount")}>{t("ukazatele.fieldAmount")}</Label>
        <Input
          id={id("amount")}
          name="amount"
          inputMode="decimal"
          required
          autoComplete="off"
          defaultValue={indicator?.amount ?? ""}
        />
      </div>

      <div className="grid gap-2">
        <Label htmlFor={id("noteInternal")}>
          {t("ukazatele.fieldNoteInternal")}
        </Label>
        {/* `maxLength` mirrors the action's own ceiling (and the agent API's
            `optionalText(2000)`), so the browser stops at the same place the
            server would refuse. The reader is still the enforcement — this is a
            courtesy, not a gate. */}
        <Textarea
          id={id("noteInternal")}
          name="noteInternal"
          rows={2}
          maxLength={2000}
          defaultValue={indicator?.noteInternal ?? ""}
        />
      </div>
    </>
  )
}
