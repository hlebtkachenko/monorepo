import { config } from "@workspace/eslint-config/base"

export default [
  ...config,
  // webpack.config.js is a CommonJS build-tooling file (require/module/__dirname),
  // not app source — outside the TS/ESM lint surface.
  { ignores: ["webpack.config.js"] },
]
