import { describe, expect, it } from "vitest"

import {
  compareUpstream,
  digestRegistryItem,
  digestTextAsset,
  fetchJson,
  type RegistryItem,
  type UpstreamManifest,
  validateManifest,
} from "./shadcn-upstream"

const button: RegistryItem = {
  name: "button",
  type: "registry:ui",
  dependencies: ["b", "a"],
  files: [
    {
      path: "button.tsx",
      type: "registry:ui",
      content: "line one\r\nline two\r\n",
    },
  ],
  description: "ignored metadata",
}

function manifest(digest = digestRegistryItem(button)): UpstreamManifest {
  return {
    version: 1,
    registry: "@shadcn",
    style: "radix-nova",
    items: {
      button: {
        state: "adapted",
        local: "button",
        digest,
        reviewedAt: "2026-07-13",
      },
      form: {
        state: "covered",
        reason: "Current forms use Field and Controller.",
        digest: "sha256:removed",
        reviewedAt: "2026-07-13",
      },
    },
    assets: {},
  }
}

describe("shadcn upstream tracking", () => {
  it("ignores key, dependency, file order, CRLF, and metadata", () => {
    const reordered: RegistryItem = {
      description: "new docs",
      files: [
        {
          content: "line one\nline two\n",
          type: "registry:ui",
          path: "button.tsx",
        },
      ],
      dependencies: ["a", "b"],
      type: "registry:ui",
      name: "button",
    }
    expect(digestRegistryItem(reordered)).toBe(digestRegistryItem(button))
  })

  it("detects implementation changes", () => {
    expect(
      digestRegistryItem({
        ...button,
        files: [
          { path: "button.tsx", type: "registry:ui", content: "changed" },
        ],
      }),
    ).not.toBe(digestRegistryItem(button))
    expect(
      digestRegistryItem({ ...button, config: { futureBehavior: true } }),
    ).not.toBe(digestRegistryItem(button))
    expect(
      digestRegistryItem({
        ...button,
        files: [{ ...button.files![0], futureFileField: "tracked" }],
      }),
    ).not.toBe(digestRegistryItem(button))
    expect(digestTextAsset("line one\r\nline two\r\n")).toBe(
      digestTextAsset("line one\nline two\n"),
    )
    expect(
      digestRegistryItem({ ...button, registryDependencies: ["dialog"] }),
    ).not.toBe(digestRegistryItem(button))
    expect(
      digestRegistryItem({ ...button, cssVars: { light: { brand: "red" } } }),
    ).not.toBe(digestRegistryItem(button))
    expect(
      digestRegistryItem({
        ...button,
        files: [
          {
            path: "button.tsx",
            type: "registry:file",
            target: "@ui/button.tsx",
            content: "line one\nline two\n",
          },
        ],
      }),
    ).not.toBe(digestRegistryItem(button))
    expect(
      digestRegistryItem({
        ...button,
        tailwind: { config: { content: ["x"] } },
      }),
    ).not.toBe(digestRegistryItem(button))
  })

  it("categorizes every drift class", () => {
    const covered: RegistryItem = {
      name: "covered",
      type: "registry:ui",
      files: [],
    }
    const base = manifest("sha256:old")
    base.items.covered = {
      state: "covered",
      reason: "Covered elsewhere.",
      digest: "sha256:old",
      reviewedAt: "2026-07-13",
    }
    const report = compareUpstream(
      [button, covered, { name: "new-item", type: "registry:ui", files: [] }],
      base,
      new Set(["button"]),
      new Set(["button", "missing-local"]),
    )
    expect(report.changedLocal).toEqual(["button"])
    expect(report.changedCovered).toEqual(["covered"])
    expect(report.new).toEqual(["new-item"])
    expect(report.removed).toEqual(["form"])
    expect(report.invalidLocal).toContain(
      "missing-local: local shadcn component lacks manifest entry",
    )
  })

  it("rejects unsafe dispositions and style mismatch", () => {
    const invalid = manifest()
    invalid.items.form.reason = ""
    expect(() => validateManifest(invalid, "radix-nova")).toThrow(
      "require reason",
    )
    expect(() => validateManifest(manifest(), "radix-rhea")).toThrow(
      "does not match",
    )
  })

  it("detects tracked source asset changes", () => {
    const base = manifest()
    base.assets.typeset = {
      format: "text",
      url: "https://example.com/typeset.css",
      local: "src/styles/typeset.css",
      digest: "sha256:old",
      reviewedAt: "2026-07-13",
    }
    const report = compareUpstream(
      [button],
      base,
      new Set(["button"]),
      new Set(["button"]),
      { typeset: "sha256:new" },
    )
    expect(report.changedAssets).toEqual(["typeset"])
  })

  it("treats invalid JSON as an operational failure", async () => {
    const originalFetch = globalThis.fetch
    globalThis.fetch = async () =>
      new Response("not json", {
        status: 200,
        headers: { "content-type": "application/json" },
      })
    try {
      await expect(fetchJson("https://example.com/item.json")).rejects.toThrow()
    } finally {
      globalThis.fetch = originalFetch
    }
  })
})
