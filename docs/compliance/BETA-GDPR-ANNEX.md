# Beta — GDPR Annex

Personal-data register for `apps/beta`, the client portal at
`beta.afframe.com`. It records what personal data the beta service holds, where
each category lives, how long it is kept, who else processes it, and which
data-subject rights are servable today.

**Status: pre-production.** The beta has no real client data in it at the time
of writing, and this annex is a precondition for putting any there. Where a
control is not built, this document says so in the same sentence as the control.
An annex that describes an intended system rather than the deployed one is worse
than no annex, because the moment it matters is the moment it is quoted back.

This is an engineering register, not legal advice. The controller/processor
wording in any client-facing DPA is Hleb's call and is not settled here.

---

## 1. Roles

| Party                                    | Role           | Notes                                                                                           |
| ---------------------------------------- | -------------- | ----------------------------------------------------------------------------------------------- |
| Client company (účetní jednotka)         | Controller     | Decides why its employees', partners' and directors' data is processed.                         |
| The accounting office (the `owner` role) | Processor      | Bookkeeps on the client's instruction. In beta the office and the operator are the same person. |
| AWS, Cloudflare, Resend, Anthropic       | Sub-processors | §5.                                                                                             |

An `organization` row is one client's book. Separation between books is a
property of the application, not of the database: beta uses scope brands
(`OrgScope` / `OwnerScope` / `OfficeScope` in `apps/beta/lib/data/scope.ts`) plus
composite `(id, organization_id)` foreign keys, **not** Postgres RLS. That
differs from `apps/web` and is a deliberate, documented choice; the fences that
hold it up are in §6.

---

## 2. Categories of personal data

| Category                 | Where                                      | Fields                                                                                    |
| ------------------------ | ------------------------------------------ | ----------------------------------------------------------------------------------------- |
| Account identity         | `app_user`                                 | email, name, image, locale, `disabled_at`, 2FA state                                      |
| Sessions and credentials | Better Auth tables (`db/schema/auth.ts`)   | session tokens, TOTP secrets, backup codes                                                |
| Invitation trail         | `user_setup_token`                         | email, `issued_ip`, `issued_user_agent`, `consumed_ip`, `consumed_user_agent`, timestamps |
| Membership               | `organization_membership`                  | which person may read which book, in which role                                           |
| Employment               | `payroll_employee`                         | full name, contract type, start/end dates, the office's external reference                |
| Payroll figures          | `payroll_employee_line`, `payroll_summary` | per-person gross/net/levy figures per period                                              |
| Documents                | `document` rows + S3 objects               | invoices, bank statements, **payslips**                                                   |
| Business partners        | `partner`, `partner_saldo`                 | counterparties, which for an OSVČ is a natural person (name, IČO, address)                |
| Assistant transcripts    | `chat`, `chat_message`, `chat_usage`       | free text a user typed, which may contain anything                                        |
| Audit trail              | `activity_log`                             | actor, action, entity, `request_id`, timestamps                                           |

Two categories carry the most harm per row and are named separately:

- **Payslips.** `document` rows with `doc_type = 'payslip'` are excluded from
  every Dokumenty view server-side and reachable only through Mzdy › Výplatnice
  under `payrollScope()`. An employee seat reads its own and no other.
- **Assistant transcripts.** Free text is unbounded by definition, which is why
  it is the only category with an enforced retention window (§4). The surface
  ships dark (`BETA_ASSISTANT_ENABLED` unset) until Hleb has reviewed an
  adversarial transcript.

No special-category data (Art. 9) is collected by design. Payroll data is not
special-category, but it is the most sensitive ordinary data here.

---

## 3. Legal basis

| Processing                                      | Basis                                                                                |
| ----------------------------------------------- | ------------------------------------------------------------------------------------ |
| Bookkeeping, payroll, tax filings               | Legal obligation of the controller (Art. 6(1)(c)) — Czech accounting and payroll law |
| Portal accounts for client staff                | Contract (Art. 6(1)(b))                                                              |
| Security logging, rate limiting, `activity_log` | Legitimate interest (Art. 6(1)(f)) — integrity of the service                        |
| Assistant transcripts                           | Contract, and only while the surface is enabled for that org                         |

---

## 4. Retention

| Data                           | Retention                                                  | Mechanism                                                                                                                                 |
| ------------------------------ | ---------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Assistant chats and messages   | 12 months from last activity                               | `CHAT_RETENTION_MONTHS` (`lib/data/assistant.ts`); swept daily at 02:00 UTC by an ECS scheduled task running `db/purge-expired-chats.mjs` |
| Accounting documents and books | Czech statutory retention (5 / 10 years by document class) | **Not automated.** Deletion is an operator act                                                                                            |
| Setup tokens                   | Retained as the invitation audit trail                     | Immutable by trigger; no expiry job                                                                                                       |
| `activity_log`                 | Indefinite                                                 | Append-only by trigger; no expiry job                                                                                                     |
| Sessions                       | Better Auth default expiry                                 | —                                                                                                                                         |
| S3 noncurrent object versions  | 30 days                                                    | `noncurrentVersionExpiration` lifecycle rule on the documents bucket                                                                      |

The gap, stated plainly: **only the assistant transcript window is enforced by a
job.** Every other period above is a policy a human would have to apply.
Statutory accounting retention is long enough that this is not yet a compliance
failure, but it is not a control either.

---

## 5. Sub-processors and transfers

| Sub-processor | Purpose                                                            | Region                                                                                      |
| ------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------- |
| AWS           | Compute (Fargate), database (RDS), object storage (S3), keys (KMS) | eu-central-1, Frankfurt                                                                     |
| Cloudflare    | DNS and the tunnel fronting every public host                      | Global edge, terminating to eu-central-1                                                    |
| Resend        | Transactional email (invitations, notifications)                   | Recipient address and message body leave the EU perimeter                                   |
| Anthropic     | The Asistent model, `api.anthropic.com`                            | **US.** Only when `BETA_ASSISTANT_ENABLED` is set, which it is not in any environment today |

Anthropic is the only third-country transfer, the only sub-processor that can
receive free-text client data, and it is switched off everywhere. It must not be
switched on for a real client before the transfer basis is written down and the
organization has been told.

---

## 6. Technical measures

Access:

- **No public signup.** An account exists only because the office minted a
  single-use setup link (`lib/auth/setup-token.ts`), which is the only path in
  the application that can create an identity.
- **MFA gate** behind `BETA_TOTP_REQUIRED`; `requireOwner` redirects an
  un-enrolled owner to enrolment.
- **Five org roles.** The narrowest — the employee seat, a `guest` bound to a
  `payroll_employee` row — reaches exactly three surfaces (Přehled, own
  Dokumenty, Moje mzda) and is excluded from company notification emails and the
  company task list. Everything else 404s.

Tenant separation, and the fences that keep it:

| Fence             | File                                            | Refuses                                                                            |
| ----------------- | ----------------------------------------------- | ---------------------------------------------------------------------------------- |
| Scope brands      | `lib/data/scope-brand-fence.boundary.test.ts`   | a module minting a scope outside `scope.ts`                                        |
| DB client         | `lib/data/db-client-fence.boundary.test.ts`     | a module reaching the database outside the data layer                              |
| `app_user` writes | `lib/auth/app-user-writes.boundary.test.ts`     | a request-influenced payload writing `is_staff` / `disabled_at` / `email_verified` |
| Employee seat     | `lib/data/employee-seat-fence.boundary.test.ts` | an org module, leaf or API route reachable by a seat with no registered narrowing  |
| S3                | `lib/storage/s3-fence.boundary.test.ts`         | a route handler holding a bucket handle                                            |

Storage:

- Bucket: private, versioned, CMK-encrypted (SSE-KMS), `enforceSSL`,
  `BLOCK_ALL` public access, in eu-central-1.
- Object keys are random and org-prefixed (`org/<uuid>/<uuid>.<ext>`) — never
  the filename, never a content hash, so a key is not an oracle for the bytes.
- `assertKeyBelongsTo` runs on every read and delete as a fail-closed floor
  under the data layer's own scoping.
- Files stream through app routes. **No presigned URLs**, deliberately: a
  presigned URL is a bearer credential that outlives the membership behind it.

---

## 7. Data-subject rights

| Right                   | Servable today | How                                                                                       |
| ----------------------- | -------------- | ----------------------------------------------------------------------------------------- |
| Access (Art. 15)        | Manually       | Operator query per table. No self-service export.                                         |
| Rectification (Art. 16) | Partly         | Name/email through /admin; employee name through the office's payroll register.           |
| Erasure (Art. 17)       | Partly — §8    | No product delete path; account disable and membership deactivation exist.                |
| Restriction (Art. 18)   | Yes            | `app_user.disabled_at` (account) and `organization_membership.active = false` (one book). |
| Portability (Art. 20)   | Manually       | Operator export.                                                                          |
| Objection (Art. 21)     | Yes            | Per-account email toggle (`email_notifications_enabled`).                                 |

None of the above is self-service. For a beta whose entire user population is
personally known to the operator, manual service is defensible. It stops being
defensible the moment the service has clients the operator does not know.

---

## 8. Erasure, and the versioned-bucket trap

Two facts that only matter together:

1. **There is no delete-organization path in the product.** `/admin` archives
   (`archived_at`), which withdraws a book from every member and is reversible.
   The danger-zone delete of spec §2.10 is not built. Every org-scoped table
   already carries `ON DELETE CASCADE`, so the database half is ready and the
   application half is not.
2. **The documents bucket is versioned.** A `DeleteObject` with no `VersionId`
   against a versioned bucket deletes nothing — it writes a delete marker and
   demotes the live object to a noncurrent version, which the lifecycle rule
   then keeps for 30 days.

Taken together, an erasure request served with the store's ordinary `delete()`
would **report success while leaving every document recoverable for a month**.
That is the failure this annex exists to prevent, and it is why the store now
carries `purgeOrganization` — a separate method that enumerates
`ListObjectVersions` over the organization's prefix and deletes every object
version _and every delete marker_ by id, batched at the API's 1000-key limit,
raising rather than swallowing the partial-failure array S3 returns inside an
HTTP 200.

A purge is not a delete, and they are deliberately two methods with two names so
the difference is visible at the call site instead of living in a comment.

Remaining work before an erasure request can be served end to end:

- the product surface (a multistep typed confirmation, spec §2.10);
- an operator runbook pairing the purge with the cascading row delete.

Until then erasure is an operator act using the purge primitive plus a row
delete, performed by hand and recorded.

---

## 9. Breach notification

72-hour controller notification (Art. 33) is Hleb's obligation as operator. The
evidence available to reconstruct an incident is `activity_log` (append-only,
enforced by trigger), CloudTrail on the bucket and the KMS key, and application
logs. No formal IR runbook exists for beta yet.

---

## 10. Open items before real client data

1. The org-delete product surface, on top of the purge primitive (§8).
2. An automated statutory-retention job, or a written decision that retention
   stays manual (§4).
3. A transfer basis for Anthropic, or a decision to keep Asistent off for real
   clients (§5).
4. A self-service export for Art. 15 / 20, or a written decision that manual
   service is the beta answer (§7).
5. An incident-response runbook (§9).
6. A signed DPA per client, naming the sub-processors in §5.

---

See also [`ICT-ASSET-INVENTORY.md`](ICT-ASSET-INVENTORY.md) (DORA Art. 8 asset
register) and [`SECRETS-CONTROLS.md`](SECRETS-CONTROLS.md).
