---
category: Fixed
---

OAuth authorize now continues correctly after a custom login: the login pages forward the pending authorize request (stripping Better Auth's signing artifacts) so the user lands back on consent instead of /workspace, and the MFA hop hard-navigates to the authorize endpoint. Refs #829
