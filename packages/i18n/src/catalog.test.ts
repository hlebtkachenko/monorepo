import { readdirSync, readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

import {
  parse,
  TYPE,
  type MessageFormatElement,
} from "@formatjs/icu-messageformat-parser"
import { describe, expect, it } from "vitest"

import { locales } from "./config"

/**
 * Catalog lint for live locales.
 *
 * `*.draft.json` files (e.g. `cs.draft.json`) are deliberately excluded:
 * a draft is a reviewable translation artifact, not a live locale — it is
 * absent from `locales` and never loaded by `buildRequestConfig`.
 */
const MESSAGES_DIR = join(dirname(fileURLToPath(import.meta.url)), "messages")

const catalogFiles = readdirSync(MESSAGES_DIR).filter(
  (file) => file.endsWith(".json") && !file.endsWith(".draft.json"),
)

type Catalog = { [key: string]: string | Catalog }

function loadCatalog(file: string): Catalog {
  return JSON.parse(readFileSync(join(MESSAGES_DIR, file), "utf-8")) as Catalog
}

function flatten(node: Catalog, prefix = ""): Map<string, string> {
  const entries = new Map<string, string>()
  for (const [key, value] of Object.entries(node)) {
    const path = prefix ? `${prefix}.${key}` : key
    if (typeof value === "string") {
      entries.set(path, value)
    } else {
      for (const [childPath, childValue] of flatten(value, path)) {
        entries.set(childPath, childValue)
      }
    }
  }
  return entries
}

function pluralElements(
  elements: MessageFormatElement[],
): Extract<MessageFormatElement, { type: TYPE.plural }>[] {
  const found: Extract<MessageFormatElement, { type: TYPE.plural }>[] = []
  for (const element of elements) {
    if (element.type === TYPE.plural) {
      found.push(element)
      for (const option of Object.values(element.options)) {
        found.push(...pluralElements(option.value))
      }
    } else if (element.type === TYPE.select) {
      for (const option of Object.values(element.options)) {
        found.push(...pluralElements(option.value))
      }
    } else if (element.type === TYPE.tag) {
      found.push(...pluralElements(element.children))
    }
  }
  return found
}

/**
 * `<BRAND-...>` placeholders are a sanctioned pattern with their own
 * production-deploy gate (scripts/check-brand-placeholders.mjs). The ICU
 * parser would read them as unclosed rich-text tags, so neutralize them
 * before validating — real tag syntax (e.g. `<admin>...</admin>`) stays
 * checked.
 */
const BRAND_PLACEHOLDER_RE = /<BRAND-[A-Z0-9-]+>/g

function parseIcu(value: string) {
  return parse(value.replace(BRAND_PLACEHOLDER_RE, "PLACEHOLDER"))
}

const enKeys = flatten(loadCatalog("en.json"))

describe("locale registry ↔ catalog files", () => {
  it("has a catalog file for every registered locale", () => {
    for (const locale of locales) {
      expect(catalogFiles).toContain(`${locale}.json`)
    }
  })

  it("has a registered locale for every live catalog file", () => {
    for (const file of catalogFiles) {
      const locale = file.replace(/\.json$/, "")
      expect(locales as readonly string[]).toContain(locale)
    }
  })
})

describe("draft catalogs", () => {
  // Drafts are excluded from the parity/ICU lint above, but a syntactically
  // broken draft should still fail at commit time.
  const draftFiles = readdirSync(MESSAGES_DIR).filter((file) =>
    file.endsWith(".draft.json"),
  )

  it("parse as JSON", () => {
    for (const file of draftFiles) {
      expect(() => loadCatalog(file), `broken draft "${file}"`).not.toThrow()
    }
  })
})

describe.each(catalogFiles)("catalog %s", (file) => {
  const catalog = flatten(loadCatalog(file))

  it("has exactly the same keys as en.json", () => {
    const keys = [...catalog.keys()].sort()
    expect(keys).toEqual([...enKeys.keys()].sort())
  })

  it("has no empty values", () => {
    for (const [key, value] of catalog) {
      expect(value.trim(), `empty message for key "${key}"`).not.toBe("")
    }
  })

  it("contains only valid ICU MessageFormat syntax", () => {
    for (const [key, value] of catalog) {
      expect(
        () => parseIcu(value),
        `invalid ICU syntax in key "${key}"`,
      ).not.toThrow()
    }
  })

  it("covers the locale's required plural categories", () => {
    // CLDR cardinal categories the locale must spell out in every
    // `{x, plural, ...}` message. `other` is enforced by the ICU parser
    // itself; Czech additionally needs one/few (and `many` for fractions,
    // which the current integer-only counts never hit).
    const locale = file.replace(/\.json$/, "")
    const required = locale.startsWith("cs")
      ? ["one", "few", "other"]
      : ["one", "other"]
    for (const [key, value] of catalog) {
      for (const plural of pluralElements(parseIcu(value))) {
        const categories = Object.keys(plural.options)
        for (const category of required) {
          expect(
            categories,
            `plural in key "${key}" is missing the "${category}" branch`,
          ).toContain(category)
        }
      }
    }
  })
})
