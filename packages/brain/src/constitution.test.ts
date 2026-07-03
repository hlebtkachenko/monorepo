import { execFileSync } from "node:child_process"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

import { describe, expect, it } from "vitest"

// Gives the constitution-checks (BGTG #4) real teeth: this runs in `pnpm --filter @workspace/brain
// test`, so a weakened detector or a real invariant violation fails the package test suite (and
// brain-ci), not just an out-of-band script. See packages/brain/.brain/constitution.md.
const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..")
const check = join(repoRoot, "scripts/brain-build/constitution-checks/check.sh")

describe("constitution checks (BGTG #4)", () => {
  it("self-test: the detector surfaces every known-bad evasion form", () => {
    expect(() =>
      execFileSync("bash", [check, "--selftest"], { stdio: "pipe" }),
    ).not.toThrow()
  })

  it("the real Brain tree is constitution-clean", () => {
    expect(() => execFileSync("bash", [check], { stdio: "pipe" })).not.toThrow()
  })
})
