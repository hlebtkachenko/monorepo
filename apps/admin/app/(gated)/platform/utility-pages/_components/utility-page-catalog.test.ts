/** @vitest-environment jsdom */

import { createElement } from "react"
import "@testing-library/jest-dom/vitest"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeAll, describe, expect, it, vi } from "vitest"

import { NextIntlClientProvider } from "@workspace/i18n/client"
import messages from "@workspace/i18n/messages/en.json"
import {
  UtilityPage,
  UTILITY_PAGE_IDS,
} from "@workspace/ui/blocks/utility-page"

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
  // The preview feedback UI is a React.lazy chunk. Resolving that render-time
  // dynamic import can stall under CI CPU contention (this suite runs alongside
  // the large @workspace/ui suite), which timed the case out. Warm the lazy()
  // payload once here by rendering the Suspense boundary in a feedback state and
  // awaiting the resolved chunk; the module-scoped lazy() instance is shared, so
  // the assertion render below is then synchronous. Paid once, generous budget.
  beforeAll(async () => {
    const { unmount } = render(
      createElement(NextIntlClientProvider, {
        locale: "en",
        messages,
        children: createElement(UtilityPage, {
          state: "service_unavailable",
          runtime: {
            application: "admin",
            automaticReport: false,
            report: { payload: { message: "warm" } },
          },
        }),
      }),
    )
    await screen.findByRole(
      "button",
      { name: "Send report" },
      { timeout: 25_000 },
    )
    unmount()
  }, 30_000)

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

    await waitFor(
      () =>
        expect(
          container.querySelector("[data-slot='utility-page']"),
        ).toHaveAttribute("data-state", "service_unavailable"),
      { timeout: 5000 },
    )
    // data-state flips in the same commit that mounts the pre-warmed (see
    // beforeAll) feedback subtree, so the section title and the Send-report
    // button are already in the DOM — query synchronously, no extra poll. This
    // makes the assertion deterministic and fails loudly if the warm-up regresses.
    expect(screen.getByText("Report this problem")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Send report" })).toHaveAttribute(
      "data-variant",
      "link",
    )
  }, 20_000)
})
