/**
 * RuleTester fixtures for workspace-rls/single-audit-writer.
 *
 * Valid cases: files inside packages/db/src/audit/, insert/update on other
 * tables, no tool_call_log argument.
 *
 * Invalid cases: .insert(tool_call_log) or .update(tool_call_log) calls
 * outside packages/db/src/audit/.
 */

import { test, describe, it } from "node:test"
import { RuleTester } from "eslint"
import rule from "../rules/single-audit-writer.js"

RuleTester.describe = describe
RuleTester.it = it
RuleTester.itOnly = it.only

const tester = new RuleTester({
  languageOptions: {
    ecmaVersion: 2022,
    sourceType: "module",
  },
})

test("single-audit-writer — valid cases", () => {
  tester.run("single-audit-writer", rule, {
    valid: [
      // Inside the audit module itself — excluded
      {
        filename: "/repo/packages/db/src/audit/writer.ts",
        code: `tx.insert(tool_call_log).values(row)`,
      },
      // Insert on a different table
      {
        filename: "/repo/apps/web/src/api/route.ts",
        code: `tx.insert(organization).values(data)`,
      },
      // Update on a different table
      {
        filename: "/repo/apps/web/src/api/route.ts",
        code: `tx.update(app_user).set({ name: "x" }).where(eq(app_user.id, id))`,
      },
      // Select on tool_call_log — only insert/update are blocked
      {
        filename: "/repo/apps/web/src/api/route.ts",
        code: `tx.select().from(tool_call_log).where(eq(tool_call_log.id, id))`,
      },
      // Insert with no arguments (edge case — no arg to match)
      {
        filename: "/repo/apps/web/src/api/route.ts",
        code: `tx.insert()`,
      },
    ],
    invalid: [],
  })
})

test("single-audit-writer — invalid: tx.insert(tool_call_log) outside audit module", () => {
  tester.run("single-audit-writer", rule, {
    valid: [],
    invalid: [
      {
        filename: "/repo/apps/web/src/api/route.ts",
        code: `tx.insert(tool_call_log).values(row)`,
        errors: [{ messageId: "noDirectAuditWrite" }],
      },
    ],
  })
})

test("single-audit-writer — invalid: db.insert(tool_call_log) outside audit module", () => {
  tester.run("single-audit-writer", rule, {
    valid: [],
    invalid: [
      {
        filename: "/repo/packages/some-pkg/src/index.ts",
        code: `db.insert(tool_call_log).values(row)`,
        errors: [{ messageId: "noDirectAuditWrite" }],
      },
    ],
  })
})

test("single-audit-writer — invalid: tx.update(tool_call_log) outside audit module", () => {
  tester.run("single-audit-writer", rule, {
    valid: [],
    invalid: [
      {
        filename: "/repo/apps/web/src/workers/job.ts",
        code: `tx.update(tool_call_log).set({ output_json: result }).where(eq(tool_call_log.id, id))`,
        errors: [{ messageId: "noDirectAuditWrite" }],
      },
    ],
  })
})

test("single-audit-writer — invalid: chained .insert(tool_call_log).values() call", () => {
  tester.run("single-audit-writer", rule, {
    valid: [],
    invalid: [
      {
        filename: "/repo/apps/api/src/handlers/some-handler.ts",
        code: `await boundDb.insert(tool_call_log).values({ tool_name: 'x', idempotency_key: 'k', actor_kind: 'human', input_json: {} })`,
        errors: [{ messageId: "noDirectAuditWrite" }],
      },
    ],
  })
})

