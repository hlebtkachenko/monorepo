/**
 * Lidé's two client components, rendered.
 *
 * A render smoke rather than a behaviour suite: the rules these components obey
 * are all decided on the server (`lib/data/people.ts`, `lib/auth/invite-policy.ts`),
 * and they are asserted there against real rows. What is worth pinning HERE is
 * the part only a render can show — that the Czech copy resolves, that the
 * once-only link is actually printed in full and marked as unrepeatable, and
 * that `submitDisabled` reaches the button, which is the visible half of the
 * last-owner surface.
 *
 * `renderToStaticMarkup`, the precedent `email-notifications-toggle.test.tsx`
 * sets: these are pure functions of their props, so neither jsdom nor a
 * Postgres boot buys anything.
 */
import { renderToStaticMarkup } from "react-dom/server"
import { NextIntlClientProvider } from "next-intl"
import { describe, expect, it, vi } from "vitest"

import { BETA_LOCALE, BETA_TIME_ZONE, betaFormats } from "@/i18n/formats"
import { betaMessages } from "@/i18n/messages"

vi.mock("../../_actions/people", () => ({
  inviteMemberAction: vi.fn(async () => ({ status: "idle" })),
  changeMemberRoleAction: vi.fn(async () => ({ status: "idle" })),
  setMemberActiveAction: vi.fn(async () => ({ status: "idle" })),
}))

const { PeopleActionForm } = await import("./people-action-form")
const { IssuedInviteLink } = await import(
  "../../../../../_components/issued-invite-link",
)
const { setMemberActiveAction } = await import("../../_actions/people")

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

/**
 * The `disabled` ATTRIBUTE, not the substring: the button's class list contains
 * `disabled:opacity-50` and friends, so a bare `toContain("disabled")` passes on
 * a live button.
 */
function submitIsDisabled(html: string): boolean {
  return /<button[^>]*\sdisabled(?:=""|[\s>])/.test(html)
}

describe("PeopleActionForm", () => {
  it("carries orgSlug as a hidden field — the tenancy gate every action reads", () => {
    const html = render(
      <PeopleActionForm
        action={setMemberActiveAction}
        orgSlug="acme-sro"
        submitLabel="Deaktivovat"
      />,
    )
    expect(html).toContain('name="orgSlug"')
    expect(html).toContain('value="acme-sro"')
  })

  it("renders the submit label", () => {
    const html = render(
      <PeopleActionForm
        action={setMemberActiveAction}
        orgSlug="acme-sro"
        submitLabel="Deaktivovat"
      />,
    )
    expect(html).toContain("Deaktivovat")
    expect(submitIsDisabled(html)).toBe(false)
  })

  it("disables the submit when the server said the row is untouchable", () => {
    // The visible half of the last-owner surface. It is an EXPLANATION, not the
    // gate — the action re-derives the verdict and the DB trigger refuses
    // underneath it — but a live button whose every click errors is worse UX
    // than one that says why.
    const html = render(
      <PeopleActionForm
        action={setMemberActiveAction}
        orgSlug="acme-sro"
        submitLabel="Deaktivovat"
        submitDisabled
      />,
    )
    expect(submitIsDisabled(html)).toBe(true)
  })
})

describe("IssuedInviteLink", () => {
  const url = "https://beta.example.com/setup/tajny-token-hodnota"

  it("prints the link in full and selectable — clipboard may be unavailable", () => {
    const html = render(
      <IssuedInviteLink
        url={url}
        email="kolega@example.com"
        expiresAt={new Date("2026-09-01T10:00:00Z").toISOString()}
      />,
    )
    expect(html).toContain(url)
    expect(html).toContain("select-all")
    expect(html).toContain("kolega@example.com")
  })

  it("says out loud that it will not be shown again", () => {
    const html = render(
      <IssuedInviteLink
        url={url}
        email="kolega@example.com"
        expiresAt={new Date("2026-09-01T10:00:00Z").toISOString()}
      />,
    )
    expect(html).toContain("Odkaz je připraven")
    expect(html).toContain("Znovu ho už nezobrazíme")
  })
})
