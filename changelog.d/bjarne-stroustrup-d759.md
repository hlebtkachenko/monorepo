---
category: Fixed
---

Fix the /o period switcher mis-stripping a sibling org slug that shares a prefix (e.g. /o/acme-backup under slug acme); the in-org sub-path now uses one segment-boundary-safe orgRelativePath helper shared with the org switcher.
