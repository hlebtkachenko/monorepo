/**
 * Base Scalar widget config shared by `<ScalarReference>` and
 * `<ScalarClient>`. Per-component variants spread this and override only
 * the fields that differ (sidebar visibility, hidden languages, metadata).
 */
export const BASE_SCALAR_CONFIG = {
  theme: "default",
  layout: "modern",
  persistAuth: true,
  authentication: { preferredSecurityScheme: "bearer" },
  defaultHttpClient: { targetKey: "shell", clientKey: "curl" },
} as const

export const REFERENCE_HIDDEN_CLIENTS = {
  c: true,
  clojure: true,
  csharp: true,
  dart: true,
  fsharp: true,
  kotlin: true,
  objc: true,
  ocaml: true,
  powershell: true,
  r: true,
  swift: true,
} as const
