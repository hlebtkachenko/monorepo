import assert from "node:assert/strict"
import { test } from "node:test"

import {
  findViolations,
  sourceHasContentPanelChildren,
} from "./check-archetype-body.mjs"

// Real files always import ContentPanel; the detector resolves the local bound
// name from the import (so aliases are caught), so every fixture carries one.
const IMPORT = `import { ContentPanel } from "@workspace/ui/blocks/content-panel"\n`

const LEGACY = `${IMPORT}
export function View() {
  return (
    <ContentPanel toolbar={<Toolbar />}>
      <div>hello</div>
    </ContentPanel>
  )
}
`

const CHILDREN_ATTR = `${IMPORT}
export function View() {
  return <ContentPanel children={<div />} />
}
`

const ARCHETYPE = `${IMPORT}
export function View() {
  return <ContentPanel body={archetypeEmpty({ title: "Nothing here" })} />
}
`

// Aliased import — the string tag is "Panel", not "ContentPanel".
const ALIASED = `import { ContentPanel as Panel } from "@workspace/ui/blocks/content-panel"
export function View() {
  return <Panel><div>hello</div></Panel>
}
`

// Spread can smuggle a children prop past the attribute walk.
const SPREAD = `${IMPORT}
export function View() {
  return <ContentPanel {...rest} />
}
`

const NO_CONTENT_PANEL = `
export function View() {
  return <Card>content</Card>
}
`

// Namespace import — the tag is the member expression <CP.ContentPanel>. Caught
// because the binding is fully resolvable in-file.
const NAMESPACE = `import * as CP from "@workspace/ui/blocks/content-panel"
export function View() {
  return <CP.ContentPanel><div>hello</div></CP.ContentPanel>
}
`

// Local re-export shim — ContentPanel is reached via another module, so the
// binding is NOT resolvable without the cross-file type-checker. Documented
// out-of-scope: the detector does not follow it (diff-visible + non-idiomatic).
const RE_EXPORT_SHIM = `import { ContentPanel } from "./panel-shim"
export function View() {
  return <ContentPanel><div>hello</div></ContentPanel>
}
`

// React.createElement path — no JSX tag to walk. Also out-of-scope for the same
// cross-file/AST reason; pinned so the boundary is explicit, not silent.
const CREATE_ELEMENT = `${IMPORT}
export function View() {
  return React.createElement(ContentPanel, null, React.createElement("div"))
}
`

test("detects JSX children passed to ContentPanel", () => {
  assert.equal(sourceHasContentPanelChildren(LEGACY), true)
})

test("detects an explicit children= attribute", () => {
  assert.equal(sourceHasContentPanelChildren(CHILDREN_ATTR), true)
})

test("body= alone is not a legacy children usage", () => {
  assert.equal(sourceHasContentPanelChildren(ARCHETYPE), false)
})

test("whitespace-only body is not a children usage", () => {
  assert.equal(
    sourceHasContentPanelChildren(
      `${IMPORT}<ContentPanel body={x}>\n   \n</ContentPanel>`,
    ),
    false,
  )
})

test("a file without ContentPanel is clean", () => {
  assert.equal(sourceHasContentPanelChildren(NO_CONTENT_PANEL), false)
})

test("catches an aliased ContentPanel import", () => {
  assert.equal(sourceHasContentPanelChildren(ALIASED), true)
})

test("treats a spread attribute on ContentPanel as children-bearing", () => {
  assert.equal(sourceHasContentPanelChildren(SPREAD), true)
})

test("catches a namespace-imported <CP.ContentPanel> body", () => {
  assert.equal(sourceHasContentPanelChildren(NAMESPACE), true)
})

test("does NOT follow a cross-file re-export shim (documented out-of-scope)", () => {
  assert.equal(sourceHasContentPanelChildren(RE_EXPORT_SHIM), false)
})

test("does NOT follow React.createElement(ContentPanel, ...) (documented out-of-scope)", () => {
  assert.equal(sourceHasContentPanelChildren(CREATE_ELEMENT), false)
})

test("findViolations flags a new (non-allowlisted) legacy file", () => {
  const { violations, stale } = findViolations({
    files: [
      { path: "apps/web/app/_components/new/new-view.tsx", source: LEGACY },
    ],
    allowlist: [],
  })
  assert.deepEqual(violations, ["apps/web/app/_components/new/new-view.tsx"])
  assert.deepEqual(stale, [])
})

test("findViolations passes an allowlisted legacy file", () => {
  const path = "apps/web/app/_components/legacy/legacy-view.tsx"
  const { violations, stale } = findViolations({
    files: [{ path, source: LEGACY }],
    allowlist: [path],
  })
  assert.deepEqual(violations, [])
  assert.deepEqual(stale, [])
})

test("findViolations passes a migrated (body=) file", () => {
  const { violations, stale } = findViolations({
    files: [{ path: "apps/web/app/_components/x/x.tsx", source: ARCHETYPE }],
    allowlist: [],
  })
  assert.deepEqual(violations, [])
  assert.deepEqual(stale, [])
})

test("findViolations reports a stale allowlist entry (file migrated to body=)", () => {
  const path = "apps/web/app/_components/migrated/migrated-view.tsx"
  const { violations, stale } = findViolations({
    files: [{ path, source: ARCHETYPE }],
    allowlist: [path],
  })
  assert.deepEqual(violations, [])
  assert.deepEqual(stale, [path])
})

test("findViolations reports a stale allowlist entry (file deleted)", () => {
  const path = "apps/web/app/_components/gone/gone-view.tsx"
  const { violations, stale } = findViolations({
    files: [],
    allowlist: [path],
  })
  assert.deepEqual(stale, [path])
})
