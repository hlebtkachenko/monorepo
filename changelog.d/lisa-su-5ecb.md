---
category: Security
---

beta: escaped LIKE metacharacters (%, _) in the auth_verification erasure purge's e-mail pattern, sharing lib/data/documents.ts's existing escapeLikePattern helper, so an address containing one cannot widen the match onto a sibling identity.
