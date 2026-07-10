// The M2.2 librarian — propose-only self-improving loop: human correction → cluster → distilled
// candidate rule → eval-gated reviewable artifact. See `README.md` in this directory for the full
// pipeline design + the artifact format, and ADR-0027 for why `.brain/` is written only via a
// human-merged GitHub PR, never a prod-box side effect.
export * from "./signature"
export * from "./decision"
export * from "./correction"
export * from "./cluster"
export * from "./distill"
export * from "./eval-gate"
export * from "./emit"
