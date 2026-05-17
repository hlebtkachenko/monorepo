/**
 * Webpack overrides for `nest build --webpack`.
 *
 * apps/api is the first app to consume the source-first `@workspace/*`
 * packages — they export raw `.ts` with no build step, so a plain `nest build`
 * (tsc) cannot compile them. Webpack inlines those sources into one
 * `dist/main.js`; everything in `node_modules` (NestJS, drizzle, native
 * modules like `@cerbos/grpc` / `@openfga/sdk`) stays external and ships in
 * the pruned runner image's `node_modules`. See ADR-0019.
 *
 * NestJS calls this module with its default config + the webpack ref.
 */
const { resolve } = require("node:path")

module.exports = (options) => ({
  ...options,
  output: {
    ...options.output,
    path: resolve(__dirname, "dist"),
  },
  externals: [
    // Externalize every bare specifier (node_modules deps + `node:` builtins)
    // so it is required at runtime, not bundled. Relative/absolute paths (app
    // sources, the entry) and the source-first `@workspace/*` packages are
    // bundled. Deterministic — does not depend on what pnpm happens to have
    // hoisted into apps/api/node_modules.
    ({ request }, callback) => {
      if (
        !request ||
        request.startsWith(".") ||
        request.startsWith("/") ||
        request.startsWith("@workspace/")
      ) {
        return callback()
      }
      return callback(null, "commonjs " + request)
    },
  ],
  module: {
    ...options.module,
    rules: [
      {
        // Single ts-loader rule with NO node_modules exclude: the `@workspace/*`
        // sources live under node_modules via pnpm symlinks and must be
        // compiled. `transpileOnly` skips program-wide type-checking — that is
        // covered separately by `pnpm typecheck` (tsc --noEmit per package).
        test: /\.tsx?$/,
        loader: "ts-loader",
        options: {
          transpileOnly: true,
          configFile: "tsconfig.json",
          onlyCompileBundledFiles: true,
        },
      },
    ],
  },
  plugins: (options.plugins ?? []).filter(
    (p) => p?.constructor?.name !== "ForkTsCheckerWebpackPlugin",
  ),
})
