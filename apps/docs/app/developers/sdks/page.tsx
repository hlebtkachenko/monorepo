import { Doc } from "@/components/doc"

export const metadata = {
  title: "SDKs",
  description: "@afframe/sdk — TypeScript client generated from OpenAPI.",
}

export default function SDKs() {
  return (
    <Doc
      title="SDKs"
      intro="The TypeScript SDK is generated from `apps/api/openapi/v1.json`. Every operation is typed end-to-end; the SDK is the api's wire shape, with helpers for auth, retries, idempotency, and webhook verification."
    >
      <h2>Install</h2>
      <pre>
        <code>npm i @afframe/sdk</code>
      </pre>
      <h2>Create a client</h2>
      <pre>
        <code>{`import { createAfframeClient } from "@afframe/sdk"

const client = createAfframeClient({
  apiKey: process.env.AFFRAME_API_KEY!,
  // Optional:
  // baseUrl: "https://api-staging.afframe.com",
  // timeoutMs: 30_000,
  // retry: { maxAttempts: 1, maxDelayMs: 5_000 },
  // onDeprecation: (info) => console.warn(info),
})`}</code>
      </pre>
      <h2>Call an endpoint</h2>
      <pre>
        <code>{`const { data, error, response } = await client.GET("/v1/organization")
if (error) throw error
console.log(data.organization.legalName)`}</code>
      </pre>
      <h2>Idempotency</h2>
      <pre>
        <code>{`await client.POST("/v1/invoices", {
  headers: { "idempotency-key": crypto.randomUUID() },
  body: { ... },
})`}</code>
      </pre>
      <h2>Brands</h2>
      <p>
        The SDK ships compile-time brands so a function expecting
        <code>Money&lt;"CZK"&gt;</code> can't be called with
        <code>Money&lt;"EUR"&gt;</code>. Mirrors the server-side
        <code>@workspace/db</code> contract.
      </p>
      <pre>
        <code>{`import { Money } from "@afframe/sdk"

const total = Money.of(125000n, "CZK")
const wire = total.toWire()  // { amount: "125000", currency: "CZK" }`}</code>
      </pre>
      <h2>Errors</h2>
      <p>
        Every non-2xx throws a subclass of <code>AfframeApiError</code>. See{" "}
        <a href="/developers/errors">Errors</a>.
      </p>
      <h2>Webhooks</h2>
      <p>
        <code>verifyWebhook</code> ships with the SDK. See{" "}
        <a href="/developers/webhooks">Webhooks</a>.
      </p>
    </Doc>
  )
}
