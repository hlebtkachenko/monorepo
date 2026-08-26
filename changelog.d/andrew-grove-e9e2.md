---
category: Fixed
---

Beta: the last-owner and owner-requires-staff invariants now take a row lock before counting, so concurrent demotions can no longer leave an organization ownerless; deactivating a user or a membership revokes that subject's outstanding one-time links.
