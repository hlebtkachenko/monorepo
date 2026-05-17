# @workspace/pdf

PDF generation package wrapping [@react-pdf/renderer](https://react-pdf.org). Currently a scaffold — the public entry point is intentionally empty while the first document templates are being designed.

## Entry point

```ts
import {} from "@workspace/pdf"
// or via glob subpath:
import {} from "@workspace/pdf/some-template"
```

## What it does

Provides the package boundary and build configuration for React-based PDF document generation. Document components use `@react-pdf/renderer` primitives (`Document`, `Page`, `View`, `Text`, `StyleSheet`) and are rendered server-side via `renderToStream` or `renderToBuffer`.

## Usage pattern (once templates exist)

```ts
import { renderToBuffer } from "@react-pdf/renderer"
import { InvoiceDocument } from "@workspace/pdf/invoice"

const pdfBuffer = await renderToBuffer(<InvoiceDocument data={invoice} />)
```

The rendered buffer can be streamed as `application/pdf` from a Next.js Route Handler or attached to an outgoing email.
