import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

/**
 * The vendoring gate.
 *
 * Both files in this directory are BYTE-IDENTICAL copies of modules that live in
 * `apps/beta`, and this test is what makes "identical" a fact rather than an
 * intention. They are copied rather than imported because `apps/beta` is a
 * Next.js application, not a library: it publishes no export map, and a CLI that
 * reached into another app's internals would both invert the dependency and
 * drag a whole framework build into `pnpm --filter @afframe/beta-agent build`.
 *
 * WHY COPYING IS SAFE HERE AND NOT IN GENERAL. Both modules are pure — `schemas`
 * imports zod and nothing else, `csv` imports nothing at all — and both are the
 * CONTRACT rather than an implementation detail: the schemas are the wire format
 * the server validates against, and the CSV reader is the parsing contract the
 * portal's own manual fallback applies to the same files. A divergence in either
 * is a silent interoperability break, which is precisely what a byte comparison
 * catches and a hand-written mirror would not.
 *
 * THIS TEST ONLY RUNS WHEN THIS PACKAGE IS AFFECTED. `turbo test --affected`
 * scopes to changed packages and their dependents, and there is no dependency
 * edge from here to `apps/beta` (adding one would put a Next build in front of
 * this CLI's). The gate that makes the copy get updated is therefore in
 * `.github/related-files.yml`: a PR touching either source file is required to
 * touch `apps/beta-agent/src/vendor/**` too, which makes this package affected,
 * which runs this test.
 */
const here = import.meta.dirname
const betaRoot = join(here, "..", "..", "..", "beta")

const PAIRS = [
  { copy: "schemas.ts", source: join(betaRoot, "lib", "agent", "schemas.ts") },
  { copy: "csv.ts", source: join(betaRoot, "lib", "import", "csv.ts") },
] as const

describe("vendored contract files", () => {
  for (const pair of PAIRS) {
    it(`${pair.copy} is byte-identical to its apps/beta source`, () => {
      const copy = readFileSync(join(here, pair.copy), "utf8")
      const source = readFileSync(pair.source, "utf8")
      expect(copy).toBe(source)
    })
  }
})
