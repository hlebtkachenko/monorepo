import { Doc } from "@/components/doc"

export const metadata = {
  title: "Webhooks",
  description: "Standard Webhooks v1 signature verification.",
}

export default function Webhooks() {
  return (
    <Doc
      title="Webhooks"
      intro="Afframe ships webhooks per the Standard Webhooks v1 spec. Three headers, one HMAC-SHA-256 over a fixed message, constant-time comparison."
    >
      <h2>Headers</h2>
      <ul>
        <li>
          <code>webhook-id</code> — opaque per-delivery ID.
        </li>
        <li>
          <code>webhook-timestamp</code> — Unix seconds of dispatch.
        </li>
        <li>
          <code>webhook-signature</code> — space-separated list of{" "}
          <code>v1,&lt;base64&gt;</code>. Multiple entries during secret
          rotation.
        </li>
      </ul>
      <h2>Verify in one line</h2>
      <pre>
        <code>{`import { verifyWebhook } from "@afframe/sdk"

await verifyWebhook({
  payload: rawBody,           // text, not JSON.parse-d
  headers: req.headers,
  secret: process.env.WEBHOOK_SECRET!,
})`}</code>
      </pre>
      <p>
        Throws <code>WebhookVerificationError</code> with one of:
      </p>
      <ul>
        <li>
          <code>missing_header</code>
        </li>
        <li>
          <code>invalid_timestamp</code> — header is not numeric
        </li>
        <li>
          <code>stale_timestamp</code> — drift &gt; 5 minutes (configurable)
        </li>
        <li>
          <code>invalid_signature</code> — no <code>v1,…</code> entry matched
        </li>
      </ul>
      <h2>Algorithm</h2>
      <ol>
        <li>
          Concatenate <code>id . timestamp . body</code>.
        </li>
        <li>HMAC-SHA-256 with the partner secret.</li>
        <li>
          Base64-encode, prefix <code>v1,</code>.
        </li>
        <li>
          Compare every entry in <code>webhook-signature</code> with
          constant-time equality.
        </li>
        <li>
          Reject when the timestamp drifts more than <code>toleranceSec</code>{" "}
          from now (default 300).
        </li>
      </ol>
      <h2>Rotation</h2>
      <p>
        Rotate by issuing a new secret and sending both old and new signatures
        during the cutover window. The verifier accepts any matching entry;
        remove the old secret after caller traffic confirms the new one works.
      </p>
    </Doc>
  )
}
