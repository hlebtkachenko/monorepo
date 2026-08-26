/**
 * The Asistent surface, rendered.
 *
 * The route's own suite owns the wire and the refusals; the data layer's owns
 * who may see what. This file owns the two things only a render can show, and
 * both are spec §2.8 requirements rather than styling:
 *
 *   1. THE DISCLAIMER APPEARS TWICE — above the composer AND attached to the
 *      first assistant message — and is NOT part of the stored transcript.
 *   2. The chat list marks the open conversation and shows the localized
 *      placeholder for a chat whose `title` is still NULL.
 *
 * `renderToStaticMarkup`, following the Zadávání dat / Úkoly suites: these are
 * pure functions of their props and a string is enough.
 */
import { renderToStaticMarkup } from "react-dom/server"
import { NextIntlClientProvider } from "next-intl"
import { describe, expect, it, vi } from "vitest"

import { BETA_LOCALE, BETA_TIME_ZONE, betaFormats } from "@/i18n/formats"
import { betaMessages } from "@/i18n/messages"
import type { ChatMessageView, ChatSummary } from "@/lib/data/projections"

const pathname = vi.hoisted(() => ({ value: "/acme-sro/asistent" }))

vi.mock("next/navigation", () => ({
  usePathname: () => pathname.value,
}))

// The chat list posts to a Server Action; rendering it must not drag the data
// layer (and therefore `db/client.ts`) into this pure-project suite.
vi.mock("../_actions/chats", () => ({
  createChatAction: vi.fn(),
  renameChatAction: vi.fn(),
  deleteChatAction: vi.fn(),
}))

const { ChatList } = await import("./chat-list")
const { ChatPanel } = await import("./chat-panel")

const DISCLAIMER = betaMessages.asistent.disclaimer

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

function chat(overrides: Partial<ChatSummary> = {}): ChatSummary {
  return {
    id: "0195e6a1-4b2c-7d3e-8f10-a1b2c3d4e5f6",
    title: null,
    updatedAt: "2026-08-20T09:00:00.000Z",
    ...overrides,
  }
}

function message(overrides: Partial<ChatMessageView> = {}): ChatMessageView {
  return {
    id: "0195e6a1-4b2c-7d3e-8f10-000000000001",
    role: "user",
    content: "Co je DPH?",
    createdAt: "2026-08-20T09:00:00.000Z",
    ...overrides,
  }
}

/** Count non-overlapping occurrences of `needle` in `haystack`. */
function occurrences(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1
}

describe("ChatPanel — the disclaimer (spec §2.8)", () => {
  it("shows it above the composer even on an empty chat", () => {
    const html = render(
      <ChatPanel
        orgSlug="acme-sro"
        chatId={chat().id}
        initialMessages={[]}
        maxInputChars={4000}
      />,
    )

    expect(occurrences(html, DISCLAIMER)).toBe(1)
  })

  it("attaches a second copy to the FIRST assistant message only", () => {
    const html = render(
      <ChatPanel
        orgSlug="acme-sro"
        chatId={chat().id}
        initialMessages={[
          message(),
          message({ id: "b", role: "assistant", content: "Daň z přidané." }),
          message({ id: "c", role: "user", content: "A dál?" }),
          message({ id: "d", role: "assistant", content: "Dál platí…" }),
        ]}
        maxInputChars={4000}
      />,
    )

    // One above the composer, one under the first assistant turn — and none
    // under the second.
    expect(occurrences(html, DISCLAIMER)).toBe(2)
  })

  it("renders the transcript it was given, with both role labels", () => {
    const html = render(
      <ChatPanel
        orgSlug="acme-sro"
        chatId={chat().id}
        initialMessages={[
          message(),
          message({ id: "b", role: "assistant", content: "Daň z přidané." }),
        ]}
        maxInputChars={4000}
      />,
    )

    expect(html).toContain("Co je DPH?")
    expect(html).toContain("Daň z přidané.")
    expect(html).toContain(betaMessages.asistent.roleUser)
    expect(html).toContain(betaMessages.asistent.roleAssistant)
  })

  it("caps the composer at the configured input length", () => {
    const html = render(
      <ChatPanel
        orgSlug="acme-sro"
        chatId={chat().id}
        initialMessages={[]}
        maxInputChars={1234}
      />,
    )

    expect(html).toContain('maxLength="1234"')
    // …and the same number is shown to the client as the remaining budget.
    expect(html).toContain("0 / 1234")
  })
})

describe("ChatList", () => {
  it("carries the hidden orgSlug the Nový chat action resolves its scope from", () => {
    const html = render(<ChatList orgSlug="acme-sro" chats={[]} />)

    expect(html).toContain('name="orgSlug"')
    expect(html).toContain('value="acme-sro"')
    expect(html).toContain(betaMessages.asistent.listEmpty)
  })

  it("shows the localized placeholder for a chat with no title", () => {
    const html = render(<ChatList orgSlug="acme-sro" chats={[chat()]} />)

    expect(html).toContain(betaMessages.asistent.untitled)
  })

  it("marks the open conversation as the current page", () => {
    const open = chat({ id: "open-id", title: "DPH u staveb" })
    const other = chat({ id: "other-id", title: "Mzdy" })
    pathname.value = "/acme-sro/asistent/open-id"

    const html = render(<ChatList orgSlug="acme-sro" chats={[open, other]} />)
    pathname.value = "/acme-sro/asistent"

    expect(html).toContain('aria-current="page"')
    expect(html).toContain('href="/acme-sro/asistent/open-id"')
    expect(html).toContain('href="/acme-sro/asistent/other-id"')
    expect(occurrences(html, 'aria-current="page"')).toBe(1)
  })
})
