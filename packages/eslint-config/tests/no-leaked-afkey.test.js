/**
 * RuleTester fixtures for workspace-rls/no-leaked-afkey.
 *
 * Valid cases: code without a literal afkey-... token, partial / mangled
 * forms, comments containing the regex but not a real token.
 *
 * Invalid cases: string literals and template literals that embed a token
 * matching the public regex.
 */

import { test, describe, it } from "node:test"
import { RuleTester } from "eslint"
import rule from "../rules/no-leaked-afkey.js"

RuleTester.describe = describe
RuleTester.it = it
RuleTester.itOnly = it.only

const tester = new RuleTester({
  languageOptions: {
    ecmaVersion: 2022,
    sourceType: "module",
  },
})

// 43-char base62 body and 8-char hex checksum — same shape as the production
// regex requires. Synthetic, not a real token.
const SAMPLE_BODY = "a".repeat(43)
const SAMPLE_CHECKSUM = "deadbeef"
const SAMPLE_TOKEN = `afkey-${SAMPLE_BODY}-${SAMPLE_CHECKSUM}`

test("no-leaked-afkey — valid cases", () => {
  tester.run("no-leaked-afkey", rule, {
    valid: [
      // Regex source (not a literal token) is fine: documentation, format file.
      {
        filename: "/repo/packages/auth/src/tokens/format.ts",
        code: `const re = /afkey-[0-9A-Za-z]{43}-[0-9a-f]{8}/`,
      },
      // Mangled form: only 42 chars in the body — not a complete token.
      {
        filename: "/repo/apps/web/src/test.ts",
        code: `const sample = 'afkey-${SAMPLE_BODY.slice(0, 42)}-${SAMPLE_CHECKSUM}'`,
      },
      // Non-hex checksum: lowercase z is not in [0-9a-f].
      {
        filename: "/repo/apps/web/src/test.ts",
        code: `const sample = 'afkey-${SAMPLE_BODY}-zzzzzzzz'`,
      },
      // Plain unrelated string.
      {
        filename: "/repo/apps/web/src/test.ts",
        code: `const greeting = 'hello world'`,
      },
    ],
    invalid: [],
  })
})

test("no-leaked-afkey — invalid: token in a string literal", () => {
  tester.run("no-leaked-afkey", rule, {
    valid: [],
    invalid: [
      {
        filename: "/repo/apps/web/src/some-route.ts",
        code: `const t = '${SAMPLE_TOKEN}'`,
        errors: [{ messageId: "leakedAfkey" }],
      },
    ],
  })
})

test("no-leaked-afkey — invalid: token in a template literal", () => {
  tester.run("no-leaked-afkey", rule, {
    valid: [],
    invalid: [
      {
        filename: "/repo/apps/web/src/some-route.ts",
        code: "const t = `${`${'" + SAMPLE_TOKEN + "'}`}`",
        errors: [{ messageId: "leakedAfkey" }],
      },
      {
        filename: "/repo/apps/web/src/some-route.ts",
        code: "const t = `bearer ${'" + SAMPLE_TOKEN + "'}`",
        errors: [{ messageId: "leakedAfkey" }],
      },
    ],
  })
})

test("no-leaked-afkey — invalid: token embedded mid-string", () => {
  tester.run("no-leaked-afkey", rule, {
    valid: [],
    invalid: [
      {
        filename: "/repo/apps/web/src/some-route.ts",
        code: `const url = 'https://example.com/auth/signup?token=${SAMPLE_TOKEN}'`,
        errors: [{ messageId: "leakedAfkey" }],
      },
    ],
  })
})
