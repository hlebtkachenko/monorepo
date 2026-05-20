import { Doc } from "@/components/doc"

export const metadata = {
  title: "Quickstart",
  description: "First request against the Afframe API in 60 seconds.",
}

export default function Quickstart() {
  return (
    <Doc
      title="Quickstart"
      intro="Send your first authenticated request. Get a key, set a header, hit /v1/ping."
    >
      <h2>1. Get an API key</h2>
      <p>
        Sign in to <a href="https://app.afframe.com">app.afframe.com</a>, open{" "}
        <em>Settings → API keys</em>, and create a key. Production keys are
        prefixed <code>affk_live_…</code>; sandbox keys are
        <code>affk_test_…</code>.
      </p>
      <h2>2. Send a ping</h2>
      <pre>
        <code>{`curl https://api.afframe.com/v1/ping \\
  -H "Authorization: Bearer affk_live_…"`}</code>
      </pre>
      <p>On success you'll see your resolved tenancy:</p>
      <pre>
        <code>{`{
  "ok": true,
  "principal": {
    "organizationId": "01H...",
    "workspaceId": "01H..."
  }
}`}</code>
      </pre>
      <h2>3. Use the SDK</h2>
      <pre>
        <code>{`import { createAfframeClient } from "@afframe/sdk"

const client = createAfframeClient({ apiKey: process.env.AFFRAME_API_KEY! })
const { data } = await client.GET("/v1/ping")`}</code>
      </pre>
      <h2>What's next?</h2>
      <ul>
        <li>
          <a href="/developers/authentication">Authentication</a>
        </li>
        <li>
          <a href="/developers/errors">Error envelope</a>
        </li>
        <li>
          <a href="/reference">Full API reference</a>
        </li>
      </ul>
    </Doc>
  )
}
