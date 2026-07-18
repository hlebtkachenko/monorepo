---
category: Changed
---

Make the @afframe/mcp SDK-client factory request-scoped (`buildClient(apiKey, baseUrl?)`) so the stdio and hosted transports share one factory without a long-lived shared client.
