/**
 * The Nastavení › Účet toggle, rendered — standalone (not mounted into any
 * route yet, see the component's own header). A pure function of its
 * `initialEnabled` prop, so `renderToStaticMarkup` is enough, the same
 * precedent `ukoly.test.tsx` and `zadavani.test.tsx` set.
 */
import { renderToStaticMarkup } from "react-dom/server"
import { NextIntlClientProvider } from "next-intl"
import { describe, expect, it, vi } from "vitest"

import { BETA_LOCALE, BETA_TIME_ZONE, betaFormats } from "@/i18n/formats"
import { betaMessages } from "@/i18n/messages"

vi.mock("../_actions/notifications", () => ({
  setEmailNotificationsEnabledAction: vi.fn(async () => ({ ok: true })),
}))

const { EmailNotificationsToggle } =
  await import("./email-notifications-toggle")

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

describe("EmailNotificationsToggle", () => {
  it("renders the Czech label and hint", () => {
    const html = render(<EmailNotificationsToggle initialEnabled={true} />)
    expect(html).toContain("E-mailové notifikace")
    expect(html).toContain("Dostávejte e-mail")
  })

  it("reflects an enabled initial state as aria-checked=true", () => {
    const html = render(<EmailNotificationsToggle initialEnabled={true} />)
    expect(html).toContain('aria-checked="true"')
  })

  it("reflects a disabled initial state as aria-checked=false", () => {
    const html = render(<EmailNotificationsToggle initialEnabled={false} />)
    expect(html).toContain('aria-checked="false"')
  })
})
