---
category: Fixed
---

Fixed a midnight-flake in the beta test suite: fixtures now derive relative dates from the same Postgres session the reads compare against, instead of a UTC-only JS computation that could disagree with the database's calendar day for an hour or two around Prague midnight.
