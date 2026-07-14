import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { afterEach, describe, expect, it, vi } from "vitest"

import DebugLayout from "./layout"

vi.mock("../../_components/detail-tabs-header", () => ({
  DetailTabsHeader: ({ title }: { title: string }) => title,
}))

describe("DebugLayout", () => {
  afterEach(() => vi.unstubAllEnvs())

  it("renders the debug subtree in production", () => {
    vi.stubEnv("NODE_ENV", "production")

    const html = renderToStaticMarkup(
      createElement(
        DebugLayout,
        null,
        createElement("main", null, "Input Fields"),
      ),
    )

    expect(html).toContain("Debug")
    expect(html).toContain("Input Fields")
  })
})
