---
category: Fixed
---

Configure the OAuth authorization server's `validAudiences` from `OAUTH_RESOURCE` so it accepts a client's RFC 8707 `resource` and mints a JWT stamped with the hosted MCP audience — without it every OAuth token request failed `invalid_request` or produced an opaque token the API rejected.
