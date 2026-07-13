import { describe, expect, it } from "vitest"

import {
  compareUpstream,
  digestRegistryItem,
  digestTextAsset,
  fetchJson,
  type RegistryItem,
  type UpstreamManifest,
  validateConfigStyle,
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
    assets: {
      "hirael-audit-log": {
        digest: "sha256:audit-log",
        reviewedAt: "2026-07-13",
      },
      "hirael-stat-card": {
        digest: "sha256:stat-card",
        reviewedAt: "2026-07-13",
      },
      typeset: {
        digest: "sha256:typeset",
        reviewedAt: "2026-07-13",
      },
    },
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

  it("pins the deliberate shadcn style", () => {
    expect(validateConfigStyle("radix-nova")).toBe("radix-nova")
    expect(() => validateConfigStyle("radix-rhea")).toThrow("must remain")
  })

  it("requires the exact trusted source asset set with a valid digest", () => {
    // Source url/local/item are not stored in the manifest at all — they live
    // only in TRACKED_ASSET_SOURCES (code), so a manifest edit cannot redirect
    // an asset to a spoofed url or a traversal path. The manifest only carries
    // the reviewed digest and date, and both are validated.
    const base = manifest()
    expect(() => validateManifest(base, "radix-nova")).not.toThrow()

    const badDigest = structuredClone(base)
    badDigest.assets.typeset!.digest = "not-a-sha"
    expect(() => validateManifest(badDigest, "radix-nova")).toThrow(
      "asset digest and reviewedAt are required",
    )

    const missing = structuredClone(base)
    delete missing.assets.typeset
    expect(() => validateManifest(missing, "radix-nova")).toThrow(
      "must exactly match tracked sources",
    )

    const extra = structuredClone(base)
    extra.assets.other = { digest: "sha256:other", reviewedAt: "2026-07-13" }
    expect(() => validateManifest(extra, "radix-nova")).toThrow(
      "must exactly match tracked sources",
    )
  })

  it("detects tracked source asset changes", () => {
    const base = manifest()
    base.assets.typeset = {
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

  it("fails a 4xx fast and prefixes the url exactly once", async () => {
    const originalFetch = globalThis.fetch
    let calls = 0
    globalThis.fetch = async () => {
      calls++
      return new Response("nope", { status: 404, statusText: "Not Found" })
    }
    try {
      await expect(fetchJson("https://example.com/item.json")).rejects.toThrow(
        "https://example.com/item.json: 404 Not Found",
      )
      expect(calls).toBe(1)
    } finally {
      globalThis.fetch = originalFetch
    }
  })
})
