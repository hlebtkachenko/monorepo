/**
 * The shared error boundary body, rendered in BOTH states of the calm-demo
 * switch.
 *
 * The whole feature is a claim about what a client sees when something breaks,
 * so the assertion has to be the rendered string rather than the predicate
 * behind it. `renderToStaticMarkup` + `NextIntlClientProvider` is the convention
 * every other `apps/beta` component test uses (see `totp-enrolment.test.tsx`);
 * this app carries no jsdom and no Testing Library on purpose.
 *
 * The flag reaches the component through `CalmErrorsProvider`, exactly as it
 * does in the app — which also proves the DEFAULT: a tree with no provider (the
 * first block below) renders the loud tone, so a component test, a Storybook
 * story or any future surface that forgets the provider fails safe.
 */
import { renderToStaticMarkup } from "react-dom/server"
import { NextIntlClientProvider } from "next-intl"
import { describe, expect, it } from "vitest"

import { BETA_LOCALE, BETA_TIME_ZONE, betaFormats } from "@/i18n/formats"
import { betaMessages } from "@/i18n/messages"

import { CalmErrorsProvider } from "./calm-errors"
import { ErrorPanel } from "./error-panel"

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

const boom = Object.assign(new Error("connection terminated"), {
  digest: "3141592653",
})

const panel = <ErrorPanel where="/[orgSlug]" error={boom} reset={() => {}} />

const loud = render(panel)
const calm = render(<CalmErrorsProvider enabled>{panel}</CalmErrorsProvider>)

describe("flag off — the deployed state, and the default with no provider", () => {
  it("says an error happened, in the destructive tone", () => {
    expect(loud).toContain("Něco se nepovedlo")
    expect(loud).toContain("Stránku se teď nepodařilo načíst")
    expect(loud).toContain("text-destructive")
  })

  it("offers the retry that is the only way out of the state", () => {
    expect(loud).toContain("Zkusit znovu")
  })

  it("renders none of the calm copy", () => {
    expect(loud).not.toContain("Data se připravují")
  })
})

describe("flag on — calm demo mode", () => {
  it("replaces the failure with a neutral pending state", () => {
    expect(calm).toContain("Data se připravují")
    expect(calm).toContain("Zkuste to prosím za chvíli")
  })

  it("drops the destructive styling entirely", () => {
    expect(calm).not.toContain("text-destructive")
    expect(calm).not.toContain("Něco se nepovedlo")
  })

  it("keeps the retry control — calm is not the same as stuck", () => {
    expect(calm).toContain("Načíst znovu")
  })
})

describe("both tones", () => {
  it("never puts the error's own text or digest on screen", () => {
    // A boundary that renders `error.message` leaks a Postgres string to a
    // client in the loud case and defeats the whole point in the calm one. The
    // digest is what goes to the log instead.
    for (const html of [loud, calm]) {
      expect(html).not.toContain("connection terminated")
      expect(html).not.toContain("3141592653")
    }
  })

  it("is an announced region either way", () => {
    // `Alert` carries role="alert" in both variants — a screen reader is told
    // the page changed even when the wording is calm.
    for (const html of [loud, calm]) {
      expect(html).toContain('role="alert"')
    }
  })
})
