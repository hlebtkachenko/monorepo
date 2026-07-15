# Document Store

Current implementation and operating guide for uploaded source documents. Read
[ADR-0031](../adr/0031-s3-storage-and-document-working-store.md) for the bucket,
storage-class, deletion, and pricing decisions. This runbook owns how the
implemented store behaves and how to change or operate it safely.

## Scope

The document store is a workspace-scoped working store for invoices, receipts,
PDFs, images, XLSX, CSV, XML, ISDOC, and future Brain source artifacts. It is
not the statutory archive of record and has no S3 Object Lock.

The shipped foundation is reusable. The real Inbox upload, OCR, extraction,
review, and booking product flow remains tracked by GitHub issue
[#518](https://github.com/hlebtkachenko/monorepo/issues/518). The dev-only
document harness proves the storage flow but is not a production Inbox UI.

## Shipped surface

| Layer             | Implementation                                             | Current behavior                                                                                                                                                                                                     |
| ----------------- | ---------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S3 and KMS        | `Data-{env}` `DocumentsBucket` plus dedicated CMK          | Private, versioned, bucket-default SSE-KMS, S3 Bucket Keys, exact web-origin CORS, no Object Lock. Objects below 128 KiB remain Standard; larger objects transition to automatic instant-access Intelligent-Tiering. |
| Storage seam      | `packages/storage` `DocumentStore` and `S3DocumentStore`   | Presigned browser POST, presigned GET, server streaming, authoritative HEAD, content-addressed keys, version-safe confirm and restore, lifecycle tags.                                                               |
| Metadata          | `inbox_attachment`, migration `0057`                       | Workspace-scoped durable identity for confirmed blobs, FORCE RLS, content-hash dedup, soft-delete timestamp.                                                                                                         |
| Authenticated web | `apps/web/app/api/documents/*`                             | Presign, confirm, preview/download URL, soft delete, restore. Session and active workspace are derived server-side.                                                                                                  |
| Browser client    | `apps/web/app/_lib/documents-client.ts`                    | Computes SHA-256 in the browser and drives upload, confirm, read, delete, and restore without proxying full bytes through Afframe compute.                                                                           |
| Public API        | `GET /v1/documents`, `GET /v1/documents/{id}/download-url` | Read-only, user-bound API-key access. Workspace comes from the principal, internal S3 keys stay private, bytes come directly from S3. SDK and MCP expose the generated read operations.                              |
| Local development | MinIO plus `documents-dev`                                 | Default dev Compose service, versioning enabled by the one-shot bucket seeder, document-scoped static credentials.                                                                                                   |
| Cleanup           | `document-reaper` Lambda                                   | Sole runtime delete principal. Hourly version-pinned cleanup based on S3 tags and object age.                                                                                                                        |
| Monitoring        | CloudWatch alarms                                          | Document write rate, total document bucket size, reaper errors, high duration, and missing invocations.                                                                                                              |

## Data and trust boundaries

| Value                     | Authority                               | Rule                                                                                                                                  |
| ------------------------- | --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Workspace                 | Session or user-bound API-key principal | Never accept `workspace_id`, `organization_id`, `user_id`, or role from document input.                                               |
| Object key                | Server                                  | `documents/{workspaceId}/{sha256}.{ext}`. Workspace is a lowercase UUID and SHA-256 is 64 lowercase hex characters.                   |
| Upload checksum           | Browser computes, S3 enforces           | The presigned POST pins `x-amz-checksum-sha256`. Confirmation compares S3's authoritative base64 checksum to the key hash.            |
| Size and content type     | S3 HEAD at confirmation                 | Client-declared values are presign inputs only. Persist values returned by S3 after validation.                                       |
| Durable document identity | `inbox_attachment.id`                   | Web/API callers address documents by UUID, never by raw storage key.                                                                  |
| Tenant isolation          | `withWorkspace` plus FORCE RLS          | A cross-workspace UUID is invisible and returns 404. `presignGet` also rejects a key whose workspace segment differs from the caller. |
| Deletion clock            | Original S3 `deleted-at` tag            | Repeated delete keeps the existing timestamp. It must not extend the 60-day redemption window.                                        |

`inbox_attachment` is workspace-scoped, not organization-scoped. A received
file can exist before company filing, and an organization record can later
reference the same attachment without moving or duplicating the blob.

## Upload and confirmation

1. Browser client calculates the file SHA-256.
2. `POST /api/documents/presign-upload` resolves session user and active
   workspace, applies rate limits, validates metadata, and checks for a live DB
   row with the same workspace/hash.
3. A dedup hit returns the existing attachment id. No S3 request is minted.
4. A new upload receives a 5-minute presigned POST. Policy conditions pin the
   exact key, MIME type, declared maximum size, and SHA-256 checksum.
5. Browser POSTs bytes directly to S3 or MinIO. Production encryption comes
   from the bucket's default CMK. Browser POSTs intentionally carry no KMS
   headers.
6. Browser calls `POST /api/documents/confirm` with the returned key and safe
   original filename.
7. Confirm performs S3 HEAD with checksum mode, validates key/workspace,
   checksum, authoritative size/type, then reads at most 4 KiB for signature or
   text heuristics.
8. Confirm promotes the pinned current S3 version into a new same-key version
   tagged `confirmed-at`, then upserts `inbox_attachment`.

The final order is load-bearing: S3 confirmation must succeed before the DB row
exists. Reversing it lets the reaper treat a DB-backed document as an abandoned
untagged upload after 24 hours.

### Accepted input

| Kind        | Extensions       | MIME type                        | Confirmation check                                                                      |
| ----------- | ---------------- | -------------------------------- | --------------------------------------------------------------------------------------- |
| PDF         | `.pdf`           | `application/pdf`                | `%PDF` signature                                                                        |
| PNG         | `.png`           | `image/png`                      | PNG signature                                                                           |
| JPEG        | `.jpg`, `.jpeg`  | `image/jpeg`                     | JPEG signature                                                                          |
| XLSX        | `.xlsx`          | Office Open XML spreadsheet MIME | ZIP container signature only                                                            |
| CSV         | `.csv`           | `text/csv`                       | Valid UTF-8 prefix, no binary controls, at least one comma, semicolon, or tab delimiter |
| XML / ISDOC | `.xml`, `.isdoc` | XML or ISDOC text MIME           | Valid UTF-8 prefix whose trimmed content starts with `<`                                |

This is integrity and shallow type validation. It is not antivirus, full PDF or
XLSX parsing, or archive-bomb protection. That boundary is tracked by
[#734](https://github.com/hlebtkachenko/monorepo/issues/734).

### Failure states

| Failure                                              | Response               | Stored state                                                                                         |
| ---------------------------------------------------- | ---------------------- | ---------------------------------------------------------------------------------------------------- |
| Invalid metadata, filename, hash, size, or type pair | 400                    | No new DB row. No presign for invalid input.                                                         |
| Object missing at confirm                            | 404                    | No DB row.                                                                                           |
| S3 metadata, checksum, or header validation fails    | 422                    | Best-effort `orphan-at` tag, then reaper after 1 hour. Untagged fallback still reaps after 24 hours. |
| S3 or metadata DB operation fails                    | 502                    | Retryable. Ordering favors retention over accidental deletion.                                       |
| Document rate window exhausted                       | 429 plus `Retry-After` | Request rejected before cost-bearing storage operation.                                              |

## Read paths

| Caller             | Entry point                                          | Disposition                                                                          | Authorization                                                             |
| ------------------ | ---------------------------------------------------- | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------- |
| Signed-in web user | `GET /api/documents/{id}/url?disposition=inline`     | Inline preview, original MIME type                                                   | Session, active workspace, FORCE RLS, live row, key/workspace backstop    |
| Signed-in web user | `GET /api/documents/{id}/url?disposition=attachment` | Attachment with sanitized ASCII fallback and RFC 5987 UTF-8 filename                 | Same as inline                                                            |
| API, SDK, MCP      | `GET /v1/documents`                                  | Metadata only, newest first; soft-deleted rows excluded unless `includeDeleted=true` | User-bound API key, principal workspace, FORCE RLS                        |
| API, SDK, MCP      | `GET /v1/documents/{id}/download-url`                | Attachment                                                                           | User-bound API key, principal workspace, live row, key/workspace backstop |

Presigned GET URLs last 15 minutes. Document bytes travel S3 to browser, never
through the web or API container. `DocumentStore.getBytes()` exists for bounded
server reads and future Brain re-extraction, but product integration remains in
[#518](https://github.com/hlebtkachenko/monorepo/issues/518).

Public `/v1` document writes are not shipped. They require one shared document
service so web and API cannot drift on confirmation and deletion ordering. The
broader write/operate API surface is tracked by
[#439](https://github.com/hlebtkachenko/monorepo/issues/439).

## Delete, restore, and reaper state

| State               | S3 tags                                                  | DB state                 | Reaper action                                                          |
| ------------------- | -------------------------------------------------------- | ------------------------ | ---------------------------------------------------------------------- |
| Upload pending      | none                                                     | no row                   | Purge current version after 24 hours.                                  |
| Validation rejected | `orphan-at`                                              | no row                   | Purge current version after 1 hour.                                    |
| Live confirmed      | `confirmed-at`, no `deleted-at`                          | `deleted_at IS NULL`     | Never age-purge.                                                       |
| Soft-deleted        | `confirmed-at` and `deleted-at`                          | `deleted_at IS NOT NULL` | Purge evaluated version and unambiguously older history after 60 days. |
| Restored            | new current version with `confirmed-at`, no `deleted-at` | `deleted_at IS NULL`     | Never age-purge.                                                       |

Delete order is DB first, S3 tag second. If tagging fails, bytes remain and a
repeated DELETE retries the idempotent tag operation. This can leak retained
bytes temporarily but cannot erase a live DB-backed document.

Restore order is S3 first, DB second. `clearDeletedTag` pins the source
VersionId and ETag, then creates a new current same-key version without the
delete tag. Only after that succeeds does the DB become live. Reversing this
order could expose a live DB row while the reaper can still delete its bytes.

The reaper re-reads tags on the exact evaluated version immediately before
deletion. Tag drift, version disappearance, ambiguous same-millisecond history,
or partial history deletion fails toward keeping data. Application runtime
roles must never receive `s3:DeleteObject` or `s3:DeleteObjectVersion`.

## Limits and cost controls

| Control                           |                          Current value | Meaning and gap                                                                                                                                   |
| --------------------------------- | -------------------------------------: | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Maximum original upload           |                                 50 MiB | Enforced before presign and again from S3 HEAD at confirm.                                                                                        |
| Upload presign TTL                |                              5 minutes | Limits reuse window for direct POST.                                                                                                              |
| Read presign TTL                  |                             15 minutes | Applies to web preview/download and public API download.                                                                                          |
| Per-user web document routes      |             90 requests per 60 seconds | Covers presign-upload, confirm, and URL minting issuance.                                                                                         |
| Per-workspace web document routes |                  900 requests per hour | Caps tenant issuance velocity.                                                                                                                    |
| Per-IP web document routes        |            180 requests per 60 seconds | Skipped when no usable forwarded IP exists.                                                                                                       |
| Document bucket write alarm       | 10,000 PUT plus POST requests per hour | Alert-only. Does not trigger service shutdown.                                                                                                    |
| Document bucket size alarm        |                                  5 GiB | Sums Standard plus automatic Intelligent-Tiering storage types.                                                                                   |
| Hard workspace quota              |                            Not shipped | Rate limits bound growth speed, not total stored bytes. Issue [#729](https://github.com/hlebtkachenko/monorepo/issues/729) owns the bill ceiling. |

The web rate limiter is process-local. With multiple Fargate tasks, effective
limits multiply by task count. A presigned POST can also be reused until its
5-minute expiry for the same key, content type, size ceiling, and checksum. The
limiter therefore caps signing and confirmation requests, not the absolute
number of direct S3 POSTs or noncurrent versions. Do not describe it as a
global quota or hard bill ceiling. Public API requests also pass the separate
V1 API-key throttler. Issue
[#729](https://github.com/hlebtkachenko/monorepo/issues/729) must account for
pending uploads and versioned storage, not only confirmed DB rows.

Storage, requests, tag scans, KMS, retrieval, transitions, and egress all
affect cost. Current Frankfurt USD and CZK comparisons and scale examples live
only in [ADR-0031](../adr/0031-s3-storage-and-document-working-store.md) so the
price snapshot has one owner.

## Local development

Conductor setup starts Postgres, MinIO, and the one-shot bucket seeder. Generic
local development can start the same default services directly:

```bash
docker compose -f infra/compose/docker-compose.dev.yml up -d postgres minio minio-createbucket
pnpm dev
```

Generated web environment values include:

- `S3_ENDPOINT=http://localhost:9000`
- `DOCUMENTS_BUCKET=documents-dev`
- `AWS_REGION=eu-central-1`
- document-scoped MinIO credentials

The scoped credentials are deliberate. Do not replace them with process-global
AWS credentials, because other AWS SDK clients such as avatar storage must
retain their normal credential chain.

MinIO API listens on `http://localhost:9000`; its console listens on
`http://localhost:9001`. The `minio-createbucket` service enables versioning,
which confirm, restore, and reaper safety require.

After signing in with the seeded dev user, use
`/workspace/debug-documents` to exercise upload, preview, download, delete, and
restore. The route returns 404 outside development and is not production UI.

## Monitoring and diagnosis

| Signal             | Alarm or source                                | Operator meaning                                                                      |
| ------------------ | ---------------------------------------------- | ------------------------------------------------------------------------------------- |
| Write flood        | `monorepo-{env}-s3-documents-put-rate-high`    | More than 10,000 POST/PUT requests in 1 hour. Check actor and storage growth.         |
| Stored-byte growth | `monorepo-{env}-s3-documents-bucket-size-high` | Daily size sample reached 5 GiB. Compare expected customer growth and abuse.          |
| Reaper failure     | `monorepo-{env}-document-reaper-errors`        | At least one invocation crashed, timed out, or ended with per-key errors.             |
| Reaper scale       | `monorepo-{env}-document-reaper-duration-high` | Maximum duration reached 50 seconds in 3 evaluated hours, close to 60-second timeout. |
| Reaper absent      | `monorepo-{env}-document-reaper-not-running`   | Fewer than one invocation for 3 hourly periods, including missing metrics.            |
| Reaper details     | `/aws/lambda/monorepo-{env}-document-reaper`   | JSON events: `reap-purge`, `reap-skip-recheck`, `reap-key-error`, `reap-summary`.     |

Example read-only checks:

```bash
aws s3api get-bucket-versioning --bucket "$DOCUMENTS_BUCKET"
aws logs tail "/aws/lambda/monorepo-${ENVIRONMENT}-document-reaper" --since 2h
```

Do not repair an incident with `aws s3 rm`, a temporary Delete grant, versioning
suspension, or manual tag rewrites. Preserve evidence, inspect CloudWatch and
CloudTrail coverage, then follow the general
[incident runbook](INCIDENT.md). Object-level CloudTrail data events are not
yet enabled and are tracked by
[#733](https://github.com/hlebtkachenko/monorepo/issues/733).

### Common failures

| Symptom                                                 | Likely cause                                                                  | Check                                                                                       |
| ------------------------------------------------------- | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Local presign returns 502                               | Missing `DOCUMENTS_BUCKET`, MinIO unavailable, or scoped credentials absent   | Generated web environment, MinIO health, `documents-dev` existence                          |
| Local confirm says no source VersionId                  | MinIO bucket versioning was not enabled                                       | Re-run `minio-createbucket`; do not bypass VersionId checks                                 |
| Local image/PDF download works but inline preview fails | Dev MinIO origin missing from CSP                                             | `NODE_ENV=development`, valid `S3_ENDPOINT`, restart Next.js after env change               |
| Confirm returns 422                                     | MIME/extension mismatch, size/checksum mismatch, or header validation failure | S3 HEAD values and reaper `orphan-at` behavior                                              |
| Existing file unexpectedly dedups                       | Live `inbox_attachment` row already has same workspace/hash                   | Query through workspace-scoped DB tooling; S3 object existence alone is not dedup authority |
| Deleted file cannot be restored                         | Redemption window passed, or restore copy failed                              | DB `deleted_at`, current version/tags, reaper logs; never recreate a DB-live row first      |

## Safe change checklist

- Preserve direct browser-to-S3 upload and S3-to-browser read paths.
- Preserve workspace derivation at the authenticated boundary and FORCE RLS.
- Deduplicate from a live DB row, never from S3 `HEAD` alone.
- Confirm the version-safe S3 tag transition before inserting/updating the DB
  row.
- Delete DB first and S3 second. Restore S3 first and DB second.
- Never sign a raw client-supplied storage key.
- Preserve bucket versioning, CMK default encryption, S3 Bucket Keys, and the
  no-delete application-role policy.
- Browser presigned POSTs must continue relying on bucket-default encryption.
  Do not require KMS headers in browser form fields.
- Update this runbook for behavior, ADR-0031 for decision or pricing changes,
  [`ENVIRONMENT-VARIABLES.md`](../ENVIRONMENT-VARIABLES.md) for configuration,
  and the public API contract when endpoints change.

Fastest relevant verification:

```bash
pnpm --filter @workspace/storage test
pnpm --filter @workspace/db test
pnpm --filter web test
pnpm --filter api test
pnpm --filter @workspace/cdk test
pnpm --filter @workspace/cdk typecheck
pnpm check:docs
```

Run both strict CDK synth environments after infrastructure changes, as defined
in the repository verification instructions.

## Source map

| Concern                                        | Canonical source                                                                                                                                                                                                   |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Storage interface and key contract             | [`packages/storage/src/document-store.ts`](../../packages/storage/src/document-store.ts)                                                                                                                           |
| S3/MinIO implementation and tag transitions    | [`packages/storage/src/document-store-s3.ts`](../../packages/storage/src/document-store-s3.ts)                                                                                                                     |
| Limits, supported types, and header validation | [`packages/storage/src/document-validation.ts`](../../packages/storage/src/document-validation.ts)                                                                                                                 |
| Web orchestration and ordering                 | [`apps/web/app/api/documents/_lib/document-handlers.ts`](../../apps/web/app/api/documents/_lib/document-handlers.ts)                                                                                               |
| DB access and dedup                            | [`apps/web/app/_lib/inbox-attachment-repo.ts`](../../apps/web/app/_lib/inbox-attachment-repo.ts)                                                                                                                   |
| Browser direct-upload client                   | [`apps/web/app/_lib/documents-client.ts`](../../apps/web/app/_lib/documents-client.ts)                                                                                                                             |
| Public API reads                               | [`apps/api/src/v1/documents/documents.controller.ts`](../../apps/api/src/v1/documents/documents.controller.ts)                                                                                                     |
| Table, constraints, and RLS                    | [`packages/db/migrations/0057_inbox_attachment.sql`](../../packages/db/migrations/0057_inbox_attachment.sql)                                                                                                       |
| Bucket, CMK, lifecycle, and policies           | [`infra/cdk/lib/data-stack.ts`](../../infra/cdk/lib/data-stack.ts)                                                                                                                                                 |
| Runtime IAM and environment wiring             | [`infra/cdk/lib/app-stack.ts`](../../infra/cdk/lib/app-stack.ts)                                                                                                                                                   |
| Reaper IAM, schedule, and alarms               | [`infra/cdk/lib/security-stack.ts`](../../infra/cdk/lib/security-stack.ts)                                                                                                                                         |
| Reaper algorithm                               | [`infra/cdk/lib/lambda/document-reaper/`](../../infra/cdk/lib/lambda/document-reaper/)                                                                                                                             |
| Cost alarms                                    | [`infra/cdk/lib/observability-stack.ts`](../../infra/cdk/lib/observability-stack.ts)                                                                                                                               |
| Dev services and bucket seeding                | [`infra/compose/docker-compose.dev.yml`](../../infra/compose/docker-compose.dev.yml), [`scripts/conductor/setup.sh`](../../scripts/conductor/setup.sh), [`scripts/generate-env.sh`](../../scripts/generate-env.sh) |

## Follow-up ownership

| Work                                                             | Source of truth                                              | Trigger or status                                                                     |
| ---------------------------------------------------------------- | ------------------------------------------------------------ | ------------------------------------------------------------------------------------- |
| Product Inbox, OCR/extraction, batch review, and Brain retrieval | [#518](https://github.com/hlebtkachenko/monorepo/issues/518) | Store foundation exists; real product flow remains.                                   |
| CloudFront signed reads on `files.afframe.com`                   | [#727](https://github.com/hlebtkachenko/monorepo/issues/727) | Revisit for branded host, WAF, or meaningful traffic. Uploads stay direct S3.         |
| WebP image thumbnails                                            | [#728](https://github.com/hlebtkachenko/monorepo/issues/728) | Async derivative for PNG/JPEG preview efficiency.                                     |
| Per-workspace hard storage quota                                 | [#729](https://github.com/hlebtkachenko/monorepo/issues/729) | Required bill ceiling when preparing v1.                                              |
| Event-driven reaper candidate index                              | [#732](https://github.com/hlebtkachenko/monorepo/issues/732) | Before 50,000 current objects or first production customer, whichever comes first.    |
| CloudTrail document mutation data events                         | [#733](https://github.com/hlebtkachenko/monorepo/issues/733) | Decide write-only event coverage and cost.                                            |
| Malware and deep-content scanning                                | [#734](https://github.com/hlebtkachenko/monorepo/issues/734) | Before uploaded bytes feed untrusted automated processing without an equivalent gate. |

A future statutory WORM archive is a separate product and legal decision. Write
a separate ADR for retention, Object Lock mode, legal hold, and destruction when
that boundary is defined. Do not retrofit those claims onto this working store.
