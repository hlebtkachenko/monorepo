export default {
  extends: ["@commitlint/config-conventional"],
  rules: {
    "type-enum": [
      2,
      "always",
      [
        "feat",
        "fix",
        "chore",
        "docs",
        "refactor",
        "test",
        "perf",
        "ci",
        "build",
        "style",
        "revert",
      ],
    ],
    "subject-case": [2, "never", ["start-case", "pascal-case", "upper-case"]],
    // Bumped 72 -> 100. Dependabot group-bump subjects ("chore(deps): bump
    // the production-dependencies group across 1 directory with 5 updates"
    // = 85) and other rollups exceed 72; 100 keeps signal but unblocks PRs.
    "header-max-length": [2, "always", 100],
    "body-max-line-length": [0, "always"],
    "footer-max-line-length": [0, "always"],
  },
};
