import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"

import { describe, expect, it } from "vitest"

// Regression guard for #690 defect 1: the posting `entry` is a Zod
// `anyOf` (double|monetary) in the OpenAPI spec. Before the gen-tools
// `anyOf`/`oneOf` handling, `zodExprFor` fell through to the terminal
// `z.unknown()`, so the generated tool handed the LLM an untyped `entry`;
// it then guessed a shape the server rejected (400) and no posting could
// ever be written. This asserts the codegen emits the concrete union shape
// the model needs — re-run `pnpm --filter @afframe/mcp gen` if it fails.
describe("createAccountingPosting generated tool — entry shape (#690)", () => {
  const source = readFileSync(
    fileURLToPath(
      new URL("./generated/createAccountingPosting.ts", import.meta.url),
    ),
    "utf8",
  )

  it("does not degrade `entry` to z.unknown()", () => {
    expect(source).not.toContain('"entry": z.unknown()')
  })

  it("emits a typed z.union for `entry`", () => {
    expect(source).toContain('"entry": z.union([z.object({')
  })

  it("types double-entry lines with a UUID accountId and DEBIT/CREDIT side", () => {
    expect(source).toContain('"accountId": z.string().uuid()')
    expect(source).toContain('"side": z.enum(["DEBIT","CREDIT"])')
  })
})
