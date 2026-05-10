import type { TestRunnerConfig } from "@storybook/test-runner"
import { injectAxe, getAxeResults } from "axe-playwright"

const config: TestRunnerConfig = {
  async preVisit(page) {
    await injectAxe(page)
  },
  async postVisit(page) {
    const results = await getAxeResults(page, "#storybook-root", {
      runOnly: { type: "tag", values: ["wcag2a", "wcag2aa"] },
    })
    if (results.violations.length > 0) {
      const violations = results.violations.map(
        (v) =>
          `[${v.impact}] ${v.id}: ${v.description} (${v.nodes.length} nodes)`,
      )
      console.warn(
        `A11y issues (${results.violations.length}):\n${violations.join("\n")}`,
      )
    }
  },
}

export default config
