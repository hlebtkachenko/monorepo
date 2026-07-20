---
category: Added
---

Add the ČNB daily FX ingest (`cnb-fx-daily` worker lane) that fetches the Czech National Bank daily fix and upserts `fx_rate` rows (rate + množství stored raw), tz-pinned to Europe/Prague.
