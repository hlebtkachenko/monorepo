---
category: Changed
---

Replaced four hand-copied `organization_role` unions (`AuditDetailRole`, `InviteRole`, and two inline uses in `apps/web/lib`) with a single `OrganizationRole` type derived from the existing `organizationRole` pgEnum in `@workspace/db/schema`, so the type can never drift from the DB enum.
