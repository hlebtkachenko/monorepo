/**
 * Import fence: `db/client.ts` is reachable from the data layer and nowhere
 * else.
 *
 * `betaDb()` is an unscoped handle on a database that holds every client book
 * with no RLS underneath (plan Part 4). The moment a page, a Server Action or a
 * route handler imports it directly, the scope seam stops being a wall and
 * becomes a convention — the query it writes has no `OrgScope` in its signature
 * and nothing forces an `organization_id` filter into its WHERE clause.
 *
 * `apps/beta/eslint.config.js` reports the same rule while the import is being
 * typed, but the repo's shared config registers `eslint-plugin-only-warn`,
 * which downgrades every rule to a warning. THIS test is the blocking half, and
 * it reads the real TypeScript AST rather than grepping: a static import, a
 * re-export, a dynamic `import()` and a `require()` all surface here, under any
 * alias.
 */
import { readdirSync, readFileSync, statSync } from "node:fs"
import { dirname, join, relative, resolve } from "node:path"

import ts from "typescript"
import { describe, expect, it } from "vitest"

const BETA_ROOT = resolve(__dirname, "..", "..")
const DB_CLIENT = join(BETA_ROOT, "db", "client")

/**
 * Directories whose modules may hold the raw handle, and the three `lib/auth`
 * files that predate the seam. Those three are global-identity paths — Better
 * Auth's adapter, the session read, the setup-link consume — none of them
 * organization-scoped. A new auth module is not covered: add it here on
 * purpose, or put the query in `lib/data/`.
 *
 * Kept identical to the `DB_CLIENT_ALLOWED` list in eslint.config.js; the last
 * case in this file asserts the two have not drifted.
 */
const ALLOWED_PREFIXES = ["db/", "lib/data/"]
const ALLOWED_FILES = [
  "lib/auth/server.ts",
  "lib/auth/session.ts",
  "lib/auth/setup-token.ts",
]

const SKIP_DIRS = new Set([
  "node_modules",
  ".next",
  "migrations",
  "fonts",
  "public",
])

function collectSources(dir: string): string[] {
  const files: string[] = []
  const walk = (current: string): void => {
    for (const entry of readdirSync(current)) {
      if (SKIP_DIRS.has(entry)) continue
      const full = join(current, entry)
      if (statSync(full).isDirectory()) walk(full)
      else if (/\.tsx?$/.test(entry)) files.push(full)
    }
  }
  walk(dir)
  return files
}

/** Every module specifier in `source`, from every import form there is. */
function moduleSpecifiers(source: string, fileName: string): string[] {
  const sf = ts.createSourceFile(
    fileName,
    source,
    ts.ScriptTarget.Latest,
    /* setParentNodes */ true,
  )
  const specifiers: string[] = []
  const visit = (node: ts.Node): void => {
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier &&
      ts.isStringLiteral(node.moduleSpecifier)
    ) {
      specifiers.push(node.moduleSpecifier.text)
    }
    if (ts.isCallExpression(node)) {
      const isDynamicImport =
        node.expression.kind === ts.SyntaxKind.ImportKeyword
      const isRequire =
        ts.isIdentifier(node.expression) && node.expression.text === "require"
      const [first] = node.arguments
      if (
        (isDynamicImport || isRequire) &&
        first &&
        ts.isStringLiteral(first)
      ) {
        specifiers.push(first.text)
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(sf)
  return specifiers
}

/** Absolute, extension-less target of a workspace-local specifier. */
function resolveLocal(specifier: string, fromFile: string): string | null {
  const withoutExtension = specifier.replace(/\.(ts|tsx|js|mjs)$/, "")
  if (withoutExtension.startsWith("@/")) {
    return join(BETA_ROOT, withoutExtension.slice(2))
  }
  if (withoutExtension.startsWith(".")) {
    return resolve(dirname(fromFile), withoutExtension)
  }
  return null
}

const importers = collectSources(BETA_ROOT)
  .filter((file) =>
    moduleSpecifiers(readFileSync(file, "utf8"), file).some(
      (specifier) => resolveLocal(specifier, file) === DB_CLIENT,
    ),
  )
  .map((file) => relative(BETA_ROOT, file).split("\\").join("/"))

const isAllowed = (file: string): boolean =>
  ALLOWED_FILES.includes(file) ||
  ALLOWED_PREFIXES.some((prefix) => file.startsWith(prefix))

describe("db/client import fence", () => {
  it("is imported only from the data layer and the three auth modules", () => {
    expect(importers.filter((file) => !isAllowed(file))).toEqual([])
  })

  it("scans a real tree and finds the importers it should (non-vacuous)", () => {
    expect(importers).toContain("lib/auth/session.ts")
    expect(importers).toContain("lib/data/scope.ts")
    expect(importers.length).toBeGreaterThanOrEqual(4)
  })

  it("sees every import form, including aliased and dynamic ones", () => {
    const probe = [
      `import { betaDb as handle } from "@/db/client"`,
      `const later = await import("../../db/client")`,
      `export { betaDb } from "@/db/client"`,
    ].join("\n")

    const found = moduleSpecifiers(probe, join(BETA_ROOT, "app", "probe.ts"))
      .map((specifier) =>
        resolveLocal(specifier, join(BETA_ROOT, "app", "nested", "probe.ts")),
      )
      .filter((target) => target === DB_CLIENT)

    expect(found).toHaveLength(3)
  })

  it("keeps the ESLint allowlist and this one in step", () => {
    const config = readFileSync(join(BETA_ROOT, "eslint.config.js"), "utf8")
    for (const entry of [...ALLOWED_FILES, ...ALLOWED_PREFIXES]) {
      expect(config, `${entry} missing from eslint.config.js`).toContain(entry)
    }
  })
})
