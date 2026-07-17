# Intercompany Collaboration

- Status: Draft for implementation
- Owner: Accounting platform
- Last reviewed: 2026-07-15
- Scope: Phase 1 MVP only

## 1. Executive decision

Phase 1 supports exactly 2 accounting collaborations:

1. **Payment on behalf:** one organization pays a supplier invoice that belongs to another organization in the same Afframe workspace.
2. **Paired invoice:** one organization issues a real sale invoice to another organization in the same workspace, and the recipient explicitly accepts it as a local received invoice.

For payment on behalf, the payer is the source and the organization that owns the supplier invoice is the target. The source records a due-from RECEIVABLE. The target clears its preexisting supplier PAYABLE and records an exact reciprocal due-to PAYABLE.

For a paired invoice, the seller and issuer is the source and the buyer and recipient is the target. Source approval creates a local ISSUED_INVOICE and a 311 RECEIVABLE. Target approval creates a separate local RECEIVED_INVOICE and a 321 PAYABLE. The source invoice designation is copied as the target document's external reference, while each book retains its own local document, event, posting, approval, number series, and open item.

Both workflows therefore create real saldokonto open items in both organizations. Each participant can see its own pohledavka or zavazek, and Afframe can state who owes whom and how much until ordinary settlement closes the 2 local items.

The two books never share a journal, approval, transaction, document, event, posting, account, open-item identifier, or API key. They share only a small workspace request row and safe directory identities. There is no workspace key.

An organization-bound agent can discover every required local input, prepare a stored organization-local HELD proposal, read request status, and inspect its organization's resulting open items and per-partner saldokonto through public API and generated MCP tools. The dedicated proposal runner is unconditional: it has no confidence, amount, or auto-apply branch. A human with current local authority resolves the proposal, and that explicit approval applies the organization-local command directly rather than creating another HELD layer. A Better Auth owner or admin may instead execute the same deterministic local command directly; that path still writes an organization-local idempotency and execution log.

Both books contain a local accounting document or capture chain and a local open position. In payment on behalf, the external supplier invoice belongs only in the target book and must be booked there before target application. The source consumes its preexisting BANK_STATEMENT payment document and opens due-from. The target retains the supplier invoice, creates a complete INTERNAL clearing document and event, clears the supplier payable, and opens due-to. Copying that supplier invoice into the source would falsely duplicate the target's expense and potentially its input VAT.

The paired-invoice workflow is different because the source really supplied goods or services to the target. It creates a true issued invoice in the source and a true received invoice in the target. The target cannot rewrite issuer-controlled legal or monetary facts. It may reject the request or choose only its local period, number series, receipt date, and supported purchase supply kind. Phase 1 STANDARD acceptance requires full input-VAT deductibility rather than exposing an unsafe deductibility override.

Phase 1 is CZK-only. A request, both accounting periods, and every linked open item use CZK. Paired invoices are limited to positive domestic Czech STANDARD or OUTSIDE_VAT invoices with zero rounding and one accounting event. Credit notes, advances, assets, reverse charge, EU and import regimes, FX, and synchronized corrections are excluded.

## 2. Goals

The MVP must:

- make payment on behalf and paired invoices auditable without creating a generic collaboration platform;
- preserve FORCE RLS and organization-local accounting;
- require separate source and target decisions and transactions;
- reuse current active workspace and organization memberships, with owner or admin as Phase 1 final accounting authority;
- keep member and guest roles read-only for final accounting;
- support organization-bound agents through explicit scopes and unconditional HELD review;
- let agents discover proposal inputs, monitor requests, and read their organization's outstanding intercompany positions without a browser-only identifier;
- give direct web actions the same domain validation, idempotency, and audit guarantees without fabricating an agent proposal;
- consume a real local source bank record and create a real local target clearing document and event for payment on behalf;
- create separate local issued and received invoices for a real intercompany supply;
- create exact reciprocal CZK open items for both workflows;
- keep shared data bounded and free of local ledger and audit identifiers.

## 3. Non-goals

Phase 1 does not implement:

- workspace-wide accounting authority or a workspace key;
- autonomous or confidence-gated cross-book posting;
- a new capability, grant, or responsible-user authority system;
- a shared ledger, document, event, posting, or approval;
- invoice types other than the narrow domestic paired-invoice shape defined here;
- automatic recharge, markup, transfer-pricing, VAT-entitlement, or withholding-tax decisions;
- supplier advances, loans, cash pooling, netting, setoff, or interest;
- foreign exchange, mixed currencies, multi-invoice allocation, or multi-payment requests;
- automatic correction of linked postings;
- shared raw attachments or participant-scoped object storage;
- runtime cross-book reconciliation;
- relationships, cases, comments, notifications, version vectors, or conflict graphs;
- organizations outside the current workspace.

## 4. Terms

| Term                       | Meaning                                                                                                                     |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Source                     | Payment payer or paired-invoice seller and issuer, depending on request kind.                                               |
| Target                     | Payment beneficiary or paired-invoice buyer and recipient, depending on request kind.                                       |
| Source bank-payment record | A preexisting unposted BANK_STATEMENT individual record, linked summary record, event, and amount facts in the source book. |
| Supplier payable           | The target's preexisting supplier-invoice PAYABLE open item.                                                                |
| Due-from                   | Command label for the source's selected local receivable account.                                                           |
| Due-to                     | Command label for the target's selected local payable account.                                                              |
| Paired invoice             | One source ISSUED_INVOICE and one target RECEIVED_INVOICE based on the same immutable shared issuer facts.                  |
| Local position             | The caller organization's request-linked RECEIVABLE or PAYABLE open item.                                                   |
| Request                    | Safe shared coordination facts, not an accounting record.                                                                   |
| HELD operation             | A local tool_call_log row with immutable operation name, input hash, input payload, actor attribution, and pending result.  |
| Participant                | Exactly the request source or target organization.                                                                          |
| Final human                | A current active organization owner or admin using Better Auth or a human API key.                                          |

## 5. Hard invariants

1. Source and target are different organizations in the same workspace.
2. The directory reference is counterparty.id for a protected self counterparty in that workspace.
3. Only source and target participants may read a request.
4. Current active organization owner or admin membership grants final Phase 1 accounting authority; member and agent session roles are read-only, and guest is denied.
5. Every agent key is organization-bound, user-bound, actor_kind = agent, explicitly scoped, and rechecked against its bound user's current workspace and organization memberships inside the transaction.
6. Null, empty, duplicate, or unknown collaboration scopes fail.
7. Agent proposals call runHeldCollaborationProposal, map the verified API principal actor_kind = agent capability to the existing tool_call_log actor_kind = ai_on_behalf audit value, and are always HELD. The database never receives `agent` as a tool-call actor value.
8. Direct Better Auth owner or admin commands call runDirectIntercompanyCommand, which logs idempotency and execution but does not create HELD work.
9. runGatedWrite is not used because it contains an auto-apply path that is unrelated to this explicit authority model.
10. Source and target use separate authority checks, OrgCtx values, execution logs, and transactions.
11. A payment-on-behalf source references one preexisting unposted BANK_STATEMENT payment record and consumes it by creating the posting based on its document and event.
12. A payment-on-behalf target supplier invoice and PAYABLE exist before application.
13. Payment-on-behalf target application settles that supplier PAYABLE and creates one complete INTERNAL event, summary, individual, and CZK OUTSIDE_VAT partial capture chain.
14. A paired-invoice source creates and books one local ISSUED_INVOICE before the request becomes PENDING; its linked 311 RECEIVABLE is the source position.
15. A paired-invoice target creates and books one local RECEIVED_INVOICE before the request becomes APPLIED; its linked 321 PAYABLE is the target position.
16. A paired invoice has a non-null tax-point date and exactly one accounting event, one individual record, and one partial, producing one posting and one open item per organization under the current bookDocument grouping contract.
17. Paired-invoice issuer facts are immutable. The target selects only local receipt and booking facts plus its local purchase supply kind. For STANDARD it may propose only the literal local fact vatDeductible = true, which the final human approval explicitly confirms. Non-deductible or partly deductible VAT is out of scope until ordinary booking supports it correctly.
18. The source and target selected periods both have accounting_currency = CZK.
19. The request and all involved open items use CZK.
20. The 2 request-linked positions always have the same original gross amount as the request.
21. One request links to at most one intercompany open item per organization.
22. Shared request rows contain no user, key, idempotency, fingerprint, evidence-hash, document ID, event ID, posting ID, account ID, supplier-open-item ID, settlement ID, or reciprocal-open-item ID. A paired invoice may share the legally meaningful source designation, never its local UUID.
23. Local identifiers and hashes remain in organization-local tool logs and accounting audit.
24. Request business facts and shared_payload are immutable after INSERT.
25. Status changes only through the database-guarded PENDING transitions.
26. Requests cannot be deleted.
27. Target rejection or source cancellation never rolls back source accounting.
28. Closed periods fail without choosing another date.
29. Applied, rejected, and cancelled requests never reopen.
30. Posted accounting remains append-only. Automated correction or synchronized editing of linked intercompany items is blocked in Phase 1.
31. The same identity may perform both organization decisions only if it is currently owner or admin in both; the server still performs 2 membership checks, 2 authority checks, 2 audit attributions, and 2 transactions. D6 also permits that user to approve an intercompany proposal originally prepared by its bound agent, but only through a freshly authorized human session.
32. Every reference required to prepare, propose, monitor, or identify an outstanding intercompany position is available through an organization-bound public API and generated MCP tool. No required reference is browser-only.

## 6. Accounting model

Account numbers are illustrative. For payment on behalf, due-from and due-to are command labels, not configuration keys or inferred mappings. Each payment proposal selects local account references, and the transaction resolves and validates them in the selected accounting period. Paired invoices use the existing deterministic invoice classification and chart-account resolution; the proposal supplies supported supply kinds, not account IDs or an account-override seam.

Source due-from validation:

- account belongs to the source and selected period;
- nature is ASSET;
- normal_balance is DEBIT;
- tracks_open_items is true.

Target due-to validation:

- account belongs to the target and selected period;
- nature is LIABILITY;
- normal_balance is CREDIT;
- tracks_open_items is true.

The target supplier open item's account is independently resolved in the target period and must be LIABILITY, CREDIT normal balance, and tracks_open_items = true. The selected bank account must be a source-period ASSET with DEBIT normal balance. The service never silently selects, creates, or changes an account.

Possible Czech chart choices include 351/361, 355/365, or 378/379. Afframe does not infer a legal relationship from workspace membership.

### 6.1 Payment target invoice before application

The target books the economic supplier invoice through the existing invoice flow:

    Debit  expense or asset                     10,000 CZK
    Debit  input VAT, when independently valid   2,100 CZK
    Credit supplier payable                     12,100 CZK

This creates the target supplier PAYABLE. The invoice is never duplicated in the source book.

The local records after application are therefore:

| Book   | Local accounting document or capture chain         | Local open position                                 |
| ------ | -------------------------------------------------- | --------------------------------------------------- |
| Source | Existing BANK_STATEMENT payment record and posting | Due-from RECEIVABLE against the target organization |
| Target | Supplier invoice plus INTERNAL clearing document   | Due-to PAYABLE against the source organization      |

This gives both books an auditable local document basis and reciprocal debt tracking without pretending that the source bought the target's goods or services.

### 6.2 Payment source materialization

The source first has an unposted BANK_STATEMENT payment record. Approved execution consumes that record and posts:

    Debit  selected intercompany due-from       12,100 CZK
    Credit selected source bank                 12,100 CZK

The source opens a 12,100 CZK RECEIVABLE against the target protected self counterparty. The request becomes PENDING in the same transaction.

### 6.3 Payment target materialization

Approved target execution creates a target-local INTERNAL document and accounting event, then posts:

    Debit  supplier payable                     12,100 CZK
    Credit selected intercompany due-to         12,100 CZK

The clearing posting settles the selected supplier PAYABLE. The same posting opens a 12,100 CZK intercompany PAYABLE against the source protected self counterparty. The request becomes APPLIED in the same target transaction.

### 6.4 Payment reimbursement

Later reimbursement remains two ordinary local payment workflows:

    Target: Debit due-to, Credit bank
    Source: Debit bank, Credit due-from

Each organization settles its own open item. The applied request is not edited.

### 6.5 Shared currency and amount rules

Phase 1 accepts only CZK. The source bank record supplies the payment date, amount, currency, and structured OUTFLOW direction. The request copies the safe facts, not their local identifiers. Phase 1 stores no payment reference because the current capture model has no structured source field for one, and it never infers a reference from free text. Target application requires:

    request.currency = source_period.accounting_currency
                     = target_period.accounting_currency
                     = supplier_open_item.currency_code
                     = 'CZK'

No rate lookup, conversion, rounding bridge, or neighbor-date substitution is allowed.

For a paired invoice, the adapter computes request.amount exactly from the one source partial as base plus VAT. Both local periods use CZK, both 311/321 open items equal that gross amount, and rounding is exactly zero.

### 6.6 Paired issued invoice

The paired-invoice source is the real seller. Source approval creates one event with source protected self as party and target protected self as counterparty, captures one local ISSUED_INVOICE, and books it through the current deterministic bookDocument path.

For a domestic STANDARD service invoice:

    Debit  311 receivable from target             12,100 CZK
    Credit 602 service revenue                    10,000 CZK
    Credit 343 output VAT                          2,100 CZK

The exact revenue account is derived by the existing classifyEvent and expandScenarioEntries logic from the supported source supply kind. The resulting 311 open item is a request-linked INVOICE_SOURCE_RECEIVABLE against the target protected self counterparty.

For OUTSIDE_VAT, VAT rate is null and VAT amount is zero, so the posting contains only 311 against the derived revenue account.

The generated source summary_record.designation is the issued invoice number. It becomes an immutable shared legal fact only after local allocation. The request and source invoice booking then commit in the same source transaction.

### 6.7 Paired received invoice

Target approval creates its own event and RECEIVED_INVOICE from the locked request facts. The target document uses its own local number series and designation. Its summary_record.external_reference equals the source issued designation.

For the same fully deductible STANDARD service invoice:

    Debit  518 service expense                    10,000 CZK
    Debit  343 input VAT                           2,100 CZK
    Credit 321 payable to source                  12,100 CZK

The target selects its local purchase supply kind because a seller's revenue classification does not determine the buyer's cost account. Every issuer-controlled fact remains unchanged: seller and buyer identities, source designation, issue date, tax-point date, due date, description, quantity, unit, unit price, base, VAT mode, VAT rate, VAT amount, currency, and gross total.

STANDARD target application requires a locally validated PAYER status and the literal local proposal fact vatDeductible = true. The final human approval explicitly confirms full input-VAT deductibility. Phase 1 accepts no false, percentage, or coefficient because the current bookDocument and VAT-output paths do not safely implement non-deductible or partial VAT. OUTSIDE_VAT creates no 343 line and accepts no deductibility field. If the target cannot accept that treatment, it rejects the request and books nothing.

The resulting 321 open item is a request-linked INVOICE_TARGET_PAYABLE against the source protected self counterparty. It has the same gross original amount and due date as the source 311 item.

### 6.8 Paired-invoice supported shape

The source proposal has exactly one description and one partial. The partial must use CZK, zero rounding, a positive base, and one of these shapes:

- STANDARD with DOMESTIC jurisdiction, 21 percent VAT, an exact positive VAT amount consistent with the base and rate, and a supported non-asset supply kind;
- OUTSIDE_VAT with OUTSIDE_VAT jurisdiction, null VAT rate, zero VAT amount, and a source VAT status of NON_PAYER or IDENTIFIED_PERSON at the tax point.

Supported supply kinds are GOODS, MATERIAL, SERVICES, UTILITY, RENT, INSURANCE, and OTHER. Source and target may select different supported supply kinds because their local revenue and cost classifications differ. ASSET, ADVANCE, CREDIT_NOTE, deferral, negative amount, nonzero rounding, reverse charge, EU, import, exempt, FX, and multiple-line or multiple-partial invoices fail before number allocation.

Both protected-self parties must have countryCode CZ. STANDARD requires source PAYER and target PAYER plus explicit full-deduction confirmation. OUTSIDE_VAT permits only source NON_PAYER or IDENTIFIED_PERSON; target VAT status is irrelevant because no input VAT exists. A source PAYER's potentially outside-scope supply needs legal-reason evidence that Phase 1 does not capture and is therefore rejected. Source and target independently validate their time-versioned status and required local chart accounts. Afframe does not infer VAT entitlement, transfer price, or markup. The source controls the commercial facts; the target either accepts them unchanged under the supported local treatment or rejects the request.

### 6.9 Paired-invoice settlement and correction

Later payment uses the ordinary local bank and saldokonto workflows:

    Target: Debit 321, Credit bank
    Source: Debit bank, Credit 311

Each organization settles its own request-linked open item. APPLIED remains immutable. A rejected or cancelled request leaves the source issued invoice and receivable intact because they already committed. Cancellation, storno, credit note, or commercial dispute handling uses a later explicit local accounting workflow; Phase 1 never deletes or synchronously rewrites either book.

## 7. Minimal request state machine

The durable states are:

```text
PENDING -> APPLIED
PENDING -> REJECTED
PENDING -> CANCELLED
```

There is no durable request `DRAFT` state. An agent proposal remains in the existing HELD queue until human approval. A browser form remains ephemeral until an authorized human applies the source command.

### 7.1 PENDING

`PENDING` means:

- source approval succeeded;
- source accounting posting succeeded;
- the source request-linked open item exists, either payment due-from or invoice receivable;
- the safe shared request row exists;
- target accounting has not been materialized.

These effects commit atomically in one source withOrganization transaction. That helper derives app.workspace_id from the organization row, so the same transaction can write the safe workspace request and organization-attributed audit without a wrapping withWorkspace transaction.

### 7.2 APPLIED

`APPLIED` means:

- target approval succeeded;
- for payment on behalf, the selected supplier payable was settled and target due-to exists;
- for a paired invoice, the target received invoice and target payable exist;
- the shared request status was updated in the same target transaction.

`APPLIED` means the 2 reciprocal positions are recognized and linked. It does not mean either intercompany open item has been paid or settled.

### 7.3 REJECTED

`REJECTED` means the target declined the request. No target accounting is created. The source payment due-from or issued-invoice receivable remains open because source accounting already occurred. Only a bounded rejection code and optional safe note are shared.

### 7.4 CANCELLED

`CANCELLED` means the source withdrew a still-pending request before target application. No target accounting is created. The source open item remains and must be resolved through an ordinary reimbursement, storno, credit-note, or other separately authorized accounting process appropriate to the request kind.

### 7.5 Invalid transitions

The following fail with a conflict response:

- applying, rejecting, or cancelling a non-PENDING request;
- reapplying an APPLIED request with different input;
- changing participants, amount, currency, or shared business facts after creation;
- deleting any durable request;
- reopening a terminal request in Phase 1.

### 7.6 Agent proposal state machine

Agent proposals use the existing organization-local tool_call_log and have only these exposed transitions:

```text
HELD -> APPLIED
HELD -> REJECTED
```

APPLIED means the registered local operation and its request mutation committed. REJECTED means a human declined the proposal without executing it. A validation, accounting, concurrency, or transport failure rolls the resolution transaction back and leaves HELD so a human can retry or reject. Phase 1 has no durable FAILED proposal state and no second transaction only to record one. A direct human command has no HELD state; it atomically returns applied or fails.

## 8. Architecture

The MVP adds one typed workspace request table and one organization-local correlation on open_item. It does not add relationship, case, graph, or replicated-document infrastructure.

    Source organization transaction
      -> reauthorize current owner/admin human
      -> resolve an agent HELD proposal or run a direct human command
      -> lock and consume local BANK_STATEMENT payment record
      -> local posting using its document and event
      -> local due-from RECEIVABLE
      -> shared request in PENDING

    Target organization transaction, later
      -> reauthorize current owner/admin human
      -> resolve an agent HELD proposal or run a direct human command
      -> lock local supplier PAYABLE
      -> allocate local INTERNAL document and event numbers
      -> local clearing posting
      -> settle supplier PAYABLE
      -> local due-to PAYABLE
      -> shared request becomes APPLIED

    Paired-invoice source organization transaction
      -> reauthorize current owner/admin human
      -> resolve an agent HELD proposal or run a direct human command
      -> create one local event
      -> capture local ISSUED_INVOICE and allocate source designation
      -> shared PAIRED_INVOICE request in PENDING
      -> book local invoice and open linked 311 RECEIVABLE

    Paired-invoice target organization transaction, later
      -> reauthorize current owner/admin human
      -> resolve an agent HELD proposal or run a direct human command
      -> lock and reparse immutable shared invoice facts
      -> create one local event and RECEIVED_INVOICE
      -> preserve source designation as external reference
      -> book local invoice and open linked 321 PAYABLE
      -> shared request becomes APPLIED

Existing accounting and tenancy primitives remain authoritative:

- withOrganization() supplies one organization-bound transaction and derives app.workspace_id from the organization row; each command constructs OrgCtx from trusted server-derived organization and workspace values, and mutation commands do not add a redundant outer withWorkspace frame;
- writeAuditEvent() is broadened at its single-writer boundary to accept WorkspaceBoundDb or OrganizationBoundDb; its SQL and redaction contract stay unchanged, and RLS tests prove an organization-bound transaction can write only its attributed organization/workspace audit event;
- lockPeriodInTx() enforces the selected local period;
- postDoubleEntry() creates the balanced posting;
- openItem() and settleOpenItem() maintain saldokonto;
- number-series allocation creates frozen local designations;
- captureDocument() and bookDocument() remain the invoice capture and posting engines;
- tool_call_log provides local idempotency, stored input, attribution, and replay;
- audit_event records safe lifecycle events.

The feature adds two dedicated service primitives.

First, authority is split by principal type. assertAgentIntercompanyAuthority(db, ctx, principal, action) rereads the bound api_key row by keyId inside the organization transaction and verifies organization, workspace, user binding, actor_kind = agent, expiry, revocation, the exact action scope, and the bound user's current linked memberships. assertHumanIntercompanyAuthority(db, ctx, userId, action) verifies current linked memberships and requires owner or admin for final source or target actions, rejection, and cancellation. organization_membership.role = agent grants no API-key capability and no final action.

Second, runHeldCollaborationProposal() always writes a HELD tool_call_log result for an API or MCP proposal. It maps the verified API-key capability value `agent` to the existing audit actor value `ai_on_behalf`, preserving the bound user and required conversation ID. It accepts no confidence, evidence score, hold amount, or auto-apply controls. runDirectIntercompanyCommand() gives a Better Auth owner or admin a separate execution path that writes a human tool_call_log idempotency anchor, executes the registered command in the same transaction, and records auto_applied = true. This is an execution log, not a fabricated agent proposal. runGatedWrite() is not reused.

A shared operation registry supplies the only dispatch:

| Operation name                     | Stored schema            | Resolver                     | Agent proposable |
| ---------------------------------- | ------------------------ | ---------------------------- | ---------------- |
| intercompany.createPaymentOnBehalf | Payment source V1        | executeSourcePaymentOnBehalf | Yes              |
| intercompany.applyPaymentOnBehalf  | Payment target V1        | executeTargetPaymentOnBehalf | Yes              |
| intercompany.createPairedInvoice   | Paired-invoice source V1 | executeSourcePairedInvoice   | Yes              |
| intercompany.applyPairedInvoice    | Paired-invoice target V1 | executeTargetPairedInvoice   | Yes              |
| intercompany.rejectRequest         | Human reject V1          | executeTargetReject          | No               |
| intercompany.cancelRequest         | Human cancel V1          | executeSourceCancel          | No               |

The 4 accounting operations have `agentProposable: true`. The 2 governance transitions have `agentProposable: false`, are accepted only by runDirectIntercompanyCommand, and can never enter HELD, proposal-status, MCP, or Brain surfaces.

Each registry entry also owns its human resolution schema. intercompany.applyPairedInvoice validates a strict resolution envelope against the locked request: STANDARD approval requires `{ decision: "APPROVE", confirmFullVatDeduction: true }`; OUTSIDE_VAT approval requires `{ decision: "APPROVE" }` and rejects the confirmation field. A target direct command uses the same conditional confirmation schema. Web renders the STANDARD checkbox and the API accepts the exact field in its human resolve or direct-command DTO. The validated envelope becomes `execution.humanConfirmation`; it is target-local audit context and never enters shared_payload. Other operations reject this field.

The API HELD resolver and web HELD resolver call the same registry. They lock the tool_call_log row, require HELD, reparse the stored payload, verify an agent-proposable operation name, deny agent resolution, call assertHumanIntercompanyAuthority again, execute once, and persist the exact terminal result. For the 4 agent-proposable intercompany operations, the same bound user may approve after entering a current owner/admin human session and passing fresh authorization. Both resolvers read that explicit operation policy from the registry; non-intercompany operations keep their existing separation rule. Unknown and human-only names fail closed in HELD resolution. No resolver switch may reconstruct input ad hoc. The sanitized proposal-status read maps the local result to HELD, APPLIED, or REJECTED without exposing stored input, local accounting IDs, reviewer identity, or resolver controls. An execution error rolls back and leaves the proposal HELD; no second transaction is added solely to persist a FAILED state.

Explicit target human acceptance executes the target command directly. It never creates a second HELD review. Proposal author attribution remains available for a future organization-specific separation-of-duties policy without changing either accounting adapter.

## 9. Data model

### 9.1 intercompany_request

This is the only new shared table. It is workspace-scoped and uses FORCE RLS.

| Column                 | Type                 | Rule                                                       |
| ---------------------- | -------------------- | ---------------------------------------------------------- |
| id                     | uuid                 | Server-generated request reference.                        |
| workspace_id           | uuid                 | Composite tenancy anchor.                                  |
| source_organization_id | uuid                 | Payer or invoice issuer.                                   |
| target_organization_id | uuid                 | Beneficiary or invoice recipient.                          |
| source_party_id        | uuid                 | Workspace protected self counterparty for source.          |
| target_party_id        | uuid                 | Workspace protected self counterparty for target.          |
| kind                   | enum                 | PAYMENT_ON_BEHALF or PAIRED_INVOICE, exactly.              |
| status                 | enum                 | PENDING, APPLIED, REJECTED, CANCELLED.                     |
| schema_version         | integer              | Starts at 1 and selects the strict payload schema.         |
| amount                 | numeric(19,4)        | Positive gross amount of both linked positions.            |
| currency               | char(3)              | CHECK currency = 'CZK'.                                    |
| shared_payload         | jsonb                | Immutable, bounded, versioned discriminated-union payload. |
| terminal_reason_code   | enum nullable        | Bounded rejection or cancellation code.                    |
| terminal_note          | text nullable        | Length-limited safe note.                                  |
| created_at             | timestamptz          | Server timestamp.                                          |
| applied_at             | timestamptz nullable | APPLIED only.                                              |
| rejected_at            | timestamptz nullable | REJECTED only.                                             |
| cancelled_at           | timestamptz nullable | CANCELLED only.                                            |
| updated_at             | timestamptz          | Server controlled.                                         |

The workspace party IDs are directory identities, not organization-local ledger IDs. Composite foreign keys validate each against counterparty(id, workspace_id). A constraint trigger verifies source_party_id is the protected self row for source_organization_id and target_party_id is the protected self row for target_organization_id.

Required database constraints:

- source differs from target;
- both organizations belong to workspace_id;
- UNIQUE(id, workspace_id) exists for composite local references;
- amount is greater than zero and currency is CZK;
- kind is one of the 2 closed enum values;
- shared_payload is a JSON object, stays within the request-size bound, and its kind and version markers equal the row columns;
- only the timestamp matching status is non-null;
- terminal reason is present only for REJECTED or CANCELLED;
- bounded text length checks apply;
- participant party mappings remain exact.

The shared row contains no user IDs, idempotency keys, payload fingerprints, evidence hashes, or local accounting UUIDs. Those values remain in each organization's tool_call_log and audit trail.

shared_payload is not a generic extension bag. `IntercompanySharedPayloadV1` is a strict Zod discriminated union with exactly these variants, and every writer and reader reparses it:

    {
      kind: "PAYMENT_ON_BEHALF"
      version: 1
      supplier: { displayName, ico?, taxId? }
      supplierInvoice: { number, issueDate, dueDate? }
      paymentDate
      reimbursementDueDate?
    }

    {
      kind: "PAIRED_INVOICE"
      version: 1
      sourceInvoiceDesignation
      issuedAt
      taxPointDate
      dueDate?
      description
      sourceIdentity: { displayName, ico?, taxId?, countryCode }
      targetIdentity: { displayName, ico?, taxId?, countryCode }
      sourceSupplyKind
      quantity?
      measureUnit?
      unitPrice?
      baseAmount
      vat: { mode: "STANDARD", jurisdiction: "DOMESTIC", rate: "21", amount }
         | { mode: "OUTSIDE_VAT", jurisdiction: "OUTSIDE_VAT", rate: null, amount: "0" }
    }

All money values are canonical numeric strings and the row amount equals baseAmount plus VAT amount for PAIRED_INVOICE. Payment amount and date are derived from the locked source bank record. Paired source designation and identity snapshots are server-derived. The serialized payload is at most 16 KiB. Display names and invoice/designation values are at most 255 characters, tax IDs 32, country code 2, description 2,000, measure unit 32, terminal note 1,000, and every reason is an enum. The 2 variants reject unknown fields. Adding a third workflow requires an enum migration, a new schema version or union member, explicit operations, RLS and accounting review; JSON alone cannot extend the platform.

The database adds two guards:

1. A BEFORE UPDATE trigger rejects changes to every business fact, participant, party, kind, schema version, amount, currency, shared payload, and created timestamp. It permits only PENDING to APPLIED, REJECTED, or CANCELLED, validates directional transition metadata, and requires a transaction-local transition marker set by the domain command.
2. A BEFORE DELETE trigger always raises. Requests are never deleted, including after terminal status.

Direct SQL cannot reopen a request, rewrite status history, or change the shared business facts that accounting relied on.

### 9.2 Organization-local open_item link

Add nullable fields:

    intercompany_request_id uuid
    collaboration_position
      PAYMENT_SOURCE_DUE_FROM
      PAYMENT_TARGET_DUE_TO
      INVOICE_SOURCE_RECEIVABLE
      INVOICE_TARGET_PAYABLE
    source_payment_individual_record_id uuid

Rules:

- both fields are null or both are non-null;
- (intercompany_request_id, workspace_id) references request(id, workspace_id) ON DELETE RESTRICT;
- unique (organization_id, intercompany_request_id) where non-null;
- (source_payment_individual_record_id, organization_id) has an organization-safe foreign key to individual_record(id, organization_id);
- source_payment_individual_record_id is unique per organization where non-null;
- RECEIVABLE requires PAYMENT_SOURCE_DUE_FROM or INVOICE_SOURCE_RECEIVABLE;
- PAYABLE requires PAYMENT_TARGET_DUE_TO or INVOICE_TARGET_PAYABLE;
- PAYMENT_SOURCE_DUE_FROM requires source_payment_individual_record_id; every other position requires it to be null;
- a constraint trigger verifies the request kind, source or target ownership, position, direction, currency, and original amount;
- linked accounts track open items;
- the target supplier PAYABLE is not linked.

Extend OpenItemInput and OpenObligationInput with optional request ID, position, and source payment individual-record fields. bookDocument accepts optional collaboration correlation, passes it to openObligation, and returns the opened item ID with each posting. The shared request never points back to either local open item. Paired-invoice document trace remains available through open_item.origin_posting_id to posting and summary_record, so no document-link table is added.

The organization-local position read joins from the request link to the caller's open_item row without filtering on is_settled. It exposes only that participant's direction and balance facts plus an opaque local item reference. FORCE RLS and the ownership constraint make a sibling position unqueryable.

### 9.3 Local document and event model

No shared document is added.

Three nullable organization-local capture fields close existing structured-data gaps:

    individual_record.bank_movement_direction monetary_direction
    summary_record.external_reference text
    summary_record.due_date date

bank_movement_direction is allowed only when the parent summary_record type is BANK_STATEMENT. New bank-statement capture/import paths set INFLOW or OUTFLOW explicitly. Existing rows remain null; Phase 1 candidates require OUTFLOW and never infer direction or sign from description. Once a bank movement has a posting or intercompany link, its direction cannot change.

external_reference is the source document's number, distinct from summary_record.designation, which is Afframe's internal gapless number. Intercompany target application requires it on the traced RECEIVED_INVOICE. Existing invoices are not guessed or backfilled; a row with no external reference is ineligible for Phase 1.

due_date is valid only for invoice summary records. bookDocument passes it to openObligation so the linked 311 or 321 item can support ordinary overdue and saldokonto views. Phase 1 does not add a variable-symbol field.

These are full capture-contract additions, not migration-only columns. DocumentInput, IndividualRecordInput, captureDocument SQL, CaptureAccountingDocumentRequestSchema, invoice create/read contracts, DTOs, OpenAPI, SDK, and generated MCP tools must write and return the relevant structured fields. Type-specific schema and service validation reject bank direction on a non-bank document, reject dueDate on a non-invoice, and require externalReference where a received-invoice intercompany flow depends on it.

The current PATCH /v1/invoices/{invoiceId}/legal-dates path can update a booked summary_record without checking its posting. Phase 1 adds database-backed paired-invoice immutability guards. Once a summary record is the origin of an INVOICE_SOURCE_RECEIVABLE or INVOICE_TARGET_PAYABLE, its designation, issued_at, tax_point_date, received_date, due_date, external_reference, and rounding cannot change. Its accounting event party_id, counterparty_id, occurred_at, occurred_on, description, and content cannot change. Its linked individual description and partial monetary, quantity, unit, supply, VAT, currency, and frozen amount facts also cannot change. API and web paths return a conflict before attempting such an update. Correction requires a later explicit storno or credit-note workflow; it never rewrites the shared request or sibling book.

Source command input references one opaque sourceBankPaymentRecordRef that resolves under source FORCE RLS to exactly one individual_record. The adapter locks that individual record, its accounting_event, and its partial_record rows. It also reads the containing BANK_STATEMENT summary_record and period without treating the whole statement as consumed.

The supported Phase 1 shape is exactly one bank movement whose structured bank_movement_direction is OUTFLOW and which has exactly one positive CZK OUTSIDE_VAT partial with zero VAT and equal transaction/accounting-currency amount. Amount and currency come from that partial. Payment date comes from accounting_event.occurred_on. No amount sign, direction, or reference is inferred from description. A normal bank record may name the external supplier as its preposting event counterparty. After locking and proving the event is still unposted, source execution atomically reclassifies accounting_event.counterparty_id to the selected target protected-self party. It preserves the actual supplier and payee facts in the local record description and audit plus the bounded shared supplier snapshot. Other individual records in the same BANK_STATEMENT summary may already be posted and remain unaffected.

The posting reuses the selected summary_record and accounting_event, and every posting line carries the selected partial_record_id. Creating the immutable posting plus the uniquely linked PAYMENT_SOURCE_DUE_FROM open item marks only that individual record consumed. A second command sees the event, partial, or unique local-link conflict before committing. Local tool_call_log output stores the individual record, partial, posting, and request linkage for audit. None enters the shared row.

Target execution creates:

- one accounting_event with party = target protected self, counterparty = source protected self;
- one INTERNAL summary_record;
- one individual_record linking that event and summary record;
- one CZK OUTSIDE_VAT partial_record for the exact clearing amount;
- no duplicate supplier invoice;
- one clearing posting referencing that event and document, with both posting lines linked to the partial record.

Before any target number allocation, the adapter traces the selected supplier PAYABLE through origin_posting_id to its posting, RECEIVED_INVOICE summary record, accounting event, and supplier counterparty. It then requires:

- summary_record.external_reference equals the locked payment payload supplierInvoice.number after bounded whitespace normalization;
- the date part of summary_record.issued_at equals the payload supplierInvoice.issueDate;
- payload paymentDate is not before that invoice issue date, otherwise the fact pattern is a supplier advance and outside Phase 1;
- open_item.counterparty_id equals the traced invoice event counterparty;
- every supplied IČO and tax ID snapshot exactly matches the corresponding structured target counterparty field;
- the selected item is CZK, remains open, and has at least the request amount remaining.

Supplier name remains a bounded review label, not a substitute identity key. If neither IČO nor tax ID was supplied, exact external invoice number, issue date, traced counterparty, amount, and explicit target human approval provide the Phase 1 match. A mismatch fails before any accounting or request transition.

The target proposal selects one local EVENT number-series reference and one local DOCUMENT number-series reference. createInternalClearingDocumentAndEvent uses the repository's createEvent and captureDocument primitives to build the complete capture chain. Execution validates series entity types and organization, locks and allocates both gapless numbers, freezes both designations, and creates no VAT treatment. Failure rolls back the allocations and capture chain with the transaction.

For paired invoices, each side creates exactly one event and one invoice individual record with one partial. The source sequence is intentionally captureDocument, insert request, then bookDocument in one transaction: capture allocates the source legal designation, the request stores that designation, and booking receives the request correlation before openObligation creates the 311 item. The target request already exists, so it creates its local event, calls captureDocument with RECEIVED_INVOICE and externalReference = sourceInvoiceDesignation, then calls bookDocument with the target correlation.

The special adapter does not call the public invoice controller and does not HTTP-chain ordinary endpoints. It directly reuses createEvent, captureDocument, bookDocument, classifyEvent, expandScenarioEntries, postDoubleEntry, and openObligation under one locked withOrganization transaction. captureAndBookIfInvoice remains the ordinary approval helper; the paired source requires the narrow request-insertion seam between capture and booking.

Both sides validate period and EVENT and DOCUMENT number-series ownership and type. Source event party and counterparty are source self and target self. Target event party and counterparty are target self and source self. The source designation becomes only the target external reference; the target designation and every UUID remain target-local.

## 10. RLS model

All affected tables retain FORCE RLS.

### 10.1 Request policies

Organization-bound SELECT requires:

    workspace_id = app.workspace_id
    and app.organization_id in (source_organization_id, target_organization_id)

Browser workspace SELECT requires both app_is_workspace_member(workspace_id, app.user_id) and an active organization membership for app.user_id in the source or target. An inactive workspace membership fails even if a stale organization membership remains active. This read policy does not grant mutation authority.

INSERT is source-directional. UPDATE is source-directional for CANCELLED and target-directional for APPLIED or REJECTED. The transition trigger, transaction-local marker, and appropriate human or agent authority helper all still apply. No DELETE policy exists and the delete trigger rejects bypass attempts.

### 10.2 Local accounting policies

Source bank records, target invoices, periods, accounts, events, documents, postings, open items, settlements, number series, and tool logs remain organization-local. A participant can never query the other participant's local accounting identifiers.

Runtime cross-book reconciliation is deferred. Phase 1 does not add an operator endpoint, background job, cross-tenant read model, or mismatch metric.

### 10.3 Directory query

The directory is derived from workspace-scoped protected self counterparty rows:

    counterparty.workspace_id = current workspace
    and counterparty.self_of_organization_id is not null

partyRef is exactly counterparty.id. The result returns partyRef, name, optional IČO, and optional tax ID already present on that protected row. It omits memberships, users, responsibility, roles, books, documents, settings, keys, and bank data.

A browser reader needs active workspace membership. An agent reader also needs a user-bound organization key, exact directory scope, and current active workspace and organization memberships for the key's bound user. The query uses counterparty workspace RLS and no admin bypass.

### 10.4 RLS and transaction matrix

| Operation                           | Transaction context                                               | RLS-visible data                                                                           | Service authority                                                                                | Audit                                                              |
| ----------------------------------- | ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------ |
| Browser safe directory              | withWorkspace                                                     | Protected-self counterparty rows in exact workspace                                        | Active workspace membership                                                                      | Access metric only                                                 |
| Agent safe directory                | Bound withOrganization                                            | Protected-self counterparty rows in bound workspace                                        | assertAgentIntercompanyAuthority with directory scope                                            | Local access metric                                                |
| Browser request list/read           | withWorkspace                                                     | Requests where active workspace plus active participant-organization membership both exist | Participant read                                                                                 | No local IDs logged                                                |
| Agent request list/read             | Bound withOrganization                                            | Requests where bound organization is source or target                                      | Current key row, exact read scope, active bound-user memberships                                 | Local read audit when policy requires                              |
| Agent proposal status               | Bound withOrganization                                            | Sanitized tool_call_log result in bound organization only                                  | Current key row, exact request-read scope, active bound-user memberships                         | Local read audit when policy requires                              |
| Participant local position          | Bound withOrganization or authorized browser organization context | Caller organization's request-linked open_item, settled or unsettled                       | Participant membership and exact request-read scope for a key                                    | No sibling item or local details logged                            |
| Source/target candidates            | Bound withOrganization                                            | Eligible records, accounts, items, and series from bound organization only                 | Current key row, exact candidates scope, active bound-user memberships, target participant check | Local access metric                                                |
| Agent proposal                      | Bound withOrganization                                            | Organization-local tool_call_log only                                                      | Exact proposal scope plus source or target participant check                                     | ai_on_behalf actor, bound user, conversation, canonical input hash |
| Direct or resolved source execution | One source withOrganization transaction                           | Source accounting rows plus source-directional request INSERT                              | assertHumanIntercompanyAuthority owner/admin                                                     | Local applied execution log plus source-side safe workspace audit  |
| Direct or resolved target execution | One target withOrganization transaction                           | Target accounting rows plus target-directional request UPDATE                              | assertHumanIntercompanyAuthority owner/admin                                                     | Local applied execution log plus target-side safe workspace audit  |
| Direct reject/cancel                | One directional withOrganization transaction                      | Locked PENDING request only                                                                | Target owner/admin rejects; source owner/admin cancels                                           | Local resolved execution log plus bounded safe workspace audit     |
| Reimbursement                       | Separate ordinary withOrganization transaction in each book       | That organization's open item and settlement only                                          | Existing local payment authority                                                                 | Existing local accounting audit                                    |

## 11. Authorization

Phase 1 deliberately reuses the repository's current organization role boundary. After login, the active workspace and organization context resolves the user's current memberships and role automatically; the user enters no second key or collaboration credential. An active owner or admin may perform final local accounting actions. Active member and agent session roles may read participant requests but cannot finally post, reject, or cancel. A guest is denied. organization_membership.role = agent is not an API-key capability and cannot substitute for actor_kind = agent on a verified organization-bound key. A future granular accounting capability may replace this role mapping without changing the request or accounting model.

### 11.1 Authority helpers

Both helpers are transaction-local, action-specific, and fail-closed.

assertHumanIntercompanyAuthority verifies in one query or locked query set:

- ctx.organizationId and ctx.workspaceId match the organization row;
- the matching workspace_membership is active;
- the matching organization_membership is active;
- organization_membership.workspace_membership_id points to that active workspace membership;
- both membership workspace IDs equal ctx.workspaceId;
- the command side and action match the request;
- EXECUTE, REJECT, and CANCEL require owner or admin at action time;
- the actor remains authorized at resolution or direct execution time.

assertAgentIntercompanyAuthority receives the complete internal principal, including a new keyId field. It rereads api_key by that ID inside the organization transaction and requires the row to remain non-revoked, non-expired, user-bound, bound to ctx.organizationId and ctx.workspaceId, actor_kind = agent, and explicitly granted the exact action scope. It then checks the bound user's current linked workspace and organization memberships. A role named agent alone never passes this helper.

An inactive membership, changed role, stale key, wrong participant, or mismatched workspace fails before request or ledger mutation. The public principal never accepts keyId from input; verifyApiKey derives it from the matched database row.

### 11.2 Matrix

| Action                      | Agent key                                       | Active owner/admin                | Active member/agent session       | Workspace-only member                  |
| --------------------------- | ----------------------------------------------- | --------------------------------- | --------------------------------- | -------------------------------------- |
| List safe directory         | User-bound, exact scope, current memberships    | Read                              | Read                              | Read                                   |
| Read participant request    | User-bound, exact scope, participant membership | Read                              | Read                              | Denied without organization membership |
| Read local proposal status  | Bound organization and exact scope              | Read own organization             | Read own organization             | Denied                                 |
| Read local debt position    | Participant-bound and exact scope               | Read own organization             | Read own organization             | Denied                                 |
| Create source HELD proposal | Source-bound, exact scope, always HELD          | Direct source command             | Denied                            | Denied                                 |
| Resolve source operation    | Denied                                          | Source only, fresh authority      | Denied                            | Denied                                 |
| Create target HELD proposal | Target-bound, exact scope, always HELD          | Direct target command             | Denied                            | Denied                                 |
| Resolve target operation    | Denied                                          | Target only, fresh authority      | Denied                            | Denied                                 |
| Reject PENDING              | Denied                                          | Target only, fresh authority      | Denied                            | Denied                                 |
| Cancel PENDING              | Denied                                          | Source only, fresh authority      | Denied                            | Denied                                 |
| Access raw source evidence  | Denied                                          | Existing source-local policy only | Existing source-local policy only | Denied                                 |

An identity in both organizations is checked independently in each OrgCtx. Source results are never cached for target authorization. An agent operating for both organizations uses 2 independently scoped organization keys; no credential spans both books.

## 12. HELD, idempotency, API, and MCP contracts

### 12.1 Unconditional HELD runner

runHeldCollaborationProposal accepts an organization-bound API principal, idempotency key, registered operation name, normalized body, and conversationId. It:

1. requires a user ID;
2. requires conversationId for an agent;
3. enters withOrganization using exactly principal.organizationId, with no selected-organization overload;
4. calls assertAgentIntercompanyAuthority inside the transaction and rereads principal.keyId;
5. maps principal.actorKind = agent to tool_call_log.actor_kind = ai_on_behalf and preserves the bound user and conversation ID;
6. calls writeToolCallLog for the proposal;
7. compares the local canonical payload hash on replay;
8. returns the prior result for the same key and payload;
9. conflicts for the same key and different payload;
10. writes status HELD without invoking the domain adapter.

For direct Better Auth actions, a signed one-use form submission token supplies the idempotency key to runDirectIntercompanyCommand. That command writes a human tool_call_log row, runs the same registered domain adapter, and stores the applied result atomically. Agent proposals remain HELD and can never enter this direct path.

runDirectIntercompanyCommand accepts only registered operations with the correct direct policy. It admits the 4 accounting commands for authorized human preparation and the 2 human-only request transitions. For paired target STANDARD it receives the same strict `confirmFullVatDeduction: true` resolution field as HELD approval. This is one approval action under D3, not another HELD layer.

### 12.2 Scope guard

Public inputs never accept organization_id, workspace_id, user_id, role, responsibility, or membership claims. The organization comes from the key. Collaboration routes reject null, empty, duplicate, and unknown scopes before checking the exact required scope.

Scopes:

- collaboration:directory:read;
- collaboration:request:read;
- collaboration:candidates:read;
- collaboration:request:propose;
- collaboration:request:review;
- collaboration:request:cancel.

No legacy empty-scope full-access behavior applies.

The current Brain-agent key issuance profile grants only accounting:write and therefore cannot call these tools. Phase 1 updates the admin issuance profile, UI, tests, and operator runbook to offer one explicit collaboration proposal bundle containing only:

- collaboration:directory:read;
- collaboration:request:read;
- collaboration:candidates:read;
- collaboration:request:propose.

Existing keys are never widened silently. An operator must reissue or rotate an organization-bound, user-bound Brain key with this bundle. The bundle does not contain review or cancel scopes and does not change the bound user's current organization authority.

### 12.3 Directory and reads

    GET /v1/collaboration/directory
    GET /v1/collaboration/requests?direction=sent|received&status=PENDING
    GET /v1/collaboration/requests/{requestRef}

Directory item:

    {
      partyRef: string
      displayName: string
      ico?: string
      taxId?: string
    }

Request responses expose requestRef, kind, direction, status, amount, CZK currency, strict shared payload, terminal reason/note when present, and lifecycle timestamps. They expose no organization-local UUID, user, key, reviewer, idempotency, evidence, or sibling-balance field.

MCP tools:

- list_collaboration_organizations;
- list_collaboration_requests;
- get_collaboration_request.

### 12.4 Organization-local preparation candidates

Agents must be able to discover every opaque reference required by the proposal tools. Existing public reads do not expose all eligible bank movements, supplier items, periods, and series under one collaboration policy, so Phase 1 adds 4 bounded organization-local reads:

    GET /v1/collaboration/payment-on-behalf/source-candidates
    GET /v1/collaboration/requests/{requestRef}/target-candidates
    GET /v1/collaboration/paired-invoices/source-candidates
        ?issuedAt=ISO-8601
        &taxPointDate=YYYY-MM-DD
        &vatMode=STANDARD|OUTSIDE_VAT
        &sourceSupplyKind=GOODS|MATERIAL|SERVICES|UTILITY|RENT|INSURANCE|OTHER
    GET /v1/collaboration/requests/{requestRef}/invoice-target-candidates

The source response contains only eligible unposted CZK bank-payment individual records with structured OUTFLOW direction, including ordinary records whose current event counterparty is the supplier, eligible local bank accounts, and eligible local due-from accounts. The target response is available only to the request target and contains only eligible local supplier PAYABLEs traced to RECEIVED_INVOICE records, their external reference, issue date, supplier display identity, remaining amount, eligible local due-to accounts, and eligible local EVENT and DOCUMENT number series. Every returned value uses an opaque local reference plus the minimal display facts needed to choose and deterministically validate it.

The paired source query facts are read-only planning inputs, not persisted authority claims. The response contains eligible local CZK periods containing both issuedAt and taxPointDate, the time-versioned source VAT status, support for that exact mode and source supply kind, all required derived chart accounts, and local EVENT and DOCUMENT number series. STANDARD returns eligible only for source PAYER and the current 21 percent catalogue. OUTSIDE_VAT returns eligible only for source NON_PAYER or IDENTIFIED_PERSON. The paired target response is available only for a PAIRED_INVOICE request target. It returns eligible CZK periods containing the locked issue and tax-point dates, local series, supported target purchase supply kinds, and whether the current target VAT status can accept the locked STANDARD or OUTSIDE_VAT facts. It never returns source-local identifiers.

All 4 reads run under the principal's bound withOrganization context, require current active memberships and the exact collaboration:candidates:read scope, and never expose sibling-book identifiers. A target endpoint additionally proves that the bound organization is the locked request target and that the request kind matches. The browser preparation UI reuses the same query services. MCP tools:

- list_payment_on_behalf_source_candidates;
- list_payment_on_behalf_target_candidates;
- list_paired_invoice_source_candidates;
- list_paired_invoice_target_candidates.

### 12.5 Agent-visible proposal and debt status

Agents receive two narrow organization-local reads:

    GET /v1/collaboration/proposals/{approvalRef}
    GET /v1/collaboration/requests/{requestRef}/local-position

The proposal response is sanitized from the local tool_call_log:

    {
      approvalRef: string
      operation: string
      status: "HELD" | "APPLIED" | "REJECTED"
      requestRef?: string
      createdAt: string
      resolvedAt?: string
    }

HELD means unresolved. APPLIED means the registered source or target operation committed. REJECTED means a human rejected the proposal without executing it. An execution error rolls back, returns a bounded error to the human caller, and leaves the proposal HELD. Every successfully applied operation returns requestRef; a source operation can supply it only after request creation commits. The query must constrain tool_call_log.tool_name to exactly the 4 agent-proposable intercompany operation names before mapping any result; an organization-local collaboration read key cannot probe unrelated accounting or human-only transition rows. The response never exposes stored input, payload hashes, idempotency keys, reviewer identities, raw rationale, or local accounting identifiers. It runs under the principal's exact bound organization, current key and membership checks, FORCE RLS, and collaboration:request:read scope. MCP tool: `get_collaboration_proposal_status`.

The local-position response queries the caller organization's open_item link by request, including settled rows:

    {
      requestRef: string
      position: "PAYMENT_SOURCE_DUE_FROM" | "PAYMENT_TARGET_DUE_TO"
              | "INVOICE_SOURCE_RECEIVABLE" | "INVOICE_TARGET_PAYABLE"
      direction: "RECEIVABLE" | "PAYABLE"
      originalAmount: string
      settledAmount: string
      remainingAmount: string
      currencyCode: "CZK"
      dueDate?: string
      isSettled: boolean
      localOpenItemRef: string
    }

It requires participant membership and collaboration:request:read, returns only the caller organization's side, and works after reimbursement. Before that side exists it returns not found without revealing whether a sibling item exists. MCP tool: `get_collaboration_local_position`.

The existing generated `get_accounting_open_items` and `get_accounting_saldokonto` MCP tools remain the general organization-local balance views. The dedicated local-position read supplies durable request correlation for either workflow without adding a cross-book balance endpoint or reconciliation privilege. Under D4, agents propose and monitor while humans finally apply; read access does not imply posting authority.

### 12.6 Source proposal

    POST /v1/collaboration/payment-on-behalf/proposals
    Idempotency-Key: required

Input:

    {
      targetPartyRef: string
      sourceBankPaymentRecordRef: string
      dueFromAccountRef: string
      bankAccountRef: string
      supplierName: string
      supplierIco?: string
      supplierTaxId?: string
      supplierInvoiceNumber: string
      supplierInvoiceIssueDate: string
      supplierInvoiceDueDate?: string
      reimbursementDueDate?: string
      conversationId?: string
    }

Amount, currency, payment date, and OUTFLOW direction are derived from the locked source record. The client cannot override them. No payment-reference field is accepted or shared in Phase 1. conversationId is required for an agent. The result is always:

    {
      status: "HELD"
      approvalRef: string
    }

MCP tool: propose_payment_on_behalf.

### 12.7 Target application proposal

    POST /v1/collaboration/requests/{requestRef}/application-proposals
    Idempotency-Key: required

Input:

    {
      supplierOpenItemRef: string
      dueToAccountRef: string
      targetEventNumberSeriesRef: string
      targetDocumentNumberSeriesRef: string
      conversationId?: string
    }

The target and accounting date come from the locked request; the client cannot choose either. Local references resolve only under target FORCE RLS. An API or MCP proposal result is always HELD. MCP tool: propose_payment_on_behalf_application.

There is no MCP operation for final HELD resolution. The existing human API and web resolver surfaces dispatch through the shared stored-operation registry.

### 12.8 Paired-invoice source proposal

    POST /v1/collaboration/paired-invoices/proposals
    Idempotency-Key: required

Input:

    {
      targetPartyRef: string
      sourcePeriodRef: string
      sourceEventNumberSeriesRef: string
      sourceDocumentNumberSeriesRef: string
      issuedAt: string
      taxPointDate: string
      dueDate?: string
      description: string
      sourceSupplyKind: "GOODS" | "MATERIAL" | "SERVICES" | "UTILITY"
                      | "RENT" | "INSURANCE" | "OTHER"
      quantity?: string
      measureUnit?: string
      unitPrice?: string
      baseAmount: string
      vat:
        | { mode: "STANDARD", rate: "21", amount: string }
        | { mode: "OUTSIDE_VAT" }
      conversationId?: string
    }

The input contains no event, document, posting, open-item, account, organization, user, role, confidence, evidence, or accounting-currency override. The adapter creates the local event. A non-null taxPointDate is required for both supported VAT modes so the booked and shared invoice never carries unresolved legal dates. It derives currency CZK, jurisdiction, frozen accounting-currency amounts, rounding zero, source and target legal identity snapshots, gross request amount, and source designation. STANDARD requires a valid source PAYER status at the tax point and exact 21 percent VAT arithmetic. OUTSIDE_VAT derives null rate and zero VAT and requires source NON_PAYER or IDENTIFIED_PERSON. An agent result is always HELD. MCP tool: `propose_paired_invoice`.

### 12.9 Paired-invoice target proposal

    POST /v1/collaboration/requests/{requestRef}/invoice-application-proposals
    Idempotency-Key: required

Input:

    {
      targetPeriodRef: string
      targetEventNumberSeriesRef: string
      targetDocumentNumberSeriesRef: string
      receivedDate: string
      targetSupplyKind: "GOODS" | "MATERIAL" | "SERVICES" | "UTILITY"
                      | "RENT" | "INSURANCE" | "OTHER"
      vatDeductible?: true
      conversationId?: string
    }

The target can choose only these local booking facts. The locked request supplies source designation, identities, issue date, tax point, due date, description, quantity, unit, unit price, base, VAT mode, VAT rate, VAT amount, currency, and gross total. The target cannot override them. STANDARD requires current target PAYER status and vatDeductible = true; false and partial values are invalid. The final approval request must also carry `confirmFullVatDeduction: true` from the human approval surface. A stored agent value alone never satisfies that confirmation. It is part of the same D3 approval, not a second review, and remains target-local. OUTSIDE_VAT prohibits both fields, carries no input VAT, and does not constrain target VAT status. An agent result is always HELD. MCP tool: `propose_paired_invoice_application`.

There is no MCP operation for final paired-invoice resolution. A current target owner or admin accepts or rejects through the shared human resolver.

### 12.10 Reject and cancel

Rejection is target-only and cancellation is source-only. A human owner or admin executes either directly through runDirectIntercompanyCommand with a bounded reason code and optional bounded safe note. The command reruns assertHumanIntercompanyAuthority, locks the PENDING request, and performs only the guarded status transition plus local and safe audit. Agents can read the resulting request state but Phase 1 adds no agent proposal tool for these human governance choices. Neither operation mutates accounting.

### 12.11 Brain tool policy

Generating MCP tools does not make them callable by Afframe Brain. The implementation must explicitly add these tools to the default-deny lists in packages/brain/src/agent/sandbox.ts.

Read allowlist additions:

- list_collaboration_organizations;
- list_collaboration_requests;
- get_collaboration_request;
- list_payment_on_behalf_source_candidates;
- list_payment_on_behalf_target_candidates;
- list_paired_invoice_source_candidates;
- list_paired_invoice_target_candidates;
- get_collaboration_proposal_status;
- get_collaboration_local_position.

Write allowlist additions:

- propose_payment_on_behalf;
- propose_payment_on_behalf_application;
- propose_paired_invoice;
- propose_paired_invoice_application.

The policy continues to deny held-write listing and resolution, direct rejection and cancellation, shell, arbitrary network, filesystem access, and any unlisted generated tool. Policy tests prove every required collaboration tool is callable by Brain and every final authority surface remains denied.

## 13. Payment-on-behalf source transaction

Source execution may be entered from a human resolution of a stored agent proposal or from runDirectIntercompanyCommand for a Better Auth owner or admin. Both paths provide the same validated input and locked local execution log to one adapter.

    const ctx = { organizationId: sourceOrganizationId, workspaceId }
    await withOrganization(sourceOrganizationId, userId, async (db) => {
          await assertHumanIntercompanyAuthority(db, ctx, userId, "SOURCE_EXECUTE")
          const execution = await lockValidatedExecutionInput(
            db,
            executionRef,
            "intercompany.createPaymentOnBehalf",
          )
          const input = execution.input

          const record = await lockSourceBankPaymentRecord(
            db,
            ctx,
            input.sourceBankPaymentRecordRef,
          )
          assertBankStatementRecord(record)
          assertExactlyOneSupportedOutgoingMovement(record)
          assertNoPostingForEvent(record.accountingEventId)
          assertNoPostingLineForPartials(record.partialRecordIds)
          assertCurrency(record, "CZK")
          const originalPayee = snapshotOriginalPayee(record)

          const period = await resolveAccountingPeriod(db, ctx, record.periodId)
          await lockPeriodInTx(db, ctx.organizationId, period.id)
          assertAccountingCurrency(period, "CZK")

          const dueFrom = await resolveSelectedAccount(
            db,
            ctx,
            record.periodId,
            input.dueFromAccountRef,
            { nature: "ASSET", normalBalance: "DEBIT", tracksOpenItems: true },
          )
          const bank = await resolveSelectedAccount(
            db,
            ctx,
            record.periodId,
            input.bankAccountRef,
            { nature: "ASSET", normalBalance: "DEBIT" },
          )
          const targetParty = await resolveProtectedSelfParty(
            db,
            ctx.workspaceId,
            input.targetPartyRef,
          )
          assertDifferentOrganization(ctx.organizationId, targetParty.organizationId)
          await reclassifyUnpostedPaymentEventCounterparty(
            db,
            ctx,
            record,
            targetParty.id,
            originalPayee,
          )

          const request = await insertPendingRequest(db, {
            kind: "PAYMENT_ON_BEHALF",
            sourceOrganizationId: ctx.organizationId,
            targetOrganizationId: targetParty.organizationId,
            sourcePartyId: await sourceSelfPartyId(db, ctx),
            targetPartyId: targetParty.id,
            safeBankFacts: record,
            safeSupplierFacts: boundedSupplierSnapshot(input, originalPayee),
            currency: "CZK",
          })
          const posting = await postDoubleEntry(db, ctx, {
            periodId: record.periodId,
            summaryRecordId: record.summaryRecordId,
            accountingEventId: record.accountingEventId,
            postingDate: record.paymentDate,
            responsibleUserId: userId,
            lines: [
              { accountId: dueFrom.id, side: "DEBIT", amount: record.amount, partialRecordId: record.paymentPartialRecordId },
              { accountId: bank.id, side: "CREDIT", amount: record.amount, partialRecordId: record.paymentPartialRecordId },
            ],
          })
          await openItem(db, ctx, {
            counterpartyId: targetParty.id,
            originPostingId: posting.postingId,
            accountNumber: dueFrom.number,
            direction: "RECEIVABLE",
            originalAmount: record.amount,
            currencyCode: "CZK",
            issueDate: record.paymentDate,
            dueDate: input.reimbursementDueDate ?? null,
            variableSymbol: null,
            intercompanyRequestId: request.id,
            collaborationPosition: "PAYMENT_SOURCE_DUE_FROM",
            sourcePaymentIndividualRecordId: record.individualRecordId,
          })
          await completeLocalExecutionLog(db, execution, localSourceResult(request, posting))
          await writeAuditEvent(db, safeLifecycleAudit(ctx, request, "created"))
          return request
    })

The locked individual record, event-level no-posting check, partial-line no-reference check, partial-linked posting lines, and unique PAYMENT_SOURCE_DUE_FROM individual-record link mark only that payment movement consumed. Other individuals in the BANK_STATEMENT summary remain independently postable. The request and source accounting commit together.

## 14. Payment-on-behalf target transaction

Target execution uses the same dual entry path: a human resolves a stored agent proposal and applies it directly, or an owner or admin enters the direct command. The target accounting date is the locked payment payload paymentDate, not client input.

    const ctx = { organizationId: targetOrganizationId, workspaceId }
    await withOrganization(targetOrganizationId, userId, async (db) => {
          await assertHumanIntercompanyAuthority(db, ctx, userId, "TARGET_EXECUTE")
          const execution = await lockValidatedExecutionInput(
            db,
            executionRef,
            "intercompany.applyPaymentOnBehalf",
          )
          const input = execution.input
          const request = await lockPendingTargetRequest(db, ctx, execution.requestRef)
          assertRequestKind(request, "PAYMENT_ON_BEHALF")
          const shared = PaymentOnBehalfSharedPayloadV1.parse(request.sharedPayload)
          assertPayloadMatchesRow(request, shared)
          assertCurrency(request, "CZK")

          const supplierItem = await lockLocalOpenItem(db, ctx, input.supplierOpenItemRef)
          assertDirection(supplierItem, "PAYABLE")
          const invoiceBasis = await traceReceivedInvoiceBasis(db, ctx, supplierItem)
          assertSupplierInvoiceMatch(shared, supplierItem, invoiceBasis)
          assertPaymentNotBeforeInvoice(shared.paymentDate, invoiceBasis.issueDate)
          assertCurrency(supplierItem, "CZK")
          assertAmountAtMostRemaining(request.amount, supplierItem.remainingAmount)

          const period = await resolveAccountingPeriodForDate(db, ctx, shared.paymentDate)
          await lockPeriodInTx(db, ctx.organizationId, period.id)
          assertAccountingCurrency(period, request.currency)
          const supplierPayable = await resolveAccountByNumber(
            db,
            ctx,
            period.id,
            supplierItem.accountNumber,
            { nature: "LIABILITY", normalBalance: "CREDIT", tracksOpenItems: true },
          )
          const dueTo = await resolveSelectedAccount(
            db,
            ctx,
            period.id,
            input.dueToAccountRef,
            { nature: "LIABILITY", normalBalance: "CREDIT", tracksOpenItems: true },
          )

          const sourceParty = await resolveRequestSourceSelfParty(db, ctx, request)
          const internal = await createInternalClearingDocumentAndEvent(db, ctx, {
            periodId: period.id,
            accountingDate: shared.paymentDate,
            eventSeriesRef: input.targetEventNumberSeriesRef,
            documentSeriesRef: input.targetDocumentNumberSeriesRef,
            partyId: request.targetPartyId,
            counterpartyId: sourceParty.id,
            amount: request.amount,
            currencyCode: "CZK",
            vatMode: "OUTSIDE_VAT",
            responsibleUserId: userId,
            description: "Payment on behalf " + request.id,
          })
          const posting = await postDoubleEntry(db, ctx, {
            periodId: period.id,
            summaryRecordId: internal.summaryRecordId,
            accountingEventId: internal.accountingEventId,
            postingDate: shared.paymentDate,
            responsibleUserId: userId,
            lines: [
              { accountId: supplierPayable.id, side: "DEBIT", amount: request.amount, partialRecordId: internal.partialRecordId },
              { accountId: dueTo.id, side: "CREDIT", amount: request.amount, partialRecordId: internal.partialRecordId },
            ],
          })
          await settleOpenItem(db, ctx, {
            openItemId: supplierItem.id,
            settlingPostingId: posting.postingId,
            amount: request.amount,
            settlementDate: shared.paymentDate,
            settlementFxRate: null,
            amountInAccountingCurrency: null,
          })
          await openItem(db, ctx, {
            counterpartyId: sourceParty.id,
            originPostingId: posting.postingId,
            accountNumber: dueTo.number,
            direction: "PAYABLE",
            originalAmount: request.amount,
            currencyCode: "CZK",
            issueDate: shared.paymentDate,
            dueDate: shared.reimbursementDueDate ?? null,
            variableSymbol: null,
            intercompanyRequestId: request.id,
            collaborationPosition: "PAYMENT_TARGET_DUE_TO",
            sourcePaymentIndividualRecordId: null,
          })
          await transitionRequest(db, request, "APPLIED", "TARGET_APPLY")
          await completeLocalExecutionLog(db, execution, localTargetResult(request, posting, internal))
          await writeAuditEvent(db, safeLifecycleAudit(ctx, request, "applied"))
          return request
    })

The target number-series allocations, INTERNAL document and event, posting, settlement, open item, stored-operation result, and APPLIED transition commit or roll back together.

The saldokonto implementation must preserve its current signatures: openItem(db, ctx, input) and settleOpenItem(db, ctx, input). OpenItemInput is extended only by the optional request link fields, including the source individual-record reference. SettleInput continues to use settlingPostingId and settlementDate. Its documentation should say payment or clearing posting. The request link is the correlation key; no free-text bank description is coerced into open_item.variable_symbol.

## 15. Paired-invoice transactions

### 15.1 Source issued invoice

Source execution is entered from a resolved agent proposal or a direct owner/admin command. All issuer-controlled facts are validated before the first number allocation.

    await withOrganization(sourceOrganizationId, userId, async (db) => {
      await assertHumanIntercompanyAuthority(db, ctx, userId, "INVOICE_SOURCE_EXECUTE")
      const execution = await lockValidatedExecutionInput(
        db,
        executionRef,
        "intercompany.createPairedInvoice",
      )
      const input = execution.input
      const targetParty = await resolveProtectedSelfParty(db, ctx.workspaceId, input.targetPartyRef)
      assertDifferentOrganization(ctx.organizationId, targetParty.organizationId)

      const period = await resolveAccountingPeriod(db, ctx, input.sourcePeriodRef)
      await lockPeriodInTx(db, ctx.organizationId, period.id)
      assertAccountingCurrency(period, "CZK")
      assertDateInPeriod(input.issuedAt, period)
      assertDateInPeriod(input.taxPointDate, period)
      await assertSupportedPairedInvoiceVat(db, ctx, input)
      await assertSupportedDerivedAccounts(db, ctx, period, input.sourceSupplyKind, "ISSUED")

      const event = await createEvent(db, ctx, {
        periodId: period.id,
        seriesId: input.sourceEventNumberSeriesRef,
        partyId: await sourceSelfPartyId(db, ctx),
        counterpartyId: targetParty.id,
        description: input.description,
        occurredAt: input.taxPointDate,
        responsibleUserId: userId,
      })
      const captured = await captureDocument(db, ctx, {
        periodId: period.id,
        seriesId: input.sourceDocumentNumberSeriesRef,
        type: "ISSUED_INVOICE",
        issuedAt: input.issuedAt,
        taxPointDate: input.taxPointDate,
        dueDate: input.dueDate ?? null,
        roundingAmount: "0",
        lines: [oneSupportedPairedPartial(event.eventId, input, { vatDeductible: true })],
      })
      const request = await insertPendingPairedInvoiceRequest(db, {
        sourceOrganizationId: ctx.organizationId,
        targetOrganizationId: targetParty.organizationId,
        sourcePartyId: await sourceSelfPartyId(db, ctx),
        targetPartyId: targetParty.id,
        sourceInvoiceDesignation: captured.designation,
        sourceIdentity: await protectedSelfSnapshot(db, ctx, ctx.organizationId),
        targetIdentity: protectedSelfSnapshotFromParty(targetParty),
        safeInvoiceFacts: input,
        amount: exactGross(input),
        currency: "CZK",
      })
      const booked = await bookDocument(db, ctx, {
        summaryRecordId: captured.summaryRecordId,
        responsibleUserId: userId,
        collaboration: {
          requestId: request.id,
          position: "INVOICE_SOURCE_RECEIVABLE",
        },
      })
      assertOneLinkedOpenItem(booked, "RECEIVABLE", request.amount)
      await completeLocalExecutionLog(db, execution, localPairedSourceResult(request, captured, booked))
      await writeAuditEvent(db, safeLifecycleAudit(ctx, request, "created"))
      return request
    })

createEvent, captureDocument, request insertion, bookDocument, 311 item, execution result, and audit commit or roll back together. Source designation allocation is therefore never left behind when request creation or booking fails.

### 15.2 Target received invoice

    await withOrganization(targetOrganizationId, userId, async (db) => {
      await assertHumanIntercompanyAuthority(db, ctx, userId, "INVOICE_TARGET_EXECUTE")
      const execution = await lockValidatedExecutionInput(
        db,
        executionRef,
        "intercompany.applyPairedInvoice",
      )
      const input = execution.input
      const request = await lockPendingTargetRequest(db, ctx, execution.requestRef)
      assertRequestKind(request, "PAIRED_INVOICE")
      const shared = IntercompanySharedPayloadV1.parse(request.sharedPayload)
      assertPayloadMatchesRow(request, shared)

      const period = await resolveAccountingPeriod(db, ctx, input.targetPeriodRef)
      await lockPeriodInTx(db, ctx.organizationId, period.id)
      assertAccountingCurrency(period, "CZK")
      assertDateInPeriod(shared.issuedAt, period)
      assertDateInPeriod(shared.taxPointDate, period)
      assertReceivedDate(input.receivedDate, shared.issuedAt)
      await assertTargetCanAcceptPairedVat(db, ctx, shared, input, execution.humanConfirmation)
      await assertSupportedDerivedAccounts(db, ctx, period, input.targetSupplyKind, "RECEIVED")
      const sourceParty = await resolveRequestSourceSelfParty(db, ctx, request)

      const event = await createEvent(db, ctx, {
        periodId: period.id,
        seriesId: input.targetEventNumberSeriesRef,
        partyId: request.targetPartyId,
        counterpartyId: sourceParty.id,
        description: shared.description,
        occurredAt: shared.taxPointDate,
        responsibleUserId: userId,
      })
      const captured = await captureDocument(db, ctx, {
        periodId: period.id,
        seriesId: input.targetDocumentNumberSeriesRef,
        type: "RECEIVED_INVOICE",
        issuedAt: shared.issuedAt,
        taxPointDate: shared.taxPointDate,
        receivedDate: input.receivedDate,
        dueDate: shared.dueDate ?? null,
        externalReference: shared.sourceInvoiceDesignation,
        roundingAmount: "0",
        lines: [oneSupportedPairedPartial(event.eventId, {
          ...shared,
          supplyKind: input.targetSupplyKind,
        }, { vatDeductible: shared.vat.mode === "STANDARD" && input.vatDeductible === true })],
      })
      const booked = await bookDocument(db, ctx, {
        summaryRecordId: captured.summaryRecordId,
        responsibleUserId: userId,
        collaboration: {
          requestId: request.id,
          position: "INVOICE_TARGET_PAYABLE",
        },
      })
      assertOneLinkedOpenItem(booked, "PAYABLE", request.amount)
      await transitionRequest(db, request, "APPLIED", "INVOICE_TARGET_APPLY")
      await completeLocalExecutionLog(db, execution, localPairedTargetResult(request, captured, booked))
      await writeAuditEvent(db, safeLifecycleAudit(ctx, request, "applied"))
      return request
    })

The target cannot change source invoice facts because the adapter constructs the RECEIVED_INVOICE from the locked, reparsed shared payload. The target number allocation, document, posting, 321 item, execution result, and APPLIED transition are atomic.

## 16. Idempotency, concurrency, and failure behavior

- Every proposal and direct human command requires an idempotency key.
- tool_call_log stores the key, canonical local payload hash, input, actor, operation name, HELD or applied result, and local IDs.
- Shared request rows store none of those values.
- Same key and payload replays; same key with changed payload conflicts.
- approvalRef is the stable opaque handle for the sanitized organization-local proposal-status read.
- A source bank record lock plus existing-posting check prevents reuse under another key.
- A request lock and unique organization request link prevent duplicate target application.
- A paired source designation allocation, request insertion, and invoice booking share one transaction; a retry cannot create an orphan invoice or second request.
- A paired target request lock, unique organization request link, and bookDocument existing-posting check prevent a second received invoice.
- A supplier open-item lock protects remaining amount.
- Number-series allocation is transaction-local and rolls back on failure.
- Source failure creates no posting, open item, or request.
- Target failure leaves PENDING and changes no target accounting.
- Paired-source failure creates no issued invoice, receivable, or request; paired-target failure creates no received invoice or payable.
- A lost response is recovered from the local stored-operation result or proposal-status read.
- A race with reject or cancel returns conflict and posts nothing.
- Source success is never automatically compensated for target failure.

## 17. Evidence and document-store boundary

The source bank-payment record is the local accounting basis and evidence anchor. Its local document, event, partial facts, input hash, and any raw source file remain source-only.

The request copies only the bounded facts needed by the target. A payment request stores supplier and payment facts. A paired-invoice request stores the issuer-controlled invoice facts and source designation, but no source document UUID, raw attachment, or evidence hash.

PR #722 storage is workspace-wide, not participant-scoped. Phase 1 grants no raw attachment access, storage key, presigned URL, download action, or implied permission. Participant-scoped evidence sharing remains a separate future design.

## 18. UI

The workspace route is:

    /workspace/inbox/intercompany

It has Received and Sent tabs with a request-kind filter. Rows show request reference, kind, participant name, relevant invoice designation or supplier invoice number, relevant date, CZK amount, status, age, and the viewer's own local RECEIVABLE or PAYABLE balance when it exists. Detail views show only safe shared facts and local actions.

Payment source preparation selects:

- a target protected-self party from the safe directory;
- one preexisting unposted local BANK_STATEMENT payment record;
- one local bank account;
- one local due-from account;
- supplier matching facts and optional reimbursement due date.

Payment target preparation selects:

- one local supplier-invoice PAYABLE;
- one local due-to account;
- one local EVENT number series;
- one local DOCUMENT number series.

Paired-invoice source preparation selects:

- a target protected-self party;
- one eligible local CZK period;
- local EVENT and DOCUMENT number series;
- issue, tax-point, and optional due dates;
- one description and one supported source supply kind;
- optional quantity, unit, and unit price;
- one positive STANDARD or OUTSIDE_VAT amount shape.

Paired-invoice target preparation shows the locked issuer facts and selects:

- one eligible local CZK period;
- local EVENT and DOCUMENT number series;
- received date;
- one supported target purchase supply kind;
- for STANDARD only, an explicit full-input-VAT-deduction confirmation that becomes vatDeductible = true after final human approval.

The target form has no editable source designation, identity, date, description, base, VAT, currency, or gross fields. Unsupported VAT status or deductibility shows a blocking explanation and Reject, not a false or partial deductibility override.

A direct owner or admin submission calls runDirectIntercompanyCommand and executes the local command immediately. An agent submission calls runHeldCollaborationProposal and appears in local accounting approvals; one explicit human approval then executes it directly. Both paths use the same domain adapter, validation, idempotency, and audit.

Direct reject and cancel actions require explicit confirmation, a one-use idempotency token, and current target or source owner/admin authority. Active members see read-only details. Guests and workspace-only users cannot read participant requests. No UI fetches sibling ledger data or exposes raw evidence.

## 19. Required accounting scenarios

### 19.1 Normal full payment

A 12,100 CZK source bank record creates a 12,100 CZK due-from RECEIVABLE. Target application clears 12,100 CZK of its supplier PAYABLE and opens a 12,100 CZK due-to PAYABLE.

### 19.2 Reverse direction

If B pays A's supplier, B is source and A is target. The same commands run with participants reversed. No new request kind exists.

### 19.3 Partial payment

If supplier remaining amount is 12,100 CZK and the source bank record is 5,000 CZK, target application clears 5,000 CZK and leaves 7,100 CZK. Both intercompany items are exactly 5,000 CZK. The request cannot later increase.

### 19.4 Missing invoice

Without a preexisting target supplier PAYABLE, application fails before number allocation or posting. The request remains PENDING or the target rejects it. The target books the invoice through the normal invoice HELD flow first.

The same fail-closed result applies when the selected PAYABLE traces to a different external invoice number, issue date, supplier counterparty, IČO, or tax ID than the request facts. Similar amount alone is never a match.

### 19.5 Source record already consumed

If a posting already exists for the selected source event, a posting line already references the selected partial, or the individual record already has a PAYMENT_SOURCE_DUE_FROM link, source execution conflicts and creates no request. A new idempotency key cannot reuse it. Other individual records in the same BANK_STATEMENT summary remain independent.

### 19.6 Supplier payable already settled

If the target item lacks sufficient remaining amount, application fails. No intercompany PAYABLE is created without the matching supplier clearing.

### 19.7 Rejection or cancellation

Target rejection and source cancellation create no target accounting and do not remove the source payment due-from or invoice receivable. Local audit records the actor; the shared row records only bounded reason and timestamp.

### 19.8 Reimbursement or invoice payment

Target pays source through its ordinary bank workflow. For payment on behalf this settles target due-to and source due-from. For a paired invoice it settles target 321 PAYABLE and source 311 RECEIVABLE. The APPLIED request stays immutable.

### 19.9 Closed period or wrong currency

A closed source period blocks source execution and request creation. A closed target period blocks target application and leaves PENDING. Any period accounting currency, bank record, supplier item, or request currency other than CZK fails. No substitute date or FX conversion is attempted.

### 19.10 Same user in both organizations

The service opens separate OrgCtx transactions and calls assertHumanIntercompanyAuthority against each organization's current memberships and owner/admin role for final actions. No source result authorizes the target. The same human may act for both only when currently authorized in both; the operations and audit remain separate.

### 19.11 Supplier advance

Without the economic supplier invoice, or when payment predates the invoice issue date, this MVP rejects application. Supplier advances require different accounts and document treatment.

### 19.12 Normal paired invoice

A source 10,000 CZK domestic service plus 2,100 CZK VAT creates a local ISSUED_INVOICE, a 12,100 CZK 311 RECEIVABLE, and PENDING. Target acceptance creates a separate local RECEIVED_INVOICE with source designation as external reference and a 12,100 CZK 321 PAYABLE, then marks APPLIED. Each organization sees only its own document, posting, and open item.

### 19.13 Paired invoice with different local classifications

The source may classify a supplied item as SERVICES and post revenue according to its source rules. The target may classify the purchase as OTHER or another supported local purchase kind. Base, VAT, gross, description, dates, and identities remain unchanged. The classifications affect only each local book.

### 19.14 Unsupported paired invoice

A multi-line, multi-partial, non-CZK, asset, advance, credit note, reverse-charge, EU, import, nonzero-rounding, non-deductible STANDARD, or partially deductible STANDARD proposal fails before number allocation. The agent can discover the supported candidate shape and report the blocker; it cannot bypass it with raw IDs or a different MCP tool.

### 19.15 Paired-invoice rejection or cancellation

Target rejection or source cancellation creates no target received invoice or PAYABLE. The source ISSUED_INVOICE and RECEIVABLE remain. A later credit note or storno is an ordinary separately authorized accounting action and is not generated by the collaboration request.

## 20. Threat model

| Threat                                           | Control                                                                                                                                                             |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tenant or role supplied by caller                | Public schemas omit them; key or session determines organization and user.                                                                                          |
| Workspace access treated as book authority       | Final commands require current owner/admin membership in the exact organization.                                                                                    |
| Stale agent key retains power                    | Every call requires user binding, current memberships, actor kind, and exact scope in the transaction.                                                              |
| Empty scope inherits full access                 | Collaboration guard rejects null or empty scopes.                                                                                                                   |
| Unknown or duplicate scope bypass                | Guard rejects before exact-scope evaluation.                                                                                                                        |
| Confidence auto-applies accounting               | Dedicated runner always stores HELD and never calls runGatedWrite.                                                                                                  |
| Direct human bypasses idempotency or audit       | Web actions use one-use keys, human tool_call_log execution rows, and the same domain adapter.                                                                      |
| Resolver executes arbitrary stored input         | Shared allowlisted registry reparses versioned payload and rejects unknown operations.                                                                              |
| JSON payload becomes a generic extension point   | Closed 2-value request kind, strict versioned discriminated union, bounded object, unknown-field rejection, and explicit operation registry prevent ad hoc kinds.   |
| Authority changes after proposal                 | Resolver reruns assertHumanIntercompanyAuthority immediately before execution.                                                                                      |
| Agent guesses or cannot obtain local references  | Bound candidate reads require collaboration:candidates:read and expose only eligible opaque references and minimal display facts from the agent's own organization. |
| Agent cannot monitor a HELD proposal             | Sanitized organization-local status read exposes only allowlisted intercompany operation state, safe timestamps, and request reference.                             |
| Agent cannot correlate request and local debt    | Participant-only local-position read returns the caller's linked item, remaining balance, and settled state, including after reimbursement.                         |
| Agent directly rejects or cancels a request      | No agent rejection or cancellation tool exists in Phase 1; final transition requires a freshly authorized local human.                                              |
| Source invents a payment                         | Adapter locks one opaque BANK_STATEMENT individual record plus its event and partials, then derives amount facts.                                                   |
| Preposting reclassification loses the real payee | The unposted event is locked; supplier and payee facts remain in local description and audit plus the bounded shared snapshot.                                      |
| Whole statement is accidentally consumed         | Consumption and uniqueness anchor to the selected individual record; sibling statement individuals remain independent.                                              |
| Same payment is reused                           | Event posting check, partial posting-line check, and unique source individual-record link conflict.                                                                 |
| Target invents or duplicates invoice             | One local supplier PAYABLE with supplier-invoice origin is required.                                                                                                |
| Target clears the wrong supplier invoice         | Trace the PAYABLE to its RECEIVED_INVOICE and counterparty, then match external reference, issue date, supplied identifiers, amount, and payment-date sanity.       |
| Agent tools exist but Brain cannot call them     | Every collaboration read and proposal tool is added to Brain's static default-deny allowlists and policy tests; human resolution stays excluded.                    |
| Paired target rewrites issuer facts              | Target input accepts only local period, series, received date, and purchase supply kind; the adapter builds from the locked, reparsed shared payload.               |
| Source VAT treatment is copied as target policy  | Source VAT facts remain immutable, but target independently validates VAT status; unsupported deductibility rejects instead of guessing.                            |
| Paired invoice opens multiple balances           | Phase 1 permits exactly one event, one individual record, and one partial; bookDocument correlation and unique organization/request link require one item.          |
| Source invoice is copied as the target local ID  | Target allocates its own designation; only the source designation becomes target external_reference.                                                                |
| Either side changes a paired invoice after link  | Database guards block legal-date and shared event, summary, individual, and partial fact changes once the request-linked open item exists.                          |
| Target accepts twice                             | Request lock, state trigger, tool log, and unique local request link prevent it.                                                                                    |
| Wrong account is selected or derived             | Payment selections validate period, organization, nature, normal side, and open-item tracking; paired booking requires every derived chart account.                 |
| Wrong currency enters                            | Request CHECK and both period and open-item validation require CZK.                                                                                                 |
| Shared row leaks audit or ledger topology        | User, key, hash, document, event, posting, account, and open-item IDs stay local.                                                                                   |
| Shared fact or status is rewritten               | Immutable-field and transition-marker trigger rejects it.                                                                                                           |
| Request is deleted                               | DELETE trigger always raises.                                                                                                                                       |
| Target sees source raw evidence                  | No source document or storage reference crosses the boundary.                                                                                                       |
| Same identity bypasses second side               | Separate OrgCtx and fresh authority checks are mandatory.                                                                                                           |
| Closed period bypass                             | Each adapter locks and validates its local period.                                                                                                                  |

## 21. Audit and observability

Audit remains local where accounting identifiers exist:

- payment source tool_call_log stores the local bank record, normalized input hash, operation, actor, HELD or applied result, posting, open item, and replay result; request reference appears only after applied source execution creates it;
- payment target tool_call_log stores the local supplier item, number-series selections, INTERNAL document and event, HELD or applied result, posting, settlement, open item, request reference, and replay result;
- paired-invoice source and target logs store only their own period, series, event, invoice, posting, linked open item, stored operation result, and replay result; a source log gains request reference only after applied execution creates it, while a target proposal already references the request;
- direct human rejection and cancellation logs store their bounded reason, terminal result, request reference, and resolution timestamp;
- direct humans receive applied execution attribution and agents receive HELD proposal attribution;
- safe workspace audit events set organization_id to the acting source or target and store request reference, lifecycle action, participant side, and timestamp without the other side's user or local ledger IDs;
- request status and timestamps are durable lifecycle evidence.

Required events:

- collaboration.payment_on_behalf.created;
- collaboration.payment_on_behalf.applied;
- collaboration.payment_on_behalf.rejected;
- collaboration.payment_on_behalf.cancelled;
- collaboration.paired_invoice.created;
- collaboration.paired_invoice.applied;
- collaboration.paired_invoice.rejected;
- collaboration.paired_invoice.cancelled;

Phase 1 metrics are limited to:

- PENDING count and age;
- rejection count by bounded reason;
- source and target application failure counts by bounded class;
- HELD proposal and resolution outcomes by operation and side.

No runtime reciprocal-mismatch, cross-book reconciliation, raw identifier, or cross-tenant accounting metric ships in Phase 1.

Execution failures are bounded transport logs and metrics emitted after rollback. They are not durable audit events because the accounting/request transaction did not commit, and Phase 1 adds no second transaction solely to persist them.

## 22. Rollout and migration

1. Add the closed request-kind enum, one intercompany_request table, strict V1 payload schemas, composite keys, FORCE RLS, immutable-update trigger, transition guard, and no-delete trigger.
2. Add generic open_item request correlation with 4 positions and the payment-source individual-record uniqueness link.
3. Add bank direction, received-invoice external reference, and invoice due date through the full capture, read, API, SDK, and MCP contracts; pass due date and optional collaboration through bookDocument and openObligation.
4. Add participant RLS, protected-self directory query, and transaction-local authority helpers.
5. Add the 6-entry registry with 4 agent-proposable accounting operations and 2 human-only transitions, the unconditional agent HELD runner, direct-human idempotent runner, and exact 4-name proposal-status filter.
6. Add versioned directory, request, proposal-status, 4 candidate, and local-position read contracts behind a default-off feature flag.
7. Add and verify the 2 payment-on-behalf operations.
8. Add and verify the paired issued-invoice and received-invoice operations using the existing accounting primitives.
9. Generate OpenAPI, SDK, and MCP tools and explicitly allow the collaboration reads and proposals in Brain.
10. Add the 2-kind Intercompany Inbox and direct human actions.
11. Enable locally and in staging for 2 seeded organizations, run all RLS, authority, accounting, VAT, idempotency, concurrency, Brain policy, and E2E suites.
12. Enable selected workspaces and monitor only the Phase 1 metrics.

Migration rules:

- infer no historical requests;
- leave existing open-item link fields null;
- leave legacy bank direction, external reference, and invoice due date null;
- make legacy received invoices without structured external_reference ineligible for payment-on-behalf matching rather than guessing a backfill;
- do not backfill relationships or party mappings from names;
- retain FORCE RLS and composite workspace foreign keys;
- disable through the feature flag without reversing posted accounting;
- block automated correction of linked items.

Runtime cross-book reconciliation remains deferred. Test fixtures may inspect both sides through separate authorized contexts, but production code receives no cross-tenant read path.

## 23. Test strategy

| Suite                         | Required coverage                                                                                                                                                                                                                                                                                                                                                                                   |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Authority                     | Active owner/admin can finally act; member and agent session roles are read-only; guest, inactive membership, wrong workspace, unbound or stale key, agent without conversation, and wrong participant fail.                                                                                                                                                                                        |
| Scope                         | Null, empty, duplicate, unknown, missing exact scope, request-read used against candidates, and legacy empty-scope behavior fail.                                                                                                                                                                                                                                                                   |
| HELD and replay               | All 4 agent proposals create tool logs and are always HELD; 2 human-only reject/cancel operations cannot enter HELD; direct humans create applied execution logs; same key replays; changed payload conflicts; unknown stored operation fails; resolver reauthorizes; agent resolver fails; same bound user may approve only the 4 agent-proposable operations after fresh human authorization.     |
| Request and local-link schema | Closed 2-kind enum; strict V1 union; payload kind/version and amount checks; composite organization and party tenancy; UNIQUE(id, workspace_id); CZK and positive amount; immutable facts; guarded transitions; no delete; no shared user, hash, idempotency, or ledger UUIDs; 4 direction-safe positions; organization-safe and unique payment-source record link only on PAYMENT_SOURCE_DUE_FROM. |
| RLS and directory             | Both active workspace plus participant memberships read; active organization with inactive workspace membership denies; unrelated organizations deny; member and agent session roles are read-only; protected self parties are the only directory rows; partyRef equals counterparty.id; no admin bypass is used.                                                                                   |
| Agent candidates              | Payment source and target reads return only eligible local records, accounts, items, and series; paired source and target reads return only eligible local CZK periods, series, supported supply kinds, and VAT-status capability; every required proposal reference is discoverable without sibling access.                                                                                        |
| Agent operational loop        | Bound agents can discover directory and kind-specific candidates; create either source or target HELD proposal; monitor only the 4 allowlisted proposal operations; read request state and their own local position; Brain policy exposes every required read/proposal tool and no final resolution, rejection, or cancellation.                                                                    |
| Local position                | Each participant sees only its PAYMENT_SOURCE_DUE_FROM, PAYMENT_TARGET_DUE_TO, INVOICE_SOURCE_RECEIVABLE, or INVOICE_TARGET_PAYABLE item; unrelated organization and wrong workspace deny; remaining balance updates through ordinary settlement; settled rows remain queryable by request; no sibling open-item reference is exposed.                                                              |
| Source record                 | Opaque individual ref, BANK_STATEMENT parent, explicit OUTFLOW direction, locked individual/event/partials, exactly one positive CZK OUTSIDE_VAT partial, no free-text inference, normal supplier counterparty reclassified only while unposted, no event posting, no partial posting-line reference, sibling statement individuals unaffected, and retry under a new key.                          |
| Source accounting             | Exact due-from and bank lines linked to the selected partial, reused source summary and event, period account validation, protected target party, unique individual-linked RECEIVABLE, atomic PENDING, rollback, and local audit.                                                                                                                                                                   |
| Target basis                  | Preexisting supplier-invoice PAYABLE traced to RECEIVED_INVOICE; external reference, issue date, counterparty and supplied IČO/tax ID match; payment is not before invoice; sufficient remaining CZK amount, target period, account nature and normal side, and both selected number-series entity types.                                                                                           |
| Target accounting             | Complete INTERNAL event, summary, individual, and CZK OUTSIDE_VAT partial capture chain, partial-linked clearing lines, settleOpenItem signature, PAYABLE link, atomic APPLIED, partial settlement, rollback, row races, and local audit.                                                                                                                                                           |
| Paired source                 | One event, one individual, one partial; source protected-self identities; CZK period and series; supported supply kind and VAT status; exact STANDARD arithmetic or OUTSIDE_VAT zero tax; source designation in strict shared payload; local ISSUED_INVOICE, posting, one linked 311 RECEIVABLE, PENDING, rollback, replay, and local audit.                                                        |
| Paired target                 | Locked and reparsed shared payload; unchanged issuer facts; independent target period, series, received date, and purchase supply kind; target VAT-status and full-deduction guard; source designation as external_reference; separate local designation; one RECEIVED_INVOICE, posting, linked 321 PAYABLE, APPLIED, rollback, replay, and local audit.                                            |
| Paired unsupported shapes     | Multi-line/partial, ASSET, ADVANCE, CREDIT_NOTE, negative, rounding, FX, reverse charge, EU, import, exempt, non-deductible or partly deductible STANDARD, inconsistent VAT, closed period, missing derived account, and changed payload all fail before local booking.                                                                                                                             |
| Privacy                       | Shared response and database row contain no local source or target IDs, user IDs, idempotency data, fingerprints, or evidence hash; no raw evidence action exists.                                                                                                                                                                                                                                  |
| UI and E2E                    | Sent and Received for both kinds; own local balance; read-only members; direct human execution; agent HELD then direct apply; payment full/reverse/partial/missing invoice/consumed record; paired STANDARD/OUTSIDE_VAT/different classifications/unsupported VAT/rejection; settlement handoff; closed period; non-CZK rejection; and dual membership.                                             |
| Observability                 | Only PENDING age, rejection, application failure, and HELD metrics are emitted; no cross-book metric exists.                                                                                                                                                                                                                                                                                        |

Required verification:

    pnpm typecheck
    pnpm lint
    pnpm test
    pnpm build

UI changes also require a visual check in the development server.

## 24. Official research basis

The design applies conservative controls based on official sources:

- Czech Accounting Act No. 563/1991 Coll.: <https://e-sbirka.gov.cz/sb/1991/563/2026-01-01>
- Czech Decree No. 500/2002 Coll.: <https://e-sbirka.gov.cz/sb/2002/500/2024-01-01>
- Czech Accounting Standards, including ČÚS 017: <https://www.mfcr.cz/assets/attachments/Ucetnictvi_2018_Ceske-ucetni-standardy-pro-500-2002_v02.pdf>
- Czech VAT Act No. 235/2004 Coll.: <https://e-sbirka.gov.cz/sb/2004/235/2026-01-01>
- Czech Financial Administration invoice guidance: <https://financnisprava.gov.cz/assets/cs/prilohy/d-seznam-dani/2013_Informace_GFR_k_fakturaci.PDF>
- EU VAT Directive 2006/112/EC: <https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:02006L0112-20250414>
- Czech Civil Code No. 89/2012 Coll.: <https://e-sbirka.gov.cz/sb/2012/89/2025-01-01>
- GDPR Regulation 2016/679: <https://eur-lex.europa.eu/eli/reg/2016/679/oj>

The narrow accounting conclusion is that true payment on behalf creates a reciprocal receivable and payable while the economic supplier invoice remains with its beneficiary. A real intercompany supply instead creates a source sale invoice and receivable plus a target purchase invoice and payable. Issuer-controlled facts and target-local VAT entitlement must not be conflated. Whether an arrangement is a recharge, advance, loan, related-party transaction, or taxable supply depends on facts outside this specification. Implementation does not replace accounting, tax, or legal advice.

### 24.1 Product-pattern research

Official product documentation supports starting with typed paired accounting outcomes and local review rather than a generic collaboration platform:

| Product                                                                                                                                                                        | Relevant pattern                                                                                                                  |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------- |
| [QuickBooks Desktop Enterprise](https://quickbooks.intuit.com/learn-support/en-us/help-article/company-file/create-transactions-different-company-files/L4LhQ3iDG_US_en_US)    | Configured intercompany relationship and due-to/due-from accounts, with the receiving company choosing its own account treatment. |
| [Intuit Enterprise Suite](https://quickbooks.intuit.com/learn-support/en-us/help-article/journal-entries/manage-intercompany-sales-intuit-enterprise-suite/L5U8y7vM1_US_en_US) | Source transaction produces a linked target-side transaction that remains unposted until accepted.                                |
| [Zoho ERP](https://www.zoho.com/en-in/erp/help/multi-company-management/intercompany-transactions.html)                                                                        | Push, review, accept and create, reject, or revise, with independent company records.                                             |
| [Odoo 19](https://www.odoo.com/documentation/19.0/applications/general/companies/multi_company.html)                                                                           | Company-specific records with counterpart drafts by default and optional policy-controlled validation.                            |
| [NetSuite](https://docs.oracle.com/en/cloud/saas/netsuite/ns-online-help/article_158989895273.html)                                                                            | Paired documents use pending, rejected, and linked states while reconciliation remains separate.                                  |
| [Dynamics 365 Finance](https://learn.microsoft.com/en-us/dynamics365/finance/general-ledger/intercompany-accounting-setup)                                                     | Legal-entity pairs and due-to/due-from mappings are configured explicitly; centralized posting is a broader enterprise mode.      |
| [Microsoft Business Central](https://learn.microsoft.com/en-us/dynamics365/business-central/intercompany-manage)                                                               | An intercompany outbox document becomes a receiving-company inbox item that can be accepted or rejected into a local document.    |
| [Dynamics 365 internal-use flow](https://learn.microsoft.com/en-us/dynamics365/supply-chain/sales-marketing/intercompany-purchase-order-for-internal-use)                      | Seller and buyer retain distinct customer and vendor invoices, and the seller invoice number is preserved on the buyer side.      |

The common baseline is separate company records, local authority, linked reciprocal balances, and explicit acceptance. None of these products requires Afframe to introduce relationship graphs, generic cases, version vectors, or a workspace master key for these 2 workflows.

## 25. Repository fit and overlap

Fresh overlap review on 2026-07-15:

- Issue [#736](https://github.com/hlebtkachenko/monorepo/issues/736), `Accounting domain gaps: backend, UI, and API completion`, is open. Its intercompany checklist still describes the rejected generic platform, workspace key, loans, reciprocal correction engine, and conflict graph. Before implementation, that checklist should be narrowed to the 2 typed workflows and 3 issues below. This specification task makes no external issue edit.
- PR [#722](https://github.com/hlebtkachenko/monorepo/pull/722) is merged and issue [#518](https://github.com/hlebtkachenko/monorepo/issues/518) is closed. Its document storage is workspace-wide, not participant-scoped, so Phase 1 exposes no raw attachments.
- PR [#723](https://github.com/hlebtkachenko/monorepo/pull/723) is merged. Its invoice HELD materialization and row-lock pattern must be reused.

Existing Companies and Inbox surfaces provide navigation context, not accounting authority.

## 26. Decisions

All authority, visibility, and Phase 1 scope decisions below were resolved through repository HITL. The exact captured answer text is preserved.

| ID  | Question                                                                                                                                                                                                                                      | Answer                     | Consequence                                                                                                               |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| D1  | For intercompany collaboration, should active workspace members receive only a minimal organization directory plus facts explicitly shared in requests, without any new sibling-book ledger, document, balance, employee, or tax-data access? | **Directory/request only** | Only protected-self directory rows and request facts are shared.                                                          |
| D2  | Is acceptance through a Workspace collaboration key allowed only with fresh per-request proof from a responsible authorized human, or can key issuance alone delegate later use, or may unattended automation only create HELD work?          | **No workspace key**       | Sessions and API or MCP principals remain organization-bound.                                                             |
| D3  | When a human with current target accounting authority approves the final intercompany proposal, should that approval directly post the target reclassification and due-to open item, or create another HELD review?                           | **Apply directly**         | One explicit human approval executes the target command; no second HELD layer.                                            |
| D4  | For Phase 1, should organization-scoped agents prepare complete intercompany proposals that require local human approval before either book is posted, or may agents directly apply accounting entries when their organization role permits?  | **Agent proposes**         | Agents discover, prepare, monitor, and read local positions; a current local human finally applies accounting.            |
| D5  | Should the first implementation contain only payment-on-behalf with reciprocal due-from/due-to open items, requiring the beneficiary supplier invoice to already exist, or also include paired intercompany sale/purchase invoices?           | **Both workflows**         | Phase 1 contains payment-on-behalf and a separate paired issued/received invoice workflow with reciprocal open items.     |
| D6  | When a user-bound agent prepares a HELD intercompany proposal, may the same user later approve it while acting in a current owner/admin human session, or must another current owner/admin approve?                                           | **Same user may approve**  | Registry policy allows it only for these operations after fresh human reauthorization; API and web enforce the same rule. |

## 27. Copy-ready implementation issues

Exactly three issues implement this specification.

### Issue 1: feat(collaboration): add request, authority, RLS, and HELD foundation

| Field       | Value                                                                                                                                               |
| ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Type        | feat                                                                                                                                                |
| Priority    | High                                                                                                                                                |
| References  | #736                                                                                                                                                |
| Depends on  | None                                                                                                                                                |
| Owned areas | packages/db, apps/api and apps/admin, shared contracts, generated SDK and MCP reads, authority infrastructure, agent-key issuance, operator runbook |
| Migrations  | Typed request table and triggers, open_item correlation, bank direction, invoice external reference and due date, constraints, indexes, FORCE RLS   |
| Tests       | Migration, trigger, RLS, authority, directory, scope, registry, replay, contract                                                                    |
| Wave        | 1                                                                                                                                                   |

Goal: establish the safe request boundary and unconditional organization-local proposal infrastructure.

Scope:

- add one intercompany_request table with the closed PAYMENT_ON_BEHALF and PAIRED_INVOICE kind enum, UNIQUE(id, workspace_id), CZK and positive amount checks, composite participant and party constraints, immutable-facts trigger, guarded status transitions, and no-delete trigger;
- define strict bounded IntercompanySharedPayloadV1 payment and paired-invoice variants; require payload kind/version to match the row, reject unknown fields, and reparse at every consumer;
- remove shared user, idempotency, fingerprint, evidence-hash, and local ledger fields from the design;
- extend open_item with one optional generic request link, the 4 closed collaboration positions, direction/kind/side constraints, and organization-safe unique payment-source individual-record reference;
- add nullable individual_record.bank_movement_direction plus summary_record.external_reference and summary_record.due_date with type-specific validation and no inferred backfill;
- plumb all 3 capture additions through accounting types, capture SQL, shared schemas, invoice reads, DTOs, OpenAPI, SDK, and MCP; pass dueDate and optional collaboration through openItem, openObligation, and bookDocument, returning correlated open-item IDs without a new booking engine;
- add database guards and service conflicts that prevent PATCH legal-date and any linked accounting-event, summary, individual, or partial fact update after a paired-invoice open item links the document;
- derive directory entries from workspace protected self counterparties with partyRef = counterparty.id;
- add participant reads and read-only member behavior under FORCE RLS;
- add keyId to the internal verified principal and implement assertAgentIntercompanyAuthority by rereading the key plus current linked memberships;
- implement assertHumanIntercompanyAuthority with current active linked memberships and action-specific owner/admin enforcement;
- require user-bound agent keys, current memberships, conversation ID, and exact non-empty scopes;
- update the Brain-agent key issuance profile, admin UI, tests, and BRAIN-OPERATOR-SESSION runbook with the explicit 4-scope collaboration proposal bundle; require reissue/rotation and never widen existing keys;
- implement runHeldCollaborationProposal for agent/API proposals and runDirectIntercompanyCommand for Better Auth owner/admin actions using tool_call_log;
- broaden the existing single writeAuditEvent helper to accept organization-bound transactions without adding a second audit writer, and cover its workspace/organization RLS behavior;
- map verified agent principals to tool_call_log actor_kind = ai_on_behalf with the bound user and conversation ID; never persist the API capability value `agent` into the audit enum;
- implement the shared versioned operation registry and resolver seam for exactly 4 agent-proposable accounting operations plus 2 human-only reject/cancel operations, without registering their domain executors yet;
- author versioned directory, request, and sanitized proposal-status Zod and OpenAPI contracts without tenant IDs, then generate SDK and MCP read surfaces;
- add a default-off feature flag.

Acceptance criteria:

- active owner/admin may finally act; member and agent session roles are read-only; guest, inactive membership, and wrong participant cannot mutate;
- stale role or membership fails inside the transaction;
- a revoked, expired, unbound, wrong-actor, wrong-organization, or wrong-scope key fails when reread by keyId inside the proposal transaction;
- runner tests prove agent proposals are always HELD while direct human commands are idempotent applied executions;
- audit tests prove the agent-to-ai_on_behalf mapping and reject missing bound user or conversation ID;
- runGatedWrite is not called;
- each mutation uses one withOrganization transaction, relying on its derived app.workspace_id for safe request and audit writes, with no redundant outer withWorkspace frame;
- writeAuditEvent accepts the organization-bound transaction and cannot attribute an event to another organization or workspace;
- unknown stored operations fail closed and both human resolvers share one registry;
- API and web resolvers read the same registry policy and allow same-user approval only for the 4 intercompany operations after fresh human reauthorization;
- paired target STANDARD resolution and direct-command DTOs require confirmFullVatDeduction = true in the registry-owned human envelope; OUTSIDE_VAT and every other operation reject that field;
- an agent can poll its organization-local approvalRef and observe HELD, APPLIED, or REJECTED state without stored payload, reviewer, idempotency, or ledger data; execution errors remain HELD after rollback;
- proposal-status tests filter to exactly the 4 agent-proposable tool names and reject human-only or unrelated tool_call_log rows even when visible in the same organization;
- request facts and status are database guarded and rows cannot be deleted;
- legacy capture rows remain null, new eligible bank movements use explicit INFLOW/OUTFLOW, invoice external reference stays distinct from internal designation, and bookDocument passes invoice due date to the opened item;
- linked paired-invoice source and target facts cannot be changed through the existing legal-date endpoint or direct table updates; correction requires a later explicit accounting workflow;
- shared rows contain no forbidden actor, idempotency, hash, evidence, or ledger identifiers;
- directory and participant RLS tests prove no sibling-book leakage and deny an inactive workspace membership even when its organization membership remains active;
- exactly scoped keys pass and empty, duplicate, unknown, or missing scopes fail;
- newly issued Brain keys can receive the explicit directory/read/candidates/propose bundle, legacy accounting:write-only keys remain denied, and no bundle grants review, cancel, or final resolution;
- run pnpm gen:all, commit every generated read artifact, and add one Unreleased changelog bullet.

Verification: pnpm gen:all && pnpm verify && pnpm test && pnpm build.

### Issue 2: feat(accounting): materialize payment and paired-invoice balances

| Field       | Value                                                                                                     |
| ----------- | --------------------------------------------------------------------------------------------------------- |
| Type        | feat                                                                                                      |
| Priority    | High                                                                                                      |
| References  | #736                                                                                                      |
| Depends on  | Issue 1                                                                                                   |
| Owned areas | packages/accounting, packages/brain tool policy, apps/api, HELD resolvers, shared generated API, SDK, MCP |
| Migrations  | None expected; Issue 1 owns all request and local-link schema                                             |
| Tests       | Source and target documents, events, accounting, HELD execution, API, MCP, idempotency, concurrency       |
| Wave        | 2                                                                                                         |

Goal: execute the 4 agent-proposable accounting operations and 2 human-only transitions through exact local document, event, posting, settlement, and open-item models, with a complete agent preparation and monitoring loop for both request kinds.

Scope:

- finish and verify the ordinary capture plumbing from Issue 1 so bankMovementDirection, externalReference, and dueDate persist and appear on every required read and generated surface;
- add all 4 organization-local source and target candidate endpoints and MCP tools so an agent can discover every required opaque record, structured fact, period, account, VAT capability, and number-series reference;
- mount the source proposal endpoint and register its versioned stored input and replay executor;
- resolve an opaque source reference to one BANK_STATEMENT individual record, then lock its event and partials without consuming the whole summary;
- require explicit OUTFLOW, exactly one positive CZK OUTSIDE_VAT partial with no VAT, derive amount/currency/date only from structured fields, require no posting for the event and no posting-line reference to its partial, and link new posting lines to that partial;
- atomically reclassify the locked unposted source event counterparty to the selected target protected-self party while preserving supplier and payee facts;
- mark the selected movement consumed through the posting plus the organization-safe unique PAYMENT_SOURCE_DUE_FROM individual-record link;
- validate source period CZK, selected bank account, and selected ASSET, DEBIT, open-item-tracked due-from account;
- post source accounting, open the linked RECEIVABLE, and create PENDING atomically;
- mount the target proposal endpoint and register its versioned stored input and replay executor;
- validate one target supplier-invoice PAYABLE and target CZK period;
- trace the PAYABLE to its RECEIVED_INVOICE and supplier counterparty, then match external reference, issue date, every supplied IČO/tax ID, amount, and payment-date sanity before number allocation;
- validate selected LIABILITY, CREDIT, open-item-tracked due-to and supplier accounts;
- allocate target-local EVENT and DOCUMENT series and create one complete INTERNAL event, summary, individual, and CZK OUTSIDE_VAT partial capture chain;
- post the clearing, call settleOpenItem(db, ctx, input), call extended openItem(db, ctx, input), open the linked PAYABLE, and mark APPLIED atomically;
- mount and register the paired-invoice source proposal and replay executor;
- require 2 CZ protected-self parties, a non-null tax-point date, exactly one event, one individual record, one partial, CZK, zero rounding, positive amount, a supported non-asset source supply kind, and either exact domestic STANDARD at 21 percent from source PAYER or OUTSIDE_VAT with zero tax from source NON_PAYER or IDENTIFIED_PERSON;
- validate the source's time-versioned VAT status and derived chart accounts, create a source-local event and ISSUED_INVOICE, preserve its allocated designation in the strict shared payload, insert PENDING, call bookDocument with INVOICE_SOURCE_RECEIVABLE correlation, and require exactly one 311 item atomically;
- mount and register the paired-invoice target application proposal and replay executor;
- allow target proposal input only for its local period, EVENT and DOCUMENT series, receivedDate, supported purchase supply kind, and the literal STANDARD fact vatDeductible = true; derive every issuer-controlled fact from the locked, reparsed request;
- independently validate target PAYER status and require agent-proposed vatDeductible = true plus an explicit same-step human full-deduction confirmation for STANDARD; OUTSIDE_VAT ignores target status and prohibits VAT confirmation; reject all other regimes until ordinary booking supports them safely;
- create the target-local event and RECEIVED_INVOICE with its own designation and source designation as externalReference, call bookDocument with INVOICE_TARGET_PAYABLE correlation, require exactly one 321 item, and mark APPLIED atomically;
- add the participant-only local-position read and MCP tool, including settled linked rows;
- implement idempotent direct human reject and cancel transitions with local tool logs;
- register the 4 accounting executors plus the human-only reject and cancel executors in the shared operation registry;
- run pnpm gen:all and commit OpenAPI, SDK, and MCP proposal and local-position operations; Issue 1 owns proposal-status generation;
- add every collaboration read and proposal tool to the Brain's explicit read/write allowlists with final resolution, rejection, and cancellation still denied;
- keep final HELD resolution human-only and absent from MCP;
- emit only local audit plus safe lifecycle events and Phase 1 metrics.

This issue should use ordered PR slices under the same issue. Slice 2A implements both payment-on-behalf sides. Slice 2B implements the paired issued-invoice side. Slice 2C implements paired target acceptance, the generic local-position read, generated tools, Brain allowlist coverage, and end-to-end resolution tests. Do not create more planning issues solely to mirror these slices.

Acceptance criteria:

- ordinary capture can persist explicit bank movement direction, invoice external reference, and invoice due date without accepting organization or role claims; invalid summary-type combinations fail;
- an organization-bound agent can discover all references, create any of the 4 source/target proposals, monitor proposal and request status, and read its own linked position through bounded local reads without a tenant ID, sibling-book read, raw SQL identifier guess, or final accounting authority;
- Brain policy tests allow every required collaboration read and proposal tool and deny all human-only resolution and transition surfaces;
- source cannot execute without one supported outgoing CZK BANK_STATEMENT individual movement;
- source direction is structured OUTFLOW and no amount, direction, or reference is inferred from description;
- another individual in the same summary may already be posted and remains unaffected;
- the same source event or partial cannot be posted twice, and the individual record cannot link twice, even with different idempotency keys;
- target cannot execute without the preexisting supplier PAYABLE;
- target cannot clear a different invoice with a similar amount, and payment before invoice issue date is rejected as an unsupported supplier advance;
- both periods and every request or open-item currency are CZK;
- account period, nature, normal side, and tracks_open_items checks fail closed;
- target INTERNAL numbers and complete capture chain allocate from selected local series and roll back on failure;
- openItem and settleOpenItem use current db, OrgCtx, and input signatures;
- payment full and partial cases create exact reciprocal due-from and due-to balances in separate transactions;
- paired STANDARD and OUTSIDE_VAT cases create a separate issued and received invoice plus equal 311 RECEIVABLE and 321 PAYABLE in separate transactions;
- the source designation is the target external reference, never its designation or UUID; target-local supply classification may differ while source monetary and legal facts cannot;
- unsupported paired shapes, VAT status, deductibility, dates, accounts, periods, series, and arithmetic fail before booking;
- each participant can read only its own one of 4 positions by request, including remaining balance and settled status after ordinary payment;
- closed period, wrong currency, missing invoice, settled item, race, replay, and rollback tests pass;
- no runtime cross-book reconciliation or mismatch metric is added;
- all generated artifacts and one Unreleased changelog bullet are committed.

Verification: pnpm gen:all && pnpm verify && pnpm test && pnpm build.

### Issue 3: feat(web): ship the Intercompany Inbox and direct human actions

| Field       | Value                                                                                                  |
| ----------- | ------------------------------------------------------------------------------------------------------ |
| Type        | feat                                                                                                   |
| Priority    | Medium                                                                                                 |
| References  | #736                                                                                                   |
| Depends on  | Issues 1 and 2                                                                                         |
| Owned areas | apps/web workspace Inbox, server actions, approval links, E2E                                          |
| Migrations  | None                                                                                                   |
| Tests       | Server actions, direct execution, read-only membership, HELD replay, Playwright, accessibility, visual |
| Wave        | 3                                                                                                      |

Goal: expose safe Sent and Received views for both request kinds plus direct human and agent-proposal paths without bypassing authority, idempotency, or audit.

Scope:

- add /workspace/inbox/intercompany with Sent and Received tabs and a request-kind filter;
- show only safe request and protected-self directory facts;
- show the viewer organization's local payment due-from/due-to or invoice receivable/payable original, settled, and remaining amount without fetching the sibling position;
- let a source owner/admin select a local unposted bank-payment record, bank account, due-from account, and target party;
- let a target owner/admin select a local supplier PAYABLE, due-to account, EVENT series, and DOCUMENT series;
- let a paired-invoice source owner/admin select the target, eligible local period and series, dates, one description, one supported supply kind, and one supported CZK amount/VAT shape;
- let a paired-invoice target owner/admin review immutable issuer facts and select only its eligible local period and series, received date, and supported purchase supply kind;
- require the same final STANDARD approval to explicitly confirm full input-VAT deduction; a prefilled agent proposal alone cannot satisfy it;
- block unsupported target VAT status or deductibility with an explanation and Reject action, never an editable issuer-fact or VAT bypass;
- submit direct human commands through runDirectIntercompanyCommand with one-use idempotency tokens;
- deep-link registered local HELD approvals;
- keep active members read-only and deny guests;
- add owner/admin target reject and source cancel confirmation actions with local idempotency logs;
- cover both request kinds plus PENDING, APPLIED, REJECTED, CANCELLED, missing supplier invoice, consumed source record, unsupported paired VAT, non-CZK, empty, loading, failure, and conflict states;
- surface only PENDING age, rejection, application failure, and HELD metrics.

Acceptance criteria:

- a direct owner/admin action uses the same deterministic command and local execution log as held resolution;
- member and guest roles remain read-only;
- role and memberships are rechecked on direct execution and held resolution;
- agent HELD items and direct human execution use the same registered operation schema and domain adapter;
- the detail view labels who owes whom from the viewer's local RECEIVABLE or PAYABLE and continues to show settled status after reimbursement or invoice payment;
- paired source and target detail views link only to that viewer's local issued or received invoice and never expose the sibling UUID;
- no raw evidence, sibling ledger detail, cross-book metric, chat, or notification system appears;
- direct apply after one human approval and D6 same-user approval are covered in both API and web resolver tests;
- API and web tests prove a stored agent vatDeductible value cannot replace the final human STANDARD confirmation, while OUTSIDE_VAT accepts no confirmation field;
- E2E covers required accounting and authorization scenarios;
- accessibility, light and dark visual checks, typecheck, lint, test, and build pass;
- add one Unreleased changelog bullet.

Verification: pnpm typecheck && pnpm lint && pnpm test && pnpm build.

## 28. Clarity score

Final clarity: **99/100**. The 2 closed workflows, current authority model, unconditional agent HELD path, 4 stored operations, separate local documents, reciprocal open items, narrow VAT boundary, RLS, idempotency, audit, rollout, agent tool policy, and exactly 3 implementation issues are specified.

All HITL answers are inserted. The remaining point is implementation naming detail that does not change the architecture or accounting outcome.
