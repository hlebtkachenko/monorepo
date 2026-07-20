/**
 * Drift guard for the GENERATED `paymentFormNames` / `paymentFormPhrases` namespaces.
 *
 * Both are emitted by packages/db/scripts/gen-payment-form-names.ts from the vendored
 * packages/db/data/payment-form.json. This test independently re-derives them and asserts the
 * committed messages still match, so editing the JSON (or hand-editing a string) without
 * re-running the generator fails here instead of silently shipping a stale catalog.
 *
 * The derivation below is DELIBERATELY a second, independent copy of the generator's logic —
 * independence is the point (mirrors country-names.test.ts). The forma-úhrady strings are
 * Czech with no authoritative translation, so en = cs (the vendored value).
 */
import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

import { describe, expect, it } from "vitest"

const HERE = dirname(fileURLToPath(import.meta.url))
const DB = join(HERE, "..", "..", "db")

interface PaymentFormData {
  code: string
  name: string
  phrase: string
}

function derive(): {
  names: Record<string, string>
  phrases: Record<string, string>
} {
  const data = JSON.parse(
    readFileSync(join(DB, "data", "payment-form.json"), "utf8"),
  ) as PaymentFormData[]
  const sort = (m: Record<string, string>): Record<string, string> =>
    Object.fromEntries(Object.entries(m).sort(([a], [z]) => a.localeCompare(z)))
  return {
    names: sort(Object.fromEntries(data.map((p) => [p.code, p.name.trim()]))),
    phrases: sort(
      Object.fromEntries(data.map((p) => [p.code, p.phrase.trim()])),
    ),
  }
}

const messages = {
  en: JSON.parse(readFileSync(join(HERE, "messages", "en.json"), "utf8")),
  cs: JSON.parse(readFileSync(join(HERE, "messages", "cs.json"), "utf8")),
} as Record<
  "en" | "cs",
  {
    paymentFormNames: Record<string, string>
    paymentFormPhrases: Record<string, string>
  }
>

describe("payment-form reference strings stay in sync with payment-form.json", () => {
  const expected = derive()

  it("paymentFormNames match the vendored payment-form.json (en = cs)", () => {
    expect(messages.en.paymentFormNames).toEqual(expected.names)
    expect(messages.cs.paymentFormNames).toEqual(expected.names)
  })

  it("paymentFormPhrases match the vendored payment-form.json (en = cs)", () => {
    expect(messages.en.paymentFormPhrases).toEqual(expected.phrases)
    expect(messages.cs.paymentFormPhrases).toEqual(expected.phrases)
  })
})
