import assert from "node:assert/strict"
import { test } from "node:test"

import {
  parseFragment,
  pickBump,
  renderVersionSection,
} from "./changelog-fragments.mjs"

test("parses a minimal fragment (category only, defaults applied)", () => {
  const f = parseFragment(
    "---\ncategory: Fixed\n---\nOrg switcher preserves module.",
  )
  assert.equal(f.category, "Fixed")
  assert.equal(f.bump, "patch")
  assert.equal(f.override, false)
  assert.equal(f.summary, "Org switcher preserves module.")
})

test("parses all optional fields", () => {
  const text = [
    "---",
    "category: Added",
    "bump: minor",
    "override: true",
    "---",
    "New posting lane behind the approval gate.",
    "",
  ].join("\n")
  const f = parseFragment(text)
  assert.equal(f.bump, "minor")
  assert.equal(f.override, true)
})

test("collapses a multi-line body into a single summary", () => {
  const f = parseFragment("---\ncategory: Changed\n---\nline one\nline two")
  assert.equal(f.summary, "line one line two")
})

test("rejects missing frontmatter, unknown category, bad bump, bad bool, empty body", () => {
  assert.throws(
    () => parseFragment("no frontmatter here"),
    /missing frontmatter/,
  )
  assert.throws(
    () => parseFragment("---\ncategory: Bogus\n---\nx"),
    /unknown category/,
  )
  assert.throws(
    () => parseFragment("---\ncategory: Fixed\nbump: huge\n---\nx"),
    /invalid bump/,
  )
  assert.throws(
    () => parseFragment("---\ncategory: Fixed\noverride: yes\n---\nx"),
    /must be true or false/,
  )
  assert.throws(
    () => parseFragment("---\ncategory: Fixed\n---\n   "),
    /empty body/,
  )
})

test("pickBump takes the strongest lever", () => {
  assert.equal(pickBump([]), "patch")
  assert.equal(
    pickBump([{ bump: "patch" }, { bump: "minor" }, { bump: "patch" }]),
    "minor",
  )
  assert.equal(pickBump([{ bump: "minor" }, { bump: "major" }]), "major")
})

test("renders categories in fixed Keep-a-Changelog order with PR backlinks", () => {
  const fragments = [
    { file: "a.md", category: "Fixed", summary: "fix a bug" },
    { file: "b.md", category: "Added", summary: "new API" },
    { file: "c.md", category: "Changed", summary: "schema move" },
  ]
  const out = renderVersionSection(fragments, {
    heading: "## [v0.24.0] — 2026-07-18",
    prByFile: { "a.md": 10, "b.md": 11, "c.md": 12 },
  })

  assert.match(out, /^## \[v0\.24\.0\] — 2026-07-18/)
  // No invented callouts — only the standard category sections.
  assert.doesNotMatch(out, /Breaking changes|Migration required/)
  // Added section precedes Changed precedes Fixed.
  assert.ok(out.indexOf("### Added") < out.indexOf("### Changed"))
  assert.ok(out.indexOf("### Changed") < out.indexOf("### Fixed"))
  // PR backlinks appended.
  assert.match(out, /- new API \(#11\)/)
})

test("does not double-append a PR ref already present in the body", () => {
  const fragments = [
    { file: "a.md", category: "Fixed", summary: "fix already tagged (#99)" },
  ]
  const out = renderVersionSection(fragments, {
    heading: "## [v1] — d",
    prByFile: { "a.md": 99 },
  })
  assert.match(out, /- fix already tagged \(#99\)$/m)
  assert.doesNotMatch(out, /\(#99\) \(#99\)/)
})
