---
category: Fixed
---

Close the admin impersonation audit row when the Better Auth session swap fails, and close all of an actor's open rows on stop (not just the newest), so getActiveImpersonation no longer reports phantom active sessions.
