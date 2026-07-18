/**
 * RuleTester fixtures for org-tree/no-loose-org-tree-folder.
 *
 * Valid: files under `_shell/` (and its non-underscore descendants), under
 * `_nav/`, plain route files/folders, and anything outside the new org tree
 * (including the frozen OLD tree's `_components/`, which this rule does not
 * police).
 *
 * Invalid: any underscore-prefixed folder in the new tree other than
 * `_shell`/`_nav` — a top-level `_components/`, a `_lib/`, and a nested
 * `company/_components/` (loose at any depth).
 *
 * The rule keys off the file path, so the `code` body is irrelevant — a
 * trivial statement is enough to trigger the `Program` visitor.
 */

import { test, describe, it } from "node:test"
import { RuleTester } from "eslint"
import rule from "../rules/no-loose-org-tree-folder.js"

RuleTester.describe = describe
RuleTester.it = it
RuleTester.itOnly = it.only

const ROOT = "/repo/apps/web/app/o/[orgSlug]"
const CODE = "export const x = 1"

const tester = new RuleTester({
  languageOptions: { ecmaVersion: 2022, sourceType: "module" },
})

test("no-loose-org-tree-folder — valid cases", () => {
  tester.run("no-loose-org-tree-folder", rule, {
    valid: [
      // _shell chrome (nested anatomy folders are not underscore-prefixed).
      {
        filename: `${ROOT}/_shell/app-body/app-content/content-header/favorite-page-header.tsx`,
        code: CODE,
      },
      { filename: `${ROOT}/_shell/org-shell.tsx`, code: CODE },
      // _nav is allowed.
      { filename: `${ROOT}/_nav/org-nav.ts`, code: CODE },
      // Plain route files + non-underscore route folders.
      { filename: `${ROOT}/page.tsx`, code: CODE },
      { filename: `${ROOT}/company/periods/page.tsx`, code: CODE },
      // Frozen OLD tree — not governed by this rule.
      {
        filename: "/repo/apps/web/app/[orgSlug]/_components/foo.tsx",
        code: CODE,
      },
      // Outside both trees.
      {
        filename: "/repo/apps/web/app/_components/org-shell.tsx",
        code: CODE,
      },
    ],
    invalid: [],
  })
})

test("no-loose-org-tree-folder — invalid: flat _components/ (old-tree pattern)", () => {
  tester.run("no-loose-org-tree-folder", rule, {
    valid: [],
    invalid: [
      {
        filename: `${ROOT}/_components/favorites-overview.tsx`,
        code: CODE,
        errors: [{ messageId: "loose", data: { folder: "_components" } }],
      },
    ],
  })
})

test("no-loose-org-tree-folder — invalid: other loose _folder (_lib)", () => {
  tester.run("no-loose-org-tree-folder", rule, {
    valid: [],
    invalid: [
      {
        filename: `${ROOT}/_lib/thing.ts`,
        code: CODE,
        errors: [{ messageId: "loose", data: { folder: "_lib" } }],
      },
    ],
  })
})

test("no-loose-org-tree-folder — invalid: loose _components nested under a route", () => {
  tester.run("no-loose-org-tree-folder", rule, {
    valid: [],
    invalid: [
      {
        filename: `${ROOT}/company/_components/thing.tsx`,
        code: CODE,
        errors: [{ messageId: "loose", data: { folder: "_components" } }],
      },
    ],
  })
})
