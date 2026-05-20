import { Doc } from "@/components/doc"

export const metadata = {
  title: "Rate limits",
  description: "IETF RateLimit headers + per-key buckets.",
}

export default function RateLimits() {
  return (
    <Doc
      title="Rate limits"
      intro="Every response carries IETF `RateLimit-*` headers. On 429, the server also returns `Retry-After`."
    >
      <h2>Headers</h2>
      <ul>
        <li>
          <code>RateLimit-Limit</code> — total tokens in the window.
        </li>
        <li>
          <code>RateLimit-Remaining</code> — tokens left right now.
        </li>
        <li>
          <code>RateLimit-Reset</code> — seconds until the window resets.
        </li>
        <li>
          <code>Retry-After</code> — present on 429. Seconds, or HTTP-date.
        </li>
      </ul>
      <h2>Retry policy</h2>
      <p>
        The SDK retries 429 + 5xx once by default, capped at 5 s, honouring
        <code>Retry-After</code>. Idempotent verbs (GET / HEAD / OPTIONS) always
        retry; mutations retry only when the caller passed
        <code>Idempotency-Key</code>. Disable with
        <code>{`createAfframeClient({ retry: false })`}</code>.
      </p>
      <h2>Buckets</h2>
      <p>
        Buckets are per API key. A leaky-bucket implementation refills
        continuously; the headers reflect the steady state.
      </p>
      <h2>What to do on 429</h2>
      <ol>
        <li>
          Read <code>Retry-After</code>.
        </li>
        <li>Sleep that long.</li>
        <li>Retry the same request.</li>
        <li>
          If the same key sees repeated 429s, slow down the caller — don't fan
          out.
        </li>
      </ol>
    </Doc>
  )
}
