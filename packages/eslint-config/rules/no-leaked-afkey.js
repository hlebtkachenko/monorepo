/**
 * workspace-rls/no-leaked-afkey
 *
 * Forbids any literal `afkey-<43 base62>-<8 hex>` token from appearing in
 * committed source. Real tokens are runtime-only artifacts; their presence
 * in code is either a copy-paste accident from a debugging session or a
 * test fixture that should be generated via `mintToken(...)` instead.
 *
 * Mirrors the public secret-scanner regex in
 * `packages/auth/src/tokens/format.ts` (AFKEY_REGEX) and the gitleaks
 * pattern in `.gitleaks.toml`. The three layers are intentional: the
 * ESLint rule catches the developer at lint time, gitleaks catches the
 * commit at hook time, and GitHub Push Protection catches the push at
 * upload time.
 *
 * Scans both string and template literals so a token escaped into a
 * template string still trips the rule. Comments are not scanned —
 * pasting a redacted example into a comment is acceptable; this rule is
 * about preventing live tokens from entering the repo.
 *
 * ESM rule (flat config).
 */

// Match the body of a token anywhere inside a literal; do NOT anchor the
// regex so a token embedded mid-string still trips. The format is fixed by
// ADR-0022 — see also packages/auth/src/tokens/format.ts.
const AFKEY_PATTERN = /afkey-[0-9A-Za-z]{43}-[0-9a-f]{8}/

/** @type {import('eslint').Rule.RuleModule} */
export default {
  meta: {
    type: "problem",
    docs: {
      description:
        "Forbid literal afkey-... tokens in source. Use mintToken() at runtime; redact in tests.",
      recommended: true,
    },
    schema: [],
    messages: {
      leakedAfkey:
        "Literal afkey- token detected. Real tokens must never enter source " +
        "control. Generate via mintToken() in test setup, or redact this value.",
    },
  },

  create(context) {
    return {
      Literal(node) {
        if (typeof node.value !== "string") return
        if (!AFKEY_PATTERN.test(node.value)) return
        context.report({ node, messageId: "leakedAfkey" })
      },
      TemplateElement(node) {
        const raw = node.value && node.value.cooked
        if (typeof raw !== "string") return
        if (!AFKEY_PATTERN.test(raw)) return
        context.report({ node, messageId: "leakedAfkey" })
      },
    }
  },
}
