---
category: Security
bump: minor
---

Added a version-aware S3 purge to the beta document store: on the versioned documents bucket a plain `DeleteObject` only writes a delete marker, so an erasure served by looping `delete()` would report success while leaving every file recoverable for 30 days. `purgeOrganization` deletes every object version and delete marker under an organization's prefix by id.
