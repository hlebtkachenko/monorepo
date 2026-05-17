# 8. Cloudflare Tunnel front door + Cloudflare/SES email split

- Status: Accepted
- Date: 2026-05-11
- Deciders: Hleb Tkachenko
- Refines: [0007](0007-mvp-single-account-cdk-only.md) (still in force; this ADR narrows the deployment shape inside the single-account model)

## Context and Problem Statement

ADR 0007 picked a single-account CDK-only deploy on AWS at eu-central-1. The first concrete architecture (ALB + ECS Fargate in private subnets + NAT-GW + 3 VPC interface endpoints) priced out at ~$140/mo idle. The owner pushed back: $140/mo for an empty MVP is too fat. Senior AWS advisor review and follow-up discussion identified the dominant cost lines as the network-layer pieces (NAT-GW $32/mo, ALB $22/mo, interface endpoints $22/mo) that buy little real value at this scale.

A separate question came up at the same time: keep adm.tools for email or move off. Owner has no email data at adm.tools worth preserving; only the "free unlimited @afframe.com mail" capability matters. Self-hosting an OSS mail server is on the table.

## Decision Drivers

- MVP idle budget tolerance: ~$50/mo, not $140
- Single founder, no time for mail-server ops surface (deliverability, IP warming, blacklist monitoring)
- Public repo: nothing AWS-account-bearing in committed code
- Want to drop adm.tools entirely (mail + DNS) without losing the `@afframe.com` mail capability
- Industry-grade deliverability for transactional emails is required (fintech-adjacent product)
- Cloudflare free tier covers DNS + DDoS + WAF + edge cache + Tunnel + Email Routing in one place

## Considered Options for the network layer

1. **ALB + private subnets + NAT-GW** (~$140/mo). The original plan from ADR 0007. Production-shaped, AWS-native, but pays $54/mo for network plumbing the MVP doesn't need yet.
2. **ALB + public subnets, no NAT** (~$90/mo). Trim NAT + endpoints, keep ALB. Cheaper but still pays $22/mo for a load balancer to route two services.
3. **Single EC2 + Docker Compose + Caddy** (~$25/mo). Cheapest, but legacy ops shape, single point of failure, manual patching.
4. **Cloudflare Tunnel + single Fargate task with cloudflared sidecar** (~$49/mo). No ALB, no NAT, no interface endpoints, no per-task public IPv4 multiplication. Outbound-initiated tunnel from inside Fargate to Cloudflare edge.

## Considered Options for email

A. Self-host OSS mail server (postfix/dovecot or maddy) as Fargate sidecar. **Rejected:** AWS port-25 throttle (1-3 day support ticket), fresh-IP reputation hell (weeks-to-months of mail landing in spam), 6+ moving parts (SPF, DKIM, DMARC, PTR, blacklist monitoring, anti-spam, anti-malware, IMAP, backups). One-founder mail-host operation = guaranteed broken when needed most.
B. Keep adm.tools as MX-only after DNS moves to Cloudflare. **Rejected:** unknown mail reputation, vendor-lock to a Ukrainian hosting provider for fintech-grade transactional mail.
C. **Cloudflare Email Routing for inbound + AWS SES (or Resend) for outbound.** Inbound is Cloudflare's mail infrastructure (free, unlimited forwards). Outbound is AWS SES (62K/mo free from Fargate, industry-best deliverability) or Resend (3K/mo free, no sandbox phase). Both clients already wired in `packages/email`.

## Decision Outcome

Chosen: **network = Option 4 (Cloudflare Tunnel), email = Option C (Cloudflare Routing + SES/Resend)**.

### Network layer

- VPC, 2 AZs, public + isolated subnets. **No private-with-egress tier**.
- **No NAT Gateway** ($32/mo saved + per-GB charges).
- **No ALB** ($22/mo saved + the 2-3 public IPv4 charges).
- **No interface endpoints** ($22/mo saved).
- Single Fargate task placed in public subnet with one public IPv4 ($3.65/mo). Security group denies all public ingress; cloudflared establishes outbound tunnel and proxies traffic both ways.
- ACM certs deleted (no ALB to attach to). Cloudflare handles HTTPS at the edge.
- Image pulls from ECR same-region (free, no NAT needed because task is in public subnet).

### Task topology

One Fargate task per env, three containers:

```
monorepo-staging task (0.5 vCPU / 2 GB Graviton):
  ├── web      Next.js, listens on 3000
  ├── api      NestJS, listens on 3001
  └── cloudflared (cloudflare/cloudflared:latest image)
                 Outbound tunnel only, no ports exposed
```

Cloudflare Tunnel routes:

- `app-staging.afframe.com/api/*` → `http://localhost:3001`
- `app-staging.afframe.com/*` → `http://localhost:3000`
- `api-staging.afframe.com/*` → `http://localhost:3001`
- `admin-staging.afframe.com/*` → `http://localhost:3100`

Same shape for production: `app.afframe.com`, `api.afframe.com`, `admin.afframe.com`. Web + api + admin scale together in one task; trip-wire to split is when load on any tier dominates resource limits.

**Why staging uses dash-form 1-level subdomains** (`app-staging`, `api-staging`, `admin-staging`) instead of the more readable `app.staging.afframe.com`, `api.staging.afframe.com`, `admin.staging.afframe.com`: Cloudflare Universal SSL on the Free plan only covers the zone apex + one level of subdomain (`afframe.com` + `*.afframe.com`). Two-level subdomains like `api.staging.afframe.com` fail TLS at the edge with `sslv3 alert handshake failure`. Production hosts are already 1-level (`api.afframe.com`, `admin.afframe.com`) and unaffected. Paying $10/mo for Advanced Certificate Manager to support 2-level wildcards on staging is a worse trade than the small URL asymmetry.

### Email layer

- **Inbound**: Cloudflare Email Routing forwards `*@afframe.com` to the personal inbox stored in repo secret `EMAIL_FORWARD_TO`. Catch-all + specific rules. Free, unlimited.
- **Outbound (transactional, from app)**: AWS SES once production access approved (62K/mo free). Resend (3K/mo free) bridges until SES production approval lands. Both wired in `packages/email`. Domain verification + DKIM via Cloudflare-hosted DNS.
- **Outbound (personal replies)**: Gmail/iCloud "Send Mail As" using SMTP credentials from Resend or SES.
- adm.tools dropped entirely. DNS migrates to Cloudflare at the same time.

### Trip-wires to revisit

- Web or api tier exhausts the 0.5 vCPU / 2 GB shared task budget → split into two tasks + add ALB back
- Email inbound volume > "a few aliases worth" → migrate to Migadu / Fastmail real mailboxes
- Cloudflare Tunnel becomes a reliability liability (Cloudflare outage observed twice in a month, or feature gaps) → swap front door for ALB + ACM cert
- Public subnet placement of the task feels too exposed (despite SG-denied inbound) → revisit private subnet + NAT-instance ($3-5/mo Spot)
- Need per-tenant scoped IAM or staging-vs-prod blast-radius isolation → revisit multi-account (ADR 0007 trip-wire)

## Consequences

Positive:

- MVP idle cost ~$49/mo instead of ~$140/mo
- Single Cloudflare account handles DNS + Tunnel + Email Routing + DDoS + WAF + CDN - fewer surfaces to manage
- AWS-side surface shrinks to just the AppStack + DataStack + NetworkStack - no ALB, no NAT, no endpoints to worry about
- adm.tools dependency eliminated
- Email deliverability uses industry-grade SES/Resend, not unknown shared-hosting mail

Negative:

- Cloudflare becomes load-bearing for inbound + email. Cloudflare outage = site down + mail down.
- Tunnel adds one container to the task (cloudflared ~50MB RAM)
- Public IPv4 on Fargate task ($3.65/mo) - same cost as before through NAT-GW's one IP, but the security model needs SG diligence (deny all public ingress)
- Two outbound mail providers (Resend + SES) configured during a transition window until SES production access approves - small operational complexity for ~48h

## Validation

- `cdk synth --context env=staging` produces 3 stacks (Network, Data, App) with no ALB, no NAT, no interface endpoints
- `cdk deploy` followed by tunnel connector activation within 2 minutes of Fargate task start
- `curl https://app-staging.afframe.com/api/health` returns 200 from Cloudflare edge
- Inbound mail to `test@afframe.com` arrives at `EMAIL_FORWARD_TO` within seconds
- Resend / SES sends a transactional email successfully signed by DKIM on `afframe.com`

## Amendment 2026-05-17 — admin container + api/admin tunnel hostnames

The single Fargate task gains a 7th container. The "Task topology" section
above showed 3 containers (web, api, cloudflared); ADRs 0012 and 0018 since
added pgbouncer, cerbos, and openfga. This amendment adds `admin`:

- **`admin`** — the `apps/admin` Next.js staff surface, port 3100,
  **`essential: false`**. A crash-looping admin must not fail the task — web
  and api stay up. `memoryReservationMiB: 384`.
- Task `memoryLimitMiB` rises **2048 → 3072**. CPU stays 512. Reserved memory
  is ≈1736 MiB across the 7 containers; memory headroom is comfortable, CPU
  (0.5 vCPU shared, now across two Next.js apps) is the watch item.
- Cost delta: the admin container adds ≈$3/mo of task memory. `api` reuses the
  existing `:3001` container at $0.

Two new Cloudflare Tunnel public hostnames route into the same task — $0
infra, no CDK change, configured manually (see `docs/runbooks/AWS-DEPLOY.md`):

- `api.afframe.com` → `http://localhost:3001` (the existing NestJS container)
- `admin.afframe.com` → `http://localhost:3100` (the new admin container). The
  admin host is its own per-env value (`ADMIN_DOMAIN`), not a subdomain of the
  web domain: production web is `app.afframe.com`, production admin is
  `admin.afframe.com`. Staging is `admin-staging.afframe.com`.

Neither host uses Cloudflare Access. Access filters only by Cloudflare-visible
identity (email / domain / IdP groups) and has no knowledge of afframe
`workspace_membership` — it cannot model "member of an allowlisted staff
workspace," and staff are intentionally cross-domain. `admin` is gated solely
by the in-app workspace-allowlist (`ADMIN_WORKSPACE_ALLOWLIST`), `api` solely
by API keys.

New trip-wire: the non-essential `admin` container fails quietly — a
crash-loop neither fails the task nor is loud. Consider a CloudWatch alarm on
the admin container's exit count.

See ADR [0020](0020-public-api-foundation.md) for the public API foundation
behind `api.afframe.com`.

## References

- ADR 0007 (single-account CDK-only, parent decision)
- `docs/runbooks/AWS-DEPLOY.md` (operational guide, updated to match)
- `.context/attachments/AWS-PLATFORM-OVERVIEW.md` gotcha #16 (App Runner not in eu-central-1), gotcha #1 (NAT-GW per-GB), gotcha #11 (Public IPv4 charges)
- `.context/attachments/aws-products-review.md` ALB + NAT verdicts
- `.context/attachments/aws-tco-decisions.md` cost-per-line analysis
