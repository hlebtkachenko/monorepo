import { readFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"
import {
  BRAND_ADMIN_DARK,
  BRAND_ADMIN_LIGHT,
  BRAND_MONO_DARK,
  BRAND_MONO_LIGHT,
  BRAND_PRIMARY_DARK,
  BRAND_PRIMARY_LIGHT,
  BRAND_RADIUS,
} from "./tokens"

// Drift guard. globals.css is the source of truth; tokens.ts mirrors
// the values for non-CSS consumers (apps/api Scalar reference, future
// packages/email + packages/pdf). If one drifts the other CI fails.
describe("brand tokens stay in sync with globals.css", () => {
  const here = dirname(fileURLToPath(import.meta.url))
  const globalsPath = resolve(here, "../styles/globals.css")
  const globalsCss = readFileSync(globalsPath, "utf8")

  function readVar(name: string): string {
    const match = globalsCss.match(new RegExp(`--${name}:\\s*([^;]+);`))
    if (!match || match[1] === undefined) {
      throw new Error(`globals.css missing --${name}`)
    }
    return match[1].trim()
  }

  it("brand mono", () => {
    expect(BRAND_MONO_LIGHT).toBe(readVar("brand-mono-light"))
    expect(BRAND_MONO_DARK).toBe(readVar("brand-mono-dark"))
  })

  it("brand primary", () => {
    expect(BRAND_PRIMARY_LIGHT).toBe(readVar("brand-primary-light"))
    expect(BRAND_PRIMARY_DARK).toBe(readVar("brand-primary-dark"))
  })

  it("brand admin", () => {
    expect(BRAND_ADMIN_LIGHT).toBe(readVar("brand-admin-light"))
    expect(BRAND_ADMIN_DARK).toBe(readVar("brand-admin-dark"))
  })

  it("radius", () => {
    expect(BRAND_RADIUS).toBe(readVar("radius"))
  })
})
