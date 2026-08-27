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
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
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
 * (`lib/auth/setup-token.ts`); the other four are /admin's privileged writes
 * (`lib/data/office/payloads.ts`), which are the only writers of `is_staff` and
 * `disabled_at` in the app. Kept as the full set for anything that still needs
 * "is this name audited at all" (e.g. the Drizzle non-literal-payload check
 * below); WHICH of these a given writer may use is the allowlists further
 * down, not this one.
 *
 * `anonymizedUserPayload` (migration 0021) is the widest of them — it names
 * `is_staff`, `disabled_at`, `email_verified` and `two_factor_enabled` in one
 * object — which is exactly why it is a builder rather than a literal at the
 * call site. It takes two primitives (the row's own id and the offboarding
 * timestamp already on the row) and derives everything else, so there is no
 * parameter through which a caller could choose WHICH columns get written.
 */
const ALLOWED_PAYLOAD_BUILDERS = [
  "setupUserPayload",
  "officeUserPayload",
  "staffFlagPayload",
  "accountDisabledPayload",
  "anonymizedUserPayload",
]

/**
 * PR 09 carry-in from the PR 08 gate: the allowlist is now PER WRITER, not one
 * flat set every writer may draw from. Before this, `isAuditedBuilderCall`
 * accepted ANY of the four names at ANY call site — so
 * `ctx.internalAdapter.createUser(officeUserPayload(...))` or
 * `db.insert(app_user).values(staffFlagPayload(...))` passed the fence even
 * though neither pairing exists in the real app and neither should: `setup-
 * token.ts`'s `createUser` is the only path that may mint a brand-new identity
 * with no privileged column at all, and the two office writers in
 * `lib/data/office/users.ts` are keyed to the ONE operation each performs
 * (`.values()` on insert creates the row, `.set()` on update flips a flag).
 * A builder used on the wrong writer is exactly the shape that would let a
 * refactor quietly widen what a writer may set.
 *
 * Better Auth's identity writers, and WHICH ARGUMENT carries the payload.
 * `createUser(data)` but `updateUser(userId, data)` — reading argument 0 for
 * the latter inspects an id and lets the payload through unread (PR 07 gate).
 */
const IDENTITY_WRITERS: Record<string, number> = {
  createUser: 0,
  updateUser: 1,
  updateUserByEmail: 1,
}

/**
 * Per-writer allowlists for Better Auth's identity writers. `createUser` is
 * the brand-new-identity path the setup-link consume uses and may take
 * nothing else. `updateUser` / `updateUserByEmail` have no legitimate caller
 * in this app today — nothing writes `app_user` through them — so their
 * allowlist is empty ON PURPOSE: a later PR that starts calling one has to
 * add a dedicated, audited builder AND name it here, rather than inheriting
 * whatever the flat set happened to allow.
 */
const IDENTITY_WRITER_BUILDERS: Record<string, readonly string[]> = {
  createUser: ["setupUserPayload"],
  updateUser: [],
  updateUserByEmail: [],
}

/**
 * Per-operation allowlists for the direct Drizzle writes on `app_user`.
 * `.values()` (an INSERT) is `createOfficeUser`'s row creation; `.set()` (an
 * UPDATE) is `setUserStaff` / `setUserDisabled` flipping one flag each, plus
 * `anonymizeAppUser` scrubbing the identity (migration 0021).
 * `setupUserPayload` is deliberately absent from both: the one path that may
 * use it is Better Auth's `internalAdapter.createUser`, because that adapter
 * call ALSO creates the linked credential in the same step — a raw Drizzle
 * insert with the same payload would create an identity with no way to sign
 * in as it and no record of how it got there.
 *
 * `anonymizedUserPayload` is on `set` ONLY, and that is the load-bearing half:
 * on `values` it would mint a brand-new account already wearing a tombstone
 * address — an identity nobody can sign in as, nobody provisioned, and nothing
 * explains.
 */
const DRIZZLE_OP_BUILDERS: Record<"values" | "set", readonly string[]> = {
  values: ["officeUserPayload"],
  set: ["staffFlagPayload", "accountDisabledPayload", "anonymizedUserPayload"],
}

/**
 * `scripts` joins `migrations` for the same reason `migrations` is here: this
 * fence is about payloads a REQUEST can influence, and neither directory is
 * reachable from one. Both are operator tooling run by hand against a database
 * — `scripts/demo-seed.ts` writes `app_user` in raw SQL exactly as a migration
 * would, with no request, no session and no client-supplied field anywhere near
 * it. What keeps the exemption from becoming a hole is that nothing shipped can
 * reach the exempt code: `db/demo-seed.test.ts` asserts that no module outside
 * `scripts/` imports from `scripts/`, so a script cannot become a request path
 * by being imported into one.
 *
 * THE EXEMPTIONS ARE PATHS, NOT NAMES. They used to be matched on the directory
 * BASENAME anywhere in the tree, which is a much larger hole than it looks: a
 * `scripts/` folder next to a Server Action, or a `tests/` folder inside a route
 * module, would have exempted request-reachable code from this fence purely by
 * being called the right thing. Nothing in the tree is spelled that way today,
 * which is exactly why it would have gone unnoticed. Each entry below is now the
 * one real directory it always meant, anchored at the app root and asserted to
 * exist — a rename fails the fence instead of silently exempting nothing.
 */
const SKIP_PATHS = new Set(["db/migrations", "scripts", "fonts", "tests"])

/**
 * Skipped wherever they occur, because neither is source anybody in this repo
 * wrote and both can nest arbitrarily deep.
 */
const SKIP_ANYWHERE = new Set(["node_modules", ".next"])

function collectProductionSources(dir: string): string[] {
  const files: string[] = []
  const walk = (current: string, prefix: string): void => {
    for (const entry of readdirSync(current)) {
      const rel = prefix === "" ? entry : `${prefix}/${entry}`
      if (SKIP_ANYWHERE.has(entry) || SKIP_PATHS.has(rel)) continue
      const full = join(current, entry)
      if (statSync(full).isDirectory()) walk(full, rel)
      else if (/\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry)) {
        files.push(full)
      }
    }
  }
  walk(dir, "")
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
 * Local names in this file that stand for the `app_user` table.
 *
 * `const users = app_user` then `db.update(users)` is an ordinary refactor and
 * used to walk straight past the fence, because the table argument was only
 * matched as the literal identifier `app_user`. Per-file, so an unrelated
 * `users` in a module that never imports the table is not claimed.
 */
function appUserAliases(sf: ts.SourceFile): Set<string> {
  const aliases = new Set(["app_user"])
  const visit = (node: ts.Node): void => {
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.initializer &&
      tableNameOf(node.initializer, sf) === "app_user"
    ) {
      aliases.add(node.name.text)
    }
    ts.forEachChild(node, visit)
  }
  visit(sf)
  return aliases
}

/**
 * The table an expression names, as a bare name.
 *
 * Takes the TAIL of a property access, so `schema.app_user` and
 * `tables.beta.app_user` are the same table as `app_user` — the previous
 * version required a bare identifier and silently returned null for every
 * namespaced import, which is the most natural way to write this code.
 */
function tableNameOf(node: ts.Expression, sf: ts.SourceFile): string | null {
  if (ts.isIdentifier(node)) return node.text
  if (ts.isPropertyAccessExpression(node)) return node.name.text
  if (ts.isElementAccessExpression(node)) {
    const argument = node.argumentExpression
    return ts.isStringLiteralLike(argument) ? argument.text : null
  }
  void sf
  return null
}

/**
 * `db.update(app_user).set({...})` and `db.insert(app_user).values({...})`.
 * The payload argument sits on the `.set` / `.values` call; the table sits on
 * the `update` / `insert` call one link back down the chain.
 */
function drizzleWriteFindings(sf: ts.SourceFile, file: string): Finding[] {
  const findings: Finding[] = []
  const aliases = appUserAliases(sf)

  const tableOfChain = (node: ts.Node): string | null => {
    let current: ts.Node = node
    for (let depth = 0; depth < 6; depth++) {
      if (
        ts.isCallExpression(current) &&
        ts.isPropertyAccessExpression(current.expression) &&
        ["update", "insert"].includes(current.expression.name.text)
      ) {
        const [table] = current.arguments
        if (!table) return null
        const name = tableNameOf(table, sf)
        // Normalize every alias back to the one name the caller checks for.
        return name !== null && aliases.has(name) ? "app_user" : name
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
      (node.expression.name.text === "set" ||
        node.expression.name.text === "values") &&
      tableOfChain(node.expression.expression) === "app_user"
    ) {
      // PER OPERATION, not one shared set: `.values()` is the INSERT
      // `createOfficeUser` performs, `.set()` is the UPDATE the two
      // is_staff/disabled_at flippers perform, and neither may reach for the
      // other's builder — see the carry-in note on `DRIZZLE_OP_BUILDERS`.
      const opName = node.expression.name.text as "set" | "values"
      const allowedForOp = DRIZZLE_OP_BUILDERS[opName]

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
      } else if (payload && !isAuditedBuilderCall(payload, allowedForOp)) {
        // A call to an audited builder is the OTHER legal shape: /admin has to
        // write `is_staff` and `disabled_at`, and a literal naming them here
        // would be the exact thing this test forbids. Routing those two through
        // a named, unit-tested builder keeps the "no unpicked object reaches a
        // privileged column" property while letting the one legitimate writer
        // exist. Anything else — a variable, a spread, a ternary, or a builder
        // this OPERATION does not own — stays a finding.
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

/**
 * Is this expression a call to one of the given audited payload builders?
 * Defaults to the FULL set — used where "is this name audited at all" is the
 * only question — but every call site that knows WHICH writer it is checking
 * passes that writer's own narrower allowlist instead.
 */
function isAuditedBuilderCall(
  node: ts.Expression,
  allowed: readonly string[] = ALLOWED_PAYLOAD_BUILDERS,
): boolean {
  return (
    ts.isCallExpression(node) &&
    ts.isIdentifier(node.expression) &&
    allowed.includes(node.expression.text)
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

  it("sees the table through a namespace and through an alias", () => {
    // Both spellings are ordinary refactors that used to walk straight past
    // the fence: the table argument was matched only as the bare identifier
    // `app_user`, so a namespaced import returned null and an alias returned a
    // name nobody was looking for.
    const hostile = `
      import * as schema from "@/db/schema"
      import { app_user } from "@/db/schema"
      const users = app_user
      export async function promote(db, id) {
        await db.update(schema.app_user).set({ is_staff: true }).where(eq(schema.app_user.id, id))
        await db.update(users).set({ disabled_at: null }).where(eq(users.id, id))
      }
    `
    const findings = drizzleWriteFindings(
      parse(hostile, "aliased-table.ts"),
      "aliased-table.ts",
    )
    expect(findings.map((f) => f.detail)).toEqual([
      "app_user write sets is_staff",
      "app_user write sets disabled_at",
    ])
  })

  it("does not claim an unrelated table of a similar shape", () => {
    const innocent = `
      import { organization } from "@/db/schema"
      export async function rename(db, id, name) {
        await db.update(organization).set({ legal_name: name }).where(eq(organization.id, id))
      }
    `
    expect(
      drizzleWriteFindings(parse(innocent, "other-table.ts"), "other-table.ts"),
    ).toEqual([])
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

  it("builds every identity write through ITS OWN audited payload builder", () => {
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
      const allowedForWriter = IDENTITY_WRITER_BUILDERS[call.name] ?? []
      expect(
        argument !== undefined &&
          isAuditedBuilderCall(argument, allowedForWriter),
        allowedForWriter.length > 0
          ? `${call.file}: internalAdapter.${call.name} must take a payload from ${allowedForWriter.join(" / ")}`
          : `${call.file}: internalAdapter.${call.name} has no audited builder yet — add one and list it in IDENTITY_WRITER_BUILDERS`,
      ).toBe(true)
    }
  })

  it("refuses a builder audited for a DIFFERENT writer (non-vacuous)", () => {
    // Every one of these is a name in ALLOWED_PAYLOAD_BUILDERS, so the old flat
    // check passed all three. Only `createUser` may take `setupUserPayload`;
    // the office builders belong to neither Better Auth writer at all.
    const hostile = `
      export async function f(ctx, userId, data) {
        await ctx.internalAdapter.createUser(officeUserPayload(data))
        await ctx.internalAdapter.updateUser(userId, staffFlagPayload(true))
        await ctx.internalAdapter.updateUserByEmail(email, accountDisabledPayload(true))
      }
    `
    const calls = identityWriterArguments(parse(hostile, "wrong-writer.ts"))
    expect(calls).toHaveLength(3)

    for (const call of calls) {
      const allowedForWriter = IDENTITY_WRITER_BUILDERS[call.name] ?? []
      expect(
        call.argument !== undefined &&
          isAuditedBuilderCall(call.argument, allowedForWriter),
        `${call.name} must not accept a builder audited for a different writer`,
      ).toBe(false)
    }
  })

  it("refuses the office builders swapped between insert and update (non-vacuous)", () => {
    // Both names are in ALLOWED_PAYLOAD_BUILDERS, so the old flat check passed
    // both. `officeUserPayload` creates a row; `staffFlagPayload` only
    // updates one, and neither operation may use the other's builder.
    const hostile = `
      import { app_user } from "@/db/schema"
      export async function f(db, id, isStaff) {
        await db.insert(app_user).values(staffFlagPayload(isStaff))
        await db.update(app_user).set(officeUserPayload({ email, name, isStaff })).where(eq(app_user.id, id))
      }
    `
    const findings = drizzleWriteFindings(
      parse(hostile, "wrong-op.ts"),
      "wrong-op.ts",
    )
    expect(findings.map((f) => f.detail)).toEqual([
      "app_user write payload is not a literal: staffFlagPayload(isStaff)",
      "app_user write payload is not a literal: officeUserPayload({ email, name, isStaff })",
    ])
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
    // The first is `createUser`'s own audited builder. The second is a raw
    // literal position occupied by a builder that IS audited overall but not
    // for `updateUser` — nothing is on `updateUser`'s allowlist (PR 09 carry-
    // in: no legitimate caller exists yet). The third is a raw literal.
    expect(
      calls.map(
        (c) =>
          c.argument &&
          isAuditedBuilderCall(c.argument, IDENTITY_WRITER_BUILDERS[c.name]),
      ),
    ).toEqual([true, false, false])
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

  it("exempts the four real directories and nothing that merely shares a name", () => {
    // Each exemption is a promise that a real directory is unreachable from a
    // request. A renamed or deleted one turns the promise into a no-op nobody
    // notices, so the promise is checked against the disk.
    for (const path of SKIP_PATHS) {
      expect(
        existsSync(join(BETA_ROOT, path)),
        `${path} still exists — an exemption for a directory that is gone is dead weight, and one for a renamed directory silently stopped exempting it`,
      ).toBe(true)
    }

    // And the anchoring itself: a `scripts` folder somewhere inside `app/` is a
    // request path, not operator tooling, and must be scanned. This is the
    // basename-matching hole, reproduced on a throwaway tree.
    const root = mkdtempSync(join(tmpdir(), "skip-paths-"))
    mkdirSync(join(root, "scripts"), { recursive: true })
    mkdirSync(join(root, "app", "scripts"), { recursive: true })
    writeFileSync(
      join(root, "scripts", "seed.ts"),
      "export const a = 1",
      "utf8",
    )
    writeFileSync(
      join(root, "app", "scripts", "action.ts"),
      "export const b = 2",
      "utf8",
    )

    const collected = collectProductionSources(root).map((file) =>
      relative(root, file).split("\\").join("/"),
    )
    expect(collected).toEqual(["app/scripts/action.ts"])

    rmSync(root, { recursive: true, force: true })
  })

  it("writes app_user through no raw SQL at all", () => {
    // Every spelling of the same statement, because this pattern is the whole
    // enforcement for the raw-SQL arm and each gap in it is a silent exemption:
    //
    //   quotes        `UPDATE "app_user" SET ...`     — what a copied psql session pastes
    //   schema        `UPDATE public.app_user SET`    — what pgAdmin and most ORMs emit
    //   both          `UPDATE "public"."app_user"`    — what pg_dump emits
    //   ONLY          `UPDATE ONLY app_user SET`      — valid Postgres, and inheritance-aware code writes it
    //   line breaks   `update\n  app_user\nset`       — what a formatter does to a long statement
    //   MERGE         `MERGE INTO app_user USING ...` — a writer since PG 15, and neither INSERT nor UPDATE
    //   comment       `UPDATE /* tenant */ app_user`  — what a query annotator injects
    //
    // The unquoted-single-token pattern this replaces matched two of the seven.
    //
    // Schema identifiers are `[a-z0-9_]+`, WITH THE DIGITS: `beta_v2.app_user`
    // is a legal qualified name and a letters-only class walks straight past it,
    // which is the same shape of gap as the one above.
    const IDENT = String.raw`"?[a-z0-9_]+"?`
    const GAP = String.raw`(?:\s|/\*[\s\S]*?\*\/|--[^\n]*\n)+`
    const pattern = new RegExp(
      String.raw`(?:insert\s+into|merge\s+into|update)${GAP}(?:only${GAP})?(?:${IDENT}\s*\.\s*)?"?app_user"?(?![\w"])`,
      "i",
    )
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

    for (const statement of [
      `UPDATE "app_user" SET is_staff = true`,
      `INSERT INTO "app_user" (email) VALUES ($1)`,
      `UPDATE public.app_user SET disabled_at = now()`,
      `INSERT INTO "public"."app_user" (email) VALUES ($1)`,
      `UPDATE ONLY app_user SET is_staff = true`,
      `update\n  app_user\nset email_verified = true`,
      `INSERT\n  INTO app_user (email)\n  VALUES ($1)`,
      // A qualified name with a DIGIT in it — `[a-z_]+` misses every schema
      // anybody ever versioned.
      `UPDATE beta_v2.app_user SET is_staff = true`,
      `INSERT INTO "beta_v2"."app_user" (email) VALUES ($1)`,
      // MERGE has been a writer since PG 15 and is neither INSERT nor UPDATE.
      `MERGE INTO app_user USING staged ON app_user.id = staged.id`,
      `merge into public.app_user u using staged s on u.id = s.id`,
      // Annotators inject a comment between the verb and the table.
      `UPDATE /* tenant: acme */ app_user SET is_staff = true`,
      `INSERT INTO -- audited\n app_user (email) VALUES ($1)`,
    ]) {
      expect(pattern.test(statement), statement).toBe(true)
    }

    // Without claiming a different table whose name merely starts the same, or
    // a statement that only READS the one it does claim.
    for (const innocent of [
      `UPDATE app_user_session SET x = 1`,
      `UPDATE "app_user_session" SET x = 1`,
      `UPDATE public.app_user_session SET x = 1`,
      `UPDATE beta_v2.app_user_session SET x = 1`,
      `MERGE INTO app_user_session USING staged ON true`,
      `SELECT * FROM app_user WHERE id = $1`,
      `DELETE FROM app_user WHERE id = $1`,
    ]) {
      expect(pattern.test(innocent), innocent).toBe(false)
    }
  })
})
