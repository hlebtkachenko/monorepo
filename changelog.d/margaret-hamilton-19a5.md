---
category: Added
---

Org-tree ESLint boundary now bans `outside → old` imports (any file outside both org trees importing the frozen `app/[orgSlug]` tree), enforced by a warning-immune `lint:org-orphan` CI gate — machine-proof the old tree deletes clean once Track A emptied its inbound consumers (scripts/* generators exempt until the flip).
