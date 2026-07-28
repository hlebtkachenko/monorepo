---
category: Security
---

Guard the admin XML-filing debug server action with requireAdminCapability. Next.js layouts do not run for Server Action POSTs, so the filing parse/generate/XSD pipeline was reachable unauthenticated.
