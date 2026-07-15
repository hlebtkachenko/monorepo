# 31. S3 storage classes and document working store

- Status: Accepted
- Date: 2026-07-14
- Deciders: Hleb Tkachenko

## Context and Problem Statement

Afframe stores several unrelated object types in Amazon S3: CDK deployment
assets, application assets, uploaded accounting source documents, CloudTrail
logs, and PostgreSQL backups. They have different access, retention, deletion,
encryption, and recovery requirements. A single bucket or one lifecycle policy
for all of them would either make working documents slow to retrieve or keep
backups unnecessarily expensive.

The uploaded-document path also needs a durable decision record. The initial
implementation was designed from a workspace-local `.context` plan, while the
committed architecture still described one organization-prefixed bucket and a
fixed Glacier lifecycle. Neither was an accurate source for the implemented
workspace-scoped document store.

S3 is not priced only by total size. The bill also depends on storage class,
object count, object size, requests, transitions, retrieval, KMS keys, and
internet transfer. Small accounting files are especially important: objects
under 128 KiB do not benefit from S3 Intelligent-Tiering and are blocked from
lifecycle transitions by default.

## Decision

Use purpose-specific buckets and storage classes. Keep customer-facing source
documents in a dedicated, versioned, SSE-KMS working store. Use S3 Standard for
documents under 128 KiB and the automatic, instant-access tiers of S3
Intelligent-Tiering for documents at least 128 KiB. Reserve Glacier Flexible
Retrieval and Deep Archive for PostgreSQL backups, where asynchronous restores
are acceptable.

### What goes where

| Data                                                                                         | Bucket owner                   | Storage policy                                                                                                                                                    | Retention and deletion                                                                                                                                                                                                                                  |
| -------------------------------------------------------------------------------------------- | ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CDK deployment assets                                                                        | `CDKToolkit` bootstrap stack   | S3 Standard                                                                                                                                                       | Noncurrent versions expire after 30 days; incomplete multipart uploads abort after 7 days.                                                                                                                                                              |
| Application assets such as avatars                                                           | `Data-{env}` `AppBucket`       | S3 Standard                                                                                                                                                       | Versioned; noncurrent versions expire after 30 days. This bucket is not for accounting source documents. Production is retained on stack destroy; lower environments can be destroyed.                                                                  |
| Uploaded invoices, receipts, PDFs, spreadsheets, CSV, XML, ISDOC, and Brain source artifacts | `Data-{env}` `DocumentsBucket` | Under 128 KiB stays in S3 Standard. At least 128 KiB transitions on day 0 to S3 Intelligent-Tiering, using only Frequent, Infrequent, and Archive Instant Access. | A confirmed live document has no age-based expiry. Soft-deleted documents remain recoverable for 60 days. Rejected or abandoned uploads are reaped earlier. Production is retained on stack destroy; lower environments can be emptied during teardown. |
| Nightly PostgreSQL backups                                                                   | `Backup-{env}` `BackupBucket`  | Standard for 0-30 days, Standard-IA at 30 days, Glacier Flexible Retrieval at 90 days, Deep Archive at 365 days                                                   | Current backup objects do not auto-expire. Noncurrent versions expire after 365 days. Objects below S3's 128 KiB lifecycle floor remain in Standard under the current rule.                                                                             |
| Account CloudTrail management logs                                                           | Account-global `Audit` stack   | S3 Standard                                                                                                                                                       | Expire after 90 days.                                                                                                                                                                                                                                   |

The documents bucket is workspace-scoped by keys shaped as
`documents/{workspaceId}/{sha256}.{ext}`. The workspace id and content hash are
derived or validated server-side. It is not an organization-prefix variant of
the application-assets bucket.

### Document protection and deletion

The documents bucket is a working store, not the statutory archive of record.
It deliberately has no S3 Object Lock. A future statutory archive must make a
separate retention and WORM decision instead of silently treating this bucket
as compliant archival storage.

Protection is layered:

- A dedicated customer-managed KMS key is the bucket's default encryption key.
  Rotation and S3 Bucket Keys are enabled. Browser presigned uploads rely on
  bucket-default encryption and do not need to send KMS headers.
- Block Public Access, TLS-only access, bucket-owner-enforced ownership, exact
  web-origin CORS, and versioning are enabled.
- Application roles can read, write, and tag but cannot delete document objects.
- The hourly document reaper is the sole runtime data-plane principal with
  `s3:DeleteObject` and `s3:DeleteObjectVersion` on the bucket. The CDK
  auto-delete custom resource is a non-production stack-teardown exception.
- The reaper deletes rejected uploads tagged `orphan-at` after 1 hour,
  unconfirmed untagged uploads after 24 hours, and user-deleted documents tagged
  `deleted-at` after 60 days. Confirmed live objects are never age-reaped.
- Reaper decisions and deletes are pinned to S3 version ids so a concurrent
  confirm, restore, or upload cannot delete a newer current version.

The optional Intelligent-Tiering Archive Access and Deep Archive Access tiers
are disabled. They require restore workflows and have minutes-to-hours latency,
which does not fit an interactive working store. Access through the three
automatic tiers remains millisecond-latency and has no retrieval fee.

### Implemented document contract

The working store is more than a bucket. The accepted implementation has these
cross-system boundaries:

- Browser uploads use a 5-minute presigned POST and browser-computed SHA-256.
  S3 enforces the exact key, content type, declared maximum size, and checksum.
  Production encryption comes from the bucket-default CMK, so browser form
  fields deliberately omit KMS headers.
- Confirmation trusts S3 HEAD values, not client metadata. It validates the
  workspace/key, checksum, size, MIME/extension pair, and at most 4 KiB of file
  header before promoting a pinned source version to `confirmed-at`.
- A workspace-scoped `inbox_attachment` row under FORCE RLS is written only
  after the S3 confirmation transition succeeds. The row, not S3 object
  existence, is the dedup authority.
- Web session routes support upload, confirm, 15-minute preview/download URLs,
  soft delete, and restore. Delete writes DB state before the S3 tag; restore
  clears the S3 tag before DB state. Both orderings fail toward retained data.
- The public API, SDK, and MCP expose read-only document list and download-URL
  operations through user-bound API keys. Internal storage keys are not exposed
  and bytes still travel directly from S3.
- Local development uses a versioned MinIO `documents-dev` bucket and
  document-scoped credentials, leaving the normal AWS credential chain intact
  for unrelated clients.
- The cost-bearing web routes have process-local user, workspace, and IP rate
  windows. These limit issuance speed, not total stored bytes. A hard
  per-workspace quota is separate follow-up
  [#729](https://github.com/hlebtkachenko/monorepo/issues/729).

The 4 KiB check is integrity and shallow type validation, not antivirus or
deep XLSX/PDF validation. Malware and archive-bomb protection are tracked by
[#734](https://github.com/hlebtkachenko/monorepo/issues/734).

The current flow, limits, failure semantics, operations, and source map are in
the [document-store runbook](../runbooks/DOCUMENT-STORE.md). That runbook is the
human-readable mirror for implementation behavior; this ADR remains the owner
of why the bucket, lifecycle, and cost choices exist.

### Price basis at decision time

This is a decision-time snapshot, not a permanent AWS quote. Rates are Amazon
S3 `eu-central-1` (Frankfurt), first 50 TB where tiered rates apply, retrieved
from the AWS Price List API on 2026-07-14. CZK values use the Czech National
Bank rate for 2026-07-14, USD 1 = CZK 21.292. Prices exclude VAT.

| Storage class                          |                                                                                   Storage per GB-month | Important extra billing                                                                                                                                    | Afframe decision                                                                                                       |
| -------------------------------------- | -----------------------------------------------------------------------------------------------------: | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| S3 Standard                            |                                                                             USD 0.0245, about CZK 0.52 | No minimum duration or retrieval fee                                                                                                                       | Use for app assets, audit logs, new backups, and documents under 128 KiB.                                              |
| S3 Intelligent-Tiering automatic tiers | Frequent USD 0.0245 (CZK 0.52), Infrequent USD 0.0135 (CZK 0.29), Archive Instant USD 0.005 (CZK 0.11) | USD 0.0025, about CZK 0.053, per 1,000 monitored objects monthly; no retrieval fee or minimum duration. Objects under 128 KiB are not monitored or tiered. | Use for documents at least 128 KiB because access is unpredictable and must remain instant.                            |
| S3 Standard-IA                         |                                                                             USD 0.0135, about CZK 0.29 | 30-day minimum, 128 KiB minimum billable size, USD 0.01 (CZK 0.21) retrieval per GB                                                                        | Use for backups after 30 days, not as the document default.                                                            |
| S3 One Zone-IA                         |                                                                             USD 0.0108, about CZK 0.23 | 30-day minimum, 128 KiB minimum billable size, USD 0.01 (CZK 0.21) retrieval per GB, one Availability Zone                                                 | Do not use for customer source documents or backups because the lower price removes multi-AZ resilience.               |
| S3 Glacier Instant Retrieval           |                                                                              USD 0.005, about CZK 0.11 | 90-day minimum, 128 KiB minimum billable size, USD 0.03 (CZK 0.64) retrieval per GB                                                                        | Do not use. Intelligent-Tiering Archive Instant gives the document store the same storage rate without retrieval fees. |
| S3 Glacier Flexible Retrieval          |                                                                            USD 0.00405, about CZK 0.09 | 90-day minimum, 40 KiB metadata overhead per object, USD 0.012 (CZK 0.26) standard retrieval per GB; bulk retrieval is free                                | Use for backups after 90 days. Restore latency is acceptable for disaster recovery, not interactive documents.         |
| S3 Glacier Deep Archive                |                                                                             USD 0.0018, about CZK 0.04 | 180-day minimum, 40 KiB metadata overhead per object, USD 0.024 (CZK 0.51) standard or USD 0.005 (CZK 0.11) bulk retrieval per GB                          | Use for backups after 365 days. Do not use for the working document store.                                             |
| S3 Express One Zone                    |                                                                              USD 0.118, about CZK 2.51 | USD 0.00346 (CZK 0.074) upload and USD 0.000645 (CZK 0.014) retrieval per GB; single-AZ design                                                             | Do not use. Afframe has no microsecond-latency requirement that justifies roughly 4.8 times Standard storage cost.     |

Other material Frankfurt charges at the same snapshot:

- Standard PUT, COPY, POST, and LIST: USD 0.0054, about CZK 0.115,
  per 1,000 requests.
- Standard GET and other requests, including object-tag reads: USD 0.0043,
  about CZK 0.092, per 10,000 requests.
- Lifecycle transitions per 1,000 objects: Intelligent-Tiering or IA
  USD 0.01 (CZK 0.21), Glacier Instant USD 0.02 (CZK 0.43), Glacier Flexible
  USD 0.036 (CZK 0.77), Deep Archive USD 0.06 (CZK 1.28).
- Internet ingress and same-region service transfer are free. The first 100 GB
  of internet egress each month is free across the whole AWS account; the
  illustrative first paid European tier is USD 0.09, about CZK 1.92, per GB.
- Each environment's document KMS key starts at USD 1, about CZK 21, per month.
  Its first and second automatic rotations each add another USD 1 per month,
  capped at USD 3, about CZK 64, monthly from the second rotation onward. KMS
  includes 20,000 account-wide requests monthly, then charges USD 0.03, about
  CZK 0.64, per 10,000 typical symmetric-key requests. S3 Bucket Keys reduce
  KMS request volume but do not remove key-storage charges.

At small scale, retained object storage is cheap. For one environment, an
illustrative 50 GB, 150,000 eligible Intelligent-Tiering objects, 300,000
monthly GETs, and 40 GB of account-wide internet egress are roughly CZK 40-105
per steady-state month before Lambda and new PUT or transition requests. At
1 TB, 2 million eligible objects, 4 million GETs, and 600 GB of internet
egress, the range is roughly CZK 1,200-1,700 per month before the reaper and new
writes, with egress contributing about CZK 958 if the account-wide free 100 GB
remains available. The latter can exceed the current USD 55, about CZK 1,171,
environment total-cost kill-switch budget and therefore requires a budget
review before that scale is allowed.

### Reaper cost guardrail

The current reaper performs an hourly full-keyspace scan and one tag read per
current object. That is operationally simple at launch but is not economical at
scale. At the current GET rate, tag reads alone are approximately:

| Current document objects | Tag reads per 30-day month | Approximate monthly request cost |
| -----------------------: | -------------------------: | -------------------------------: |
|                   50,000 |                 36 million |         USD 15.48, about CZK 330 |
|                  150,000 |                108 million |         USD 46.44, about CZK 989 |
|                2 million |               1.44 billion |     USD 619.20, about CZK 13,183 |

Replace the hourly full scan with an event-driven candidate index before the
bucket reaches 50,000 current objects or before the first production-customer
launch gate, whichever comes first. A daily S3 Inventory can provide cheap
reconciliation, but cannot by itself preserve the 1-hour orphan window because
Inventory is delivered only daily or weekly. The existing Lambda duration alarm
remains a failure detector, not permission to ignore the request-cost threshold.

## Consequences

Positive:

- Each data type gets retrieval and retention behavior that matches its use.
- Interactive documents can cool automatically without surprise restore delays
  or retrieval fees.
- Small receipts and XML files avoid useless transition and monitoring charges.
- The documents bucket has a smaller IAM and encryption blast radius than the
  general application-assets bucket.
- Backup storage can reach low-cost archive tiers without making the live
  document path asynchronous.
- Pricing assumptions and the dominant object-count and egress risks are
  reviewable in git.

Negative / trade-offs:

- More buckets, lifecycle rules, alarms, and one dedicated KMS key increase
  infrastructure and operating complexity.
- KMS key storage becomes a visible fixed monthly cost and rises after the first
  two rotations.
- The reaper's hourly tag scan is expensive before S3 storage itself is; an
  event-driven candidate index is mandatory, not optional optimization.
- Web document rate limits are process-local and multiply with Fargate task
  count. A signed POST can be reused until expiry for the same constrained
  object, so these limits control issuance rather than absolute S3 version
  creation. They are not a distributed quota or bill ceiling.
- The shipped public API document surface is read-only. Write twins require a
  shared orchestration service so safety ordering cannot drift from web routes.
- The working store does not satisfy a future statutory WORM archive
  requirement. That scope remains explicitly separate.
- Backup objects below 128 KiB remain in Standard with the current AWS lifecycle
  default, so tiny backup fixtures do not demonstrate archive billing behavior.
- Prices and the USD/CZK rate will drift. Operators must use the AWS Pricing
  Calculator and current CNB rate for commitments.

Follow-up work required:

- Replace the document reaper's hourly `GetObjectTagging` full scan with an
  event-driven candidate index before 50,000 current objects or
  production-customer launch. Use S3 Inventory as daily reconciliation, not as
  the only clock for sub-day expiry. Source of truth:
  [#732](https://github.com/hlebtkachenko/monorepo/issues/732).
- Add CloudTrail data events for document writes, tagging, and deletes if the
  audit value justifies their request cost. Source of truth:
  [#733](https://github.com/hlebtkachenko/monorepo/issues/733).
- Add the hard per-workspace storage bill ceiling before v1
  ([#729](https://github.com/hlebtkachenko/monorepo/issues/729)) and malware or
  deep-content scanning before equivalent automated processing
  ([#734](https://github.com/hlebtkachenko/monorepo/issues/734)).
- Complete real Inbox, OCR/extraction, batch review, and Brain retrieval through
  [#518](https://github.com/hlebtkachenko/monorepo/issues/518). CloudFront
  signed reads ([#727](https://github.com/hlebtkachenko/monorepo/issues/727))
  and image thumbnails
  ([#728](https://github.com/hlebtkachenko/monorepo/issues/728)) are optional
  delivery and efficiency layers, not prerequisites for correctness.
- Make a separate ADR for statutory archive retention, Object Lock mode, legal
  hold, and deletion once that product boundary is defined.
- Review the USD 55 total-cost budget before allowing the large-scale scenario.
- Re-evaluate whether small PostgreSQL backups should be aggregated or exempted
  explicitly if production dumps remain below 128 KiB.

## Alternatives considered

- **Put documents in the existing application-assets bucket** - rejected because
  unrelated CORS, KMS, lifecycle, and deletion policies would share one blast
  radius.
- **Keep every document in S3 Standard** - viable but rejected for large,
  unpredictably accessed PDFs because automatic instant-access tiering saves
  storage without requiring access forecasts.
- **Use fixed Standard-IA and Glacier transitions for documents** - rejected
  because the working set can become hot again, IA adds retrieval fees, and
  Glacier Flexible or Deep Archive adds restore latency.
- **Use S3 One Zone-IA** - rejected because customer financial source documents
  and backups must not trade multi-AZ resilience for the small storage discount.
- **Use S3 Glacier Instant Retrieval directly** - rejected because its 90-day
  minimum and retrieval fee are worse for unpredictable working access than the
  chosen automatic Intelligent-Tiering tiers.
- **Use S3 Express One Zone** - rejected because the latency profile is not
  required and its storage price is much higher.
- **Enable Object Lock on the working bucket** - rejected because soft delete,
  undo, abandoned-upload cleanup, and deduplicated same-key version handling are
  working-store concerns. Statutory WORM retention needs a separate archive
  design.

## See also

- [Amazon S3 pricing](https://aws.amazon.com/s3/pricing/)
- [Amazon S3 storage classes](https://aws.amazon.com/s3/storage-classes/)
- [S3 Intelligent-Tiering behavior](https://docs.aws.amazon.com/AmazonS3/latest/userguide/intelligent-tiering-overview.html)
- [S3 lifecycle transition constraints](https://docs.aws.amazon.com/AmazonS3/latest/userguide/lifecycle-transition-general-considerations.html)
- [Amazon S3 Inventory schedule and behavior](https://docs.aws.amazon.com/AmazonS3/latest/userguide/storage-inventory.html)
- [AWS KMS pricing](https://aws.amazon.com/kms/pricing/)
- [CNB exchange-rate fixing for 2026-07-14](https://www.cnb.cz/en/financial_markets/foreign_exchange_market/exchange_rate_fixing/daily.txt?date=14.07.2026)
- [`infra/cdk/lib/data-stack.ts`](../../infra/cdk/lib/data-stack.ts) - application and document buckets
- [`infra/cdk/lib/backup-stack.ts`](../../infra/cdk/lib/backup-stack.ts) - backup bucket lifecycle
- [`infra/cdk/lib/audit-stack.ts`](../../infra/cdk/lib/audit-stack.ts) - CloudTrail bucket retention
- [`infra/cdk/lib/security-stack.ts`](../../infra/cdk/lib/security-stack.ts) - reaper IAM, schedule, alarms, and budgets
- [`packages/storage/src/document-store.ts`](../../packages/storage/src/document-store.ts) - document storage contract
- [Document-store runbook](../runbooks/DOCUMENT-STORE.md) - implemented flows,
  limits, operations, troubleshooting, and follow-up ownership
- [PR #722](https://github.com/hlebtkachenko/monorepo/pull/722) - implementation
  scope and verification evidence
