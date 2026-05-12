import js from "@eslint/js"
import eslintConfigPrettier from "eslint-config-prettier"
import onlyWarn from "eslint-plugin-only-warn"
import turboPlugin from "eslint-plugin-turbo"
import tseslint from "typescript-eslint"
import requireWithOrganization from "./rules/require-with-organization.js"
import noSetLocalOutsideWrapper from "./rules/no-set-local-outside-wrapper.js"
import singleAuditWriter from "./rules/single-audit-writer.js"
import noBareRoleIdentifier from "./rules/no-bare-role-identifier.js"

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
          selector:
            "ImportDeclaration[source.value=/^\\.\\.?\\/.*\\.js$/]",
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
          selector:
            "ExportAllDeclaration[source.value=/^\\.\\.?\\/.*\\.js$/]",
          message:
            "Relative TS barrel re-exports must omit the .js extension (ADR-0015 — Bundler resolution).",
        },
      ],
    },
  },
]
