---
category: Fixed
---

OAuth consent and organization-selection now complete: the forms read the `url` field Better Auth's /oauth2/consent and /oauth2/continue actually return (it responds with `{ redirect: true, url }`, not `redirect_uri`), so authorizing no longer dead-ends on "Something went wrong". Refs #829
