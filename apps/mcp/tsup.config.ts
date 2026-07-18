import { readFileSync } from "node:fs"
import { defineConfig } from "tsup"

// Read the version without a JSON import attribute (kept portable across the
// config loader) and inline it, so the published bundle reports its own version.
const version = (
  JSON.parse(
    readFileSync(new URL("./package.json", import.meta.url), "utf8"),
  ) as { version: string }
).version

// Bundle the stdio server into a single self-contained ESM file. `noExternal`
// pulls @afframe/sdk + @workspace/shared + zod + the MCP SDK into dist/server.js
// so the published @afframe/mcp has no runtime dependencies — fastest `npx -y`
// cold start, and the same single file the DXT desktop bundle ships. The hosted
// Worker (src/http.ts) is bundled separately by wrangler and is not built here.
export default defineConfig({
  entry: { server: "src/server.ts" },
  format: "esm",
  platform: "node",
  target: "node20",
  noExternal: [/.*/],
  treeshake: true,
  clean: true,
  define: { "process.env.MCP_BUILD_VERSION": JSON.stringify(version) },
})
