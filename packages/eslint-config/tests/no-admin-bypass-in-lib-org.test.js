/**
 * RuleTester fixtures for workspace-rls/no-admin-bypass-in-lib-org.
 *
 * Valid: files outside apps/web/lib/org (rule no-ops), and the three genuinely
 * cross-scope reads in the org lib, each carrying an inline or directly-above
 * `rls-allow-admin-bypass` marker (resolveMembership, otherOrgs, getHeaderUser).
 *
 * Invalid: a new unmarked withAdminBypass added under apps/web/lib/org — both a
 * fresh file and a second call in a file that already has an allowlisted one.
 */

import { test, describe, it } from "node:test"
import { RuleTester } from "eslint"
import rule from "../rules/no-admin-bypass-in-lib-org.js"

RuleTester.describe = describe
RuleTester.it = it
RuleTester.itOnly = it.only

const HEADER = "/repo/apps/web/lib/org/header.ts"
const RESOLVE = "/repo/apps/web/lib/org/resolve.ts"
const OUTSIDE = "/repo/apps/web/app/o/[orgSlug]/layout.tsx"

const tester = new RuleTester({
  languageOptions: {
    ecmaVersion: 2022,
    sourceType: "module",
  },
})

test("no-admin-bypass-in-lib-org — valid cases", () => {
  tester.run("no-admin-bypass-in-lib-org", rule, {
    valid: [
      // Outside apps/web/lib/org: the rule no-ops even on a raw withAdminBypass.
      {
        filename: OUTSIDE,
        code: `const x = await withAdminBypass(async (db) => db.select())`,
      },
      // resolveMembership: marker on the line directly above the call.
      {
        filename: RESOLVE,
        code: [
          `export async function resolveMembership() {`,
          `  // rls-allow-admin-bypass: cross-workspace slug lookup before any org id exists.`,
          `  return await withAdminBypass(async (db) => db.select())`,
          `}`,
        ].join("\n"),
      },
      // getHeaderUser: marker directly above a `const row = await ...` call.
      {
        filename: HEADER,
        code: [
          `export async function getHeaderUser() {`,
          `  // rls-allow-admin-bypass: global app_user identity read, no org scope.`,
          `  const row = await withAdminBypass(async (db) => db.select())`,
          `  return row`,
          `}`,
        ].join("\n"),
      },
      // otherOrgs: inline marker on the same line as the call.
      {
        filename: HEADER,
        code: `const otherOrgs = await withAdminBypass(async (db) => db.select()) // rls-allow-admin-bypass: cross-workspace org-switcher list`,
      },
    ],
    invalid: [],
  })
})

test("no-admin-bypass-in-lib-org — invalid: unmarked withAdminBypass in a lib/org file", () => {
  tester.run("no-admin-bypass-in-lib-org", rule, {
    valid: [],
    invalid: [
      {
        filename: HEADER,
        code: `const x = await withAdminBypass(async (db) => db.select())`,
        errors: [{ messageId: "banned" }],
      },
    ],
  })
})

test("no-admin-bypass-in-lib-org — invalid: a second unmarked call in an already-allowlisted file", () => {
  tester.run("no-admin-bypass-in-lib-org", rule, {
    valid: [],
    invalid: [
      {
        filename: HEADER,
        code: [
          `// rls-allow-admin-bypass: global app_user identity read.`,
          `const a = await withAdminBypass(async (db) => db.select())`,
          `const b = await withAdminBypass(async (db) => db.select())`,
        ].join("\n"),
        // Only the second (unmarked) call is flagged; the first is exempted.
        errors: [{ messageId: "banned" }],
      },
    ],
  })
})

// An unrelated comment that merely lives above the call is not the marker.
test("no-admin-bypass-in-lib-org — invalid: non-marker comment does not exempt", () => {
  tester.run("no-admin-bypass-in-lib-org", rule, {
    valid: [],
    invalid: [
      {
        filename: RESOLVE,
        code: [
          `// look up the org by slug`,
          `const x = await withAdminBypass(async (db) => db.select())`,
        ].join("\n"),
        errors: [{ messageId: "banned" }],
      },
    ],
  })
})
