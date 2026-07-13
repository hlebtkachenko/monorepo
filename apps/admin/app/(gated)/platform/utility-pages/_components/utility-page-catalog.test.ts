/** @vitest-environment jsdom */

import { createElement } from "react"
import "@testing-library/jest-dom/vitest"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

import { NextIntlClientProvider } from "@workspace/i18n/client"
import messages from "@workspace/i18n/messages/en.json"
import { UTILITY_PAGE_IDS } from "@workspace/ui/blocks/utility-page"

import { UtilityPageCatalog } from "./utility-page-catalog"

vi.mock("../../../../_components/language-picker", () => ({
  LanguagePicker: () =>
    createElement("button", { "aria-label": "Change language" }, "EN"),
}))

function renderCatalog() {
  return render(
    createElement(NextIntlClientProvider, {
      locale: "en",
      messages,
      children: createElement(UtilityPageCatalog),
    }),
  )
}

describe("UtilityPageCatalog", () => {
  it("lists every state and connects selection to the real preview", async () => {
    const user = userEvent.setup()
    const { container } = renderCatalog()

    expect(
      screen.getByText(
        `${UTILITY_PAGE_IDS.length} of ${UTILITY_PAGE_IDS.length}`,
      ),
    ).toBeInTheDocument()
    expect(
      container.querySelector("[data-slot='utility-page']"),
    ).toHaveAttribute("data-state", "route_not_found")
    expect(screen.queryByText("Report this problem")).not.toBeInTheDocument()

    await user.click(
      screen.getByRole("button", {
        name: /service_unavailable.*service temporarily unavailable/i,
      }),
    )

    await waitFor(() =>
      expect(
        container.querySelector("[data-slot='utility-page']"),
      ).toHaveAttribute("data-state", "service_unavailable"),
    )
    expect(await screen.findByText("Report this problem")).toBeInTheDocument()
    expect(
      await screen.findByRole("button", { name: "Send report" }),
    ).toHaveAttribute("data-variant", "link")
  }, 20_000)
})
