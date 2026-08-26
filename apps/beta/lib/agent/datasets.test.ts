/**
 * The dataset registry and the route tree agree, in BOTH directions.
 *
 * WHY THIS IS WORTH A TEST. `GET /api/agent/v1/meta` hands `AGENT_DATASETS`
 * straight to the office agent, which uses it to tell "beta does not accept
 * this yet" apart from "beta accepted it and dropped it" — the difference
 * between a deployment fault and a silent data loss (see the module's own
 * header). That only holds while the registry is TRUE, and it is a hand-written
 * constant next to a directory of route files:
 *
 *   - a dataset marked `implemented: true` with no route on disk makes the
 *     handshake advertise an endpoint that 404s;
 *   - a route on disk marked `implemented: false` makes the agent skip a
 *     dataset beta would happily have taken, which is how a month-end quietly
 *     ships without a předvaha.
 *
 * Both are asserted against the real filesystem. Runs in the `pure` project:
 * a directory listing needs no database.
 */
import { existsSync, readdirSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

import { AGENT_DATASETS } from "./datasets"

const ROUTES_DIR = resolve(
  import.meta.dirname,
  "..",
  "..",
  "app",
  "api",
  "agent",
  "v1",
  "orgs",
  "[orgSlug]",
)

/** Every `route.ts` under the org-scoped agent tree, as its path segment. */
function routePathsOnDisk(): string[] {
  const found: string[] = []
  const walk = (dir: string, prefix: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue
      const segment = prefix === "" ? entry.name : `${prefix}/${entry.name}`
      const child = resolve(dir, entry.name)
      if (existsSync(resolve(child, "route.ts"))) found.push(segment)
      walk(child, segment)
    }
  }
  walk(ROUTES_DIR, "")
  return found.sort()
}

describe("AGENT_DATASETS", () => {
  it("names each path once", () => {
    const paths = AGENT_DATASETS.map((dataset) => dataset.path)
    expect(new Set(paths).size).toBe(paths.length)
  })

  it("declares exactly the routes that exist on disk as implemented", () => {
    const implemented = AGENT_DATASETS.filter((dataset) => dataset.implemented)
      .map((dataset) => dataset.path)
      .sort()
    expect(implemented).toEqual(routePathsOnDisk())
  })

  it("gives every unimplemented arm a note naming where it lands", () => {
    for (const dataset of AGENT_DATASETS) {
      if (dataset.implemented) {
        // A note on a live arm would be a stale TODO the handshake publishes.
        expect(dataset.note, dataset.path).toBeUndefined()
        continue
      }
      expect(dataset.note, dataset.path).toBeTruthy()
    }
  })

  it("carries the account map as an implemented arm (PR 27)", () => {
    expect(
      AGENT_DATASETS.find((dataset) => dataset.path === "account-balance-map"),
    ).toEqual({ path: "account-balance-map", implemented: true })
  })
})
