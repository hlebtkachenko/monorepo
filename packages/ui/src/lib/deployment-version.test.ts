import { describe, expect, it } from "vitest"

import { deploymentKey, isDeploymentVersionPayload } from "./deployment-version"

describe("deployment identity", () => {
  it("uses both the image revision and version when available", () => {
    expect(deploymentKey({ sha: "abc", version: "1.2.3-abc" })).toBe(
      "abc:1.2.3-abc",
    )
    expect(deploymentKey({ sha: "unknown", version: "dev" })).toBeNull()
  })

  it("validates version endpoint payloads", () => {
    expect(
      isDeploymentVersionPayload({
        sha: "abc",
        version: "1.2.3-abc",
        time: "2026-07-14T00:00:00Z",
        runtime: "node-24",
      }),
    ).toBe(true)
    expect(isDeploymentVersionPayload({ sha: "abc" })).toBe(false)
  })
})
