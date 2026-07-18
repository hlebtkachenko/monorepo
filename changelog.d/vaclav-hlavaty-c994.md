---
category: Changed
---

Drop the unused outerTx parameter from withOrgReadonly so read-only org transactions are always top-level, making 'the callback cannot write' a guarantee rather than a caveat a composed caller could break.
