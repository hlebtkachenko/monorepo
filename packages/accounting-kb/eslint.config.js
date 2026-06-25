import { config } from "@workspace/eslint-config/base"

export default [
  ...config,
  {
    // The vendor script is a Node ESM one-off; give it the Node globals it uses.
    files: ["scripts/**/*.mjs"],
    languageOptions: {
      globals: { console: "readonly", process: "readonly" },
    },
  },
]
