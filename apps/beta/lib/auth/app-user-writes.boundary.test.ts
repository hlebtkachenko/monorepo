/**
 * SF-3 — no client-influenced payload may write a privileged `app_user` column.
 *
 * `is_staff` gates /admin and is the DB precondition for an owner membership;
 * `disabled_at` is the offboarding switch; `email_verified` is an assertion only
 * the server may make. Every one of them is set by /admin or by a migration, and
 * by nothing that a form, a Server Action argument or an API body can reach.
 *
 * `setup-token.test.ts` asserts the ALLOWLIST that the one existing account
 * creator uses. This file is the other half, and the half that keeps holding
 * once other write paths exist: it walks the real TypeScript AST of every
 * production module in this app and fails on
 *
 *   - a Drizzle `update(app_user).set({...})` / `insert(app_user).values({...})`
 *     whose payload names a forbidden column, or spreads an object into it,
 *   - a Better Auth `internalAdapter.createUser/updateUser` call whose argument
 *     is anything other than a call to an audited payload builder,
 *   - raw `INSERT INTO app_user` / `UPDATE app_user` SQL anywhere in app code.
 *
 * A new write path added by a later PR is covered the day it is written; it has
 * to go through one of those two shapes to exist at all.
 */
import { readdirSync, readFileSync, statSync } from "node:fs"
import { join, relative, resolve } from "node:path"

import ts from "typescript"
import { describe, expect, it } from "vitest"

const BETA_ROOT = resolve(__dirname, "..", "..")

const FORBIDDEN_COLUMNS = [
  "is_staff",
  "disabled_at",
  "email_verified",
  "two_factor_enabled",
  "id",
]

/**
 * The only functions allowed to build an `app_user` payload. Each one is an
 * explicit pick over named fields (never a spread), and each is unit-tested
 * against a hostile input.
 */
const ALLOWED_PAYLOAD_BUILDERS = ["setupUserPayload"]

const IDENTITY_WRITERS = ["createUser", "updateUser", "updateUserByEmail"]

const SKIP_DIRS = new Set([
  "node_modules",
  ".next",
  "migrations",
  "fonts",
  "public",
  "tests",
])

function collectProductionSources(dir: string): string[] {
  const files: string[] = []
  const walk = (current: string): void => {
    for (const entry of readdirSync(current)) {
      if (SKIP_DIRS.has(entry)) continue
      const full = join(current, entry)
      if (statSync(full).isDirectory()) walk(full)
      else if (/\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry)) {
        files.push(full)
      }
    }
  }
  walk(dir)
  return files
}

type Finding = { file: string; detail: string }

function parse(source: string, fileName: string): ts.SourceFile {
  return ts.createSourceFile(
    fileName,
    source,
    ts.ScriptTarget.Latest,
    /* setParentNodes */ true,
  )
}

/**
 * `db.update(app_user).set({...})` and `db.insert(app_user).values({...})`.
 * The payload argument sits on the `.set` / `.values` call; the table sits on
 * the `update` / `insert` call one link back down the chain.
 */
function drizzleWriteFindings(sf: ts.SourceFile, file: string): Finding[] {
  const findings: Finding[] = []

  const tableOfChain = (node: ts.Node): string | null => {
    let current: ts.Node = node
    for (let depth = 0; depth < 6; depth++) {
      if (
        ts.isCallExpression(current) &&
        ts.isPropertyAccessExpression(current.expression) &&
        ["update", "insert"].includes(current.expression.name.text)
      ) {
        const [table] = current.arguments
        return table && ts.isIdentifier(table) ? table.text : null
      }
      if (ts.isCallExpression(current)) current = current.expression
      else if (ts.isPropertyAccessExpression(current))
        current = current.expression
      else return null
    }
    return null
  }

  const visit = (node: ts.Node): void => {
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      ["set", "values"].includes(node.expression.name.text) &&
      tableOfChain(node.expression.expression) === "app_user"
    ) {
      const [payload] = node.arguments
      if (payload && ts.isObjectLiteralExpression(payload)) {
        for (const property of payload.properties) {
          if (ts.isSpreadAssignment(property)) {
            findings.push({ file, detail: "spread into an app_user write" })
            continue
          }
          const name = property.name?.getText(sf)
          if (name && FORBIDDEN_COLUMNS.includes(name.replace(/["']/g, ""))) {
            findings.push({ file, detail: `app_user write sets ${name}` })
          }
        }
      } else if (payload) {
        findings.push({
          file,
          detail: `app_user write payload is not a literal: ${payload.getText(sf).slice(0, 60)}`,
        })
      }
    }
    ts.forEachChild(node, visit)
  }

  visit(sf)
  return findings
}

/** `ctx.internalAdapter.createUser(<argument>)` and its siblings. */
function identityWriterArguments(
  sf: ts.SourceFile,
): { name: string; argument: ts.Expression | undefined }[] {
  const calls: { name: string; argument: ts.Expression | undefined }[] = []
  const visit = (node: ts.Node): void => {
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      IDENTITY_WRITERS.includes(node.expression.name.text) &&
      node.expression.expression.getText(sf).includes("internalAdapter")
    ) {
      calls.push({
        name: node.expression.name.text,
        argument: node.arguments[0],
      })
    }
    ts.forEachChild(node, visit)
  }
  visit(sf)
  return calls
}

const productionFiles = collectProductionSources(BETA_ROOT)
const parsed = productionFiles.map((file) => ({
  file: relative(BETA_ROOT, file).split("\\").join("/"),
  source: readFileSync(file, "utf8"),
}))

describe("SF-3 — app_user write paths", () => {
  it("scans the real app (non-vacuous)", () => {
    expect(parsed.length).toBeGreaterThan(20)
    expect(parsed.map((entry) => entry.file)).toContain(
      "lib/auth/setup-token.ts",
    )
  })

  it("never sets a privileged column through Drizzle", () => {
    const findings = parsed.flatMap((entry) =>
      drizzleWriteFindings(parse(entry.source, entry.file), entry.file),
    )
    expect(findings).toEqual([])
  })

  it("detects the violation it is looking for (non-vacuous)", () => {
    const hostile = `
      import { app_user } from "@/db/schema"
      export async function promote(db, id, input) {
        await db.update(app_user).set({ is_staff: true }).where(eq(app_user.id, id))
        await db.insert(app_user).values({ ...input })
      }
    `
    const findings = drizzleWriteFindings(
      parse(hostile, "hostile.ts"),
      "hostile.ts",
    )
    expect(findings.map((f) => f.detail)).toEqual([
      "app_user write sets is_staff",
      "spread into an app_user write",
    ])
  })

  it("builds every identity write through an audited payload builder", () => {
    const calls = parsed.flatMap((entry) =>
      identityWriterArguments(parse(entry.source, entry.file)).map((call) => ({
        ...call,
        file: entry.file,
      })),
    )

    // The consume path creates the one account this app can create.
    expect(calls.length).toBeGreaterThanOrEqual(1)

    for (const call of calls) {
      const argument = call.argument
      const isAuditedBuilder =
        argument !== undefined &&
        ts.isCallExpression(argument) &&
        ts.isIdentifier(argument.expression) &&
        ALLOWED_PAYLOAD_BUILDERS.includes(argument.expression.text)

      expect(
        isAuditedBuilder,
        `${call.file}: internalAdapter.${call.name} must take a payload from ${ALLOWED_PAYLOAD_BUILDERS.join(" / ")}`,
      ).toBe(true)
    }
  })

  it("writes app_user through no raw SQL at all", () => {
    const pattern = /(insert\s+into|update)\s+app_user\b/i
    const offenders = parsed
      .filter((entry) => pattern.test(entry.source))
      .map((entry) => entry.file)
    expect(offenders).toEqual([])

    // The pattern is real: it matches the fixtures that do write app_user.
    const fixtures = readFileSync(
      join(BETA_ROOT, "tests", "fixtures.ts"),
      "utf8",
    )
    expect(pattern.test(fixtures)).toBe(true)
  })
})
