---
category: Fixed
---

Conductor workspace setup now fails loudly when a second Postgres holds localhost:5432, instead of bootstrapping the container and silently pointing the app at the wrong server.
