---
category: Fixed
---

Resolve the local hook diff base dynamically (env override, PR base, or nearest-of-main/main-beta commit-count heuristic) instead of hardcoding origin/main, so beta/* branches stop false-positiving the size-cap, changelog-fragment, and cache-buster-advisory pre-push hooks and pnpm preflight.
