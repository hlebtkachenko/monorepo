---
category: Added
---

Wire the OAuth 2.1 env into the deployed containers so OAuth activates: the API verifier gets `OAUTH_ISSUER`/`OAUTH_JWKS_URI`/`OAUTH_RESOURCE` to accept OAuth access tokens on `/v1/*` alongside API keys, and the web container's authorization server gets the shared `OAUTH_RESOURCE` so it mints tokens with the correct MCP audience.
