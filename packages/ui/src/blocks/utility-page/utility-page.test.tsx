import type { ReactNode } from "react"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

import { NextIntlClientProvider } from "@workspace/i18n/client"
import csMessages from "@workspace/i18n/messages/cs.json"
import messages from "@workspace/i18n/messages/en.json"

import { UtilityPage } from "./utility-page"
import { UTILITY_PAGE_BINDINGS } from "./utility-page.bindings"
import { UTILITY_PAGE_CATALOG } from "./utility-page.catalog"
import { UTILITY_PAGE_IDS } from "./utility-page.types"

function renderUtilityPage(ui: ReactNode, locale: "en" | "cs" = "en") {
  return render(
    <NextIntlClientProvider
      locale={locale}
      messages={locale === "cs" ? csMessages : messages}
    >
      {ui}
    </NextIntlClientProvider>,
  )
}

describe("utility page catalog", () => {
  it("defines every supported state exactly once", () => {
    expect(Object.keys(UTILITY_PAGE_CATALOG).sort()).toEqual(
      [...UTILITY_PAGE_IDS].sort(),
    )
  })

  it("records applications and concrete triggers for every state", () => {
    expect(Object.keys(UTILITY_PAGE_BINDINGS).sort()).toEqual(
      [...UTILITY_PAGE_IDS].sort(),
    )
    for (const binding of Object.values(UTILITY_PAGE_BINDINGS)) {
      expect(binding.applications.length).toBeGreaterThan(0)
      expect(binding.triggers.length).toBeGreaterThan(0)
    }
  })

  it("keeps actions and feedback within a two-control limit", () => {
    for (const definition of Object.values(UTILITY_PAGE_CATALOG)) {
      const feedback =
        definition.telemetry.report === "automatic_with_user_feedback" ? 1 : 0
      expect(definition.actions.length + feedback).toBeLessThanOrEqual(2)
    }
  })

  it("never reports expected navigation misses", () => {
    for (const definition of Object.values(UTILITY_PAGE_CATALOG)) {
      if (definition.httpStatus === 404) {
        expect(definition.telemetry.report).toBe("none")
      }
    }
  })

  it("logs every unexpected state", () => {
    for (const definition of Object.values(UTILITY_PAGE_CATALOG)) {
      if (definition.condition === "unexpected") {
        expect(["warning", "error"]).toContain(definition.telemetry.log)
      }
    }
  })

  it("gives every service-unavailable state a recovery or status action", () => {
    for (const definition of Object.values(UTILITY_PAGE_CATALOG)) {
      if (definition.httpStatus === 503) {
        expect(
          definition.actions.some((action) =>
            ["retry", "go_back", "open_status"].includes(action),
          ),
        ).toBe(true)
      }
    }
  })
})

describe("UtilityPage", () => {
  it("renders every catalog state through the approved shared layout", async () => {
    for (const state of UTILITY_PAGE_IDS) {
      const definition = UTILITY_PAGE_CATALOG[state]
      const stateMessages = messages.utilityPage.states[state]
      const view = renderUtilityPage(
        <UtilityPage
          state={state}
          runtime={{
            onRetry: vi.fn(),
            automaticReport: false,
            report: { payload: { message: `Preview ${state}` } },
          }}
        />,
      )

      expect(
        view.container.querySelector(`[data-state='${state}']`),
      ).toHaveAttribute("data-slot", "utility-page")
      expect(
        screen.getByRole("heading", { name: stateMessages.title }),
      ).toHaveAttribute("data-size", "2")
      expect(screen.getByText(stateMessages.description)).toHaveAttribute(
        "data-variant",
        "muted",
      )
      expect(
        view.container.querySelector("[data-slot='utility-page-mobile-code']"),
      ).toHaveTextContent(
        definition.httpStatus?.toString() ?? stateMessages.codeLabel,
      )

      if (definition.telemetry.report === "automatic_with_user_feedback") {
        expect(
          await screen.findByText("Report this problem"),
        ).toBeInTheDocument()
        expect(
          await screen.findByRole("button", { name: "Send report" }),
        ).toHaveAttribute("data-variant", "link")
      } else {
        expect(
          screen.queryByText("Report this problem"),
        ).not.toBeInTheDocument()
      }

      view.unmount()
    }
  })

  it("renders the catalog copy and application-aware navigation for a 404", () => {
    renderUtilityPage(
      <UtilityPage
        state="route_not_found"
        footerControl={<button aria-label="Change language">EN</button>}
      />,
    )

    expect(
      screen.getByRole("heading", { name: "Page not found" }),
    ).toHaveAttribute("data-size", "2")
    expect(
      screen.getByText(
        "The address may be incorrect, or the page may have moved.",
      ),
    ).toHaveAttribute("data-variant", "muted")
    const backLink = screen.getByRole("link", { name: "Go back" })
    expect(backLink).toHaveAttribute("href", "https://app.afframe.com")
    expect(backLink).toHaveAttribute("data-size", "xl")
    expect(
      screen.getByRole("link", { name: "Return to app.afframe.com" }),
    ).toHaveAttribute("href", "https://app.afframe.com")
    expect(
      screen.getByRole("button", { name: "Change language" }),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole("button", { name: /mode/i }),
    ).not.toBeInTheDocument()
    expect(
      document.querySelector("[data-slot='utility-page-mobile-code']"),
    ).toHaveTextContent("404")
    expect(screen.queryByText(/feedback/i)).not.toBeInTheDocument()
  })

  it("renders state, action, header, and feedback copy in Czech", async () => {
    renderUtilityPage(
      <UtilityPage
        state="unexpected_server_error"
        runtime={{
          automaticReport: false,
          report: { payload: { message: "server failed" } },
        }}
      />,
      "cs",
    )

    expect(
      screen.getByRole("heading", { name: "Stránku se nepodařilo načíst" }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole("button", { name: "Zkusit znovu" }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole("link", { name: "Zpět na app.afframe.com" }),
    ).toBeInTheDocument()
    expect(screen.getByText("Nahlásit tento problém")).toBeInTheDocument()
    expect(
      await screen.findByRole("button", { name: "Odeslat hlášení" }),
    ).toBeInTheDocument()
  })

  it("uses the requested application and back fallback", () => {
    renderUtilityPage(
      <UtilityPage
        state="route_not_found"
        runtime={{
          application: "admin",
          actionHrefs: { go_back: "/platform" },
        }}
      />,
    )

    expect(
      screen.getByRole("link", { name: "Return to admin.afframe.com" }),
    ).toHaveAttribute("href", "https://admin.afframe.com")
    expect(screen.getByRole("link", { name: "Go back" })).toHaveAttribute(
      "href",
      "/platform",
    )
  })

  it("uses the shared auth chrome for shell placement", () => {
    const { container } = renderUtilityPage(
      <UtilityPage state="access_denied" runtime={{ surface: "shell" }} />,
    )

    const shell = container.querySelector("[data-surface='shell']")
    expect(shell).toBeInTheDocument()
    expect(shell).toHaveClass("h-full", "min-h-0")
    expect(shell).not.toHaveClass("min-h-[60vh]", "md:h-[60vh]")
    expect(container.querySelector("[data-slot='logo']")).toBeInTheDocument()
    expect(screen.getAllByText("403")).toHaveLength(2)
    expect(
      container.querySelector("[data-slot='auth-shell-aside'] > div"),
    ).not.toHaveClass("bg-foreground")
  })

  it("places reportable 503 feedback below the auth separator", async () => {
    renderUtilityPage(
      <UtilityPage
        state="service_unavailable"
        runtime={{
          referenceId: "service_503",
          automaticReport: false,
          report: { payload: { message: "service unavailable" } },
        }}
      />,
    )

    expect(screen.getByText("Report this problem")).toHaveAttribute(
      "data-slot",
      "field-separator-content",
    )
    expect(screen.getByRole("button", { name: "Try again" })).toHaveAttribute(
      "data-size",
      "xl",
    )
    expect(
      await screen.findByText(
        "Help us investigate by sharing diagnostic information.",
        { exact: false },
      ),
    ).toHaveAttribute("data-variant", "muted")
    expect(
      await screen.findByRole("button", { name: "Send report" }),
    ).toHaveAttribute("data-variant", "link")
    expect(screen.queryByText("service_503")).not.toBeInTheDocument()
    expect(screen.queryByText(/retry after/i)).not.toBeInTheDocument()
  })

  it("automatically reports the failure and sends button feedback as a bug", async () => {
    const user = userEvent.setup()
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(null, { status: 200 }))

    renderUtilityPage(
      <UtilityPage
        state="unexpected_server_error"
        runtime={{
          onRetry: vi.fn(),
          referenceId: "error_503",
          report: { payload: { message: "server failed", digest: "abc" } },
        }}
      />,
    )

    const feedback = await screen.findByRole("button", {
      name: "Send report",
    })
    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce())
    await user.click(feedback)

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "/api/client-error",
      expect.objectContaining({
        body: expect.stringContaining('"id":"error_503"'),
      }),
    )
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "/api/client-error",
      expect.objectContaining({
        body: expect.stringContaining('"type":"bug"'),
      }),
    )
    expect(fetchMock.mock.calls[1]?.[1]?.body).toEqual(
      expect.stringContaining("Utility state: unexpected_server_error"),
    )
    expect(await screen.findByText("Bug report sent")).toBeInTheDocument()
    fetchMock.mockRestore()
  })
})
