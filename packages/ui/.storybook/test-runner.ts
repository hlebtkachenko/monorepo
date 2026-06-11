import { appendFileSync, existsSync, readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import type { TestRunnerConfig } from "@storybook/test-runner"
import { getStoryContext } from "@storybook/test-runner"
import { injectAxe, getAxeResults } from "axe-playwright"

/**
 * Axe a11y gate (T14). Every story is scanned (wcag2a + wcag2aa, as before),
 * but `serious`/`critical` violations now FAIL the story's test instead of
 * only warning — unless the (storyId, ruleId) pair is listed in the committed
 * baseline allowlist (`a11y-baseline.json`, same directory). The baseline
 * freezes the debt that existed when the gate was introduced so the check is
 * green from day one while locking the floor: new serious/critical
 * regressions fail, and fixing a baselined violation should be followed by
 * removing its entry.
 *
 * `minor`/`moderate` violations stay warnings (visible in the shard logs).
 *
 * Refreshing the baseline after intentional changes:
 *
 *   SB_FULL=1 pnpm --filter @workspace/ui build-storybook
 *   npx http-server packages/ui/storybook-static --port 6006 --silent &
 *   A11Y_BASELINE_WRITE=baseline.jsonl pnpm --filter @workspace/ui \
 *     test-storybook --url http://127.0.0.1:6006
 *
 * then merge the JSONL into a11y-baseline.json (sorted by story id) and
 * review the diff — the baseline should only ever shrink.
 */

interface BaselineFile {
  /** storyId -> axe rule ids accepted for that story. */
  [storyId: string]: string[]
}

const FAILING_IMPACTS = new Set(["serious", "critical"])

/**
 * Resolve the committed baseline file. Storybook 10 loads this config via a
 * registered ESM TS loader (native `import()`), so CJS `__dirname` is NOT
 * available here — relying on it silently produced an empty baseline and
 * failed every baselined story. Try the module URL first, then `__dirname`
 * (in case a CJS transform is ever in play), then the conventional
 * `<cwd>/.storybook/` location (`test-storybook` always runs from the
 * package root). Missing file = loud failure: the baseline is committed,
 * so "not found" means a resolution bug, not a clean slate.
 */
function loadBaseline(): BaselineFile {
  const candidates: string[] = []
  try {
    candidates.push(
      join(dirname(fileURLToPath(import.meta.url)), "a11y-baseline.json"),
    )
  } catch {
    // import.meta.url unavailable under a CJS transform — fall through.
  }
  if (typeof __dirname === "string") {
    candidates.push(join(__dirname, "a11y-baseline.json"))
  }
  candidates.push(join(process.cwd(), ".storybook", "a11y-baseline.json"))

  const found = candidates.find((p) => existsSync(p))
  if (!found) {
    throw new Error(
      `a11y-baseline.json not found (tried: ${candidates.join(", ")})`,
    )
  }
  return JSON.parse(readFileSync(found, "utf8")) as BaselineFile
}

const baseline = loadBaseline()

const config: TestRunnerConfig = {
  async preVisit(page) {
    await injectAxe(page)
  },
  async postVisit(page, context) {
    const storyContext = await getStoryContext(page, context)
    // Respect Storybook's standard per-story escape hatches.
    if (storyContext.parameters?.a11y?.disable) return

    const results = await getAxeResults(page, "#storybook-root", {
      runOnly: { type: "tag", values: ["wcag2a", "wcag2aa"] },
    })
    if (results.violations.length === 0) return

    const describe = (v: (typeof results.violations)[number]) =>
      `[${v.impact}] ${v.id}: ${v.description} (${v.nodes.length} nodes)`

    const allowedRules = new Set(baseline[context.id] ?? [])
    const failing = results.violations.filter(
      (v) =>
        v.impact != null &&
        FAILING_IMPACTS.has(v.impact) &&
        !allowedRules.has(v.id),
    )
    const warningsOnly = results.violations.filter((v) => !failing.includes(v))

    if (warningsOnly.length > 0) {
      console.warn(
        `A11y issues (${warningsOnly.length}) in ${context.id}:\n` +
          warningsOnly.map(describe).join("\n"),
      )
    }

    // Baseline collection mode: append instead of failing (see header).
    const baselineSink = process.env.A11Y_BASELINE_WRITE
    if (baselineSink && failing.length > 0) {
      for (const v of failing) {
        appendFileSync(
          baselineSink,
          JSON.stringify({ storyId: context.id, ruleId: v.id }) + "\n",
        )
      }
      return
    }

    if (failing.length > 0) {
      throw new Error(
        `A11y gate: ${failing.length} serious/critical violation(s) in ` +
          `${context.id} not covered by .storybook/a11y-baseline.json:\n` +
          failing.map(describe).join("\n"),
      )
    }
  },
}

export default config
