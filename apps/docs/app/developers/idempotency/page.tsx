import { Doc } from "@/components/doc"

export const metadata = {
  title: "Idempotency",
  description: "Safe retries for mutations via Idempotency-Key.",
}

export default function Idempotency() {
  return (
    <Doc
      title="Idempotency"
      intro="Send `Idempotency-Key` on any mutation. Same key + same body returns the same response; same key + different body returns 409 idempotency_conflict."
    >
      <h2>How</h2>
      <pre>
        <code>{`await client.POST("/v1/invoices", {
  headers: { "idempotency-key": crypto.randomUUID() },
  body: { ... },
})`}</code>
      </pre>
      <h2>Rules</h2>
      <ul>
        <li>
          Required: client-generated, opaque, 1–255 chars. UUIDv4 recommended.
        </li>
        <li>Server caches the first response under the key for 24 hours.</li>
        <li>Replay with the same body → cached response, same status.</li>
        <li>
          Replay with a different body → <code>409 idempotency_conflict</code>.
        </li>
        <li>Don't reuse keys across distinct logical actions.</li>
      </ul>
      <h2>SDK retry policy</h2>
      <p>
        Mutations retry on 429 / 5xx <em>only</em> when an
        <code>Idempotency-Key</code> is present. Without one, the SDK lets the
        error bubble — the caller must decide whether re-sending is safe.
      </p>
    </Doc>
  )
}
