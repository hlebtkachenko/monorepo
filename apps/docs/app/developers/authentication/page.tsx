import { Doc } from "@/components/doc"

export const metadata = {
  title: "Authentication",
  description: "API keys, scopes, environments.",
}

export default function Authentication() {
  return (
    <Doc
      title="Authentication"
      intro="Every /v1 request authenticates with a bearer API key. No OAuth, no session cookies."
    >
      <h2>Key formats</h2>
      <ul>
        <li>
          <code>affk_live_…</code> — production. Points at{" "}
          <code>api.afframe.com</code>.
        </li>
        <li>
          <code>affk_test_…</code> — sandbox. Points at the same host; the
          server resolves the environment from the prefix.
        </li>
      </ul>
      <h2>Sending the key</h2>
      <pre>
        <code>Authorization: Bearer affk_live_…</code>
      </pre>
      <p>
        Missing, malformed, or revoked keys return <code>401 unauthorized</code>
        . Keys with the wrong environment prefix return{" "}
        <code>403 forbidden</code>.
      </p>
      <h2>Rotation</h2>
      <p>
        Create a new key in the dashboard, swap clients, revoke the old one.
        Revocation is immediate; in-flight requests with the old key complete
        normally, the next attempt fails fast.
      </p>
      <h2>Scopes</h2>
      <p>
        Keys carry a scope set (read, write, admin). Scope mismatches return
        <code>403 forbidden</code> with the missing scope name in the error
        <code>display_message</code>. The minimum-privilege default is{" "}
        <em>read</em>.
      </p>
      <h2>Tenancy</h2>
      <p>
        Each key is bound to one <code>organizationId</code> + one
        <code>workspaceId</code>. The server injects them at the request
        boundary — they are never an input field on an API operation. See{" "}
        <a href="https://github.com/hlebtkachenko/monorepo/blob/main/CLAUDE.md">
          AI tool input schemas must NOT declare organization_id/user_id/role
        </a>
        .
      </p>
    </Doc>
  )
}
