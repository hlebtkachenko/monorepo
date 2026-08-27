import { describe, expect, it } from "vitest"

import { formatBytes } from "./bytes"

/** cs-CZ uses non-breaking and narrow spaces; compare on the glyphs. */
const squash = (value: string): string => value.replace(/\s/g, "")

describe("formatBytes", () => {
  it.each([
    [512, "512B"],
    [2048, "2kB"],
    [1024 * 1024, "1MB"],
    [25 * 1024 * 1024, "25MB"],
  ])("renders %s bytes as %s", (value, expected) => {
    expect(squash(formatBytes(value))).toBe(expected)
  })
})
