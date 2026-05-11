/**
 * RuleTester fixtures for workspace-rls/no-set-local-outside-wrapper.
 *
 * Valid cases: strings inside packages/db/src/, strings that don't match
 * the forbidden patterns.
 *
 * Invalid cases: string literals containing SET LOCAL app.* or set_config
 * calls with 'app.' prefix, in template literals, outside packages/db/src/.
 */

import { test, describe, it } from "node:test"
import { RuleTester } from "eslint"
import rule from "../rules/no-set-local-outside-wrapper.js"

RuleTester.describe = describe
RuleTester.it = it
RuleTester.itOnly = it.only

const tester = new RuleTester({
  languageOptions: {
    ecmaVersion: 2022,
    sourceType: "module",
  },
})

test("no-set-local-outside-wrapper — valid cases", () => {
  tester.run("no-set-local-outside-wrapper", rule, {
    valid: [
      // File inside packages/db/src/ — rule excluded there
      {
        filename: "/repo/packages/db/src/tenancy.ts",
        code: `const q = "SELECT set_config('app.organization_id', $1, true)"`,
      },
      // Unrelated string — does not match pattern
      {
        filename: "/repo/apps/web/src/api/route.ts",
        code: `const msg = "SET timeout = 30"`,
      },
      // Unrelated set_config call — different prefix
      {
        filename: "/repo/apps/web/src/api/route.ts",
        code: `const q = "SELECT set_config('my.custom', $1, true)"`,
      },
      // Plain assignment, no SQL
      {
        filename: "/repo/apps/web/src/api/route.ts",
        code: `const x = 42`,
      },
    ],
    invalid: [],
  })
})

test("no-set-local-outside-wrapper — invalid: SET LOCAL app. in string literal", () => {
  tester.run("no-set-local-outside-wrapper", rule, {
    valid: [],
    invalid: [
      {
        filename: "/repo/apps/web/src/api/route.ts",
        code: `const q = "SET LOCAL app.organization_id = 'abc'"`,
        errors: [{ messageId: "noSetLocal" }],
      },
    ],
  })
})

test("no-set-local-outside-wrapper — invalid: set_config('app.X') in string literal", () => {
  tester.run("no-set-local-outside-wrapper", rule, {
    valid: [],
    invalid: [
      {
        filename: "/repo/apps/web/src/api/route.ts",
        code: `const q = "SELECT set_config('app.organization_id', val, true)"`,
        errors: [{ messageId: "noSetLocal" }],
      },
    ],
  })
})

test("no-set-local-outside-wrapper — invalid: SET LOCAL app. in template literal quasi", () => {
  tester.run("no-set-local-outside-wrapper", rule, {
    valid: [],
    invalid: [
      {
        filename: "/repo/apps/web/src/api/route.ts",
        code: "const q = `SET LOCAL app.workspace_id = '${id}'`",
        errors: [{ messageId: "noSetLocal" }],
      },
    ],
  })
})

test("no-set-local-outside-wrapper — invalid: set_config in template literal quasi", () => {
  tester.run("no-set-local-outside-wrapper", rule, {
    valid: [],
    invalid: [
      {
        filename: "/repo/apps/web/src/api/route.ts",
        code: "const q = `SELECT set_config('app.user_id', '${uid}', true)`",
        errors: [{ messageId: "noSetLocal" }],
      },
    ],
  })
})

test("no-set-local-outside-wrapper — invalid: case-insensitive SET LOCAL", () => {
  tester.run("no-set-local-outside-wrapper", rule, {
    valid: [],
    invalid: [
      {
        filename: "/repo/apps/web/src/api/route.ts",
        code: `const q = "set local app.organization_id = '123'"`,
        errors: [{ messageId: "noSetLocal" }],
      },
    ],
  })
})

