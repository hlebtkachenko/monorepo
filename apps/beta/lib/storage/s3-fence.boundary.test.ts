/**
 * Import fence: the S3 client is reachable from `lib/storage/` and nowhere else.
 *
 * The sibling of `lib/data/db-client-fence.boundary.test.ts`, and the reason is
 * the same one scaled up. An `S3Client` built against `DOCUMENTS_BUCKET` is a
 * handle on EVERY organization's files with no `OrgScope` in its signature; the
 * moment a route or a page holds one, the org prefix in a key is a convention
 * rather than a wall. Worse than the database case, in fact: a mis-scoped SQL
 * read renders someone else's row, a mis-scoped `GetObject` hands over someone
 * else's invoice as a file the browser saves to disk.
 *
 * TWO FENCES IN ONE FILE:
 *   1. nothing outside `lib/storage/` imports `@aws-sdk/*` or the S3 store;
 *   2. nothing outside `lib/storage/` and `lib/data/` imports the store seam
 *      (`lib/storage/store.ts`) — routes go through `lib/data/documents.ts`,
 *      which is where the authorization lives.
 *
 * Like its sibling it reads the real TypeScript AST, so a dynamic `import()`,
 * a re-export and an aliased import all surface.
 */
import { readdirSync, readFileSync, statSync } from "node:fs"
import { dirname, join, relative, resolve } from "node:path"

import ts from "typescript"
import { describe, expect, it } from "vitest"

const BETA_ROOT = resolve(__dirname, "..", "..")
const STORE_SEAM = join(BETA_ROOT, "lib", "storage", "store")

/** Kept identical to `RAW_S3_CLIENT` / `S3_CLIENT_ALLOWED` in eslint.config.js. */
const AWS_PACKAGES = ["@aws-sdk/client-s3", "@aws-sdk/lib-storage"]
const S3_ALLOWED_PREFIX = "lib/storage/"
/**
 * The store SEAM (not the client) is additionally reachable from the data
 * layer, which is what `lib/data/documents.ts` uses, and from the test tree,
 * where the in-memory fake is installed.
 *
 * TEST FILES ANYWHERE are also allowed, and only for the seam: installing the
 * fake IS what `setDocumentStoreForTests` is for, it refuses to run in
 * production, and a route's own spec is the right place to call it. The AWS
 * fence above has no such exemption — nothing outside `lib/storage/` builds an
 * S3 client, test or not.
 */
const SEAM_ALLOWED_PREFIXES = ["lib/storage/", "lib/data/", "tests/"]
const isTestFile = (file: string): boolean => /\.test\.tsx?$/.test(file)

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

const sources = collectSources(BETA_ROOT).map((file) => ({
  file: relative(BETA_ROOT, file).split("\\").join("/"),
  specifiers: moduleSpecifiers(readFileSync(file, "utf8"), file),
  absolute: file,
}))

const awsImporters = sources
  .filter((entry) =>
    entry.specifiers.some((specifier) =>
      AWS_PACKAGES.some(
        (pkg) => specifier === pkg || specifier.startsWith(`${pkg}/`),
      ),
    ),
  )
  .map((entry) => entry.file)

const seamImporters = sources
  .filter((entry) =>
    entry.specifiers.some(
      (specifier) => resolveLocal(specifier, entry.absolute) === STORE_SEAM,
    ),
  )
  .map((entry) => entry.file)

describe("S3 client import fence", () => {
  it("scans a real tree and finds the importer it should (non-vacuous)", () => {
    expect(awsImporters).toContain("lib/storage/document-store-s3.ts")
    expect(seamImporters).toContain("lib/data/documents.ts")
  })

  it("keeps the AWS SDK inside lib/storage", () => {
    expect(
      awsImporters.filter((file) => !file.startsWith(S3_ALLOWED_PREFIX)),
    ).toEqual([])
  })

  it("keeps the store seam out of routes, pages and actions", () => {
    expect(
      seamImporters.filter(
        (file) =>
          !isTestFile(file) &&
          !SEAM_ALLOWED_PREFIXES.some((prefix) => file.startsWith(prefix)),
      ),
    ).toEqual([])
  })

  it("no route handler reaches storage at all — only lib/data does", () => {
    const routeFiles = sources.filter((entry) => entry.file.startsWith("app/"))
    expect(routeFiles.length).toBeGreaterThan(5)
    for (const entry of routeFiles) {
      const reaches = entry.specifiers.filter(
        (specifier) =>
          specifier.includes("lib/storage/document-store") ||
          AWS_PACKAGES.some((pkg) => specifier.startsWith(pkg)),
      )
      expect(reaches, `${entry.file} reaches the store directly`).toEqual([])
    }
  })

  it("keeps the ESLint allowlist and this one in step", () => {
    const config = readFileSync(join(BETA_ROOT, "eslint.config.js"), "utf8")
    for (const entry of [...AWS_PACKAGES, "lib/storage/**/*.{ts,tsx}"]) {
      expect(config, `${entry} missing from eslint.config.js`).toContain(entry)
    }
  })
})
