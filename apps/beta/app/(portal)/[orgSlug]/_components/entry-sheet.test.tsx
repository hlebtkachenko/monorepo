/**
 * `EntrySheet` (manual-entry plan §2.1/W0), rendered — same
 * `renderToStaticMarkup` + `NextIntlClientProvider` terms as
 * `pro-ucetni/zadavani/_components/partners-section.test.tsx`.
 *
 * SCOPED TO THE TRIGGER, ON PURPOSE. React's server renderer does not render
 * portal content at all — confirmed empirically against this app's own
 * `Sheet` (`@workspace/ui/components/sheet` wraps Radix `Dialog`, and its
 * `Content` is portalled): `renderToStaticMarkup` on a `Sheet` with
 * `open={true}` still omits everything inside `SheetContent` from the output
 * string, because a portal renders into a DOM container `renderToStaticMarkup`
 * never produces. So no static render — of `EntrySheet`, of the `Sheet` it
 * wraps, or of any future caller's page — can assert what is INSIDE the
 * sheet; only what is INSIDE THE FLOW (the trigger) is observable this way.
 * The fields component each wave passes as `children` (this PR's
 * `LoanFields`, proven in `finance/uvery/_components/loan-fields.test.tsx`)
 * is what stays independently testable — exactly the reason the plan
 * (§2.1 point 3) keeps fields as their own component rather than inlining
 * them into the sheet.
 *
 * What IS proven here: the trigger renders with the given label and variant,
 * and carries the a11y attributes a disclosure control needs before any
 * client JS has run (`aria-haspopup`, `aria-expanded`, `data-state`).
 */
import { renderToStaticMarkup } from "react-dom/server"
import { NextIntlClientProvider } from "next-intl"
import { describe, expect, it } from "vitest"

import { BETA_LOCALE, BETA_TIME_ZONE, betaFormats } from "@/i18n/formats"
import { betaMessages } from "@/i18n/messages"

import { EntrySheet, type EntrySheetActionState } from "./entry-sheet"

const IDLE: EntrySheetActionState = { status: "idle" }

async function fakeAction(
  previous: EntrySheetActionState,
  _formData: FormData,
): Promise<EntrySheetActionState> {
  return previous
}

function render(node: React.ReactElement): string {
  return renderToStaticMarkup(
    <NextIntlClientProvider
      locale={BETA_LOCALE}
      timeZone={BETA_TIME_ZONE}
      formats={betaFormats}
      messages={betaMessages as never}
    >
      {node}
    </NextIntlClientProvider>,
  )
}

function sheet(
  overrides: Partial<
    Pick<
      React.ComponentProps<typeof EntrySheet<EntrySheetActionState>>,
      "triggerVariant" | "triggerSize"
    >
  > = {},
): React.ReactElement {
  return (
    <EntrySheet
      action={fakeAction}
      idle={IDLE}
      hidden={{ orgSlug: "acme-sro" }}
      triggerLabel="Přidat řádek"
      title="Nový řádek"
      description="Vyplňte údaje nového řádku."
      submitLabel="Uložit řádek"
      {...overrides}
    >
      <input name="amount" defaultValue="1000" />
    </EntrySheet>
  )
}

describe("EntrySheet — the trigger", () => {
  it("renders the given label", () => {
    const html = render(sheet())
    expect(html).toContain("Přidat řádek")
  })

  it("defaults to an outline, small trigger — the row/section-level shape", () => {
    const html = render(sheet())
    expect(html).toContain('data-variant="outline"')
    expect(html).toContain('data-size="sm"')
  })

  it("takes `default`/full size for a page header's primary action", () => {
    const html = render(
      sheet({ triggerVariant: "default", triggerSize: "default" }),
    )
    expect(html).toContain('data-variant="default"')
    expect(html).toContain('data-size="default"')
  })

  it("marks itself as a closed dialog opener before any client JS runs", () => {
    const html = render(sheet())
    expect(html).toContain('aria-haspopup="dialog"')
    expect(html).toContain('aria-expanded="false"')
    expect(html).toContain('data-state="closed"')
  })
})
