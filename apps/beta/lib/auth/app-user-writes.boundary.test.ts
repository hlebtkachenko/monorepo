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
 *   - a Drizzle `update(app_user).set(...)` / `insert(app_user).values(...)`
 *     whose payload names a forbidden column, spreads an object into it, or is
 *     anything other than a literal or a call to an AUDITED PAYLOAD BUILDER,
 *   - a Better Auth `internalAdapter.createUser/updateUser` call whose payload
 *     argument is anything other than a call to an audited payload builder,
 *   - raw `INSERT INTO app_user` / `UPDATE app_user` SQL anywhere in app code.
 *
 * A new write path added by a later PR is covered the day it is written; it has
 * to go through one of those two shapes to exist at all.
 *
 * TWO CARRY-INS FROM THE PR 07 GATE, both about the identity-writer arm being
 * fooled by ordinary refactors:
 *
 *   1. THE PAYLOAD IS NOT ALWAYS ARGUMENT 0. Better Auth's signature is
 *      `updateUser(userId, data)` — checking argument 0 there inspects the id
 *      string and lets the actual payload through unread. The index is per
 *      writer now, and asserted below against both shapes.
 *
 *   2. THE ADAPTER CAN BE DESTRUCTURED OR ALIASED. `const { updateUser } =
 *      ctx.internalAdapter` produces a bare `updateUser(...)` call with no
 *      `internalAdapter` anywhere in the callee text, and `const a =
 *      ctx.internalAdapter` produces `a.updateUser(...)`. Both used to be
 *      invisible. Local bindings taken from anything mentioning
 *      `internalAdapter` are tracked per file, and calls through them count.
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
 * explicit pick over named fields (never a spread), takes primitives rather
 * than an options object, and is unit-tested against a hostile input.
 *
 * `setupUserPayload` builds the identity a consumed setup link creates
 * (`lib/auth/setup-token.ts`); the other three are /admin's privileged writes
 * (`lib/data/office/payloads.ts`), which are the only writers of `is_staff` and
 * `disabled_at` in the app.
 */
const ALLOWED_PAYLOAD_BUILDERS = [
  "setupUserPayload",
  "officeUserPayload",
  "staffFlagPayload",
  "accountDisabledPayload",
]

/**
 * Better Auth's identity writers, and WHICH ARGUMENT carries the payload.
 * `createUser(data)` but `updateUser(userId, data)` — reading argument 0 for
 * the latter inspects an id and lets the payload through unread (PR 07 gate).
 */
const IDENTITY_WRITERS: Record<string, number> = {
  createUser: 0,
  updateUser: 1,
  updateUserByEmail: 1,
}

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
      } else if (payload && !isAuditedBuilderCall(payload)) {
        // A call to an audited builder is the OTHER legal shape: /admin has to
        // write `is_staff` and `disabled_at`, and a literal naming them here
        // would be the exact thing this test forbids. Routing those two through
        // a named, unit-tested builder keeps the "no unpicked object reaches a
        // privileged column" property while letting the one legitimate writer
        // exist. Anything else — a variable, a spread, a ternary — stays a
        // finding, because the next one might not be audited.
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

/** Is this expression a call to one of the audited payload builders? */
function isAuditedBuilderCall(node: ts.Expression): boolean {
  return (
    ts.isCallExpression(node) &&
    ts.isIdentifier(node.expression) &&
    ALLOWED_PAYLOAD_BUILDERS.includes(node.expression.text)
  )
}

/**
 * Local names in this file that carry Better Auth's internal adapter, from
 * either shape a refactor produces:
 *
 *   `const { updateUser } = ctx.internalAdapter`   → a DIRECT writer name
 *   `const adapter = ctx.internalAdapter`          → a RECEIVER alias
 *
 * Both are per-file: an identifier called `updateUser` in a module that never
 * mentions `internalAdapter` is somebody else's function, not this one.
 */
function adapterBindings(sf: ts.SourceFile): {
  /** local name → the writer it actually is. */
  direct: Map<string, string>
  receivers: Set<string>
} {
  const direct = new Map<string, string>()
  const receivers = new Set<string>()

  const visit = (node: ts.Node): void => {
    if (ts.isVariableDeclaration(node) && node.initializer) {
      const initializer = node.initializer.getText(sf)
      if (initializer.includes("internalAdapter")) {
        if (ts.isObjectBindingPattern(node.name)) {
          for (const element of node.name.elements) {
            // `const { updateUser: rename } = ...` binds `rename`, and the
            // ORIGINAL property name is what identifies the writer — so the
            // rename is recorded as a pointer back to it, not looked up by its
            // new name (which is in no allowlist).
            const property = (element.propertyName ?? element.name).getText(sf)
            if (property in IDENTITY_WRITERS && ts.isIdentifier(element.name)) {
              direct.set(element.name.text, property)
            }
          }
        } else if (ts.isIdentifier(node.name)) {
          receivers.add(node.name.text)
        }
      }
    }
    ts.forEachChild(node, visit)
  }

  visit(sf)
  return { direct, receivers }
}

/**
 * `ctx.internalAdapter.createUser(<payload>)` and every aliased spelling of it,
 * paired with the argument that actually carries the payload.
 */
function identityWriterArguments(
  sf: ts.SourceFile,
): { name: string; argument: ts.Expression | undefined }[] {
  const { direct, receivers } = adapterBindings(sf)
  const calls: { name: string; argument: ts.Expression | undefined }[] = []

  const record = (name: string, node: ts.CallExpression): void => {
    const index = IDENTITY_WRITERS[name]
    if (index === undefined) return
    calls.push({ name, argument: node.arguments[index] })
  }

  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node)) {
      if (ts.isPropertyAccessExpression(node.expression)) {
        const receiver = node.expression.expression
        const writer = node.expression.name.text
        const throughAdapter =
          receiver.getText(sf).includes("internalAdapter") ||
          (ts.isIdentifier(receiver) && receivers.has(receiver.text))
        if (throughAdapter) record(writer, node)
      } else if (ts.isIdentifier(node.expression)) {
        const writer = direct.get(node.expression.text)
        if (writer !== undefined) record(writer, node)
      }
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
        await db.update(app_user).set(input)
        await db.update(app_user).set(buildWhateverYouLike(input))
      }
    `
    const findings = drizzleWriteFindings(
      parse(hostile, "hostile.ts"),
      "hostile.ts",
    )
    expect(findings.map((f) => f.detail)).toEqual([
      "app_user write sets is_staff",
      "spread into an app_user write",
      "app_user write payload is not a literal: input",
      "app_user write payload is not a literal: buildWhateverYouLike(input)",
    ])
  })

  it("accepts an audited builder as a payload, and only an audited one", () => {
    const audited = `
      import { app_user } from "@/db/schema"
      export async function toggle(db, id, isStaff) {
        await db.update(app_user).set(staffFlagPayload(isStaff)).where(eq(app_user.id, id))
        await db.insert(app_user).values(officeUserPayload({ email, name, isStaff }))
      }
    `
    expect(
      drizzleWriteFindings(parse(audited, "audited.ts"), "audited.ts"),
    ).toEqual([])
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
      expect(
        argument !== undefined && isAuditedBuilderCall(argument),
        `${call.file}: internalAdapter.${call.name} must take a payload from ${ALLOWED_PAYLOAD_BUILDERS.join(" / ")}`,
      ).toBe(true)
    }
  })

  /**
   * PR 07 gate, carry-in 1. `updateUser(userId, data)` puts the payload in
   * argument ONE. A checker reading argument zero inspects an id string, finds
   * it is not a builder call, and reports the right verdict for the wrong
   * reason — until someone "fixes" the false positive by allowing identifiers,
   * at which point the real payload is never read at all.
   */
  it("reads the payload argument of each writer, not always the first", () => {
    const source = `
      export async function f(ctx, userId, data) {
        await ctx.internalAdapter.createUser(setupUserPayload(data))
        await ctx.internalAdapter.updateUser(userId, staffFlagPayload(true))
        await ctx.internalAdapter.updateUserByEmail(email, { is_staff: true })
      }
    `
    const calls = identityWriterArguments(parse(source, "positions.ts"))

    expect(calls.map((call) => call.name)).toEqual([
      "createUser",
      "updateUser",
      "updateUserByEmail",
    ])
    expect(calls.map((call) => call.argument?.getText())).toEqual([
      "setupUserPayload(data)",
      "staffFlagPayload(true)",
      "{ is_staff: true }",
    ])
    // And the third one — a raw literal in the payload position — is the shape
    // the suite refuses.
    expect(
      calls.map((c) => c.argument && isAuditedBuilderCall(c.argument)),
    ).toEqual([true, true, false])
  })

  /**
   * PR 07 gate, carry-in 2. Destructuring or aliasing the adapter removes
   * `internalAdapter` from the callee text entirely.
   */
  it("follows a destructured or aliased internalAdapter", () => {
    const source = `
      export async function f(ctx, userId, data) {
        const { updateUser, createUser: make } = ctx.internalAdapter
        const adapter = ctx.internalAdapter
        await updateUser(userId, data)
        await make(data)
        await adapter.updateUser(userId, data)
      }
    `
    const calls = identityWriterArguments(parse(source, "aliased.ts"))

    expect(calls.map((call) => call.name)).toEqual([
      "updateUser",
      "createUser",
      "updateUser",
    ])
    // Every one of them lands on the payload, and none of them is audited.
    expect(calls.map((call) => call.argument?.getText())).toEqual([
      "data",
      "data",
      "data",
    ])
  })

  it("does not claim an unrelated function of the same name", () => {
    const source = `
      import { updateUser } from "./somewhere-else"
      export async function f(data) { await updateUser(data) }
    `
    expect(identityWriterArguments(parse(source, "unrelated.ts"))).toEqual([])
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
