/**
 * The shell's SCROLL REGION is the thing under test, and it is a regression
 * guard rather than a unit: `AppShell` deliberately renders its body slot
 * `overflow-hidden` (the org app fills that slot with surfaces that scroll
 * their own inner regions), so a consumer that hands it a plain page column —
 * which every beta page is — gets everything past the fold clipped and
 * unreachable unless IT supplies the scroll region. That is exactly what
 * shipped: no page in the portal scrolled.
 *
 * A static render can prove the invariant that prevents it coming back — that
 * `children` land inside an element which is allowed to scroll — so it is
 * asserted here rather than left to a browser nobody runs in CI.
 *
 * `renderToStaticMarkup` + `NextIntlClientProvider` is the convention every
 * other `apps/beta` component test uses (see `totp-enrolment.test.tsx`); this
 * app carries no jsdom and no Testing Library on purpose.
 */
import { renderToStaticMarkup } from "react-dom/server"
import { NextIntlClientProvider } from "next-intl"
import { describe, expect, it, vi } from "vitest"

import { IconProvider } from "@workspace/ui/icon-packs"

import { BETA_LOCALE, BETA_TIME_ZONE, betaFormats } from "@/i18n/formats"
import { betaMessages } from "@/i18n/messages"

// The shell reads the active path to mark the current rail entry. There is no
// Next router in a static render, so the hook is stubbed rather than the whole
// module tree rearranged to avoid it.
vi.mock("next/navigation", () => ({ usePathname: () => "/demo/dokumenty" }))

const { BetaShell } = await import("./beta-shell")

function render(node: React.ReactElement): string {
  return renderToStaticMarkup(
    <NextIntlClientProvider
      locale={BETA_LOCALE}
      timeZone={BETA_TIME_ZONE}
      formats={betaFormats}
      messages={betaMessages as never}
    >
      {/* The root layout mounts one; the rail's icon buttons need it. */}
      <IconProvider>{node}</IconProvider>
    </NextIntlClientProvider>,
  )
}

describe("BetaShell — page scroll", () => {
  it("wraps the page body in a scrollable region", () => {
    const html = render(
      <BetaShell orgSlug="demo" orgLegalName="Demo Ucetni s.r.o.">
        <p>page body</p>
      </BetaShell>,
    )

    // Asserted as EXACT containment, not a loose regex over the whole
    // document: the rail is itself an `overflow-y-auto` box, so a pattern that
    // merely finds "a scrollable div ... somewhere ... then the body" passes
    // against the clipped version too. What matters is that the body is the
    // scroll region's own content.
    expect(html).toContain(
      '<div class="h-full overflow-y-auto"><p>page body</p></div>',
    )
  })

  it("gives the scroll region a fixed height so it overflows inside the shell", () => {
    // `h-full` is load-bearing: with `min-h-full` (or no height at all) the box
    // GROWS past its parent instead of scrolling, and `AppShell`'s
    // `overflow-hidden` body clips it again — the original bug, restored.
    const html = render(
      <BetaShell orgSlug="demo" orgLegalName="Demo Ucetni s.r.o.">
        <p>page body</p>
      </BetaShell>,
    )

    expect(html).toContain('<div class="h-full overflow-y-auto">')
  })
})
