/**
 * `TotpEnrolment`'s "verify" step only exists after an async `handleEnable`
 * sets internal state, which `renderToStaticMarkup` — the convention every
 * other `apps/beta` component test uses, see `email-notifications-toggle.test.tsx`
 * — cannot reach without jsdom + Testing Library (a devDependency this app
 * doesn't carry, and adding it is a `pnpm-lock.yaml` cache-buster). So this
 * file asserts the two things a static render CAN prove: the password step
 * renders no QR before there is anything to scan, and `TotpQrCode` — the
 * component the verify step wires the enrolment's `totpURI` into — passes
 * the value through with the same `size`/`level` the main app's MFA setup
 * screen (`apps/web/app/auth/mfa/setup/mfa-setup-form.tsx`) uses. The actual
 * SVG body is effect-generated (see `qr-code.tsx`) and untestable without a
 * DOM either way — `packages/ui`'s own `qr-code.test.tsx` needs jsdom for it.
 */
import { renderToStaticMarkup } from "react-dom/server"
import { NextIntlClientProvider } from "next-intl"
import { describe, expect, it } from "vitest"

import { BETA_LOCALE, BETA_TIME_ZONE, betaFormats } from "@/i18n/formats"
import { betaMessages } from "@/i18n/messages"

import { TotpEnrolment, TotpQrCode } from "./totp-enrolment"

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

describe("TotpEnrolment — password step", () => {
  it("renders no QR code before there is anything to scan", () => {
    const html = render(<TotpEnrolment onEnrolled={() => {}} />)
    expect(html).not.toContain('data-slot="qr-code"')
    expect(html).toContain("totp-enable-password")
  })
})

describe("TotpQrCode", () => {
  const uri =
    "otpauth://totp/Afframe:owner%40example.com?secret=JBSWY3DPEHPK3PXP&issuer=Afframe"

  it("renders the QR root wired to the enrolment's totp URI", () => {
    const html = render(<TotpQrCode value={uri} />)
    expect(html).toContain('data-slot="qr-code"')
  })

  it("uses the same size the main app's MFA setup screen uses", () => {
    const html = render(<TotpQrCode value={uri} />)
    expect(html).toContain("--qr-code-size:192px")
  })
})
