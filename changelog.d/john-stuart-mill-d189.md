---
category: Added
bump: minor
---

Add `deploy-beta.yml`, a self-contained `workflow_dispatch` pipeline that builds the `apps/beta` image, gates it on the ECR CRITICAL-CVE scan, seeds the beta Cloudflare Tunnel token into SSM and deploys `Network-beta` / `BetaData-beta` / `BetaApp-beta` through beta's own least-privilege OIDC deploy role.
