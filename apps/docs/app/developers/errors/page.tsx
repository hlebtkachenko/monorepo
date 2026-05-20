import { Doc } from "@/components/doc"

export const metadata = {
  title: "Errors",
  description:
    "Plaid-shape error envelope. Every code, what it means, how to recover.",
}

const CODES: {
  code: string
  status: number
  family: string
  meaning: string
}[] = [
  {
    code: "bad_request",
    status: 400,
    family: "INVALID_REQUEST",
    meaning: "Generic parse / shape problem.",
  },
  {
    code: "unauthorized",
    status: 401,
    family: "UNAUTHORIZED",
    meaning: "Key missing, malformed, revoked, or wrong env.",
  },
  {
    code: "forbidden",
    status: 403,
    family: "FORBIDDEN",
    meaning: "Scope or tenancy mismatch.",
  },
  {
    code: "not_found",
    status: 404,
    family: "NOT_FOUND",
    meaning: "No such resource in the authenticated tenant.",
  },
  {
    code: "conflict",
    status: 409,
    family: "CONFLICT",
    meaning: "Idempotency or business-rule conflict.",
  },
  {
    code: "idempotency_conflict",
    status: 409,
    family: "CONFLICT",
    meaning: "Same Idempotency-Key reused with a different body.",
  },
  {
    code: "stale_resource",
    status: 409,
    family: "CONFLICT",
    meaning: "Optimistic-concurrency mismatch — re-read, re-apply.",
  },
  {
    code: "feature_not_enabled",
    status: 403,
    family: "FORBIDDEN",
    meaning: "Feature gated to an entitlement this key doesn't have.",
  },
  {
    code: "payload_too_large",
    status: 413,
    family: "PAYLOAD_TOO_LARGE",
    meaning: "Body exceeded per-endpoint cap.",
  },
  {
    code: "validation_error",
    status: 422,
    family: "VALIDATION",
    meaning:
      "Body parsed but failed schema validation. `details[]` carries field-level breakdown.",
  },
  {
    code: "rate_limited",
    status: 429,
    family: "RATE_LIMITED",
    meaning: "Bucket exhausted. See `RateLimit-*` + `Retry-After` headers.",
  },
  {
    code: "internal_error",
    status: 500,
    family: "INTERNAL",
    meaning:
      "Server error. Retry safe operations; report the `requestId` to support.",
  },
]

export default function Errors() {
  return (
    <Doc
      title="Errors"
      intro="Every non-2xx response from /v1 is wrapped in the same envelope. SDKs map `code` to typed Error subclasses."
    >
      <h2>Envelope</h2>
      <pre>
        <code>{`{
  "error": {
    "code": "validation_error",
    "error_type": "VALIDATION",
    "message": "Request body failed validation.",
    "documentation_url": "https://api.afframe.com/docs/errors#validation_error",
    "requestId": "req_1f5a...",
    "details": [
      { "path": "$.legalName", "code": "required", "message": "legalName is required." }
    ]
  }
}`}</code>
      </pre>
      <ul>
        <li>
          <code>code</code> — stable machine-readable. Switch on this, not{" "}
          <code>message</code>.
        </li>
        <li>
          <code>error_type</code> — Plaid-shape family.
        </li>
        <li>
          <code>message</code> — developer-facing. Safe to log.
        </li>
        <li>
          <code>display_message</code> — optional end-user-safe.
        </li>
        <li>
          <code>documentation_url</code> — deep-link to this page anchor.
        </li>
        <li>
          <code>requestId</code> — echoes <code>X-Request-Id</code>. Quote it in
          support tickets.
        </li>
        <li>
          <code>details[]</code> — present on <code>validation_error</code>;
          absent on most other codes.
        </li>
      </ul>
      <h2>Registry</h2>
      <table>
        <thead>
          <tr>
            <th>Code</th>
            <th>Status</th>
            <th>Family</th>
            <th>Meaning</th>
          </tr>
        </thead>
        <tbody>
          {CODES.map((c) => (
            <tr key={c.code} id={c.code}>
              <td>
                <code>{c.code}</code>
              </td>
              <td>{c.status}</td>
              <td>{c.family}</td>
              <td>{c.meaning}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <h2>SDK error classes</h2>
      <pre>
        <code>{`import {
  AfframeApiError,
  UnauthorizedError,
  RateLimitError,
  ValidationError,
} from "@afframe/sdk"

try {
  await client.GET("/v1/organization")
} catch (err) {
  if (err instanceof RateLimitError) await sleep(err.retryAfter * 1000)
  if (err instanceof ValidationError) renderFieldErrors(err)
  throw err
}`}</code>
      </pre>
    </Doc>
  )
}
