import { Doc } from "@/components/doc"

export const metadata = {
  title: "CLI",
  description: "@afframe/cli — call any endpoint from the shell.",
}

export default function CLI() {
  return (
    <Doc
      title="CLI"
      intro="`@afframe/cli` is a thin command-line wrapper over the SDK. One binary, every endpoint, profile-based config."
    >
      <h2>Install</h2>
      <pre>
        <code>npm i -g @afframe/cli</code>
      </pre>
      <h2>Configure</h2>
      <pre>
        <code>{`# ~/.config/afframe/config.toml
[default]
api_key = "affk_live_..."

[staging]
api_key  = "affk_test_..."
api_base = "https://api-staging.afframe.com"`}</code>
      </pre>
      <p>
        Or set <code>AFFRAME_API_KEY</code> / <code>AFFRAME_API_BASE</code>/{" "}
        <code>AFFRAME_PROFILE</code> directly in the env.
      </p>
      <h2>Commands</h2>
      <pre>
        <code>{`afframe ping                       # GET /v1/ping
afframe organization               # GET /v1/organization
afframe --profile staging ping     # use staging profile
afframe --api-key affk_test_... ping`}</code>
      </pre>
      <h2>Output</h2>
      <p>
        JSON to stdout, exit code 0 on success, 1 on any
        <code>AfframeApiError</code>, 2 on transport. Errors print the Plaid
        envelope verbatim to stderr — <code>requestId</code> at the top so
        support can find the request in logs.
      </p>
    </Doc>
  )
}
