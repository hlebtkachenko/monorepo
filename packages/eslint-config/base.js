import js from "@eslint/js"
import eslintConfigPrettier from "eslint-config-prettier"
import onlyWarn from "eslint-plugin-only-warn"
import turboPlugin from "eslint-plugin-turbo"
import tseslint from "typescript-eslint"
import requireWithOrganization from "./rules/require-with-organization.js"
import noSetLocalOutsideWrapper from "./rules/no-set-local-outside-wrapper.js"
import singleAuditWriter from "./rules/single-audit-writer.js"
import noBareRoleIdentifier from "./rules/no-bare-role-identifier.js"
import noLeakedAfkey from "./rules/no-leaked-afkey.js"

/**
 * workspace-rls flat-config plugin.
 *
 * Rules:
 *   require-with-organization  — forbids raw db.* outside packages/db/src/
 *   no-set-local-outside-wrapper — forbids bare SET LOCAL app.* GUC strings
 *   single-audit-writer        — forbids direct insert/update on tool_call_log
 *   no-bare-role-identifier    — advisory; prefers workspaceRole/organizationRole
 *
 * Applied only to packages/ and apps/ source files. Excluded: migrations/,
 * scripts/, test files, and the ESLint config package itself.
 */
const workspaceRlsPlugin = {
  rules: {
    "require-with-organization": requireWithOrganization,
    "no-set-local-outside-wrapper": noSetLocalOutsideWrapper,
    "single-audit-writer": singleAuditWriter,
    "no-bare-role-identifier": noBareRoleIdentifier,
    "no-leaked-afkey": noLeakedAfkey,
  },
}

/**
 * Type-checked override: enables the two promise-correctness rules that
 * require TypeScript type information. Kept deliberately narrow — we do NOT
 * flip on the full `recommendedTypeChecked` preset.
 *
 * `files` is `**\/*.{ts,tsx}` (not `apps\/**` / `packages\/**`): every
 * consuming package runs `eslint` with its own directory as cwd, so a
 * `apps\/**` prefix would never match — a linted file there resolves to
 * `app\/page.tsx` relative to that cwd. A cwd-relative `**` glob is the only
 * pattern that takes effect uniformly across packages.
 *
 * `projectService: true` makes typescript-eslint discover the nearest
 * `tsconfig.json` for each linted file automatically; `tsconfigRootDir` is
 * the fallback root and is set to the ESLint process cwd (the consuming
 * package), since `base.js` itself lives in `packages/eslint-config/`.
 *
 * `ignores` also excludes files that are NOT part of any package's tsconfig
 * `include` — config files (`*.config.ts`, `.storybook/**`, `vitest.*`) and
 * `tests/` helper dirs. `projectService` raises a hard parsing error for any
 * linted file the TS project graph does not own, so those must be excluded.
 *
 * Gated OFF under lefthook (the `LEFTHOOK` env var is set during hook runs):
 * `projectService` must build the TS project graph before it can lint even a
 * single staged file, which is too slow for a pre-commit hook. CI's
 * `pnpm lint` runs without `LEFTHOOK` and therefore applies the full rules.
 */
const typeCheckedOverride = {
  files: ["**/*.{ts,tsx}"],
  ignores: [
    "**/*.test.*",
    "**/*.spec.*",
    "**/*.stories.*",
    "**/*.config.*",
    "**/*.d.ts",
    "**/.storybook/**",
    "**/tests/**",
    "**/scripts/**",
    "**/migrations/**",
    "**/vitest.setup.*",
    "**/vitest.workspace.*",
    "**/vitest-env.d.ts",
  ],
  languageOptions: {
    parserOptions: {
      projectService: true,
      tsconfigRootDir: process.cwd(),
    },
  },
  rules: {
    "@typescript-eslint/no-floating-promises": "error",
    "@typescript-eslint/no-misused-promises": "error",
  },
}

/**
 * A shared ESLint configuration for the repository.
 *
 * @type {import("eslint").Linter.Config}
 * */
export const config = [
  js.configs.recommended,
  eslintConfigPrettier,
  ...tseslint.configs.recommended,
  {
    plugins: {
      turbo: turboPlugin,
    },
    rules: {
      "turbo/no-undeclared-env-vars": "warn",
    },
  },
  // Configure no-unused-vars to ignore underscore-prefixed identifiers.
  // This covers: intentionally-unused destructured params (_index, _type,
  // _props, _options), type-only module-augmentation generics (_TData, _TVal),
  // and array placeholder destructures. Applied via both the TS and base rule
  // so it works regardless of which config layer wins.
  {
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          destructuredArrayIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
    },
  },
  {
    plugins: {
      onlyWarn,
    },
  },
  {
    ignores: ["dist/**", ".next/**", "**/.turbo/**", "**/coverage/**"],
  },
  // workspace-rls rules: source files under packages/ and apps/ only.
  // Excluded scopes:
  //   **/migrations/**   — raw SQL runner files; db.* calls are intentional
  //   **/scripts/**      — migration runner and one-off scripts use raw postgres client
  //   **/*.test.*        — tests exercise internals directly
  //   **/*.spec.*        — same
  //   **/eslint-config/**— the config package itself must not self-apply
  {
    files: ["packages/**/*.{ts,tsx,js,mjs}", "apps/**/*.{ts,tsx,js,mjs}"],
    ignores: [
      "**/migrations/**",
      "**/scripts/**",
      "**/*.test.ts",
      "**/*.test.tsx",
      "**/*.spec.ts",
      "**/*.spec.tsx",
      "packages/eslint-config/**",
    ],
    plugins: {
      "workspace-rls": workspaceRlsPlugin,
    },
    rules: {
      "workspace-rls/require-with-organization": "error",
      "workspace-rls/no-set-local-outside-wrapper": "error",
      "workspace-rls/single-audit-writer": "error",
      "workspace-rls/no-leaked-afkey": "error",
      // Advisory: registered under onlyWarn — fires as warning in the base
      // config and is downgraded to warn by eslint-plugin-only-warn.
      "workspace-rls/no-bare-role-identifier": "warn",
    },
  },
  // ADR-0015: monorepo uniformly uses Bundler moduleResolution. Relative
  // imports + re-exports MUST omit the `.js` extension. Turbopack does
  // not resolve `.js` -> `.ts` in transpilePackages; an extension here
  // breaks `pnpm --filter web build`. The rule applies to every .ts/.tsx
  // file linted by the shared config; real `.js` files (postcss configs,
  // ESLint configs, generated build artefacts) are untouched because the
  // selector only matches `.js`-suffixed RELATIVE imports.
  {
    files: ["**/*.ts", "**/*.tsx"],
    ignores: [
      "**/migrations/**",
      "**/scripts/**",
      "**/*.test.ts",
      "**/*.test.tsx",
      "**/*.spec.ts",
      "**/*.spec.tsx",
    ],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: "ImportDeclaration[source.value=/^\\.\\.?\\/.*\\.js$/]",
          message:
            "Relative TS imports must omit the .js extension (ADR-0015 — Bundler resolution).",
        },
        {
          selector:
            "ExportNamedDeclaration[source.value=/^\\.\\.?\\/.*\\.js$/]",
          message:
            "Relative TS re-exports must omit the .js extension (ADR-0015 — Bundler resolution).",
        },
        {
          selector: "ExportAllDeclaration[source.value=/^\\.\\.?\\/.*\\.js$/]",
          message:
            "Relative TS barrel re-exports must omit the .js extension (ADR-0015 — Bundler resolution).",
        },
      ],
    },
  },
  // Block-internal imports are private. Consumer code (apps + other packages)
  // must import a UI block via its index (`@workspace/ui/blocks/<block>`), never
  // a deep internal module. This is the ENFORCEMENT BOUNDARY for the ContentBody
  // archetype-blocker: the archetype minter/registry live in
  // `content-panel/content-body/archetypes/*` and must stay unreachable, or the
  // "only a branded Archetype can be a body" gate is bypassed by a deep import
  // of `defineArchetype`. Block internals themselves use relative paths, so this
  // (alias-only) rule never fires inside packages/ui.
  {
    files: ["**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@workspace/ui/blocks/*/*", "@workspace/ui/blocks/*/**"],
              message:
                "Import UI blocks from their index (@workspace/ui/blocks/<block>), not internal modules. Block internals (e.g. the archetype minter/registry) are private by design.",
            },
          ],
        },
      ],
    },
  },
  // Type-checked promise-correctness rules. Excluded under lefthook to keep
  // the pre-commit hook fast (see typeCheckedOverride doc comment above).
  ...(process.env.LEFTHOOK ? [] : [typeCheckedOverride]),
]
