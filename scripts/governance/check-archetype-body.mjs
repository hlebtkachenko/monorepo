#!/usr/bin/env node
// Archetype-body governance ratchet (archetype-system S8 §1/§3/§7).
//
// The ContentPanel body may hold ONLY a branded archetype descriptor
// (`<ContentPanel body={archetypeEmpty(...)} />`). The legacy free-JSX path
// (`<ContentPanel>{jsx}</ContentPanel>`, or an explicit `children=` prop) is
// grandfathered by a hand-maintained allowlist. This check fails when:
//
//   1. VIOLATION — a *new* file renders a <ContentPanel> that passes children
//      and is NOT in the allowlist. Use the archetype path instead.
//   2. STALE — an allowlist entry whose file is gone OR no longer renders a
//      <ContentPanel> with children. Remove it from the JSON (caught in review).
//
// Enforcement note (honest): the allowlist is shrink-PREFERRED, not code-forced
// shrink-only. This check does not compare against a base ref, so appending a
// path to archetype-body-allowlist.json turns a new violation green — only diff
// review (and the CRITICAL rule at the top of that file) stops the list from
// growing. Adding entries is FORBIDDEN without Hleb's explicit approval, even in
// full-auto mode. Detection is a TypeScript-compiler-API AST walk (not a regex)
// so unusual formatting cannot evade it, mirroring scripts/check-nav.ts. The
// type brand + dev runtime assert on ContentBody remain the primary gate; this
// is the anti-regression ratchet over the known legacy call sites.
import { readFileSync, readdirSync, statSync } from "node:fs"
import { dirname, join, relative } from "node:path"
import { fileURLToPath } from "node:url"

import ts from "typescript"

const here = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = join(here, "..", "..")
const ALLOWLIST_PATH = join(here, "archetype-body-allowlist.json")
const SCAN_DIRS = ["apps/web", "apps/admin"]

/**
 * The LOCAL bindings that reach `ContentPanel` in this file, resolved from its
 * import declarations so import-shape variants are caught, not just the literal
 * identifier:
 *   - `names`      — direct/aliased named imports (`import { ContentPanel }`,
 *                    `import { ContentPanel as Panel }`) → matched as `<Panel>`.
 *   - `namespaces` — namespace imports (`import * as CP`) → matched as the
 *                    member tag `<CP.ContentPanel>`.
 * Cross-file indirection (a local re-export shim, or `React.createElement`) is
 * out of scope here: closing it needs the type-checker across files, and both
 * are non-idiomatic + diff-visible in this codebase. The NAMESPACE / SHIM /
 * CREATE_ELEMENT fixtures in the test file pin this exact boundary.
 */
function contentPanelBindings(sourceFile) {
  const names = new Set()
  const namespaces = new Set()
  const visit = (node) => {
    if (
      ts.isImportDeclaration(node) &&
      ts.isStringLiteral(node.moduleSpecifier) &&
      /blocks\/content-panel(\/|$)/.test(node.moduleSpecifier.text)
    ) {
      const bindings = node.importClause?.namedBindings
      if (bindings && ts.isNamedImports(bindings)) {
        for (const el of bindings.elements) {
          const imported = (el.propertyName ?? el.name).text
          if (imported === "ContentPanel") names.add(el.name.text)
        }
      } else if (bindings && ts.isNamespaceImport(bindings)) {
        namespaces.add(bindings.name.text)
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(sourceFile)
  return { names, namespaces }
}

/**
 * A JSX spread attribute (`{...props}`) can smuggle a `children` prop past the
 * attribute walk, so any spread on a ContentPanel counts as children-bearing.
 */
function hasSpreadAttribute(attributes) {
  return attributes.properties.some((prop) => ts.isJsxSpreadAttribute(prop))
}

/** Does a JSX attribute list contain an explicit `children=` prop? */
function hasChildrenAttribute(attributes) {
  return attributes.properties.some(
    (prop) =>
      ts.isJsxAttribute(prop) &&
      ts.isIdentifier(prop.name) &&
      prop.name.text === "children",
  )
}

/** Is a JSX child meaningful (i.e. not whitespace-only text or an empty `{}`)? */
function isMeaningfulChild(child) {
  if (ts.isJsxText(child)) return child.text.trim().length > 0
  if (ts.isJsxExpression(child)) return child.expression !== undefined
  return true
}

/**
 * PURE detector. Parses one TSX source string and returns true when it renders
 * at least one `<ContentPanel>` that passes children — either JSX children in
 * the body or an explicit `children=` attribute. `body=` alone is NOT children.
 */
export function sourceHasContentPanelChildren(source, fileName = "file.tsx") {
  const sourceFile = ts.createSourceFile(
    fileName,
    source,
    ts.ScriptTarget.Latest,
    /* setParentNodes */ true,
    ts.ScriptKind.TSX,
  )

  const { names, namespaces } = contentPanelBindings(sourceFile)
  if (names.size === 0 && namespaces.size === 0) return false
  const isCP = (tagName) => {
    if (ts.isIdentifier(tagName)) return names.has(tagName.text)
    // Namespace member tag: `<CP.ContentPanel>` from `import * as CP`.
    return (
      ts.isPropertyAccessExpression(tagName) &&
      ts.isIdentifier(tagName.expression) &&
      namespaces.has(tagName.expression.text) &&
      tagName.name.text === "ContentPanel"
    )
  }

  let found = false
  const visit = (node) => {
    if (found) return
    if (ts.isJsxSelfClosingElement(node) && isCP(node.tagName)) {
      if (
        hasChildrenAttribute(node.attributes) ||
        hasSpreadAttribute(node.attributes)
      ) {
        found = true
        return
      }
    }
    if (ts.isJsxElement(node) && isCP(node.openingElement.tagName)) {
      const viaAttr = hasChildrenAttribute(node.openingElement.attributes)
      const viaSpread = hasSpreadAttribute(node.openingElement.attributes)
      const viaBody = node.children.some(isMeaningfulChild)
      if (viaAttr || viaSpread || viaBody) {
        found = true
        return
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(sourceFile)
  return found
}

/**
 * PURE ratchet. Given every scanned TSX file ({ path, source }) and the frozen
 * allowlist, compute the two failure sets:
 *   - violations: files with a legacy ContentPanel body that are NOT allowlisted
 *   - stale:      allowlist paths that no longer render a legacy ContentPanel body
 * Paths are repo-relative, POSIX-style, sorted.
 */
export function findViolations({ files, allowlist }) {
  const allowSet = new Set(allowlist)
  const withChildren = new Set(
    files
      .filter(
        (f) =>
          f.source != null && sourceHasContentPanelChildren(f.source, f.path),
      )
      .map((f) => f.path),
  )
  const violations = [...withChildren].filter((p) => !allowSet.has(p)).sort()
  const stale = allowlist.filter((p) => !withChildren.has(p)).sort()
  return { violations, stale }
}

/** Recursively collect every `.tsx` file under `dir`, as repo-relative paths. */
function collectTsxFiles(dir) {
  const out = []
  let entries
  try {
    entries = readdirSync(dir)
  } catch {
    return out
  }
  for (const name of entries) {
    if (name === "node_modules" || name.startsWith(".")) continue
    const abs = join(dir, name)
    const st = statSync(abs)
    if (st.isDirectory()) {
      out.push(...collectTsxFiles(abs))
    } else if (name.endsWith(".tsx")) {
      out.push(relative(REPO_ROOT, abs).split("\\").join("/"))
    }
  }
  return out
}

function readAllowlist() {
  const parsed = JSON.parse(readFileSync(ALLOWLIST_PATH, "utf8"))
  // The file is `{ CRITICAL: "...", allowlist: [...] }`; the CRITICAL note is a
  // read-for-agents banner forbidding hand-added entries. Tolerate a bare array
  // too, in case the shape is ever simplified.
  return Array.isArray(parsed) ? parsed : parsed.allowlist
}

function main() {
  const allowlist = readAllowlist()
  const scanned = SCAN_DIRS.flatMap((d) => collectTsxFiles(join(REPO_ROOT, d)))
  const files = scanned.map((path) => ({
    path,
    source: readFileSync(join(REPO_ROOT, path), "utf8"),
  }))

  const { violations, stale } = findViolations({ files, allowlist })

  if (violations.length > 0) {
    console.error(
      "\n[archetype-body] BLOCKED — new files render a legacy <ContentPanel> body\n" +
        "(children / free JSX). Use the archetype path instead:\n" +
        "  <ContentPanel body={archetypeEmpty({ ... })} />\n" +
        "Do NOT silence this by appending to archetype-body-allowlist.json — that\n" +
        "is FORBIDDEN without Hleb's explicit approval (see the CRITICAL note atop\n" +
        "the file). Migrate the page.\n" +
        "See .context/archetype-system/specs/S8-content-body-blocker.md.\n" +
        violations.map((f) => `  - ${f}`).join("\n") +
        "\n",
    )
  }

  if (stale.length > 0) {
    console.error(
      "\n[archetype-body] STALE allowlist entries — these no longer render a\n" +
        "legacy <ContentPanel> body (migrated or deleted). Remove them from the\n" +
        "`allowlist` array in\n" +
        "  scripts/governance/archetype-body-allowlist.json\n" +
        stale.map((f) => `  - ${f}`).join("\n") +
        "\n",
    )
  }

  if (violations.length > 0 || stale.length > 0) {
    process.exit(1)
  }

  console.log(
    `[archetype-body] OK — ${allowlist.length} grandfathered ContentPanel bodies, ` +
      "no new legacy usage.",
  )
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main()
}
