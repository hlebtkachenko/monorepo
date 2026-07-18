/**
 * RuleTester fixtures for org-tree/no-cross-org-tree-import.
 *
 * Valid: files outside both org trees, imports of shared code (@workspace/*,
 * apps/web/lib), and same-tree imports (alias + relative).
 *
 * Invalid: new -> old and old -> new edges via alias, relative path, and
 * dynamic import.
 */

import { test, describe, it } from "node:test"
import { RuleTester } from "eslint"
import rule from "../rules/no-cross-org-tree-import.js"

RuleTester.describe = describe
RuleTester.it = it
RuleTester.itOnly = it.only

const NEW = "/repo/apps/web/app/o/[orgSlug]/layout.tsx"
const OLD = "/repo/apps/web/app/[orgSlug]/layout.tsx"
const OUTSIDE = "/repo/apps/web/app/_components/org-shell.tsx"

const tester = new RuleTester({
  languageOptions: {
    ecmaVersion: 2022,
    sourceType: "module",
  },
})

test("no-cross-org-tree-import — valid cases", () => {
  tester.run("no-cross-org-tree-import", rule, {
    valid: [
      // New tree importing the design system — shared, allowed.
      {
        filename: NEW,
        code: `import { AppShell } from '@workspace/ui/blocks/app-shell'`,
      },
      // New tree importing an extracted shared lib — allowed.
      {
        filename: NEW,
        code: `import { resolveActivePeriod } from '@/lib/org/period'`,
      },
      // New tree importing its own tree via relative path — allowed.
      {
        filename: NEW,
        code: `import { OrgShell } from './_shell/org-shell'`,
      },
      // New tree importing its own tree via alias — allowed.
      {
        filename: NEW,
        code: `import { orgRailNav } from '@/app/o/[orgSlug]/_nav/org-nav'`,
      },
      // Old tree importing shared code — allowed.
      {
        filename: OLD,
        code: `import { safeNext } from '@/lib/safe-next'`,
      },
      // A file in neither tree may import the old tree freely.
      {
        filename: OUTSIDE,
        code: `import { orgRailNav } from '@/app/[orgSlug]/_nav/org-nav'`,
      },
    ],
    invalid: [],
  })
})

test("no-cross-org-tree-import — invalid: new -> old via alias", () => {
  tester.run("no-cross-org-tree-import", rule, {
    valid: [],
    invalid: [
      {
        filename: NEW,
        code: `import { getOrgAccountingContext } from '@/app/[orgSlug]/_lib/accounting-data'`,
        errors: [{ messageId: "newToOld" }],
      },
    ],
  })
})

test("no-cross-org-tree-import — invalid: new -> old via relative path", () => {
  tester.run("no-cross-org-tree-import", rule, {
    valid: [],
    invalid: [
      {
        filename: NEW,
        code: `import { getHeaderPeriods } from '../../[orgSlug]/_lib/header-periods'`,
        errors: [{ messageId: "newToOld" }],
      },
    ],
  })
})

test("no-cross-org-tree-import — invalid: new -> old via dynamic import", () => {
  tester.run("no-cross-org-tree-import", rule, {
    valid: [],
    invalid: [
      {
        filename: NEW,
        code: `const m = import('@/app/[orgSlug]/_lib/accounting-data')`,
        errors: [{ messageId: "newToOld" }],
      },
    ],
  })
})

test("no-cross-org-tree-import — invalid: old -> new via alias", () => {
  tester.run("no-cross-org-tree-import", rule, {
    valid: [],
    invalid: [
      {
        filename: OLD,
        code: `import { OrgShell } from '@/app/o/[orgSlug]/_shell/org-shell'`,
        errors: [{ messageId: "oldToNew" }],
      },
    ],
  })
})
