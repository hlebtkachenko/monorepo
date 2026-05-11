/**
 * RuleTester fixtures for workspace-rls/no-bare-role-identifier.
 *
 * Valid cases: non-shorthand `{ role: value }`, non-CallExpression parent,
 * property names other than 'role'.
 *
 * Invalid cases: shorthand `{ role }` as argument to a CallExpression
 * (db.select({ role }), db.insert(table).values({ role }), etc.).
 */

import { test, describe, it } from "node:test"
import { RuleTester } from "eslint"
import rule from "../rules/no-bare-role-identifier.js"

RuleTester.describe = describe
RuleTester.it = it
RuleTester.itOnly = it.only

const tester = new RuleTester({
  languageOptions: {
    ecmaVersion: 2022,
    sourceType: "module",
  },
})

test("no-bare-role-identifier — valid cases", () => {
  tester.run("no-bare-role-identifier", rule, {
    valid: [
      // Non-shorthand property — explicit value, not bare identifier
      {
        code: `db.select({ role: workspaceRole })`,
      },
      // Object not passed as CallExpression argument — standalone object literal
      {
        code: `const obj = { role }`,
      },
      // Shorthand for a different property name
      {
        code: `db.select({ workspaceRole })`,
      },
      // Shorthand 'role' in a non-call context (e.g. array)
      {
        code: `const arr = [{ role }]`,
      },
      // Function parameter destructuring — not an object literal in a call
      {
        code: `function foo({ role }) { return role }`,
      },
    ],
    invalid: [],
  })
})

test("no-bare-role-identifier — invalid: shorthand role in db.select call", () => {
  tester.run("no-bare-role-identifier", rule, {
    valid: [],
    invalid: [
      {
        code: `db.select({ role })`,
        errors: [{ messageId: "noBareRole" }],
      },
    ],
  })
})

test("no-bare-role-identifier — invalid: shorthand role in tx.select call", () => {
  tester.run("no-bare-role-identifier", rule, {
    valid: [],
    invalid: [
      {
        code: `tx.select({ role })`,
        errors: [{ messageId: "noBareRole" }],
      },
    ],
  })
})

test("no-bare-role-identifier — invalid: shorthand role in .values() call", () => {
  tester.run("no-bare-role-identifier", rule, {
    valid: [],
    invalid: [
      {
        code: `db.insert(app_user).values({ role })`,
        errors: [{ messageId: "noBareRole" }],
      },
    ],
  })
})

test("no-bare-role-identifier — invalid: shorthand role in arbitrary function call", () => {
  tester.run("no-bare-role-identifier", rule, {
    valid: [],
    invalid: [
      {
        code: `someQueryFn({ role })`,
        errors: [{ messageId: "noBareRole" }],
      },
    ],
  })
})

