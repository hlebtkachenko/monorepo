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

test("findViolations flags a new (non-allowlisted) legacy file", () => {
  const { violations, stale } = findViolations({
    files: [{ path: "apps/web/app/_components/new/new-view.tsx", source: LEGACY }],
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
