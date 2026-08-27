---
category: Fixed
---

Reset the beta agent API's process-wide rate limiters before every test in agent-api.test.ts (via the existing resetRateLimitersForTests helper), so the file's growing test count can no longer silently close in on the 60-call key budget the shared beforeAll fixtures spend against.
