/**
 * RuleTester fixtures for workspace-rls/require-with-organization.
 *
 * Valid cases: files inside packages/db/src/ (excluded), calls that go
 * through the approved wrappers.
 *
 * Invalid cases: raw db.* calls, aliased imports, adminDb.* calls, and
 * sqlClient.* calls from outside packages/db/src/.
 */

import { test, describe, it } from "node:test"
import { RuleTester } from "eslint"
import rule from "../rules/require-with-organization.js"

RuleTester.describe = describe
RuleTester.it = it
RuleTester.itOnly = it.only

const tester = new RuleTester({
  languageOptions: {
    ecmaVersion: 2022,
    sourceType: "module",
  },
})

test("require-with-organization — valid cases", () => {
  tester.run("require-with-organization", rule, {
    valid: [
      // File inside packages/db/src/ — rule is excluded there
      {
        filename: "/repo/packages/db/src/tenancy.ts",
        code: `import { db } from './client.js'; db.select()`,
      },
      // Approved wrapper call: withOrganization
      {
        filename: "/repo/apps/web/src/api/route.ts",
        code: `withOrganization(orgId, userId, async (tx) => { await tx.select() })`,
      },
      // Approved wrapper call: withWorkspace
      {
        filename: "/repo/apps/web/src/api/route.ts",
        code: `withWorkspace(wsId, userId, async (tx) => { await tx.select() })`,
      },
      // Approved wrapper call: withAdminBypass
      {
        filename: "/repo/apps/web/src/api/route.ts",
        code: `withAdminBypass(async (tx) => { await tx.select() })`,
      },
      // Import from @workspace/db but not using a tracked specifier
      {
        filename: "/repo/apps/web/src/api/route.ts",
        code: `import { withOrganization } from '@workspace/db'; withOrganization(id, uid, fn)`,
      },
      // Non-db identifier that happens to end in Db but is not imported
      {
        filename: "/repo/apps/web/src/api/route.ts",
        code: `const scratchDb = new SomethingElse(); scratchDb.open()`,
      },
    ],
    invalid: [],
  })
})

test("require-with-organization — invalid: raw db.select() outside db package", () => {
  tester.run("require-with-organization", rule, {
    valid: [],
    invalid: [
      {
        filename: "/repo/apps/web/src/api/route.ts",
        code: `import { db } from '@workspace/db'; db.select()`,
        errors: [{ messageId: "noRawDb" }],
      },
    ],
  })
})

test("require-with-organization — invalid: aliased import bypass", () => {
  tester.run("require-with-organization", rule, {
    valid: [],
    invalid: [
      {
        filename: "/repo/apps/web/src/api/route.ts",
        code: `import { db as client } from '@workspace/db'; client.select()`,
        errors: [{ messageId: "noRawDb" }],
      },
    ],
  })
})

test("require-with-organization — invalid: aliased import from subpath", () => {
  tester.run("require-with-organization", rule, {
    valid: [],
    invalid: [
      {
        filename: "/repo/apps/web/src/api/route.ts",
        code: `import { db as myDb } from '@workspace/db/client'; myDb.insert()`,
        errors: [{ messageId: "noRawDb" }],
      },
    ],
  })
})

test("require-with-organization — invalid: bare adminDb.execute() outside db package", () => {
  tester.run("require-with-organization", rule, {
    valid: [],
    invalid: [
      {
        filename: "/repo/apps/web/src/api/route.ts",
        code: `adminDb.execute(sql\`SELECT 1\`)`,
        errors: [{ messageId: "noRawDb" }],
      },
    ],
  })
})

test("require-with-organization — invalid: sqlClient direct use", () => {
  tester.run("require-with-organization", rule, {
    valid: [],
    invalid: [
      {
        filename: "/repo/packages/some-pkg/src/index.ts",
        code: `import { sqlClient } from '@workspace/db'; sqlClient.execute(sql\`SELECT 1\`)`,
        errors: [{ messageId: "noRawDb" }],
      },
    ],
  })
})

test("require-with-organization — invalid: db.transaction() outside db package", () => {
  tester.run("require-with-organization", rule, {
    valid: [],
    invalid: [
      {
        filename: "/repo/apps/web/src/api/route.ts",
        code: `import { db } from '@workspace/db'; db.transaction(async (tx) => tx.select())`,
        errors: [{ messageId: "noRawDb" }],
      },
    ],
  })
})

