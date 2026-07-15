# @workspace/filing

Generate and validate the official Czech e-filing XML formats the platform
submits to institutions and trading partners. This package does not compute
any domain figures itself: `@workspace/accounting` produces the numbers, and
`@workspace/filing` serializes them into the exact XML the institution
expects, then checks that XML against the institution's own XSD. Pure,
bytes-in/bytes-out, no I/O — no fetch, no filesystem writes, no database
access.

## What ISDOC is

ISDOC (Information System Document) is the Czech open e-invoice standard.
Version 6.0.1 is the current one. It is plain XML, namespace
`http://isdoc.cz/namespace/2013`, UTF-8 encoded, and is the interchange
format read/written by Money S3, Pohoda, iDoklad, Helios, and most other
Czech accounting software.

- Spec: https://mv.gov.cz/isdoc/
- Official XSD schemas: https://github.com/isdoc/schema

## Tier roadmap

- **Tier 1 — ISDOC 6.0.1** — done (`generateIsdoc`, `readIsdoc`,
  `validateFiling`).
- **Tier 2 — Přiznání k DPH (DPHDP3) + Kontrolní hlášení (DPHKH1)** — done.
  Submitted to the Finanční úřad through the EPO (Elektronické podání pro
  finanční správu) `<Pisemnost>` envelope. `generateDphdp3` / `readDphdp3`,
  `generateDphkh1` / `readDphkh1`, `validateFiling(xml, "dphdp3"|"dphkh1", …)`,
  plus `buildDphdp3FromAccounting` / `buildDphkh1FromAccounting` adapters.
- **Tier 3 — DPPO** (Přiznání k dani z příjmů právnických osob, DPPDP9) — done.
  Same EPO `<Pisemnost>` envelope. `generateDppo` / `readDppo`,
  `validateFiling(xml, "dppo", "05.01.01")`, plus `buildDppoFromAccounting` from
  the `@workspace/accounting` DPPO worksheet.
- Later, out of scope for now: ČSSZ (social security) and health-insurance
  filings.

## Package layout

```
src/xml/          generic XML core: ordered-tree build (build.ts) + parse (parse.ts)
src/validate/      XSD validation (validate.ts) + schema registry (registry.ts)
                   + schemas.generated.ts (inlined XSD text, see "Extending" below)
src/model/         Zod models (isdoc.ts, dphdp3.ts, dphkh1.ts, dppo.ts) — the UI seam
src/cz/isdoc/      ISDOC 6.0.1 writer (write.ts) + reader (read.ts)
src/cz/fu/         FÚ EPO: envelope.ts (Pisemnost + attribute-centric věty) +
                   dphdp3/ + dphkh1/ + dppo/ writers/readers/compute + adapter.ts
schemas/           vendored official XSDs, version-pinned, never fetched at runtime
fixtures/isdoc/    10 reference invoices used as test fixtures
```

## Tier 2 — FÚ EPO (DPHDP3 + DPHKH1)

Unlike ISDOC (element-centric), the EPO daňový-portál forms are **attribute-
centric**: values live in XML attributes on self-closing věty, wrapped in a
namespace-less `<Pisemnost>` → `<DPHDP3>`/`<DPHKH1>` envelope. Grounded entirely
from the vendored official XSDs (`schemas/fu/`), not from prose.

- **Decimals**: DPHDP3 amounts are whole koruna (`xs:decimal` fractionDigits=0,
  e.g. `obrat23="1000"`); DPHKH1 row amounts are haléře (`fractionDigits=2`,
  e.g. `zakl_dane1="1000.00"`). The writers/adapters format accordingly.
- **DIČ** is emitted digits-only (attr pattern `[0-9]{1,10}`) — the "CZ" prefix
  is stripped. **Dates** are normalised to `D.M.YYYY`.
- **Models** (`Dphdp3` / `Dphkh1`) type the hlavička (VetaD) + poplatník (VetaP);
  DPHDP3 value věty (Veta1..6) are per-attribute string records so ANY attribute
  round-trips, and DPHKH1 row věty (A.1/A.2/A.4/A.5/B.1/B.2/B.3) are typed rows.
- **Adapters** map the platform's computed VAT figures (`@workspace/accounting`
  `Dph.rows` / `KontrolniHlaseni`) into the models via filing-local input
  interfaces — `@workspace/filing` stays a pure serialize package with no
  accounting/db dependency.

```ts
import {
  generateDphdp3,
  readDphdp3,
  generateDphkh1,
  readDphkh1,
  buildDphdp3FromAccounting,
  buildDphkh1FromAccounting,
  validateFiling,
} from "@workspace/filing"

const xml = generateDphdp3(buildDphdp3FromAccounting(dph.rows, meta))
const { valid, errors } = await validateFiling(xml, "dphdp3", "03.01.03")
```

The full attribute dictionary + řádek→attribute map lives in
`.context/xml-filing-tier2-grounding.md`. The Veta4 (odpočet) column roles and
the header code values (`dapdph_forma`, `typ_ds`, …) are flagged there for the
Advisor gate to confirm against the official "Pokyny k vyplnění".

## Tier 3 — DPPO (DPPDP9)

The corporate income tax return is the largest CZ form (53 věty, 626 attributes)
and uses the same attribute-centric EPO `<Pisemnost>` → `<DPPDP9>` envelope.
Grounded from the vendored official XSD (`schemas/fu/dppo/05.01.01/`).

- **Envelope**: `<DPPDP9 verzePis="05.01.01">` with `dokument` fixed `DP9` and
  `k_uladis` fixed `DPP` (injected by the writer). Amounts are whole koruna
  (`fractionDigits=0`); ř.280 sazba is an integer percent (`"21"`). DIČ
  digits-only, dates `D.M.YYYY` — the shared `envelope.ts` formatters.
- **Model** (`Dppo`) types the hlavička (VetaD) + poplatník (VetaP) + the II.
  oddíl daňová část (VetaO) as per-attribute string records, and keeps every
  other věta (all přílohy — účetní závěrka, spojené osoby, …) verbatim in
  `extraVety`, in XSD sequence order. So an uploaded real return round-trips
  losslessly and re-exports XSD-valid without the ~50 přílohy věty being modeled
  field-by-field.
- **Adapter** `buildDppoFromAccounting` maps the `@workspace/accounting` DPPO
  worksheet (`ucetni_vysledek`, `nedanove_naklady`, `osvobozene_vynosy`,
  `odpocet_ztraty`, `sazba`, `slevy`) onto the VetaO anchor řádky and lets the
  form arithmetic (`computeDppoTotals`) fill the mezisoučty + tax chain, so the
  return foots and ř.290 daň matches the worksheet.
- **Compute** (`@workspace/filing/dppo-compute`, decimal-only, no validator)
  reproduces the II. oddíl footing — ř.70/170 mezisoučty, ř.200 základ daně,
  ř.250 základ po odečtech, ř.270 zaokrouhlení na tisíce dolů (§21), ř.290 daň,
  ř.310 po slevách, ř.340 celková daň, ř.360 poslední známá daň.

```ts
import {
  generateDppo,
  readDppo,
  buildDppoFromAccounting,
  validateFiling,
} from "@workspace/filing"

const xml = generateDppo(buildDppoFromAccounting(worksheet, meta))
const { valid, errors } = await validateFiling(xml, "dppo", "05.01.01")
```

The VetaO řádek→attribute map, the two coarse-lump placements
(`nedanove_naklady`→ř.40, `osvobozene_vynosy`→ř.110), and the mezisoučet vazby
are documented + flagged in `.context/xml-filing-tier3-grounding.md` for the
Advisor gate to confirm against the official "Pokyny k vyplnění přiznání k DPPO".

### Reusable entry points for a real UI (demo-independent)

The package is the product; a filing UI is just a consumer. The in-repo consumer
is the admin operator tool at **Platform → Debug → XML filing**
(`apps/admin/.../platform/debug/xml-filing`, prod-live): import any filing XML,
round-trip it, XSD-validate, run the DPPO kritické kontroly. A full org-side
editing tester is preserved in `.context/dppo-tier3-demo/`. All of the API below
is exported and CI-clean with no UI consumer at all (knip honors the `exports`
map as the API boundary), so a real form binds to it directly:

| Concern              | Import                                | What it gives the UI                                                                                                                                                                   |
| -------------------- | ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Field input contract | `@workspace/filing/fields`            | `fieldTypeFor(group, attr)` → `parseField(type, raw)` — normalize (space/comma) + enforce each XSD facet (whole koruna, integer percent, D.M.YYYY, digit DIČ). Bind every input to it. |
| Form footing         | `@workspace/filing/dppo-compute`      | `computeDppoTotals(model)` — the disabled součtové řádky (client-safe, no validator).                                                                                                  |
| Soft validity (warn) | `@workspace/filing/dppo-checks`       | `checkDppo(model)` → typed warnings + suggestions (never blocks).                                                                                                                      |
| Hard validity (gate) | `@workspace/filing`                   | `validateFiling(xml, "dppo", "05.01.01")` → XSD errors.                                                                                                                                |
| Business validity    | `@workspace/filing/business-validity` | `validateDicLegalEntity` / `isValidIco` (offline mod-11). ARES existence = `@workspace/registries` at the UI layer.                                                                    |
| Accounting → form    | `@workspace/filing`                   | `buildDppoFromAccounting(worksheet, meta)`.                                                                                                                                            |
| Serialize / parse    | `@workspace/filing`                   | `generateDppo` / `readDppo`.                                                                                                                                                           |

The client-safe subpaths (`/fields`, `/dppo-compute`, `/dppo-checks`,
`/business-validity`) pull only `decimal.js-light`, never `xmllint-wasm`, so they
bundle into a browser form; `validateFiling` (the XSD gate) stays server-side.
The form↔model glue (read the `<form>`, merge edits, remount) is UI-layer and is
the only thing a real UI re-implements — every rule/parse/validator above is
already in the package.

## API

Import from the package root (`@workspace/filing`) or the ISDOC-only subpath
(`@workspace/filing/isdoc`, same exports minus the generic XML/validate core).

### `generateIsdoc(input: unknown): string`

`src/cz/isdoc/write.ts`. Parses `input` through `IsdocInvoiceSchema` (Zod;
throws on an invalid shape) and returns a full ISDOC 6.0.1 XML document
string, UTF-8, with the `<?xml version="1.0" encoding="UTF-8"?>` prolog.

All totals, VAT subtotals (aggregated per `(rate, is_pdp)` pair), and
currency-converted amounts are recomputed from the line items using
`decimal.js-light` with `ROUND_HALF_EVEN` rounding to 2 decimal places. The
caller never supplies totals; they are derived, so the UI can never produce a
document with inconsistent arithmetic.

```ts
import { generateIsdoc } from "@workspace/filing"

const xml = generateIsdoc({
  invoice_id: "FP-2025-001",
  issue_date: "2025-11-12",
  supplier: {
    ico: "12345678",
    dic: "CZ12345678",
    name: "Dodavatel Alpha s.r.o.",
  },
  customer: {
    ico: "87654321",
    dic: "CZ87654321",
    name: "Odběratel Beta s.r.o.",
  },
  lines: [
    {
      description: "Poradenské služby 11/2025",
      qty: "1",
      unit_price_base: "1000.00",
      vat_rate: "21",
    },
  ],
  payment_method: 42,
  bank: {
    account: "1234567890",
    code: "0100",
    name: "Komerční banka",
    iban: "CZ6501000000001234567890",
    bic: "KOMBCZPP",
  },
})
```

### `readIsdoc(xml: string): IsdocInvoice`

`src/cz/isdoc/read.ts`. The inverse of `generateIsdoc`: parses an ISDOC XML
document back into the editable `IsdocInvoice` model. Derived/computed
elements (totals, tax subtotals) are dropped on read; `generateIsdoc`
recomputes them from the lines when the model is exported again. Throws if
the document has no `<Invoice>` root.

```ts
import { readIsdoc } from "@workspace/filing"

const model = readIsdoc(uploadedXmlText)
model.supplier.name // editable in place
```

### `validateFiling(xml, filingType, version): Promise<FilingValidationResult>`

`src/validate/validate.ts`.

```ts
export interface FilingValidationResult {
  readonly valid: boolean
  readonly errors: readonly string[]
}

export async function validateFiling(
  xml: string,
  filingType: FilingType, // "isdoc" today
  version: string, // "6.0.1"
): Promise<FilingValidationResult>
```

Runs the vendored official XSD through `xmllint-wasm` (WASM libxml2 — runs
identically in Node and in the browser).

```ts
import { validateFiling } from "@workspace/filing"

const { valid, errors } = await validateFiling(xml, "isdoc", "6.0.1")
if (!valid) console.error(errors)
```

### Generic XML core

`src/xml/build.ts` and `src/xml/parse.ts` are format-agnostic and back both
the ISDOC writer/reader and any future Tier 2/3 format.

```ts
export type XmlNode = Record<string, unknown>
export type XmlAttrs = Record<string, string | number>

function el(tag: string, children?: XmlNode[], attrs?: XmlAttrs): XmlNode
function leaf(
  tag: string,
  text?: string | number | null,
  attrs?: XmlAttrs,
): XmlNode
function serialize(root: XmlNode): string // -> UTF-8 XML string with prolog
function parse(xml: string): unknown // -> plain object tree
```

`el` builds a container element with explicitly ordered children (element
order is XSD-critical for these formats, hence a `preserveOrder` tree instead
of a plain unordered object). `leaf` builds a text-bearing element; passing
`null`/`undefined` for `text` produces a self-closing empty element.
`serialize` renders the tree via `fast-xml-parser`'s `XMLBuilder`. `parse`
reads a document into a plain object tree (attributes as `@_name`, text as
`#text` when the node also carries attributes), stripping a leading UTF-8 BOM
if present.

### `IsdocInvoice` model

`src/model/isdoc.ts`, a Zod object (`IsdocInvoiceSchema`) — this is the shape
a UI form binds to. All monetary/quantity fields are decimal strings (e.g.
`"1000.00"`, `"21"`), never native `number`, per the repo's money rule; exact
arithmetic happens only inside the writer.

```ts
interface IsdocInvoice {
  invoice_id: string
  uuid?: string
  doc_type: string // "1" invoice … "7" simplified/anonymous, default "1"
  direction?: string
  issue_date: string
  tax_point_date?: string
  due_date?: string
  currency?: {
    local: string // default "CZK"
    foreign?: string
    rate?: string
    ref_rate?: string
  }
  supplier: IsdocParty
  customer?: IsdocParty // required unless anonymous_customer + doc_type "7"
  anonymous_customer?: { id: string; id_scheme: string }
  lines: IsdocLine[] // min 1
  payment_method: number // 10/20 cash, 31/42/48/49/50/97 transfer
  bank?: {
    account: string
    code: string
    name: string
    iban: string
    bic: string
  }
  variable_symbol?: string
  cash?: { receipt_id: string; paid_date: string }
  original_references?: { id: string; uuid?: string; issue_date?: string }[]
  already_claimed?: {
    // advance-invoice offsetting
    tax_exclusive?: string
    tax_inclusive?: string
    by_rate?: Record<
      string,
      { taxable?: string; tax?: string; inclusive?: string }
    >
  }
}

interface IsdocParty {
  ico?: string
  dic?: string
  name: string
  street?: string
  building?: string
  city?: string
  zip?: string
  country_code?: string
  country_name?: string
  is_vat_payer: boolean // default true
}

interface IsdocLine {
  description: string
  qty: string
  unit: string // default "ks"
  unit_price_base: string
  vat_rate: string
  reverse_charge?: boolean // PDP (tuzemské přenesení daňové povinnosti)
  reverse_charge_code?: string
  unit_price_base_curr?: string
}
```

## How to wire it to UI buttons

`@workspace/filing` is server-only in practice: `xmllint-wasm` ships a WASM
blob and is meant to run in a Node process (or a browser tab), never inside
a bundled client chunk. In this monorepo, drive it from Next.js server
actions and keep the client side to plain event handlers plus a `Blob`
download. A working reference implementation (dev-only debug page) lives at
`.context/isdoc-tier1-demo/` — `isdoc-demo.tsx` (client component),
`actions.ts` (server actions), `demo-isdoc/page.tsx` (route), and
`web-wiring.patch` (the `next.config.mjs` / `package.json` diff to wire the
package into `apps/web`).

### Next.js integration requirement

Add the package to `transpilePackages` and mark `xmllint-wasm` as a server
external in `apps/web/next.config.mjs`:

```js
const nextConfig = {
  transpilePackages: [
    // ...existing entries
    "@workspace/filing",
  ],
  // xmllint-wasm ships a .wasm blob + a worker file; keep it a Node external
  // so Next doesn't try to bundle those assets (it runs server-side only).
  serverExternalPackages: ["xmllint-wasm"],
  // ...
}
```

Also add `"@workspace/filing": "workspace:*"` to `apps/web/package.json`
dependencies. The exact diff is preserved at
`.context/isdoc-tier1-demo/web-wiring.patch`.

### Upload/Load button

Read the uploaded file client-side, hand its text to a server action that
calls `readIsdoc`, and use the returned model to populate form state.

```ts
// actions.ts
"use server"

import { readIsdoc, type IsdocInvoice } from "@workspace/filing"

export async function parseIsdocAction(xml: string): Promise<IsdocInvoice> {
  return readIsdoc(xml)
}
```

```tsx
// client component
const fileRef = React.useRef<HTMLInputElement>(null)
const [model, setModel] = React.useState<IsdocInvoice | null>(null)

async function onUpload(file: File) {
  try {
    const parsed = await parseIsdocAction(await file.text())
    setModel(parsed)
  } catch (err) {
    toast.error(`Not a valid ISDOC file: ${(err as Error).message}`)
  }
}

<input
  ref={fileRef}
  type="file"
  accept=".isdoc,.xml"
  className="hidden"
  onChange={(e) => {
    const f = e.target.files?.[0]
    if (f) void onUpload(f)
    e.target.value = ""
  }}
/>
<Button onClick={() => fileRef.current?.click()}>Upload .isdoc</Button>
```

### Export button

Regenerate XML from the edited model, validate it, and trigger a browser
download regardless of validity (so the invalid document is still
inspectable).

```ts
// actions.ts
"use server"

import {
  generateIsdoc,
  validateFiling,
  type IsdocInvoice,
} from "@workspace/filing"

export interface IsdocExportResult {
  xml: string
  valid: boolean
  errors: string[]
}

export async function exportIsdocAction(
  model: IsdocInvoice,
): Promise<IsdocExportResult> {
  const xml = generateIsdoc(model)
  const result = await validateFiling(xml, "isdoc", "6.0.1")
  return { xml, valid: result.valid, errors: [...result.errors] }
}
```

```tsx
// client component
async function onExport() {
  if (!model) return
  const out = await exportIsdocAction(model)
  const blob = new Blob([out.xml], { type: "application/xml" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = `${model.invoice_id || "invoice"}.isdoc`
  a.click()
  URL.revokeObjectURL(url)
  toast[out.valid ? "success" : "error"](
    out.valid ? "Exported, XSD valid" : "Exported, XSD INVALID",
  )
}

;<Button disabled={!model} onClick={() => void onExport()}>
  Export as XML
</Button>
```

## Validation semantics

`validateFiling` runs the official ISDOC XSD (`schemas/isdoc/6.0.1/`) through
`xmllint-wasm`. It checks **structure**: element presence, element order,
required attributes, enumerations, and numeric/date type formats. It does
**not** check arithmetic (e.g. that `TaxInclusiveAmount` equals
`TaxableAmount + TaxAmount`) — the XSD has no cross-field constraint for
that, and validating it structurally cannot catch a wrong total. Correctness
of the totals is a property the writer guarantees by construction: it always
recomputes every total from the line items with `decimal.js-light`,
`ROUND_HALF_EVEN` rounding, 2 decimal places. A hand-edited or hand-built
document that skips `generateIsdoc` has no such guarantee.

To check a saved `.isdoc` file outside this package (e.g. one produced by
another system):

```bash
xmllint --noout --schema packages/filing/schemas/isdoc/6.0.1/isdoc-invoice-6.0.1.xsd <file>.isdoc
```

## Rendering / editing model

`IsdocInvoice` is a plain, JSON-serializable object: every field is a
string, number, boolean, nested object, or array of those, with no methods
or class instances. Map its fields directly to form inputs (see the wiring
recipe above), let the user edit them in place, and call `generateIsdoc`
again on export. Because totals are always derived on write, the UI never
needs to (and never should) expose an editable total, subtotal, or tax
amount field.

## Extending (adding a format or tier)

To add a new filing format (e.g. Tier 2's DPHDP3):

1. Vendor the official XSD(s) under `schemas/<format>/<version>/`.
2. Run `pnpm --filter @workspace/filing gen:schemas` to inline the schema
   text into `src/validate/schemas.generated.ts` via
   `scripts/inline-schemas.mjs`.
3. Register the `(filingType, version)` pair in `src/validate/registry.ts`,
   pointing at the inlined schema entries (main schema + any `xs:include`/
   `xs:import` targets to preload).
4. Add a Zod model under `src/model/`, and a writer + reader under
   `src/cz/<format>/`, following the `isdoc` writer/reader as the template.

Schemas are inlined as string constants rather than read from disk or
fetched at runtime because a bundler (Turbopack in `apps/web`, Vite in
Storybook) cannot resolve a runtime `new URL(..., import.meta.url)` plus
`fs.readFileSync` the way plain Node can; inlining sidesteps both the
bundler-asset-resolution problem and any runtime filesystem dependency, so
the same validator code runs unchanged in Node, in tests, and in the
browser.

## Testing

```bash
pnpm --filter @workspace/filing test
```

34 tests across `src/cz/isdoc/write.test.ts` and `src/cz/isdoc/read.test.ts`.
Every one of the 10 fixtures in `fixtures/isdoc/` is generated and validated
against the official XSD, and round-tripped (`generateIsdoc` → `readIsdoc` →
`generateIsdoc` again, checked for a stable result). The XSD pass via
`xmllint-wasm` is the correctness gate, not a hand-written assertion list.

`generateIsdoc` is a faithful TypeScript port of the canonical reference
generator at `~/.claude/skills/isdoc/` (`scripts/generate.py`); that skill's
`REFERENCE.md` documents the field-level rules (element order,
`(rate, is_pdp)` aggregation, the cash-vs-transfer `Details` choice, non-VAT
`PartyTaxScheme` omission, PDP reverse charge, `AnonymousCustomerParty` for
`doc_type = "7"`) that both implementations reproduce.
