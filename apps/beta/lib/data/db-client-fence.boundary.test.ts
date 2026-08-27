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

/**
 * Skipped by PATH relative to `dir` (always `BETA_ROOT` here), not by bare
 * basename. `node_modules`/`.next` are excluded no matter where they occur —
 * once skipped once, the walker never descends into them, so a nested
 * instance is never actually reached — but `migrations`/`fonts`/`public` name
 * the app's own top-level directories specifically, and matching those by
 * basename alone used to silently exempt any FUTURE directory that happened
 * to share one of those names deeper in the tree (a route folder literally
 * named `public`, say) from this fence's AST scan.
 */
const SKIP_DIR_PATHS = new Set([
  "node_modules",
  ".next",
  "db/migrations",
  "fonts",
  "public",
])

function collectSources(dir: string): string[] {
  const files: string[] = []
  const walk = (current: string): void => {
    for (const entry of readdirSync(current)) {
      const full = join(current, entry)
      if (SKIP_DIR_PATHS.has(relative(dir, full))) continue
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

/**
 * True if `sf` re-exports `betaDb` — under any alias, or via `export *` — from
 * `db/client`, in any form.
 *
 * PR 09 carry-in from the PR 07 gate. The primary fence above only asks "does
 * this file's own code hold the raw handle", which is the wrong question for a
 * file INSIDE the allowlist: `lib/data/organizations.ts` doing
 * `export { betaDb } from "@/db/client"` is itself an allowed importer, so the
 * primary check passes it — and then `app/some-page.tsx` can
 * `import { betaDb } from "@/lib/data/organizations"`, which never mentions
 * `db/client` at all and is invisible to both this test and the ESLint rule
 * (`no-restricted-imports` only matches the literal specifier). The re-export
 * IS the bypass: it turns one allowed file into a second, unfenced door onto
 * the unscoped client.
 */
function reExportsDbClient(sf: ts.SourceFile, fromFile: string): boolean {
  let found = false
  const visit = (node: ts.Node): void => {
    if (
      ts.isExportDeclaration(node) &&
      node.moduleSpecifier &&
      ts.isStringLiteral(node.moduleSpecifier) &&
      resolveLocal(node.moduleSpecifier.text, fromFile) === DB_CLIENT
    ) {
      if (!node.exportClause) {
        // `export * from "@/db/client"` — re-exports everything, betaDb
        // included, under no alias at all.
        found = true
      } else if (ts.isNamedExports(node.exportClause)) {
        for (const element of node.exportClause.elements) {
          // `export { betaDb as db } from "..."` re-exports the ORIGINAL name
          // `betaDb` under the local alias `db` — the alias is irrelevant to
          // what leaves the module, only the source name is.
          const original = (element.propertyName ?? element.name).text
          if (original === "betaDb") found = true
        }
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(sf)
  return found
}

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

  it("no allowlisted file re-exports the raw client (the `export { betaDb }` bypass)", () => {
    const offenders = collectSources(BETA_ROOT)
      .map((file) => relative(BETA_ROOT, file).split("\\").join("/"))
      .filter((file) => isAllowed(file))
      .filter((file) => {
        const full = join(BETA_ROOT, file)
        return reExportsDbClient(
          ts.createSourceFile(
            full,
            readFileSync(full, "utf8"),
            ts.ScriptTarget.Latest,
            true,
          ),
          full,
        )
      })
    expect(offenders).toEqual([])
  })

  it("detects the re-export bypass it is looking for (non-vacuous)", () => {
    const hostileFile = join(BETA_ROOT, "lib", "data", "hostile.ts")
    const hostileSources = [
      `export { betaDb } from "@/db/client"`,
      `export { betaDb as db } from "../../db/client"`,
      `export * from "@/db/client"`,
    ]
    for (const source of hostileSources) {
      const sf = ts.createSourceFile(
        hostileFile,
        source,
        ts.ScriptTarget.Latest,
        true,
      )
      expect(reExportsDbClient(sf, hostileFile), source).toBe(true)
    }

    // Holding and USING the handle internally is exactly what the allowlist
    // exists to permit — only re-exporting it is the bypass.
    const innocentFile = join(BETA_ROOT, "lib", "data", "innocent.ts")
    const innocentSource = [
      `import { betaDb } from "@/db/client"`,
      `export function organizationForScope() { return betaDb() }`,
    ].join("\n")
    const innocentSf = ts.createSourceFile(
      innocentFile,
      innocentSource,
      ts.ScriptTarget.Latest,
      true,
    )
    expect(reExportsDbClient(innocentSf, innocentFile)).toBe(false)

    // A re-export of something else entirely from db/client (hypothetically,
    // a type) does not trip the check — only the raw handle's name does.
    const otherExportFile = join(BETA_ROOT, "lib", "data", "other-export.ts")
    const otherExportSf = ts.createSourceFile(
      otherExportFile,
      `export { SomeType } from "@/db/client"`,
      ts.ScriptTarget.Latest,
      true,
    )
    expect(reExportsDbClient(otherExportSf, otherExportFile)).toBe(false)
  })
})
