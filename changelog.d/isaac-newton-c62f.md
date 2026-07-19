---
category: Changed
---

CI: drop the redundant local `.turbo` cache restore on PR/non-main jobs (it cost ~38-50s per job and almost always missed); rely on the Cloudflare remote turbo cache, which is the real cross-run layer. Main-push still saves for the deploy/release path.
