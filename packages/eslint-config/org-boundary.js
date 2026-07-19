import tseslint from "typescript-eslint"

import noCrossOrgTreeImport from "./rules/no-cross-org-tree-import.js"

/**
 * Warning-immune deletion-safety gate for the org UI rebuild.
 *
 * The shared `base` config registers `eslint-plugin-only-warn`, which downgrades
 * EVERY rule (including `org-tree/no-cross-org-tree-import`) to a warning. The
 * app's main `lint` runs bare `eslint` with no `--max-warnings`, so those
 * warnings never fail CI. The only blocking org-tree gate today is
 * `lint:org-new` (`eslint app/o --max-warnings 0`), scoped to the warning-clean
 * new tree — it cannot cover the outside surface (which carries unrelated
 * warnings, so `--max-warnings 0` there is infeasible).
 *
 * This config is the answer: a standalone flat config that does NOT extend base
 * (no `only-warn`) and enables ONLY `no-cross-org-tree-import` as a hard error.
 * A single forbidden `outside -> old` / `new -> old` / `old -> new` import fails
 * the gate independent of ambient warning noise. Consumed by `apps/web`'s
 * `lint:org-orphan` script via `eslint -c`.
 *
 * Green here = machine proof that no file outside the frozen old tree imports
 * into it (scripts/* generators exempted until the flip), i.e. the old tree's
 * runtime surface can be deleted without breaking any consumer.
 */
export default [
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      parser: tseslint.parser,
      ecmaVersion: 2022,
      sourceType: "module",
    },
    plugins: {
      "org-tree": {
        rules: { "no-cross-org-tree-import": noCrossOrgTreeImport },
      },
    },
    rules: {
      "org-tree/no-cross-org-tree-import": "error",
    },
  },
]
