---
category: Security
---

Beta setup links now enforce the consuming route's allowed purposes inside the claim transaction, so a link posted to the wrong route performs no side effect and is not burned; the build-phase Better Auth placeholder secret is now per-process CSPRNG bytes instead of a constant baked into the image.
