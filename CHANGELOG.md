# Changelog

All notable changes to this project. Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

Tag convention: `v<MAJOR>.<MINOR>.<PATCH>` for stable releases, `v<MAJOR>.<MINOR>.<PATCH>-rc.<N>` for release candidates. See [`docs/conventions/RELEASES.md`](docs/conventions/RELEASES.md) for the full rule set + cut workflow.

## [Unreleased]

## [v0.23.4] — 2026-07-18

### Changed

- Disable the post-deploy "Update ready / Reload now" prompt via an AppShell feature flag (component + wiring kept intact)
- Admin brand-lockup separator now uses the `icon-active-bg` token (#cdcece) instead of `border-subtle` for a more visible divider

## [v0.23.3] — 2026-07-17

### Added

- ESLint guard (ADR-0008) flagging redirect bases built from `request.url` instead of `publicOrigin(request)` — the class that slipped through in #794; warns on every lint run + pre-commit, excludes single-arg reads and `import.meta.url`

### Changed

- Rebuild the workspace + admin brand lockup: the app logomark stays in the rail and a vertical separator + wordmark SVG move into the header's left zone (pinned to the App Body's left border), replacing the single horizontal logo asset — mono-light on the green workspace chrome, `tone="admin"` + chrome-token divider on admin. Adds an AppShell `logoNudge` prop (default true; workspace + admin opt out so the rail logomark baseline aligns with the wordmark) and a shared `--wordmark-height` token

### Fixed

- Org switcher now preserves the current module/page/subpage when switching organizations (drops org-scoped record-id leaves + query), instead of dumping the user on the target org root
- Admin "Stop impersonating" redirect now builds its base URL via publicOrigin (x-forwarded-host) instead of request.url, so it no longer emits an unreachable Location behind Cloudflare Tunnel (ADR-0008)
- Login-session-expiry on the password/MFA steps (web + admin) now preserves the in-flight `?next=` deep link, so a stalled sign-in returns the user to the page they were signing in to reach instead of the default landing
- CI: key the Playwright browser cache on the installed playwright-core version instead of the package.json range string, and bump Playwright to 1.61.1 — replaced the stale exact `1.60.0` override with a floor-only `playwright-core >=1.61.1` that dedupes the tree to one browser version and tracks future bumps, so a version bump can no longer serve a mismatched cached chromium

## [v0.23.2] — 2026-07-17

### Added

- Brain admission caps: cross-instance concurrent-run enforcement via Postgres `brain_admission_slot` (migration 0063) behind `ACCOUNTING_ADMISSION_SHARED=1`, with an inline dead-holder reap and a pg-boss backstop reaper (#472)
- pnpm preflight script (affected typecheck+lint+docs check) for local pre-push gate
- PR-WORKFLOW.md convention (PR sizing, cache-buster isolation, preflight, squash-only)
- Document the apps/web/app/_components shared-vs-single-use placement rule + single-use index (README + AGENTS.md)

### Changed

- Brain hygiene (#775): delete the inert M2.1 model-routing dead path, add the Zdroj "Created by Agent" source column to saldokonto (open_item inbox_id), document all seven brain subcommands + the extract→event→book path, make the ISDOC unwired-reason honest (parser exists; adapter tracked in #792), and refresh epic #524
- Brain write gate: hold on the SUM of sub-ceiling amounts not just per-amount (S6); run the OCR-template screen for every ai_on_behalf write, not only agent keys (S7); record an honest skipped-veto audit shape (`{skipped:true,reason}`) when a confidence/amount hold pre-empts the veto (S8) (#774)
- pnpm preflight now runs the CHANGELOG Unreleased gate (catches release-cut merge mis-files that --no-verify merge pushes bypass)
- PR-WORKFLOW: add branch-per-PR lifecycle rule (check branch before new work) and clarify grouping is per-campaign, never per-PR
- Wire small-PR workflow into AGENTS.md, CONTRIBUTING.md, and an advisory cache-buster lefthook hook; base-pin pnpm preflight to origin/main
- Wire the Playwright MCP server into the repo .mcp.json

### Removed

- Retire the dev-only content-panel demo routes + components (Table/Launchpad/Dashboard/Single + table-demo); Table & Blank references now point at the settings/debug archetype pages, Launchpad/Dashboard/Single rebuild tracked in #787
- Delete the empty apps/web/components and apps/web/hooks scaffold directories
- Delete the redundant web-side dev mail outbox viewer page (/dev/outbox); the /api/dev/outbox endpoint + admin ops-debug viewer remain the single dev-mail inspection path

### Fixed

- Preserve the full deep-link path through the login redirect across web (`/[orgSlug]/*`, `/workspace/*`) and admin (`/(gated)/*`) so a signed-out visitor lands back on the exact page instead of the section root — layouts now read an `x-pathname` header forwarded by the edge proxy (added to admin, which previously had none)
- Remove two dead settings/debug sidebar links (archetype-table-db / -pivot routes never existed) and add the Archetype Table + Section Details Form debug pages to the sitemap

## [v0.23.1] — 2026-07-16

### Added

- Brain CLI: brain pipeline <pdf> books one document end-to-end (extract vision-OCR IR to event to book) as a single command with two approve clicks; INSTRUCT-AND-EXIT at each human-review gate (prints the held-write reviewId + approval URL + resume command, then exits without polling), resumable via a crash-safe on-disk checkpoint and --after-event <appliedEventId>; composes the existing extract/event/book cores with zero server change (WP2 Task 2.5)
- Brain CLI: brain book --after-event <eventId> overrides (or supplies) the --context captureContext.eventId with the applied accounting-event uuid the operator copies off /approvals after the event write is approved, validated as a uuid at the boundary, so no post-approval hand-edit of the context JSON is needed and no server read is performed (WP2 Task 2.3, #578)
- Brain CLI: brain extract --out <file> writes the validated machine IR Invoice (emitted by the extract session between sentinels) so brain event/book --extracted consume it with no hand-transcription; a shared parseExtractedInvoice validator asserts required fields + revives *_minor bigints, fail-closed on an absent/invalid IR (WP2 Task 2.2, #570)

### Changed

- Dev bot no longer opens GitHub issues for transient CI failures or runtime app errors — those now alert Telegram only; issues stay reserved for security-scan, blocking accounting-gate, and user-feedback signals
- Bump production dependencies group: react-hook-form 7.81.0, recharts 3.9.2, @nestjs/{common,core,platform-express} 11.1.28, @anthropic-ai/claude-agent-sdk 0.3.205, @fortawesome/react-fontawesome 3.4.0, @openfga/syntax-transformer 0.2.2 (supersedes stale Dependabot #699 and #782)
- Brain #578: remove the runtime-inert classify-to-capture threading seam (bare allowlisted tools auto-approve before canUseTool runs — CLAUDE_SDK_CAN_USE_TOOL_SHADOWED — so the updatedInput rewrite never fired) and correct the overstated three-sandbox-layers / harness-threads-classify comments; classify stays a model reasoning + human-reviewer discrepancy step, the write is submitted verbatim and the server gate holds every special regime; real treatment threading is deferred to a follow-up that feeds it a document-grounded supplyKind from the IR (WP2 Task 2.4)

### Fixed

- Stabilize the @workspace/ui Vitest suite: sweep stray fire-and-forget timers (input-otp caret sync) at each test boundary so they no longer fire after jsdom teardown and crash CI with 'ReferenceError: window is not defined'
- Brain approvals: add resolve-parity.test.ts (PG18) — drives the shared executeHeldWrite dispatcher for every GATED_WRITE_OPERATION_IDS op (exhaustiveness guard + real-DB landing), the červené storno negative-amount edit path, the stale-payload 422, and the S1/S2 web guards (WP1 Task 1.5, closes audit S9)
- Brain approvals reviewer UI: render the Tier-3 register-card creators (createAsset / createDepreciationPlan / createInventoryCount) with a real header + a labeled detail section, plus a generic key/value fallback for any unmapped future op, so the human gate is never blind (WP1 Task 1.4)
- Brain web approvals: add author!=approver + role gate (deny guest/agent), re-validate the stored payload, and write the same resolved output_json shape as the API (note + resolvedAt + payloadHash forwarded, so a post-resolve replay returns the recorded outcome not a 409) — WP1 Tasks 1.2-1.3, closes audit S1-S4
- Brain held-write approvals: extract a shared executeHeldWrite dispatcher so the web and API resolve paths land identical domain effects, and the web path now re-validates the stored payload (WP1 Task 1.1, closes audit S5)

### Security

- Bump better-auth to 1.6.13 (pinned) to patch GHSA-86j7-9j95-vpqj stored XSS via javascript: redirect_uri in oidc-provider/mcp
- Brain web approvals: make the resolve/confident-wrong role gate a fail-closed allowlist (owner/admin/member) so a future membership role is denied by default (WP1 security-review hardening)

## [v0.23.0] — 2026-07-16

### Added

- Inspector Sheet: right-docked row inspector rail on the Table archetype (7-tab rail, section-registry-driven tabs, deep-link `?inspect=<id>`, adjacent-row navigation) + Inspector Attachments wired to the S3 document store
- Pivot Columns manager drag: dragging a low-level measure reorders it across EVERY high-level group at once, and dragging a high-level group reorders the whole group; pivot group headers gain a Filter action routed to their column-dimension's toolbar filter.
- Pivot per-group subtotal rows (opt-in `subtotalRows`): a bold "Total …" row closes each group with the group's aggregate; the group's own value cells are blanked while expanded so the subtotal isn't shown twice.
- Pivot value columns are now filterable (the general all-columns-filterable rule): each measure column carries an inline numeric min/max filter in its header dropdown wired to TanStack columnFilters; all pivot headers get the AI-analyze item via the section bridge.
- Pivot drill-through: clicking any aggregate cell (subtotal, leaf, or grand total) opens the underlying source records behind it, via a new `ArchetypeTable.onPivotDrill` bridge that hands the page a `PivotDrillTarget` (cell coordinates + the filtered source rows); cells are inert when unwired.
- Table archetype: per-page persistence of column widths/order/pinning across reloads, and a sticky "Reset column sizes" action in the Columns manager
- Table archetype foundation: column-driven toolbar filters (filter presets) + default toolbar builder, DB→spec mapper, inline-cell write-back bridge with optimistic revert, table-aware bulk selection actions, single-page row virtualization, a Pivot table section, grid surface/checkbox design tokens, and shift-click range selection

### Changed

- Provision the S3 documents bucket (#722 working store) in production on the v0.22.6 deploy — first creation on prod; the CDK replace-guard override is audited as a brand-new empty bucket with no destructive replace of any existing resource
- Internal (thermo review): decomposed the 844-line DataGridView — the cell-focus grid + scroll-edge subsystems now live in data-grid-view-hooks (useCellFocusGrid / useScrollEdges); the left/centre/right pin split is one partitionByPin helper (was hand-rolled in the header, every body row, and the summary row); the column-manager's two reorder rows share one renderReorderRow.
- Pivot value/group column filtering moved fully into the toolbar: the inline per-column min/max filter in the header dropdown is removed; a column's Filter now opens ONE toolbar filter keyed by its measure field (or group dimension), so e.g. one "Amount" filter applies across every group.
- Pivot high-level (group) headers render on the neutral header surface (no blue tint), with corner cells matching and a full-strength single divider between groups cascading down the body (no double line).
- Pivot-aware columns manager: grouped tables show a 'High-level columns' section (the group headers) plus a 'Low-level columns' section that dedups each reused measure into ONE switch (an 'Orders' toggle hides Orders under every group).
- Pivot value columns are drag-reorderable again, but constrained WITHIN their group: each group's header gets its own dnd SortableContext so a value column can't be dragged into another group; the header-menu Move is dropped for grouped columns (drag only).
- Pivot header polish: group double-click auto-fit now sizes every sub-column to its rendered (formatted) cell text; group-tier header cells regain the normal header hover/active states; the top-left corner cells above the pinned select + label are a clean white block with no divider.
- Pivot header polish: group (high-level) headers now render as real interactive header cells (same dropdown/pin/resize, not a hardcoded label); pin seam + Total-row seam unified to a single 2px full-weight double border; the columns manager cascades a group column's hide toggle to its leaf value columns.
- Pivot hierarchical column headers: `columnDimensions` now render as banded header tiers (a grouping row per dimension, tinted with the new `--grid-header-group` #f5f7f9 token) over the measure columns; pivot columns keep sort-by-value but are structurally fixed (no reorder via the new `meta.disableReorder`).
- Filter-side creatable option/multiOption columns: the value editor shows a "Create …" row for a typed value with no match (mirrors the creatable cell editor); the multiOption filter-variant icon is now the real lucide-lab `chevrons-up-down-square` (adds `@lucide/lab`).
- Table archetype: reset column layout (sizes + order + pinning), full-weight pin-seam border, 22px inspector button, slack on double-click auto-fit; Pivot now ships the shared select column + per-dimension toolbar filters; filter-variant icons refreshed (text/number/date/option/multiOption); every data column is filterable by construction; `select` columns can be `creatable` (add a new option from the table via CreatableCombobox); the block right-click context menu is switched off.
- Pivot section rebuilt from the ground up to render THROUGH the shared Table stack (useSectionGridTable + DataGridView) — no reinvented grid/sorting, in-layout, identical look: pure-data descriptor with multi rowDimensions/columnDimensions and multiple measures (sum/count/countDistinct/avg/min/max), an accumulator-fold transform with true subtotals+grand-totals at every level, cross-currency cells flagged non-aggregable (never a fake number), collision-safe row ids + CSS-safe leaf-column ids, expand/collapse, TanStack sort by label or measure value, and loading/empty/error states. Hierarchical column headers + drill-through are follow-up phases.
- Table archetype: columns are filterable by default (the toolbar filter is derived from each column's kind — no per-column wiring; opt out with filter:false, and the Status-delegated column is dropped from the multi-filter automatically); the Open-inspector button is a bordered white icon box (unselected-checkbox border, #646464 glyph, #e5e5e5 hover) with an "Open Inspector" tooltip; double-click auto-fit on the identity column reserves room for the inspector button (no overlap) via a new column meta.trailingWidth

### Fixed

- Pivot: shift-range row selection no longer selects a non-selectable subtotal caught in the range (raw setRowSelection bypassed the enableRowSelection predicate, inflating the count/sum); and reordering a group/measure while a measure is hidden no longer scatters that measure's leaves out of their groups, which split the banded header when re-shown.
- Pivot: selecting a row-group checkbox no longer also selects that group's calculated subtotal ("Total …") row, which would double-count a sum over the selection; subtotal rows are now non-selectable (no checkbox, keep their line number).
- Pivot table now scrolls horizontally INSIDE its own grid (pinned + mandatory columns stay frozen) instead of scrolling the whole Content Body — the section wrapper was missing `min-w-0`, so any wide grid pushed the body sideways.
- Table archetype: dark-mode lighter box behind inline-editable cell text (the shadcn Input's `dark:bg-input/30` outranked the cell's `bg-transparent` — the inline editors now force `dark:bg-transparent` and inherit the row surface), grid keyboard-nav hijacking inline-editor caret keys, unsafe optimistic-write rollback on out-of-order commits, invalid/NaN numeric commits, Columns-manager order not following pinned groups, filter coercion (missing-vs-zero, invalid dates, untrimmed tags, stale filter models), and descriptor/pin validation gaps
- Table archetype: a column's `kind` now canonically drives its toolbar filter via one global `filterVariantForKind` map (`filter: true` derives everything from the kind — a `select`/`badge` column becomes a dropdown/option filter with its own options, never a text search); the row Inspector's Open button moved into a required right-aligned `role: "id"` identity column (hover-revealed, sized a step above the checkbox), replacing the generic actions-column placement
- Table archetype (review-plan C-tasks): single-page row model (`useDataTable` `paginated: false`) replaces the hidden fake `pageSize` so sort/filter see every row and nothing is silently truncated; the Pivot grand total is a stable pinned footer row outside the sortable/selectable body model (never moves, never selectable, absent when empty); the Pivot section is documented display-grade (a UI package must not import domain `Money`) with zero-decimal-currency + epsilon-sum formatting fixed; the `selection` feature flag (which never worked) removed so the always-on select column matches the type, and the row Inspector is wired end-to-end (a per-row Open-inspector button opens the `renderInspector` Sheet); flat + Pivot renderers now share one `useSectionGridTable` scaffold so the mandatory single-page config + live-table registration have a single definition point
- Table archetype: DataGridView passes its DndContext a React SSR-stable useId, fixing a hydration mismatch on the column-drag grips (dnd-kit's default aria-describedby is a module-counter id that differs between server and client renders).
- Table archetype: the Columns manager row toggle was a native <button> wrapping the Radix Checkbox (also a <button>), causing a button-in-button hydration error. The row is now a role=button div with a non-interactive check indicator; a regression test + an open-state story keep the a11y gate (nested-interactive) covering it.
- Table archetype: a per-column header "Filter" on the column delegated to the faceted statusFilter no longer crashes the toolbar (FilterSelector.getColumn threw on the unknown id). The chrome now guards the multi-filter `property` to columns it owns and routes the delegated column to the statusFilter via a new StatusFilterDescriptor.columnId.

### Security

- Allowlist Debian-base perl CVE-2026-13221 + Storable CVE-2026-57433 in the ECR deploy gate — base-essential, never in the Node runtime path, no upstream Debian fix; same disposition as the existing perl entries

## [v0.22.6] — 2026-07-15

### Added

- Admin Platform > Debug > Emails preview page rendering every transactional email; compose the From display name (Afframe) in code so prod inboxes stop showing no-reply; move email authoring convention into docs/specs/TRANSACTIONAL-EMAILS.md
- Document the transactional-email authoring convention (AGENTS.md + packages/email README) and add a guard test that fails if any email builder skips the shared shell or support Reply-To
- Feedback support notification: set Reply-To to the submitter and share the escapeHtml util from @workspace/email instead of a local copy; document the internal-vs-customer email boundary in docs/specs/TRANSACTIONAL-EMAILS.md
- Unify all transactional emails (invite, password reset, email verification, magic link) on one cross-client shell: hosted brand mark, fluid mobile layout, Outlook-safe button, footer, and support Reply-To
- Invitation email now shows the workspace name as the heading, the organization legal name in the body, and the inviter's email alongside their name; the issuer resolves workspace display_name + inviter email
- Rebuild the invitation email for cross-client rendering: table-based layout, inlined styles, Outlook-safe padded-cell button, and the hosted brand mark PNG in place of inline SVG that Gmail/Outlook strip

### Changed

- Rebuild the workspace Profile as grouped General, Appearance, Security, Privacy, and Permissions pages with contextual dialogs and history, editable identity, avatar, contact, signature, shared company-structure fields, regional and consent settings, session and API-key visibility, permission grants, workspace departure, and OTP-confirmed account deletion.

### Fixed

- Guard bare localStorage access in ThemeProvider and ThemeToggle so Safari with cookies/storage blocked no longer throws "Can't find variable: localStorage" on every page (#749, #750)

## [v0.22.5] — 2026-07-15

### Added

- admin: XML-filing operator debug page (Platform → Debug → XML filing) — import a DPPO/DPHDP3/DPHKH1/ISDOC XML, round-trip it through @workspace/filing, XSD-validate the regenerated output, and run the DPPO kritické kontroly; prod-live (staff-only), not dev-gated
- filing: DPPO input + validity layers — field parsers (@workspace/filing/fields: parseKoruna/parseSazba/parseDic/parseEpoDate + fieldTypeFor), offline IČO/DIČ mod-11 checksum (@workspace/filing/business-validity), and warn-only EPO kritické-kontroly (checkDppo, @workspace/filing/dppo-checks) — the demo-independent input contract a real filing UI binds to
- filing: Tier 3 FÚ EPO DPPO engine (DPPDP9 v05.01.01) — generateDppo/readDppo, validateFiling(…, "dppo", "05.01.01"), buildDppoFromAccounting, computeDppoTotals (@workspace/filing/dppo-compute), vendored official XSD
- Brain Tier 4 (surfacing): "Created by Agent" (Zdroj) filter + column on the Records/documents and Journal (deník) tables, driven by inbox_id — any agent-proposed, human-approved accounting fact is now filterable system-wide.
- Brain Tier 4 (provenance): inbox_item table + inbox_id stamped on every agent-landed accounting row (posting, summary/individual/partial record, double-entry + monetary line, accounting_event, open_item), minted at approve from the held write — the spine of the system-wide "Created by Agent" filter. Workspace-scoped with the composite-FK / bare-uuid split that keeps RLS intact.
- Brain Tier 3: gated register-card creators (createAsset / createDepreciationPlan / createInventoryCount) so the agent can propose asset cards, depreciation plans (odpisy), and inventory counts through the confidence gate (held → human approves).

## [v0.22.4] — 2026-07-15

### Added

- Czech e-filing engine Tier 2 (FÚ EPO): @workspace/filing now generates, reads, and XSD-validates the DPHDP3 (Přiznání k DPH, v03.01.03) and DPHKH1 (Kontrolní hlášení, v03.01.14) <Pisemnost> documents against the vendored official schemas — attribute-centric věty, whole-koruna vs haléře decimals, DIČ digit-stripping, D.M.YYYY dates. Public API for a UI to bind buttons to: generateDphdp3/readDphdp3, generateDphkh1/readDphkh1, validateFiling(xml, 'dphdp3'|'dphkh1', version), the typed Zod models (Dphdp3/Dphkh1 — the render seam), buildDphdp3FromAccounting/buildDphkh1FromAccounting adapters from the accounting VAT outputs, and computeDphdp3Totals/applyDphdp3Totals (the derived footer lines ř.46/62/63/64/65, exposed via the @workspace/filing/dphdp3-compute subpath so a client can compute them without bundling the validator). filing stays a pure serialize package (no accounting/db dependency). See packages/filing/README.md.

## [v0.22.3] — 2026-07-15

### Added

- Wire the internal-documents, obligation-vouchers (+ payable/receivable), and trial-balance (obratová předvaha) pages from ModulePage placeholders to real data-backed views, reusing the existing fetchDocuments / saldokonto / general-ledger read models and table components.
- Brain Tier 2: `createAccountingPosting` gains an optional `openObligation` directive so any double-entry posting (a contract obligation or an internal doklad, not just an invoice) can open its saldokonto pohledávka/závazek. Server-authoritative: counterparty from the posting's event, currency from the period, amount = the exact posted net movement; fail-closed on a null counterparty, opens nothing on net ≤ 0, rejected on a monetary posting.
- Brain Tier 1.5: `brain event` cross-checks the extracted counterparty IČO against the ARES public register before proposing the event — a name mismatch refuses --execute (override with --allow-register-mismatch), asserts the counterparty_register_mismatch cap so the write holds sub-green, and surfaces the mismatch in the held-event review; fail-open (ARES down never blocks).

### Fixed

- Block accounting period close on unresolved period-scoped HELD Brain proposals, and fail closed on unscoped legacy proposals. (#738)

## [v0.22.2] — 2026-07-15

### Changed

- Document S3 bucket responsibilities, implemented upload/read/delete flows, limits, local MinIO operation, alarms, troubleshooting, follow-up ownership, Frankfurt pricing, and scale guardrails in ADR-0031 and the document-store runbook.

## [v0.22.1] — 2026-07-15

### Added

- New `@workspace/filing` package: Czech e-filing XML engine. Tier 1 = ISDOC 6.0.1 read (`readIsdoc`) + write (`generateIsdoc`) + `xmllint-wasm` XSD validation (`validateFiling`) over a generic XML core, the foundation for the FÚ EPO tax filings (DPH / KH / DPPO) in later tiers

### Fixed

- Made accounting period roll-forward fail closed on authoritative readiness checks, generate the period output atomically before close, and disclose blockers and unsupported statutory checks in Settings. (#724)

## [v0.22.0] — 2026-07-15

### Added

- S3 document store: rate limiting on the cost-bearing document routes (presign-upload / confirm / mint-url) — per-user 90/min, per-workspace 900/hour, per-IP 180/min, returning 429 with Retry-After. Bounds how fast an authed tenant can mint S3 objects/egress URLs (bytes go direct-to-S3, so the risk is the S3 bill, not compute). Absolute per-workspace storage quota tracked as follow-up #729.
- S3 document store (Stage 4b): public /v1 read/retrieve API twin — GET /v1/documents (list, workspace-scoped, includeDeleted filter) and GET /v1/documents/{id}/download-url (short-lived presigned URL, bytes fetched direct from S3, never proxied). Workspace derived from the API key, no tenant identifiers accepted; internal S3 key never exposed. OpenAPI/SDK/MCP regenerated (2 new MCP tools).
- S3 document store (Stage 4): reusable UI-agnostic browser client (app/_lib/documents-client.ts — uploadDocument/getDocumentUrl/deleteDocument/restoreDocument, bytes direct to S3, sha256 computed in-browser) + a dev-only /workspace/debug-documents harness exercising upload→confirm→preview(PdfViewer/img)→download→soft-delete→undo end-to-end. Storage stays decoupled from any product surface.
- S3 document store (Stage 3): authenticated web routes for document upload/confirm/preview/download/delete/undo (apps/web/app/api/documents/*) — workspace derived server-side, dedup via the inbox_attachment row not S3, confirm tags-then-writes-row (never DB-first), delete/undo asymmetric S3-tag↔DB ordering, and a fail-closed callerWorkspaceId backstop on presignGet
- S3 document store: inbox_attachment table (migration 0057) — workspace-scoped durable identity of a confirmed upload, FORCE RLS with 4 command-specific policies, content-addressed dedup UNIQUE(workspace_id, sha256), composite-FK target, sha256/size CHECKs
- S3 document store P1b: document-reaper Lambda (sole S3-delete principal, hourly EventBridge, tag-age purge of orphaned/abandoned/soft-deleted objects) + errors/duration alarms
- S3 document store P1a: KMS-CMK-encrypted DocumentsBucket (Intelligent-Tiering, versioned, SSE-KMS + SSE-C deny policy) + no-delete task-role grants + write-flood alert (SNS-only, no kill-switch)
- S3 DocumentStore interface + S3/minio implementation (packages/storage)

### Changed

- Conductor dev setup: bring up the dev-compose minio + seed the documents-dev bucket, and add the S3 document store env (DOCUMENTS_BUCKET / S3_ENDPOINT / minio creds) to the generated apps/web/.env.local, so the /workspace/debug-documents harness works locally out of the box.

### Fixed

- S3 document store debug harness: page body now scrolls (h-full overflow-y-auto) so a tall image/PDF preview is fully visible instead of clipped by the app-shell content slot's by-design overflow-hidden.
- S3 document store: inline image/PDF preview was blocked in local dev by the site CSP — the minio dev origin (S3_ENDPOINT) is now added to img-src and connect-src when NODE_ENV=development, so presigned-URL previews render (download always worked as a top-level navigation). Production CSP is unchanged (real S3 presigned URLs already matched https://*.amazonaws.com).
- S3 document store now works against S3-compatible endpoints (minio dev): pin explicit static credentials when a custom S3_ENDPOINT is set (avoids the AWS SDK error when both AWS_PROFILE and AWS_ACCESS_KEY_ID are present), and source the pinned VersionId for version-safe confirm/undo from HeadObject (which every implementation returns) instead of GetObjectTagging (which minio omits). Dev-compose minio bucket now has versioning enabled.
- S3 document store hardening (advisor Stage 0): UUID-validate document object keys so presign and confirm agree, size-filter Intelligent-Tiering to the ≥128KiB tail, alarm when the sole-delete reaper stops running, and document that presignGet is not an authorization boundary (the route is)
- Harden S3 document uploads and cleanup with complete presigned POST fields, authoritative file validation, version-safe confirmation and undo, and race-safe reaper deletes.

## [v0.21.1] — 2026-07-15

### Added

- Brain CLI: new `afframe brain event` command + `invoiceToEvent` adapter — proposes the accounting event (case) for an extracted invoice carrying the supplier/customer identity (name/IČO/DIČ, source-verbatim, malformed fields omitted), so the derived invoice books against the right counterparty instead of holding on a null one. Deterministic operator-key POST /v1/accounting/events (no agent session), gated → HELD for human review; direction picks the party (received→supplier, issued→customer); occurredAt = tax-point/issue date; refuses --execute on a missing counterparty unless --allow-missing-counterparty.

### Fixed

- Brain: approving a captured invoice through the public API (POST /v1/accounting/held-writes/:id/resolve) now books it (posting per event + saldokonto obligation) instead of leaving an orphaned capture — parity with the web approvals path (PR #712/#715). POST /v1/invoices now persists its held write under the shared captureAccountingDocument tool_name (normalized body), so a held invoice is approvable through the existing replay case instead of dead-ending on an unknown 'createInvoice' operation. Both approve surfaces share one captureAndBookIfInvoice unit; the API held-row read takes FOR UPDATE so a concurrent double-approve cannot double-book.

## [v0.21.0] — 2026-07-15

### Added

- Row Inspector Sheet (`InspectorSheet` + parts) for the Table archetype: a right-docked detail Sheet opened by the per-row maximize affordance, with pinned header/meta grid, Details/Review/Line items/Evidence sections, and a sticky action footer
- dnd-kit column header drag-reorder in DataGridView (mouse/touch/keyboard) sharing columnOrder with the Columns manager; Table section gains inspect (row maximize affordance) + rowActions (right-pinned action column) feature flags
- Table section (sectionTable) — a TanStack Table v8 data grid with pure-data column/row descriptors, inline cell editing, row selection, sort/resize/reorder/pin; ArchetypeTable now owns a SectionTable bridge so the toolbar viewTools + selection footer drive the live grid. Demo at Settings → Debug → Archetype Table
- ArchetypeTable whole-panel archetype (ContentHeader with views + fully-wired ContentToolbar + branded body Sections + selection ContentFooter, no legacy status bar) with a Settings → Debug → Archetype Table reference page

### Changed

- Table archetype hardening: controlled column pinning + order in useDataTable (pinned columns drag-reorder within their group; a header-menu pin lands before the action column, never outside it); row actions trimmed to one primary action + overflow; the columns dropdown rows became clean whole-row toggles; and the per-column header menu gained Filter (opens the shared toolbar filter at that column) + AI-analyze items.
- ContentToolbar/filter polish: option-filter count badges pinned to the right edge, Reset chip restyle (no icon/shadow), date filter as a range picker with a preset sidebar + dropdown month/year caption, 5px inter-line gap; Columns manager reordered by live columnOrder with pinned-left/right + unpinned sections and checkboxes; removed the Inspector panel/dialog mode toggle from the toolbar
- ContentToolbar: 42px bar matching ContentHeader, default-size controls, faceted status-filter live update fix, search clear button, and the multi-filter slot wired into the archetype-table debug demo
- Reworked ContentHeader: merged breadcrumb+back-link+title nav (icon crumbs, collapsible native BreadcrumbEllipsis dropdown, Single-only back link), rebuilt view tabs (mandatory count badges, flush underline, no per-tab icons, mandatory All + active kept inline), container-query responsive collapse driven by the header's own width, uniform gaps, 42px height, Favorite-only actions; added a Pin icon to the icon packs

## [v0.20.1] — 2026-07-14

### Added

- Accounting: createEvent now resolves a supplier/customer IDENTITY to a workspace-shared counterparty (resolveCounterparty, find-or-create deduped by IČO then DIČ then name+country, self-org excluded, NULL-only backfill), so the derive booker opens the saldokonto obligation against the right partner. createAccountingEvent accepts an optional counterparty {name,ico,dic,countryCode} object (counterpartyId still wins). Partial unique indexes on counterparty (workspace_id,ico)/(workspace_id,tax_id) (migration 0058) make the dedup race-safe so one vendor never splits across two saldokonto partners.
- Accounting: approving a captured invoice now opens its saldokonto obligation (pohledávka/závazek) in the same tx — bookDocument calls the new openObligation helper per event, so an approved invoice lands fully-wired into závazky/pohledávky (previously openItem had zero production callers and saldokonto stayed empty). A dobropis (net ≤ 0) opens nothing; an invoice event with no counterparty fails closed (holds); a UNIQUE(origin_posting_id) guards against a duplicate open. Migration 0057.

### Fixed

- Auth: the edge proxy session-presence check now reads the per-workspace cookie prefix ($CONDUCTOR_PORT), fixing a redirect loop to /auth/login introduced when the dev cookie was namespaced — getSessionCookie was still looking for the default cookie name.
- Auth: dev session cookies are namespaced per Conductor workspace (advanced.cookiePrefix keyed on $CONDUCTOR_PORT), so parallel workspace dev servers on localhost no longer clobber each other's session and silently sign you out; production cookie name is unchanged.

## [v0.20.0] — 2026-07-14

### Added

- Accounting: fetchDocuments now returns posting status (is_posted / posting_id); new unlinkedInvoiceLines invariant flags any non-generated invoice ledger line missing its partial_record link.
- Brain: classify_accounting_event echoes supplyKind and the intake harness threads it onto the capture partial, so a derived invoice books to the correct cost/revenue account with no human friction (still held for review).
- Accounting: deterministic whole-document booking (bookDocument) runs in the capture-approve transaction, so approving a captured invoice lands one fully-wired posting per event with every ledger line linked to its source partial_record (§6/2), replacing the orphaned capture + preview-vs-apply drift.

### Fixed

- Accounting: resolveHeldWrite locks the held tool_call_log row (SELECT ... FOR UPDATE) so concurrent approves of the same capture can't double-book the ledger; bookDocument also fails closed on §37a ADVANCE partials.
- Conductor Web Run now starts Postgres, repairs a missing or unseeded workspace database, and applies any pending migrations before launching Next.js.

## [v0.19.3] — 2026-07-14

### Added

- Notify signed-in web and admin users when a newer deployment is available, with a user-confirmed reload action that stays dismissed until the next deployment.

### Changed

- Conductor web/api/admin Run buttons now auto-open the app in the default browser once the port answers (bounded, macOS-gated poller in .conductor/settings.toml)

### Fixed

- PWA web manifest route no longer errors on unfilled brand copy: <BRAND-*> i18n placeholders are ICU-escaped ('...') so next-intl renders them literally instead of throwing UNCLOSED_TAG

## [v0.19.2] — 2026-07-14

### Added

- Conductor: admin dev server run button ($CONDUCTOR_PORT+2) with its own generated apps/admin/.env.local (shared workspace DB + auth secret, ADMIN_WORKSPACE_ALLOWLIST = seeded workspace id); committed [prompts] action-button instructions for Review/Create PR/Fix errors/Resolve conflicts/Branch rename

### Fixed

- Restore the admin Platform Debug page in production so its Input Fields board is reachable from the existing navigation entry.

## [v0.19.1] — 2026-07-14

### Added

- Conductor: full per-workspace isolation (own $CONDUCTOR_PORT range + own seeded Postgres database per workspace, demo login owner@example.com), committed setup/archive scripts replacing untracked local config, and cloud-safe (Docker-gated) setup

### Dependencies

- Bump the dev-dependencies group across 1 directory with 9 updates (#704)

## [v0.19.0] — 2026-07-13

### Added

- Section Details Table — a data-driven content-panel section (Data Table on the right of a Details Form), with readonly (display + add editable rows) and editable (edit rows in place) modes; action buttons as data (add-row local state, link navigation).
- UI: **Tabs** section (`sectionTabs`) — a Form section whose right column is a set of tabs (default segmented variant), each tab carrying its own 6-column field grid; reuses the Form section's shared `FieldGrid` + `SectionTwoCol` parts. Tab switching is data-driven (`tabs` + `defaultTab`)
- UI: **Group** section (`sectionGroup`) — a titled, rule-bracketed container that nests other sections (one level); subsumes and replaces the standalone Title + Divider sections (its chrome = the h2 + top/bottom rules). ContentBody now delegates to a shared recursive `SectionList` so the brand guard runs at every level; the closed registry stays leaf-only (no import cycle)
- UI: **Title** section (`sectionTitle`) — a standalone h2 group heading at the same left position as a Form title, used to group 2+ Form sections; wired into the Archetype Details debug page
- UI: **Details** archetype (`ArchetypeDetails`) — ContentHeader (no view tabs), no toolbar, a body of as many stacked branded Sections as the page wants, and an optional Save/Discard ContentFooter; Settings → Debug → Archetype Details reference page shows two stacked Form sections + the footer
- UI: Form section fields can carry an optional `hover` (HoverCard, not tooltip) shown over the CONTROL — rich data-driven explanation (title + description), label left undecorated; DIČ on the debug page explains it is FÚ-issued for every company incl. non-VAT payers
- UI: Form section (`sectionForm`) — a two-column Content-Panel body section (title + description left, a 6-column field grid right, fields spanning 1–6 columns; text + select controls as data) plus a Settings → Debug → Section Form reference page
- Add the ContentFooter block — the single sticky bottom action surface (selection + save modes, data-descriptor slots); replace ContentPanel's floating actionBar slot with a footer slot; migrate the 3 ActionBar pages (archetype-system P5/PR-6)
- Add the archetype-body governance ratchet (`check:archetype-body`): a required CI check that AST-scans apps/web + apps/admin and fails when a new file renders a legacy `<ContentPanel>` body outside the archetype path, with a frozen shrink-only allowlist of the 47 grandfathered call sites.
- AssistantPanel block (assistant-panel) and a first-class Inspector block extracted from ContentPanel (archetype-system P3)

### Changed

- Refactor Details Table renderer to a single draft-row state model (from a 6-piece overlay), move the adjacent-group divider overlap to one CSS rule, derive section payload types from their props, and correct the Space section's default-size JSDoc
- Tabs: bump the horizontal TabsList height h-8 → h-9 in packages/ui (applies everywhere the segmented Tabs is used, incl. the Details Tabs section).
- Details Table polish: the per-row Edit icon toggles to an Apply (check) action that returns the row to read mode keeping its edits; read-only tables can show a 'to edit, go to <link> ↗' hint; two Details groups stacked with no Space now collapse to a single divider (no gap) via a 1px overlap.
- Redesign Section Details Table: fixed 6-track grid layout, per-row inline Edit + destructive Delete confirmation, real controls (text / dropdown / tags), dynamic Add button + optional link actions, editable/read-only states, white inputs on the grey editing row. Drops the earlier badge/badge-or-dash cell.
- Renamed the Details-archetype section family: Section Form/Tabs/Group → Section Details Form/Tabs/Table/Group (factories sectionDetailsForm/Tabs/Group, kinds details-form/tabs/table/group); Space and Empty stay generic.
- UI: Tabs section keeps every tab panel mounted (`forceMount`) so entered values survive a tab switch (reset only on reload/Discard); +6px gap between the tab bar and the fields
- UI: Group section gains 16px bottom breathing room (pb-4) before its bottom rule; Archetype Details demo gives each Addresses tab distinct fields so tab switching visibly swaps the form
- UI: Archetype Details demo adds a 16px Space before the group's bottom divider (breathing room from the section above)
- UI: replace the Title `topRule` flag with a standalone **Divider** section (`sectionDivider`) — a full-ContentBody-width hairline the page places explicitly above and below a group, so the last group gets a real bottom rule (a flag couldn't, since no section knows it is last)
- UI: Title section — bottom padding 32→16px (hugs its group) and a new `topRule` flag drawing a full-ContentBody-width hairline above the heading; groups separate by the next title's rule, the last group is closed by the ContentFooter (flat pattern — chose over a nested Group section per Advisor review)
- UI: Form section vertical padding `py-4`→`py-8` (16→32px each side, so stacked sections sit 64px apart) and the Space section default gap 16→32px
- UI: Form field hover card text reduced to `text-xs` and narrowed to w-56
- UI: Form field `hover` now surfaces as a visible '?' (CircleHelp) affordance next to the label instead of a hidden hover on the input — discoverable, opens the HoverCard on hover or keyboard focus; label still undecorated
- UI: Form section layout pass — container-query responsive columns (stack the title above the fields on a narrow panel instead of cramming; when side-by-side the left title column is capped at 18rem so the fields take the remaining width), `px-6`/`py-4` padding (24px sides = 3× the panel header), h4 (`Heading level={4}`) title; new `sectionSpace` gap section + a section `fill` flag so Empty fills while Form/Space take natural height and the body scrolls
- UI: Form section polish — desktop `select` now renders our Radix Select (not NativeSelect), controls pin to a shared baseline so a row's inputs never float, title/first-field top-aligned, and sections carry an optional `anchor` (DOM id via ContentBody) for URL/CLI/docs deep-links
- Relocate reusable archetype surface into packages/ui (archetypes are shared across web + admin): ArchetypeBlank -> packages/ui/blocks/archetypes, and the AppPageHeader content-header portal seam -> packages/ui/blocks/app-shell; ~44 page importers repointed to the barrels. Only routes + nav config stay app-side.
- Archetype system, corrected model: an Archetype is now a component that composes the whole Content Panel from closed blocks + branded Sections (not a body-level descriptor). Added the Blank archetype (ArchetypeBlank) + a Settings→Debug→Archetype Blank page, ContentBody now renders branded Sections via a closed SECTION_REGISTRY, and ContentPanel gained a sections body path. Deleted the dead, never-adopted body-level archetype API (ArchetypeDescriptor/ARCHETYPE_REGISTRY/archetypeEmpty) after an Advisor gate, and repointed the archetype-body ratchet message, allowlist banner, and docs to the sections path.
- Archetype-body ratchet: make the allowlist claims honest (shrink-preferred + review-gated, not code-forced) and add a CRITICAL read-for-agents banner to archetype-body-allowlist.json forbidding hand-added entries without explicit approval; the BLOCKED/STALE messages now point at that rule.
- Harden the archetype Content Panel after a thermo-review pass: close the governance ratchet's namespace-import blind spot (with pinned shim/createElement boundary fixtures), test ContentBody's prod no-leak backstop, make AddDescriptor a discriminated union so a variants dropdown can't ship without a handler, cover the ContentToolbar container + split-add path, trim dead content-header exports, drop orphaned favorite state from 5 page contexts, fix registry dep lists, and reconcile the archetype docs.
- Register content-panel/sidebar-panel/assistant-panel blocks in the UI registry; reconcile the CONTENT-ARCHETYPES shared-foundation example to the closed ContentHeader/ContentToolbar/ContentBody/ContentFooter API (archetype-system P6/PR-7)
- Close the ContentToolbar API: descriptor-only named slots (statusFilter/search/filter/viewTools/actions/add/modeToggle), rename the ReactNode left/right toolbar to ContentToolbarLegacy for not-yet-migrated pages, migrate demo-table as canonical (archetype-system P4/PR-4)
- Close the ContentHeader API (remove actions/icon/tabs/manageTabs ReactNode holes; add breadcrumb + titleIcon; internal Favorite/Configure + data-driven manageViews); split into content-header-* sub-blocks (archetype-system P4/PR-3). Header-jammed content on companies/doklad/single-demo dropped behind TODO(archetype-redo).
- Extract AppBody presentational panel-row component from AppShell; all shell state stays in AppShell (archetype-system P3)
- Reshape content-panel block: move ContentHeader + ContentToolbar into subfolders with re-export (archetype-system P2, behavior-preserving)
- Rename UI blocks `app-content` → `content-panel` and `app-sidebar` → `sidebar-panel` (archetype-system restructure, phase 1)

### Fixed

- Storybook a11y baseline: re-map the app-content→content-panel rename's story ids and cover the new ContentFooter selection story; make the admin utility-page-catalog test await async content (findByText) to de-flake it under CI load
- Details Table: clicking Apply (check) on a still-empty newly-added row now discards it instead of leaving a blank '—' row behind — an empty new row's Apply behaves like the X remove.

## [v0.18.0] — 2026-07-13

### Added

- Admin Platform Debug page with Input Fields subpage (blocked in production); the shared inputs debug board lives in packages/ui/src/blocks/inputs-debug and is rendered by that page
- DatePicker component: shadcn calendar-with-presets in a Card, vertical (presets below) and horizontal (presets left) orientations, active-preset highlight, our rounded-lg surface radius
- **brain**: calibration degenerate-fit guard (#569) — reject zero-variance / single-block / all-same-label fits, fail closed to the cold-start identity model; a degenerate fit can never raise a score
- **api/brain**: wire the confidence gate to consult a (default-safe, cold-start-identity) calibration model + a guarded refit entry point (M3.2, #569 degenerate-fit/domain guards); cold-start stays HELD (the `extraction_failed` floor forces the block short-circuit regardless of the model). Preserve `serverGate` (incl. `.shadow`) forward across held-write resolve (F1) so a resolved row carries both `resolution` and the shadow score the M3.3 run-log ingestion pipeline needs.
- **brain**: run-log ingestion pipeline (M3.3): shape reviewed held-writes (shadow score + human approve/reject outcome) into CalibrationSample rows for the M3.2 calibration refit; fail-closed, never fabricates a label
- **brain**: server-side extraction re-verifier (M3.1) — independently recomputes VAT arithmetic/sums/totals and OCR template-confirmation basis for a captured document, returning a structured field-by-field verdict. Standalone and unconsumed: the `extraction_failed` cold-start floor and `runGatedWrite` are untouched; the verdict feeds no decision path today (activation is data-gated on the M2.3 marathon + closing #565).
- Added a typed utility-page catalog and shared renderer for web and admin error, access, availability, connectivity, and recovery states.
- Add the current shadcn chat primitives, Typeset typography, audit-log and stat-card components, showcase coverage, and pinned shadcn MCP agent discovery.
- feat(brain): posting lane (`brain run --mode posting`) — the Brain reasons the double-entry účet předkontace (cost account vs 321 + 343) and proposes a HELD posting, so its account choice is testable against the real book (GAP-007)

### Changed

- ColorPicker: trigger height h-8 -> h-9 (matches form-control input height)
- Toggle: default size now h-9 (matches input field), normalize focus ring to ring-3, drop redundant lg size
- Combobox now shows a clear (X) on selection by default (ComboboxInput showClear defaults to true), so every combobox gets it; Autocomplete popup uses the ring-1 ring-foreground/10 floating-surface style instead of a hardcoded border
- Mention chip has internal padding (pill wider than text) and its popup uses our ring/muted-label dropdown styling; Autocomplete disabled state matches Combobox (single opacity + bg-input fill); PhoneInput country list height uses the Radix available-height token instead of a fixed pixel value
- InputSegmented is now single-size, inheriting the input line's h-9/rounded-lg (dropped the sm/lg size scale)
- InputTags editable chips now enter edit mode on a single click (was double-click)
- InputOTP default size is now separate rounded boxes matched to the input line (size-9/36px, rounded-lg) instead of the joined look; the old joined look moves to a new `connected` size, and `xl` is documented as needing containerClassName='w-full'
- PasswordInput generator now forces a random 1–3 symbols (was exactly 1) into distinct slots, and the stale comment (claimed 4 groups/21 chars) now matches the real 3-group/20-char output
- PasswordInput now type-requires `value` + `onValueChange` when `showGenerate` is set (discriminated union), so the generated password always has somewhere to land
- SelectTrigger shows its ring only while the dropdown is open (data-[state=open]); removed the focus-visible ring that lingered on the closed trigger after a mouse selection
- SelectTrigger `sm` size reverted to shadcn/ui original height (h-8, was our h-7) and dropped the sm-only radius override
- InputGroup addon text (InputGroupText) and buttons (InputGroupButton) now match the input's own text size (text-base/md:text-sm) at medium weight and muted-foreground, instead of a fixed text-sm
- Default form-control height bumped `h-8` → `h-9` across Input, Select trigger, NativeSelect, InputGroup (also lifts PasswordInput + Combobox), and the Autocomplete field so paired fields align; `sm` sizes unchanged
- Redesigned the accounting approvals surface: business-facing table columns (counterparty, amount, confidence, doklad number, event date, added date, status) replacing the internal Operace/Popis/Aktér/Klíč set, with row-select checkboxes and bulk approve/reject straight from the ActionBar; a pinned Inspector action footer (approve/reject/edit stay put while the detail scrolls, via a new ContentPanel `inspectorFooter` slot); richer always-on detail lines (doklad number, účetní případ, supplier resolved server-side); and hardened i18n locale resolution so a session-fetch failure no longer 500s every page through the root layout's metadata
- Harden and simplify the shadcn upstream audit script (unified fetch/retry with fail-fast 4xx, digest-only asset manifest, explicit registry tracking flag, review command fetches only what it records)
- chore(agents): pin the brain-gate + thermo-review workflows to Opus 4.8 xhigh (two independent lenses); drop Fable 5 as the default advisor model
- Add an in-admin Platform Archetypes reference catalog at `/platform/archetypes` listing the content-panel archetypes and their slot recipes.
- Restore the AI financial agents plan to docs/plans as durable reference for EPIC #485/#487; remaining active plan and public-API launch context migrated to GitHub issues #686/#687/#688 in the Roadmap v1 project.
- Simplify documentation structure, archive obsolete material, and make documentation validation taxonomy-agnostic.
- Share repository agent skills across Claude Code and Codex, and add Codex-native CodeGraph MCP and prompt-hook configuration.
- Reclassify documentation into plans, runbooks, specifications, compliance, and reference material; archive obsolete files; and add automated documentation validation.
- Restructure documentation entry points, define canonical source ownership, and correct stale API, sitemap, archetype, ADR, environment, and link references.
- ci: split environment resume into parallel database and application lanes, remove the setup runner, overlap ECS, API boot, independent sidecar preparation, and migration-journal reads, prevent the bootstrap/runtime OpenFGA metrics-port race, tighten readiness detection without reducing failure tolerance, and gate sleeping-page removal on ECS task health
- infra: keep production continuously available through 2026-07-26 by temporarily deferring the 5h auto-cold-pause TTL; staging remains unchanged and production auto-stop resumes automatically at 2026-07-27 00:00 Europe/Prague

### Removed

- Dropped the unused `sm` size from NativeSelect (only the held-writes MD/Dal picker used it, now default h-9); NativeSelect is single-size

### Fixed

- Replace the false-green shadcn update check with an explicit reviewed upstream baseline and port compatible button, card, sidebar, and spinner fixes without changing Afframe theme tokens.
- fix(api): add a `number` filter to GET /v1/accounts so an agent resolves one account by number (with periodId) without paging the whole period chart — unblocks the posting lane's account number→id lookup (#690)
- fix(brain): posting-lane MCP tool now types the double-entry `entry` (gen-tools emits z.union for OpenAPI anyOf/oneOf instead of z.unknown), so the model can build a valid posting body (#690)
- Documentation link check ignores Markdown links inside code fences and inline code, preventing false positives on illustrative examples.
- PasswordInput generator now forces a lowercase letter, so every generated password satisfies PasswordSchema.mixedCase (previously ~1-in-2500 could be rejected by the app's own rule)
- PhoneInput: explicit country pick no longer reverts to the default for shared dial codes (+44/+1/+39), and the first typed digit is no longer swallowed when it matches the dial code's leading digit
- Combobox popup width matches the input (min-w anchor-width, was 28px wider); debug board Combobox demos use the required items + render-function filtering pattern; normal Combobox shows a clear (X) on selection; CreatableCombobox demo matches the standard input width, drops the debug readout, and gains a disabled variation
- PhoneInput: h-9 height, country selection rewrites the dial code (no more revert), CZ/SK pinned atop a scrollable country list, dial code auto-loads on the first digit typed, and the country defaults to Czechia
- i18n locale resolver no longer crashes page rendering when the auth/session backend is unavailable; it falls back to the cookie/default locale

## [v0.17.7] — 2026-07-11

M2 — "Brain learns + statutory completeness": the booking-template library + model routing (with the §I9 constitution carve-out for a reviewable, human-confirmed template — never an opaque write template, still HELD/gated), the propose-only librarian distillation engine, the #565 evidence-gate floor close, and DPH ř.12/13 §108 residual-self-assessment-on-receipt + RENT place-of-supply routing (new `SECTION_108` jurisdiction, migrations 0055/0056). Every Brain write still HELDs at cold start; nothing auto-applies. Plus the Dependabot auto-merge tooling and a one-shot scheduled deploy.

### Added

- Dependabot auto-merge workflow for safe bump classes (dev-deps patch/minor, pip, Docker digest-only; excludes Actions/prod/majors) via a Dependabot-secret PAT, plus scripts/governance/synthesize-dependency-changelog.mjs for release-cut Dependencies-section synthesis
- **brain**: booking-template library (M2.1, amends §I9) — workspace-scoped, human-confirmed `booking_template` rows keyed on counterparty/direction/supply-kind/jurisdiction; a match still proposes through the unchanged gated write path (never auto-applies, never skips `runGatedWrite`); model routing picks Haiku for a confirmed match and escalates to the default reasoning model for a novel case; the I9 write-template tripwire gains a narrow, exact-match carve-out for the new `BookingTemplateMatch` routing type.
- **brain**: the M2.2 librarian distillation engine (`packages/brain/src/librarian/`) — ingest human corrections of held Brain proposals, cluster by counterparty/direction/supply_kind/jurisdiction, distill a majority-vote candidate rule, gate it against the already-locked `booking_rule_pr_gate` threshold (0.90), and emit a `status: "proposed"` reviewable JSON artifact to a caller-supplied directory — never a default path, never an opaque prod row, never a live gate/floor/constitution change. Fixture-tested only (data-gated on M2.3); the real-corrections adapter and the GitHub PR automation ADR-0027 describes are explicit follow-up.
- **accounting**: DPH přiznání lines ř.12/13 — §108 residual self-assessment on receipt (place of supply CZ, supplier not established in tuzemsku: gas/electricity §7a, §10–§10d special-place services incl. §10d means-of-transport hire, goods with assembly §7(6)), carried by a new `vat_jurisdiction = 'SECTION_108'` marker (migration 0056) that splits ř.12/13 out of the domestic §92 line ř.10/11 and routes §108 receipts to kontrolní hlášení A.2 (not B.1); deductible on ř.43/44, net-neutral (#540)

### Changed

- **brain**: close #565 evidence-gate floor route-arounds (M2.4) — a declared `extractionMethod` can no longer skip the OCR-template screen, and `POST /v1/invoices` now wires the same screen `POST /v1/accounting/documents` uses (tightening-only)
- One-shot scheduled deploy workflow: staging then production from latest main at 10:00 Europe/Prague on 2026-07-11

### Fixed

- **accounting**: RENT place-of-supply routing on the DPH return — renting general movable property from an EU lessor is a §9(1) service (ownership never transfers → not a §16 goods acquisition), so it now lands on ř.5/6, not ř.3/4; also fixed a latent SQL operator-precedence bug in the shared `supportedDapEvidence` predicate whose unparenthesized OR orphaned the trailing rate/deductibility guards (masked while all jurisdiction-distinct-from-EU test data was single-rate) (#540)
- **accounting**: a §92 kód předmětu plnění (`commodityCode`) could sit on a SECTION_108 received partial and leak onto a kontrolní hlášení A.2 row, which has no §92-kód field — tightened the `partial_record_commodity_code_rc_chk` CHECK (migration 0056) to also exclude SECTION_108 and added a capture-boundary guard (#540)
- **brain**: harden the M2.2 librarian distillation engine's promotion preconditions (inert, no real callers yet — corrected before the M2.3 adapter feeds live corrections): (a) extend `CorrectionSignature` with the §92 `commodityCode` and §37a `isAdvance` sub-facts so distinct Czech-VAT sub-cases no longer over-cluster (#643's `BookingSignature` must gain the same sub-facts in lockstep); (b) de-masquerade the eval — `evaluateCandidate` now gates on its own `LIBRARIAN_IN_SAMPLE_CONSISTENCY_MIN` (0.90 in-sample consistency floor) instead of borrowing the held-out `booking_rule_pr_gate` number, which is wired as the real promotion gate in M2.3; (c) `candidateId` now content-addresses the signature **and** the normalized proposed decision, so a drifted re-distillation no longer silently overwrites a superseded proposal; (d) `deriveDecision` now replays a reviewer edit through a faithful per-tool re-statement of `apps/web`'s `applyHeldWriteEdit` (`librarian/replay.ts`) instead of a shallow field-spread, so the treatment the librarian votes on is byte-for-byte the treatment that would book.

## [v0.17.6] — 2026-07-10

Patch release: dependency maintenance (production + dev + infra image + GitHub Actions bumps, all within-major) plus Dependabot workflow hardening (changelog-gate exemption, cooldown/labels/PR-limit config) and an AWS deploy-time reduction.

### Changed

- Exempt Dependabot PRs from the changelog Unreleased gate (author-gated), harden dependabot.yml (cooldown + labels + PR limit on all ecosystems), and document dependency recording at release-cut (#667)
- Reduce AWS deployment time by overlapping cold environment warm-up with image builds, bundling migration transport, stabilizing Budget names, and narrowing helper image contexts.

### Dependencies

- Bump production-dependencies group: 25 within-major updates incl. next 16.2.9->16.2.10, @sentry/{nextjs,node} 10.62->10.63, @aws-sdk/* 3.1063->3.1079, recharts, resend, radix-ui, react-resizable-panels, lucide-react (#665)
- Bump dev-dependencies group: tsx 4.22.4->4.23.0, @cloudflare/workers-types 4->5 (type-only D1Database, non-breaking), @next/eslint-plugin-next, @aws-sdk/client-{ecs,rds,sns}, aws-cdk-lib (#663)
- Bump dev-dependency @playwright/test 1.60.0->1.61.1 (#668)
- Bump postgres base image digests in /infra, /infra/compose/postgres, /infra/compose/pgtap (#657, #658, #659)
- Bump infra-compose-images group: postgres-exporter v0.20.0->v0.20.1, mailpit v1.30.3->v1.30.4 (#661)
- Bump github-actions group: aws-actions/configure-aws-credentials v6.2.1->v6.2.2, github/codeql-action v4.36.3->v4.37.0, step-security/harden-runner v2.19.4->v2.20.0 (#662)

## [v0.17.5] — 2026-07-10

M1 — "Brain thinks": the reasoning lane (classify_accounting_event) + the deterministic write-body wiring that threads the server's treatment onto the capture payload (narrow-only, every special regime still HELD), the MD/D posting preview with exact minor-unit money math, edit-before-approve on the held-write inspector, conversational onboarding discovery + `brain onboard --execute`, the fail-closed markitdown extraction layer, and the §66 export (DPH ř.22) correctness fix.

### Added

- **brain**: edit-before-approve on the held-write approvals inspector (M1.7, A-Z 2.6) — a reviewer can correct the header date, single-partial VAT amounts, and double-entry posting lines before approving, replaying the edited payload through the same gated resolve path.
- **brain**: M1.3 MD/D posting preview on the held-write approvals inspector — reuses the existing předkontace expander (classifyEvent + expandScenarioEntries) as a pure, read-only view over a held write's proposed input, no posting, no persisted read.

### Fixed

- **brain**: exact integer-minor-unit money math in the MD/D held-write preview totals — replaced the float sum + `< 0.005` epsilon balance check with exact numeric(19,4) minor-unit arithmetic (domain rule: never native `number` for money); display output unchanged.
- **brain**: `afframe brain onboard --execute` runs the already-assembled onboarding create calls (create_accounting_period / create_number_series) via the operator's own API client, behind an explicit confirmation gate mirroring `brain book --live` — immediately-applied writes, default stays print-only (M1.4 completion).
- **brain**: onboarding discovery — a pure `discoverBookability` predicate (an OPEN period + DOCUMENT/EVENT number series) plus `afframe brain onboard`, a read-only CLI command that reports whether an organization is bookable and, if not, proposes (never executes) the exact `create_accounting_period`/`create_number_series` calls that would fix it (M1.4 discovery + guided-create slice; the live conversational wizard is follow-up).
- **brain**: wire the reasoning lane (M1.1+M1.2) — `list_accounts`/`get_account` join the book-lane read allowlist, and the login-pack + live kickoff now require the Brain to reason the transaction facts and call `classify_accounting_event` (a pure, ungated decision) before every capture/posting proposal, instead of being handed a pre-decided treatment. Every proposal is still HELD/gated exactly as before — classify never mutates, never bypasses the server gate, and the write body is unchanged in this PR.

### Changed

- Bump markitdown from 0.1.5 to 0.1.6 (#660)
- **brain**: complete the M1.2 write-body wiring — the harness now threads the server's `classify_accounting_event` treatment (vatMode/vatJurisdiction/commodityCode) onto the capture write body deterministically at the launcher's canUseTool updatedInput seam. The model never edits the payload; the merge is NARROW-ONLY (only ever moves a line toward held, never widens an adapter-held OUTSIDE_VAT row into STANDARD) and never touches the amounts; confidence stays out of the model's hands; every special-regime write is still HELD by the untouched `deriveCaptureVeto` (`unverified_vat_regime`).
- **brain**: `brain extract`'s digital-PDF path now runs a best-effort local markitdown text-layer read alongside the vision-OCR pre-pass (M1.5), and every extraction always resolves through a fail-closed `extractionMethod` discriminator (#565) — markitdown, tesseract (deferred), and vision all map to the SAME weakest wire value (`ocr`), by type construction, never a stronger one; the extract→book bridge's existing forced `ocr` stamp is unchanged.

### Fixed

- **accounting**: resolve the decideVat↔catalogue vat_mode conflation for a §66 export of goods to a third country (S-EXPORT now captures EXEMPT, matching the catalogue) and add DPH ř.22 (vývoz zboží), routing it off ř.50 §51 exempt-without-deduction — fixes #566.

## [v0.17.4] — 2026-07-10

Patch release: capture and compute the DPPO annual worksheet inputs, converge every OpenFGA pin to v1.18.1 (app-stack + bootstrap Dockerfile + local compose) with the version-check guard extended to all three, offer Czech in the onboarding profile locale selector, add a retrievable source for the bot `INGEST_SECRET`, and improve the Conductor CodeGraph refresh tooling.

### Added

- **accounting/annual**: capture and persist the provenanced DPPO worksheet inputs (taxpayer category + the six §25/§18a/§19/§34/§35/§38a adjustments) per accounting period via a new `dppo_annual_adjustment` table and an owner/admin edit form on the Corporation tax page, so `buildDppo` computes instead of only reporting NEEDS_INPUT.
- scripts/bot-dev-vars.sh materializes apps/bot/.dev.vars INGEST_SECRET from Vault/SSM, with docs and rotation path (#398)

### Changed

- Developer tooling: make the Conductor CodeGraph refresh target the active workspace under Spotlight, preserve exit status, and close its Run shell automatically.
- Bump OpenFGA image pin to v1.18.1 in the CDK app-stack (#564)
- Converge OpenFGA bootstrap Dockerfile + local compose pins to v1.18.1 and extend the version-check guard to all three pin files (#533)
- Onboarding profile locale selector now offers Czech, sourced from the @workspace/i18n registry (#532)

### Fixed

- **brain**: `afframe brain onboard --execute` now exits non-zero when a NON-TTY run auto-refuses the confirmation with onboarding work still pending, so automation can distinguish "refused, nothing created" from the already-bookable no-op. An interactive decline stays exit 0.

## [v0.17.3] — 2026-07-10

Patch release: statutory-closing correctness remediation (#625). Correct statutory filing periods and Czech legal dates, separate schedules from actual obligations, derive VAT/KH/SH and payroll obligations from captured evidence, make DPPO/DPFO/year-end outputs truthful (unknown inputs stay explicit instead of fabricated zero/false), and enforce canonical workspace configuration. Plus follow-up cleanup: correct the pre-2024 DPPO rate citation, drop stale test scaffolding, and document the migration 0051 pre-deploy data check.

### Changed

- **accounting/annual**: resolve DPPO rates from the taxable period and explicit taxpayer category, preserve missing advisor inputs as blocking instead of zero, label DPFO and year-end outputs as incomplete worksheets, and include proven prior-period comparisons when available.
- **accounting/closing**: resolve VAT and payroll profiles as effective-dated timelines, preserve missing intervals as configuration issues, separate schedule applicability from filing status, and stop labelling past dates as overdue without filing evidence.
- **workspace/settings**: label the scoped board as periodic obligations, render default number-series descriptions from the canonical catalogue, and enforce responsible-assignee workspace membership in PostgreSQL.

### Fixed

- **accounting**: correct the pre-2024 DPPO rate legal citation (§21 ZDP, not the 2024 konsolidační balíček), remove stale obligation-test scaffolding, and document the migration 0051 pre-deploy data check.
- **accounting/statutory**: preserve unknown legal and payroll facts, resolve VAT obligations from shared effective-dated evidence, require statutory filing-period API ranges, expose guarded invoice legal-date corrections, and serialize responsible-member changes without assignment races.
- **accounting/closing**: derive KH and SH obligations from captured VAT evidence, preserve quarterly service-only SH and the goods-triggered monthly cadence, keep identified-person schedules event-driven and separate from payer worksheets, single-source VAT classification predicates, and label DAP/KH/SH outputs as partial worksheets with blocking evidence gaps.
- **accounting/payroll**: replace the `has_employees` shortcut with effective-dated relationship, insurance-participation, payroll-tax-advance, and special-rate-withholding facts; keep legacy rows visibly unconfigured; and resolve each remittance through dated, source-backed threshold and deadline rules.
- **accounting/vat**: model statutory VAT periods independently from accounting periods, preserve Czech legal dates, and report incomplete VAT evidence instead of asserting unsupported deductions.

## [v0.17.2] — 2026-07-10

Patch release: Afframe Brain M0 — the test-phase enabler set. Raised pre-launch admission caps + env-configurable throttler, one-paste env-collapse (only `BRAIN_API_KEY`), a real held-write review UI, onboarding create-period / number-series / list-periods tools (fixes #579), a bulk `brain book-batch` orchestrator, code guards for every safety invariant (including the I8 confident-wrong circuit-breaker), gate-integrity + stale-held alerts, and a fail-closed login-pack constitution assembler. Additive and gated: every accounting write is still HELD at cold start.

### Added

- **brain**: automated code guards + tests for the Brain safety invariants I3 (no tenancy fields in any API request schema + full public-op allowlist), I4 (append-only ledger DELETE rejection), I7 (human-actor-required guard), I9 (no write-templates tripwire, scanning code not comments), and I10 (provenance atomicity).
- **brain/api**: onboarding tools — `POST /v1/accounting/number-series`, `POST /v1/accounting/periods`, `GET /v1/accounting/periods` (with SDK + MCP tools). `create-period` reuses the coupled scaffold so a period is always minted with its chart of accounts + default number series (fixes #579 under-provisioning) and rejects overlapping periods with a 409 to prevent double-booking on retry.
- **brain**: the held-write review surface now renders a real reviewable view for each Brain proposal — document header (counterparty, date, total), per-rate VAT summary, human-readable why-held reasons in Czech, and the rationale, grouped by účetní případ — instead of a raw JSON dump.
- **brain**: the Brain live-session login pack now assembles its safety-spine constitution section byte-verbatim from the locked `.brain/constitution.md` (the operator no longer hand-copies the 13KB locked file, removing a drift/truncation risk) and fail-closes — it throws rather than boot a session with any missing or empty safety section. The three sections with no canonical committed source stay operator-supplied (auto-authoring safety text is deliberately refused).
- **brain**: observability alerts for the Brain write gate — a CRITICAL alert (deduped GitHub issue + Telegram) fires if a fresh accounting write ever auto-applies (HTTP 201) at the cold-start posture (structurally impossible today — a broken-gate alarm), and a stale-held-review-queue warning reports held writes older than a configurable threshold, wired to an opt-in recurring scheduler (`ACCOUNTING_STALE_HELD_ALERT_ENABLED`, dormant by default). Both route through `@workspace/notify` and are fully fail-swallowed; the gate hook is purely observational (returns the decision unchanged).
- **brain**: bulk document booking — a new `brain book-batch <folder>` command runs many documents through the held write loop with bounded concurrency, rate-limit retry/backoff, and crash-safe checkpoint/resume keyed on a deterministic (clock-free) per-document idempotency key that threads to the server `Idempotency-Key` so a killed-and-resumed run never double-books. Non-applied outcomes are classified (rate-limited → retried; hard error / no review handle → failed and re-attempted) so a document is never silently recorded as held.
- **brain**: confident-wrong circuit-breaker (constitution invariant I8) is now real in code — a persisted, workspace-scoped `brain_confident_wrong` counter (FORCE RLS) plus a fail-closed startup halt in the write gate that refuses autonomous writes once a human marks a previously auto-applied booking confidently wrong, until an operator investigates and clears it. Tightening-only and dormant at cold start (green is unreachable, so nothing is auto-applied and the count stays 0); the increment is a human-only review action and the reset is operator-only.

### Changed

- **ci**: add `brain` to the allowed `pr-title` conventional-commit scopes so Afframe Brain PRs pass `conv-title` with a `feat(brain):`-style scope.
- **brain/api**: raise pre-launch throughput — admission caps 32/8 → 64/16 wired into the ECS task-def, and the `/v1` throttler is now env-configurable (`V1_THROTTLE_LIMIT` default raised 100 → 300). Throughput only: every write is still HELD (the caps are a pure concurrency limiter, orthogonal to the auto-apply gate). Single-task caps today (#472).
- **brain**: the Brain CLI now runs with only `BRAIN_API_KEY` set — `BRAIN_MCP_ENDPOINT` defaults to the production API base and the auth mode to `ambient`; the redundant client-side `BRAIN_RUNTIME_ACTIVE`/`BRAIN_LIVE` pre-gate is removed (the server admission lane is the sole authority and every write is still HELD), and a lane-off / rate-limited run prints a clean sentence instead of a raw 429 dump.

### Fixed

- **mcp**: the MCP tool codegen (`gen-tools.ts`) silently dropped JSON-Schema `format`, so `conversationId` and other UUID fields never received `.uuid()` in the generated tools; now emit `.uuid()` for `format: "uuid"` so generated tools match the API contract. (#577)

### Docs

- **brain**: document the two distinct write-gate thresholds (client confidence vs server cold-start green) and a file map of where each Brain concern lives, and add a `⚠ SAFETY SPINE` banner to the gate / evidence-gate / sandbox source files.
- **brain**: mark ADRs 0025–0029 Accepted, rewrite the stale `packages/brain/README.md` to the accurate client-not-server design, and drop the phantom `--live` flag from `brain book` help.

## [v0.17.1] — 2026-07-09

Patch release: CI/CD signal and bot-deploy fixes only. No product or runtime change.

### Changed

- **ci**: reduce workflow drift and noise — sync the shared setup action pins, derive Dockerfile `turbo prune` from the root `turbo` dependency, make mature DB advisory checks fail visibly, trim impossible container-scan path filters, and stop PR workflow completions from spawning skipped `notify-ci` runs.

### Fixed

- **ci/bot**: let deploy-bot use the pnpm-installed wrangler instead of a stale wrangler-action version pin, avoiding npm workspace protocol failures during Worker deploys.

## [v0.17.0] — 2026-07-09

Minor release: period-mechanism completion (PR1–PR4) — real accounting-period data wires through the full closing cycle (VAT, payroll, income tax, year-end statements, obligation calendar), real Settings surfaces (number series, tax profile), and real workspace Companies + Legislation operational data. Adds the GitHub Issues tracker migration (replacing the retired Linear integration), CodeGraph developer tooling repo-wide, and numerous CI, governance, and dependency updates.

### Added

- **workspace**: replace mock operational data on the Companies + Legislation surfaces with real data — a workspace-scoped statutory obligation engine (`computeWorkspaceObligations`) drives each company's next-deadline card field and the Legislation board; VAT regime and onboarding/active/archived status are now derived from `vat_status`/`accounting_period`; a new `organization.responsible_user_id` column + owner/admin-gated assignment action wires a real accountant assignee picker onto the company card and inspector. (#612)
- **closing**: time-versioned `organization_tax_profile` table (has_employees) wired into the statutory obligation engine so payroll obligations become real, plus a Settings > Tax profile capture page and a real Payroll landing (period-mechanism PR3d). (#609)
- **closing**: real Closing income-tax pages (DPPO / DPFO, gated on person type + book regime) and year-end financial-statements page, computed from the existing annual output builders over the active accounting period. (#605)
- **closing**: filing-period-aware VAT output builders (přiznání k DPH / KH / SH scoped to a filing month or quarter by the DUZP, `accounting_event.occurred_at`) and real Closing VAT pages (return / control statement / EC sales list) computing each selected filing period's figures. (#601)
- **closing**: statutory obligation + deadline engine (monthly/quarterly VAT return / KH / SH / payroll, business-day-shifted per the Czech holiday calendar) and real Closing Overview + Calendar computed from the active accounting period. (#598)
- **web/accounting**: organization page data now carries the active accounting period through the server data path, replacing the remaining mock-period assumptions in that flow. (#593)
- **web/settings**: Settings > Number series now uses the real number-series surface and includes the restore-defaults backfill for the accounting-period mechanism. (#594)

### Changed

- Refresh root maintenance files: set the real Code of Conduct enforcement contact, document the as-built AWS security posture in SECURITY.md, and harden .dockerignore to keep secrets and local tool dirs (.env, keys, .claude/, .codegraph/) out of the Docker build context.
- Developer tooling: CodeGraph now ships a versioned Claude Code UserPromptSubmit hook (repo-wide per-prompt context injection), exposes the full MCP tool set (explore/node/search/status), tunes parse workers + daemon idle timeout, and makes the Conductor workspace index build best-effort so it never blocks workspace creation.
- Developer tooling: make CodeGraph repo-local via pnpm, add Conductor workspace setup plus agent startup scripts/runbook, and remove leftover graph-index placeholders.
- **release/changelog**: correct historical entries — drop the stale note claiming the v0.2.1 tag still exists on the remote (it was deleted) and strip the stray emoji from the v0.3.1 HITL fix entry. (#604)
- **release/changelog**: fold the unpublished `v0.16.11` draft release notes back into Unreleased because `v0.16.10` remains the latest published GitHub release.
- **governance**: replace the retired tracker integration with GitHub Issues. Bot-created issues now use GitHub issues and repo labels, with optional ProjectV2 field writes and optional parent Epic attachment supplied by deploy config instead of source-level Roadmap constants. Scheduled health scans and heartbeat checks report in Telegram without creating issues. PR backlink sync resolves GitHub issue links from PR metadata and explicit issue references instead of branch names; docs, runbooks, generated API contracts, and workflow comments no longer reference the old tracker.
- **governance**: require every non-release PR to add an Unreleased changelog entry, with CI and local hooks preserving existing entries so parallel agents append instead of overwriting.
- **ci**: the `_deploy-aws.yml` `brain_runtime_active` input now defaults to `1` for the pre-launch period, so a deploy that omits it keeps the `/v1/accounting` write admission lane ON instead of silently killing it (v0.16.9 omitted it and every write 429'd). This does not enable auto-apply: the cold-start `extraction_failed` floor still HELDs every write. Revert the default to explicit at launch (ADR-0028). (#584)

### Fixed

- **bot/issues**: harden the GitHub-issues tracker migration — reset the Linear-era D1 dedup/snooze cache on deploy (a surviving row would comment a recurrence into a dead 404 and never open a GitHub issue), re-file a fresh issue when a comment POST fails or the stored id isn't a GitHub number, honor `addComment`'s result instead of ignoring it, validate the ProjectV2 field config at the boundary (a partial config no longer TypeErrors + 500s `/issue`) with a fail-fast deploy check, drop the duplicate Telegram ping per feedback, and de-duplicate the governance scripts (no self-`spawnSync`) + the bot's two GitHub transports. (#603)
- **ci**: deploy diff checks now handle changed or missing CDK input files correctly under `pipefail`, so the guard fails for real drift instead of exiting early from expected no-match cases. (#595)
- **github**: remove the unsupported Code Quality branch-ruleset threshold while keeping CodeQL code scanning required, and document the live required-check set. (#597)

### Docs

- **brain**: weave Afframe Brain into the platform docs so it is no longer orphaned — `README.md` + `ARCHITECTURE.md` gain the `brain` package, the `apps/mcp`/`apps/cli` Brain role, and a Brain subsystem section; `docs/START-HERE.md`, `docs/README.md`, and `AGENTS.md` link the Brain docs; the stale `packages/brain/README.md` + `ARCHITECTURE.md` (which described the dropped in-process/worker design) get staleness banners. Adds `docs/AFFRAME-BRAIN-STATUS.md`, a tracked v1 status/roadmap tracker (M1–M4 done/outstanding, the engineering-done boundary, what's deferred to v2, and the open GitHub issues that gate each piece). Registers the two missing material ICT assets in the DORA register (`docs/INVENTORY.md`): the Anthropic Claude API and the Brain local operator client. Verified by two independent top-tier advisor passes. (#589)
- **brain**: add the per-key throttler `429` failure mode to the Brain troubleshooting playbook, including the operator symptom and remediation path. (#591)

### Dependencies

- **deps-dev**: dev-dependencies group bump (10 updates: `prettier` 3.8→3.9, `turbo` 2.9→2.10, `shadcn`, `knip`, and others), lockfile deduped. (#587)
- **deps**: bump AWS CDK to `2.1129.0` and refresh the lockfile. (#596)

## [v0.16.10] — 2026-07-08

Patch release: Afframe Brain documentation + an operator-env fix. Two A-Z docs (a one-page index and a debug-level technical reference verified against the current code with `file:line` citations throughout), plus a default so a fresh Brain session uses the operator's Claude Code login instead of demanding an Anthropic token. No product or runtime change; the Brain write lane stays HELD.

### Docs

- **brain**: `docs/AFFRAME-BRAIN.md` — a single A-to-Z landing doc: what Brain is, the client-not-server architecture, the constitution safety spine, the server write gate + confidence model, learning, the M1–M4 roadmap with current status, an operator quickstart, and a doc map. (#583)
- **brain**: `docs/AFFRAME-BRAIN-TECHNICAL.md` — a debug-level technical reference for a fresh engineer/agent: an end-to-end capture trace, the transport/CLI/sandbox, auth/tenancy/endpoints, the write gate (step order, three-way AND, cold-start floor, every HTTP status, admission caps, shadow score), the confidence model, the data model + migrations + composite-FK isolation, learning/OCR/constitution, a symptom→cause→file troubleshooting playbook, and a real-vs-aspirational ledger. Corrects the stale pre-reframe `packages/brain/README.md` and the schema-comment migration numbering. Linked from the index. (#585)

### Changed

- **cli/docs**: `BRAIN_AGENT_SDK_AUTH` defaults to `ambient` in the operator env template — on the operator's own Mac the nested Claude subprocess authenticates via the machine's Claude Code login (no Anthropic token required); `buildBrainSessionEnv` only force-feeds `ANTHROPIC_API_KEY` for an `sk-`-prefixed value. The M2 bootstrap prompt now reuses an existing filled `mlive.local.sh` instead of demanding credentials. (#582)

## [v0.16.9] — 2026-07-07

Patch release: dependency maintenance sweep plus the local stdio MCP bridge that lets the live Brain loop connect. Cut as a patch by explicit decision even though it bundles a `feat` subject (#575). No user-facing product change; the Brain write lane stays HELD.

### Added

- **cli**: a local stdio MCP bridge so the live Brain loop can connect (v1) — the `afframe` CLI exposes the Brain MCP surface over a local stdio transport, unblocking the local-Claude-Code write loop against a running server. (#575)

### Changed

- **deps**: production-dependencies group bump (16 updates: `@sentry/node`+`@sentry/nextjs` 10.60→10.62, `lucide-react`, `resend`, `pdfjs-dist`, `recharts`, `react-resizable-panels`, `motion`, and others — all minor/patch), with the lockfile deduped. (#562)
- **deps-dev**: dev-dependencies group bump (11 updates: `@types/node` 25→26, `turbo` 2.9→2.10, `prettier` 3.8→3.9, `@playwright/test` 1.60→1.61, `knip`, `shadcn`, `wrangler`, and others), with the lockfile deduped. (#560)
- **deps**: GitHub Actions group bump (11 updates: `actions/checkout` 6→7, `docker/setup-qemu-action`, `docker/setup-buildx-action`, `docker/login-action`, and others). (#559)
- **deps**: `prometheuscommunity/postgres-exporter` `v0.19.1`→`v0.20.0` in the infra dev-compose stack. (#558)
- **deps**: `ubuntu` devcontainer base image digest bump. (#557)

### Docs

- **brain**: operator session runbook (W1.6) documenting how a live Brain session pushes a real org's docs through the HELD write loop. (#574)
- **brain**: `conversationId` must be a UUID — corrected in the Brain operator runbook + M2 prompt. (#576)

## [v0.16.8] — 2026-07-06

Patch release: Afframe Brain **M1 operator onramp + write-path instrumentation** — a server-verifiable extraction-method OCR fail-closed leg, the extract→book PDF bridge, and shadow-score calibration instrumentation — plus a statutory reverse-charge / issued-EU DPH fix. The Brain write lane stays HELD at cold start; nothing auto-applies. Gated through adversarial `brain-gate` + thermo-nuclear reviews, and (for the accounting fix) two independent statutory-VAT advisors.

### Fixed

- **accounting**: an ISSUED intra-EU supply was misrouted onto the domestic §92 reverse-charge DPH rows (ř.25 + KH A.1) instead of the intra-community lines (ř.20 goods §64 / ř.21 services §9/1), and was unreachable end-to-end because the předkontace catalogue welded the scenario to `EXEMPT` while `decideVat` emits `REVERSE_CHARGE` (the posting expander threw on the mismatch). Normalizes issued-EU to `REVERSE_CHARGE + vat_jurisdiction='EU'`, adds ř.20/21, single-sources one predicate shared by the DPH rows and the souhrnné hlášení so they cannot diverge, and rejects an `EXEMPT`+EU issued capture at the capture boundary. Export (§66 vývoz) sibling + place-of-supply ř.12/13 tracked as #566 / #540. (#567)
- **api**: a user-bound agent key that omitted `conversationId` returned a 500; it now returns a clean 422 at the write boundary. (#568)
- **cli**: `brain run --inputs` broke on bigint money fields; a `_minor`-keyed reviver reconstructs them per the Money-as-string wire convention (fails loud past 2^53). (#568)

### Added

- **api**: server-verifiable `extraction_method` on the capture contract + a server-derived OCR fail-closed leg — an `ocr` capture with no confirmed template basis (templateId absent or unresolvable under RLS) is forced HELD, closing the omitted/foreign-`templateId` novelty bypass (#554). Add-only, agent-key-scoped, merged with the existing novelty veto into one `screenTemplateBasis`. The lying-`structured`-label + unscreened `/v1/invoices` route-arounds are tracked as floor-lift preconditions in #565. (#568)
- **cli**: `brain book <pdf|image> --extracted <ir.json>` — the extract→book bridge routes an OCR-extracted invoice into a live capture (`extraction_method: "ocr"`, carries the matched `templateId`); the structured folder path now honestly stamps `"structured"`. Deliberately no auto-parse of the untrusted extract free-text into a booking (one-command chain tracked #570). (#571)
- **api**: shadow-score instrumentation — each agent write persists a `serverGate.shadow` (audit-only, never enforces) for M3 calibration: a server-derivable `serverLane`, a client `claimLane` (diagnostic), and a per-write `claimAudit`. The enforced score + three-way AND are byte-identical; a hardened two-leg AST boundary test forbids any production read of `.shadow` (gate included) or wiring it into `autoApply`. Calibration-safety guards tracked #569. (#572)

## [v0.16.7] — 2026-07-06

Patch release: wire the dead "Add company" buttons, and add an operator input to enable the Brain write lane per-env at deploy time.

### Fixed

- **web**: the three "Add company" buttons (companies table toolbar, cards toolbar, and cards empty-state) toasted "coming soon" instead of opening the create-org wizard, even though the wizard (`/workspace/organizations/new`) is fully wired. They now link to it, matching the header "New company" button. Also wired the org-header "Contact us" item to `mailto:` support. (#563)

### Changed

- **ci**: `_deploy-aws.yml` gains an optional `brain_runtime_active` input, passed through to CDK as `-c brainRuntimeActive=<value>` (ADR-0028). Empty leaves the fail-closed default (OFF); an explicit `1` enables the `/v1/accounting` write admission lane on the target env. This is the documented, no-code-change way to turn the Brain write lane on per-env (writes still stay HELD at cold start). (#563)

## [v0.16.6] — 2026-07-06

Patch release: fix the create-organization wizard being unscrollable on short viewports.

### Fixed

- **web**: the "Organization details" wizard (`/workspace/organizations/new`) is now scrollable. The app-shell main body is `overflow-hidden` by design (each page owns its inner scroll), but the wizard page rendered plain flow content with no scroll region, so on a short viewport the lower fields + the submit button were clipped with no scrollbar — the form could not be completed. Wrapped the wizard in an `h-full overflow-y-auto` region. (#561)

## [v0.16.5] — 2026-07-05

Patch release: the Afframe Brain **B1.5** pre-launch readiness bundle — OCR templates, a server-derived novelty veto, operator ergonomics, and the bank-statement booking adapter. The Brain write lane still ships **OFF** (`BRAIN_RUNTIME_ACTIVE` fail-closed) and every agent write stays HELD — nothing user-facing changes. Cut as a patch by explicit decision even though the change carries a `feat` subject. Gated through three independent adversarial safety reviews (Fable 5 high + Opus 4.8 xhigh — GO/GO/GO, no confident-wrong path, safety spine byte-unchanged) and a thermo-nuclear code-quality review.

### Added

- **api**: `/v1/ocr-templates` — the workspace OCR-template library (migration 0047 `ocr_extraction_template`, workspace-scoped FORCE RLS mirroring `counterparty`). `GET` (agent + human read), `POST` propose-unconfirmed, `PUT` refine (resets `human_confirmed_at`, bumps version), and the human-only `POST :id/confirm` (`@RequireHumanActor()` + `accounting:write` — an agent key is denied the trust boundary). A new server-derived **`novel_template` Tier-3 veto**: an agent capture keyed to an _unconfirmed_ template is forced HELD (the signal is injected in-tx server-side, so a client can neither forge nor omit it, and it is add-only in the write gate's three-way AND). `templateId` rides the capture contract as **audit-only** — persisted into the `serverGate` record and stripped before the domain mutation on both the capture and held-write replay paths. ADR-0029 records that Brain learned state is workspace-scoped. (#555, #518)
- **cli**: `afframe brain extract <path>` — a LOCAL vision-OCR pre-pass that turns a PDF/image into an IR Invoice + field-level provenance + a layout fingerprint, and may propose an _unconfirmed_ template. The file is fed to the model as an image/document **content block** (never via a `Read` tool); `allowedBuiltinTools` is empty and the MCP allowlist is the ocr-template read + propose pair ONLY, so a hostile document cannot steer a filesystem read or a book. `afframe brain book <folder>` walks a folder of structured exports into per-record capture plans for operator inspection before a live run. (#555, #469)
- **admin**: an "Issue Brain agent key" action that hardcodes `actor_kind='agent'` (closing the self-approval lane — a mis-minted `human` key could otherwise cross-approve its own held writes), gated on the `admin:api_key.create` capability (owner + admin) with a password step-up; the audit log records the key id + name, never the secret. (#555)

### Changed

- **intake**: a `bankToCapture` adapter books a bank statement line as an OUTSIDE_VAT partial using its already-signed `amount_minor` verbatim (no double-negate, no fabricated VAT); GL entries stay non-bookable (import/reconcile-only). The held-write reject surface now un-confirms the source OCR template on both the web and API resolve paths (shared `unconfirmTemplateOnReject`), and the held-writes review UI surfaces the OCR-template provenance badge. (#555)

## [v0.16.4] — 2026-07-05

Patch release: the Czech **Kontrolní hlášení** A.1/B.1 now emits the §92 "kód předmětu plnění" (domestic reverse-charge commodity code). Accounting-domain only; the Brain write lane still ships **OFF** (`BRAIN_RUNTIME_ACTIVE` fail-closed) and every agent write stays HELD — nothing user-facing changes. Cut as a patch by explicit decision even though the change carries a `feat` subject.

### Added

- **accounting**: §92 kód předmětu plnění on kontrolní hlášení A.1 (dodavatel) / B.1 (odběratel). A new nullable `partial_record.commodity_code` (migration 0046 — codes `1` zlato §92b / `3` nemovitost §92d / `4` stavební-montážní §92e / `5` příloha 5 §92c) is threaded through the capture contract + the `classifyEvent` decision layer and emitted as `KhRow.kod`; a doklad mixing §92 commodities splits into a row per kód. Two DB CHECKs make an invalid state unrepresentable — an out-of-domain code, or a §92 kód on any line that is not a domestic reverse charge (`vat_mode = REVERSE_CHARGE AND vat_jurisdiction IS DISTINCT FROM 'EU'`) — so the emitter needs no read-side masking. Distinct from `supply_kind` (the souhrnné-hlášení kód 0/3). Gated through an adversarial safety review (Fable 5 high + Opus 4.8 xhigh — GO, no confident-wrong path, safety spine untouched) and a thermo-nuclear code-quality review (invalid state made unrepresentable, emitter simplified). (#516, #551)

## [v0.16.3] — 2026-07-05

Patch release: internal Brain-launcher tooling + a dead-code sweep. The Brain write lane still ships **OFF** (`BRAIN_RUNTIME_ACTIVE` fail-closed) and nothing user-facing changes — cut as a patch by explicit decision even though one change carries a `feat` subject.

### Added

- **brain**: the SDK-backed `AgentSessionLauncher` lands in `apps/cli` (`private: true`) — the sole `@anthropic-ai/claude-agent-sdk` import in the repo. It wires the deploy-gated live-session seam behind `afframe brain run --inputs <file>` (`--dry-run` inspects the plan with no creds; the live path stays fail-closed on the env + `BRAIN_RUNTIME_ACTIVE=1` kill-switch). Pure config assembly + capture-result parsing live in `session-config.ts` (unit-tested); the `query()` body is the only untested-live surface, marked as such. Gated through two independent adversarial safety reviews (Fable 5 high + Opus 4.8 xhigh) — no confident-wrong path, safety spine byte-unchanged. (#469, #549)

### Changed

- **chore**: dead-code cleanup pass across the repo, and `knip` flipped from advisory to a **blocking required check** so unused exports/files fail CI going forward. (#548)

## [v0.16.2] — 2026-07-05

Patch release: version the agent safety + code-quality gates in the repo (tooling only; no product/app change).

### Changed

- **governance**: the Brain safety gate (`.claude/workflows/brain-gate.js` — two independent top-tier reviewers, Fable 5 high + Opus 4.8 xhigh, that adversarially hunt confident-wrong paths + safety-invariant violations, then synthesize a ruling) and the thermo-nuclear code-quality gate (`.claude/workflows/thermo-review.js` + the `.claude/skills/thermo-nuclear-code-quality-review/` methodology) are now tracked in the repo instead of workspace-local + gitignored, so every clone/worktree has them. `.gitignore` surgically un-ignores only those two workflow scripts (everything else under `.claude/workflows/` stays local scratch); `packages/brain/CLAUDE.md` points every Brain agent at the mandatory gate. (#546)

## [v0.16.1] — 2026-07-05

Patch release: fix the release pipeline for GitHub immutable releases.

### Fixed

- **ci**: `release.yml` now creates the GitHub Release as a **draft**, lets the `build` (tarball), `slsa-provenance` (SLSA L3) and `supply-chain` (SBOM + cosign) jobs attach their assets to the mutable draft, and a new `publish-release` job flips it live only once every upload has landed. With release immutability enabled (a repo/org setting that flipped in around v0.14.0), the previous create-then-upload flow published the release immediately and every asset upload failed `HTTP 422: Cannot upload assets to an immutable release` — v0.14.0 through v0.16.0 shipped with zero assets. The SLSA generator now targets the draft via `draft-release: true` (without it its softprops step 404s the tag and forks a duplicate release). The five already-published empty releases are immutable and cannot be back-filled; this fixes it forward.

## [v0.16.0] — 2026-07-05

Minor release: the Afframe Brain v1 launch **backstops** — the security + correctness guarantees that must be in place before the write lane is ever turned on. The write lane still ships **OFF** (`BRAIN_RUNTIME_ACTIVE` fail-closed); nothing user-facing changes. Every change was gated through a 2× independent adversarial safety review (Fable 5 high + Opus 4.8 xhigh) and a Fable-5-high thermo-nuclear code-quality review — no confident-wrong path, safety spine untouched.

### Added

- **api**: server-side **agent-key capability** (`api_key.actor_kind`, migration 0045, default `human`). An `agent`-actor API key (an autonomous Brain client) may propose gated writes but is denied the entire held-write review surface — both `GET /v1/accounting/held-writes` and `POST …/held-writes/:id/resolve` — via a class-level `@RequireHumanActor()` guard, so a leaked or second agent key can never list or cross-approve the queue. The audit stamp (`tool_call_log.actor_kind`) derives from the tamper-proof key capability, not the spoofable `conversationId`. (#517)
- **api**: the auto-apply write gate's injectable admission/scoring seams moved to a TEST-ONLY `runGatedWriteWithSeams`; production `runGatedWrite` takes exactly one argument, so overriding the fail-closed server-score leg of the three-way AND is now a **compile error** (with a TS-AST boundary test as belt-and-braces). (#519)

### Changed

- **intake**: the live-CC harness (`runLiveBrainSession`) is wired through an injectable `AgentSessionLauncher` seam — fail-closed on env + the `BRAIN_RUNTIME_ACTIVE=1` kill-switch before the launcher is consulted, with zero Agent-SDK dependency in `@workspace/intake`. The SDK-backed launcher + first live run stay deploy-gated (#469, M-live). (#543)

### Fixed

- **accounting**: an EU-marked issued reverse-charge supply (§9/1 service reverse-charged to the EU customer) no longer leaks onto Kontrolní hlášení A.1 — it belongs on Souhrnné hlášení only. KH A.1 + the DPH `a1_base`/`r25_base` checksums now filter domestic §92 PDP (`vat_jurisdiction IS DISTINCT FROM 'EU'`); the unfiltered mode that caused the leak was deleted from the type. (#516)

## [v0.15.0] — 2026-07-05

Minor release: the first public accounting **API surface** (`/v1/accounts`, `/v1/invoices`), Czech localization going live, and the accounting-period switcher wired to real data.

### Added

- **api**: `GET/POST /v1/invoices` — invoice CRUD over the posting model. Captures invoice-typed doklady (received → RECEIVED_INVOICE, issued → ISSUED_INVOICE) with their line/partial money decomposition; organization-scoped (FORCE RLS); runs through the server safety gate (201 apply / 202 hold), tenant + responsible user injected from the API-key principal, never the body. (#534)
- **api**: `GET /v1/accounts` + admin edit — chart-of-accounts (účtový rozvrh) read, organization-scoped; the chart exists only for DOUBLE_ENTRY periods. (#529)
- **web**: the app-shell accounting-period switcher wired to real `accounting_period` data — org-scoped read (newest-first, open/closed lock state), selection persisted server-side in the httpOnly `afframe_period` cookie. Replaces the mock. (#528)
- **i18n**: the **Czech locale** promoted live (`cs.json`, full `en.json` parity including the createOrg onboarding surface with statutory accounting terminology); the footer locale picker (web + admin) now offers CZ. (#531)
- **db**: pgTap RLS coverage for every FORCE-RLS table plus a shared vitest `globalSetup` factory across `@workspace/testcontainers`. (#542)

### Changed

- **accounting**: EU services received are split into DPH rows 5/6 (correct kód plnění per the reverse-charge rules) instead of collapsing into one row. (#539)

### Fixed

- **auth**: the invite duplicate-email race is closed with a partial unique index on the pending-invite token (migration 0044). (#530)

## [v0.14.2] — 2026-07-05

Patch release: dependency + documentation updates.

### Changed

- **deps**: openfga image pin `v1.17.1` → `v1.18.0` (constant-time preshared-key auth). The MySQL case-sensitivity CVEs + migration-008 lock window and the OIDC-audience enforcement do not apply here — the datastore is Postgres and the sidecar runs no OIDC authn. (#523)
- **deps**: every workspace `eslint` specifier aligned to the pinned `^9.39.2` override (they advertised `^10.4.1`, which the override already overrode). Zero lockfile change; eslint still resolves to `v9.39.4`. (#521)
- **docs**: the AI financial-agents plan rewritten from the stale BullMQ substrate to the shipped pg-boss lanes (ADR-0017); no BullMQ mention remains. (#522)

## [v0.14.1] — 2026-07-05

Patch release: CI + repo-tooling housekeeping.

### Changed

- **ci**: monthly tool-version pin refresh behind upstream drift (pnpm `packageManager`, CI tool binaries). (#526)
- **ci**: knip config hardened + a dead admin barrel export removed. (#525)
- **docs**: the `v0.14.0` changelog recorded (committed after the tag). (#538)

## [v0.14.0] — 2026-07-04

Minor release: **Afframe Brain v1** — the unprivileged Brain client on top of the v0.13.0 foundation, plus the server-side gate that closes the confident-wrong hole for good. The write lane still ships **OFF** (`BRAIN_RUNTIME_ACTIVE` fail-closed); nothing user-facing changes until Brain launch. Every agent write is HELD at cold start — the live end-to-end run and the launch milestones (M-live → M2 → M3 → M4 → flip) remain ahead, tracked in EPIC #524.

### Added

- **api**: the **server-side evidence gate** — ends client-scalar-only auto-apply trust. Auto-apply now requires a three-way AND (client confidence ≥ threshold **AND** the independent server veto not held **AND** a server-side evidence score green). The client's self-reported `signals` are never consumed directly: every non-server-verifiable field degrades to its worst value and a structural `extraction_failed` block forces the score sub-green, so green is **unreachable at cold start** regardless of any fitted calibration → all writes HELD. Held-write resolve enforces author ≠ approver. (#520)
- **brain / intake**: the unprivileged Brain client — a pure IR→capture adapter (rate-less / non-positive / NaN rows → `OUTSIDE_VAT` hold; money via string math, never `BigInt(Number())`), a per-tool MCP sandbox bound to the real accounting tools (DENY `resolve`/`list`-held: self-approval + injection surface), a post-calibration hard-class confidence ceiling (a fitted map cannot lift a capped class above green), isotonic calibration-refit machinery for M3 (≥10-run guard; not wired to the live path), and an honest creds-gated live-CC harness scaffold (never faked). (#520)
- **accounting / db**: persist `supply_kind` (migration 0043, additive-nullable) so the Souhrnné hlášení emits the correct kód plnění (0 = goods §64, 3 = services §9/1) instead of hardcoding 0. (#520)
- **web**: a read-only ingestion inbox — a Table archetype over `tool_call_log` surfacing the org's gated writes alongside the approvals queue (upload/OCR/extraction pipeline deferred to #518). (#520)

### Changed

- **brain**: the LOCKED `.brain/constitution.md` re-derived to the v1 **server-side HTTP boundary** (Hleb-ratified) — I1 (server-side `withOrganization` from the API-key principal), I4 (rollback unit = `tool_call_log` row + `conversation_id`; no per-row `brain_run_id` column), I5 (17 mutable / 6 append-only tables, three-way AND primary), I6 (held-write queue), I3/I10 + enforcement-map. (#520)

## [v0.13.0] — 2026-07-04

Minor release: the Afframe Brain v1 **foundation** — the server-side safety spine that lets an unprivileged agent book accounting without ever auto-applying a wrong entry unreviewed. The v1 accounting write lane ships **OFF by default** (`BRAIN_RUNTIME_ACTIVE` fail-closed), so nothing user-facing changes until Brain launch. This is the foundation layer only; the actual Brain client + first end-to-end run (M1) and the milestones beyond remain ahead.

### Added

- **api**: server-side confidence veto on the accounting write gate — a client's claimed `confidence` is now necessary but not sufficient. The server derives the dangerous signals from the payload and forces a HOLD regardless of the claim: `asset_vs_expense` at posting (in-tx `accountId`→`account.number` lookup, per-synthetic DHM aggregation over 501/502/503/504/505/511/512/513/518/548), and `unverified_vat_regime` / `vat_amount_missing` / `vat_mismatch` at capture (all non-STANDARD VAT held, STANDARD-missing-`vatAmount` held, `base×rate` mismatch held). Honest limit: a wrong VAT rate with self-consistent arithmetic and sub-40k misclassification stay underivable — human review of held writes is the master gate (full evidence contract tracked in #464). (#479)
- **api / db / web**: EPIC-R marshrutizátor wired into the write path — a per-(org, period) transaction-scoped advisory lock (`lockPeriodInTx`) serializes concurrent posts across the write gate + both approve-replay lanes, and a fail-closed admission kill-switch (`BRAIN_RUNTIME_ACTIVE`) + concurrency caps front every v1 accounting write (held-write resolve stays exempt so a human can always drain the review queue). (#479)
- **brain / intake / accounting-kb**: the Brain packages — `@workspace/brain` (calibrated confidence engine, canonical IR + provenance, the server-side gate, agent login-pack + N-1 tool sandbox + prompt-injection defense, cross-source reconcile/dedup), `@workspace/intake` (pure heterogeneous-dump parsers → Brain IR), `@workspace/accounting-kb` (vendored machine-readable KB + CZ-law taxonomy: §34 loss, PDP 343-split, OSVČ/DPFO, zahajovací rozvaha). Plus the BGTG build-ground-truth harness and ADRs 0025-0028. (#479)
- **infra**: `BRAIN_RUNTIME_ACTIVE` wired into the api task env as a context flag defaulting OFF — the agent write lane stays closed until an operator enables it at Brain launch (`cdk deploy -c brainRuntimeActive=1`), no code change. (#479)

### Fixed

- **accounting**: `closePeriod` now takes the same per-(org, period) advisory lock as the write path, closing a close-vs-post race — a roll-forward close could previously commit concurrently with an in-flight post (the closed-period guard is a BEFORE-INSERT trigger only and cannot stop a close racing a live post). (#479)

## [v0.12.4] — 2026-07-03

Patch release: organization slug hardening — a single shared reserved-name policy, a real name-to-slug pipeline, and two guard fixes from the org-scaffolding review.

### Added

- **org-provisioning**: a single shared slug + reserved-name policy (`slug.ts`) — `RESERVED_SLUGS` (grouped: routing/framework, product surface, Afframe brand, accounting domain, generic) + `isReservedSlug`, consumed by the create-org scaffolder, the `[orgSlug]` router guard, and onboarding (replacing three hand-mirrored copies). A real `slugify` pipeline: diacritic transliteration (á→a, š→s, ř→r, ú→u…), symbol words (`&`→"a", `+`→"plus"), word runs→`-`, a trailing legal-form cut (s.r.o./a.s./k.s./v.o.s./spol. s r.o./o.p.s./družstvo…), min length 3, max 48. (#475)

### Fixed

- **org-provisioning**: `pickUniqueSlug` skips router-reserved slugs so a company is never minted at an unreachable `/{slug}`. (#474)
- **web**: company archive/restore now requires the active workspace role to be owner or admin, matching the org settings mutation gate; a plain member gets a forbidden toast. (#474)
- **web**: onboarding no longer pads a short workspace name to the reserved literal `workspace` (which minted the default company at an unreachable `/workspace`); it uses the shared slugify + reserved-slug skip. (#475)
- **org-provisioning / web**: the old collapse-only slugify left `Acme, s.r.o.` → `acme-s-r-o` and mangled diacritics (`Škoda` → `koda`); now `acme` / `skoda`. (#475)

## [v0.12.3] — 2026-07-03

Patch release: the organization creation-scaffolding protocol — one call mints a ready-to-book účetní jednotka, wired into the workspace Companies hub and the org settings pages. Additive only; no existing behavior changed.

### Added

- **org-provisioning**: `@workspace/org-provisioning` — `scaffoldOrganization(input)` mints a fully-configured účetní jednotka in one atomic idempotent transaction: identity + owner membership + NACE links + vat_status + first accounting period + full směrná-osnova chart + number series + self-counterparty + peněžní-deník categories + optional signatory / OSS. Platform rows under `withAdminBypass`, accounting master-data via a nested `withOrganization(outerTx)` frame in the same transaction. (#443)
- **registries**: `@workspace/registries` — ARES v3 REST + CRPDPH SOAP + ČSÚ legal-form lookups supplying prefill suggestions (kraj / finanční úřad / spisová značka / delivery address), zero workspace deps. (#443)
- **accounting**: additive setup + lifecycle primitives — `createVatStatus` (§6/§6f/§97 ZDPH range), `seedChartFromDirectives` (materialize the směrná osnova via one INSERT…SELECT over `directive_account`), `rollForwardPeriod` (close result → close → open next účetní období). No existing domain function changed. (#443)
- **db**: migrations 0041/0042 — organization identity + config columns (IČO, sídlo split, region, delivery address, data box, contact, tax office, registry file, archived_at) and 3 org-scoped satellites (authorized person, tax representative, OSS registration) + a workspace-tier provisioning idempotency table; all in `ORGANIZATION_SCOPED_TABLES`. (#443)
- **web**: create-organization wizard (IČO → server-side ARES/DPH prefill → scaffold) on the Companies hub, plus archive/restore, an Active/Archived filter, and CSV export. The `[orgSlug]/settings` stub pages are filled — identity (identity/contact/sídlo/signatories), periods (list + roll-forward), VAT status (change / OSS / tax representative), data box. A scaffolded book auto-surfaces in the header org switcher via its active owner membership. (#443)

## [v0.12.2] — 2026-07-03

Patch release: the human half of the accounting write gate, API-key write scopes, and a repo-hygiene guard.

### Added

- **api**: held-writes review surface — `GET /v1/accounting/held-writes` lists the gated writes the confidence gate held for human review; `POST /v1/accounting/held-writes/{id}/resolve` approves (re-validates the stored payload against the original schema and executes it through the same domain path, with the approver as the responsible user) or rejects (audit-only). 404/409/403/422 seams covered; SDK + MCP regenerated (23 tools). The "Ke schválení" page gains Schválit a zaúčtovat / Zamítnout actions with an optional note. (#462)
- **api**: `accounting:write` API-key scope enforced on the three accounting write mutations via `@RequireScopes` in ApiKeyGuard — 403 names the missing scope; keys with empty scopes pass as legacy full access (warn-logged) until issued keys carry scopes. (#462)

### Fixed

- **ci**: removed a `_junk/` file force-added to the tree by #444 and added a tracked-but-gitignored guard (`git ls-files -i -c --exclude-standard` must be empty) to the CI `changes` job and lefthook pre-commit — `.gitignore` only affects untracked files, so nothing previously stopped ignored paths from being committed. (#463)

## [v0.12.1] — 2026-07-03

Patch release: Sidekick brand accent recolored to the shared purple token, UI-only, no runtime behavior change.

### Changed

- **ui**: the Sidekick brand mark, the `tone="sidekick"` IconButton, the "Ask Sidekick" context-menu item, and the admin command palette's "Ask AI" row now use the shared `--purple` token instead of hardcoded grays. The "Ask Sidekick" menu item's lucide `Sparkles` glyph is replaced with the real brand mark and its `BorderBeam` gradient wrapper is dropped. (#460)

## [v0.12.0] — 2026-07-03

Minor release: the v2 Czech accounting system — the double-entry domain, its public agent surface, and the accounting UI, landed as one piece (EPICs 1–5).

### Added

- **db**: v2 accounting ground layer — 16 migrations / 39 tables: law-as-reference directives, time-bound org links (regime, size, legal form, VAT regime), events → documents → postings spine, gapless number series, FORCE-RLS tenant isolation, trigger-maintained turnover read models, saldokonto open items. (#445)
- **accounting**: `@workspace/accounting` domain engine — classification (predkontace + `decideVat`), capture, double-entry + monetary posting, FX (daily/real/fixed), depreciation, accruals, corrections, and statutory outputs: DPH return, kontrolní hlášení, souhrnné hlášení, DPPO, financial statements (závěrka) with statement layouts. (#445)
- **api**: 15 `/v1/accounting` endpoints / 21 MCP tools — reads (journal, ledger, open items, saldokonto), 6 statutory outputs, pure `classify`, number-series discovery, and 3 gated write mutations (events, documents, postings) behind a confidence + idempotency gate (`tool_call_log`): low-confidence writes are held for human review, replays are idempotent, tenant identity comes only from the API-key principal. (#445)
- **web**: accounting module UI on live domain data — deník (journal, with event description + counterparty context), hlavní kniha, saldokonto, účtový rozvrh, accounting overview, and the "Ke schválení" held-writes review queue; Records module connected to captured documents (overview + faktury přijaté); doklad editor (Single archetype) relocated into Records. (#445)

### Fixed

- **ci**: paired-files required check no longer fails structurally on PRs over 20k changed lines — the script lists files via the paginated REST Files API instead of the line-capped diff endpoint; squawk migration lint excludes `ban-char-field` + `adding-field-with-default` (correct-by-design fixed-length codes and generated columns). (#445)
- **api**: high-severity polynomial-regex (ReDoS) in the accounting error seam replaced with linear matching; MCP generator now wires path/query/header parameters (11 accounting tools were broken at runtime). (#445)

## [v0.11.0] — 2026-07-03

Minor release: the workspace tier — the accountant-office surface for managing multiple client books, billing, and team, distinct from a client's own book.

### Added

- **web**: full workspace-tier app shell + 8 modules (Companies hub, Analyse, Audit, Inbox, Legislation, Billing, Team, Settings/Profile), built on the org tier's shell/archetype vocabulary. Green office-chrome identity, combined logomark+wordmark rail lockup. Real writes for Settings, Billing entity, and Profile display name; Companies/Team/Billing-overview backed by real data. Inbox and other undelivered surfaces (Audit backend, Legislation, Billing/Invoices) ship as designed mock UI with tracked follow-ups (#452–458), or as a prod TODO stub with the mock preserved dev-only (Inbox). (#444)

### Fixed

- **ci**: gitleaks false positives (statute citations, example IBAN, fixture DIČ) from other branches surfacing via the all-refs scan. (#444)

## [v0.10.3] — 2026-07-03

Patch release: dev-tooling and docs only, no runtime behavior change.

### Fixed

- **deps**: bounded the `js-yaml` pnpm override to `>=4.2.0 <5.0.0` — an unbounded 4.x floor let `@redocly/openapi-core` float to js-yaml 5.x and break `pnpm gen:all` SDK/MCP codegen repo-wide. (#442)

### Docs

- **api**: `/v1/structure` surface listed in the API README, CLI, and MCP guides. (#441)

## [v0.10.2] — 2026-07-01

Patch release: the app-structure discovery surface — the org navigation tree, pages, and layout archetypes, reachable by AI agents **outside the GUI** via the public API / SDK / MCP / CLI. Read-only metadata; no runtime behavior change to the app.

### Added

- **api**: read-only app-structure discovery surface for agents — `GET /v1/structure` (the ten rail modules → pages → subpages, each with route, icon, build-status, and layout archetype) and `GET /v1/structure/archetypes` (the five content-panel archetypes). Public (no API key — the IA is tenant-agnostic), auto-shipped as MCP tools (`getStructure`, `listArchetypes`) and CLI commands (`afframe structure`, `afframe archetypes`). Generated from the typed `nav.ts` trees at build time (`scripts/gen-structure.ts` → committed snapshot), drift-locked via a lefthook `structure-drift` hook; the GUI is untouched. Operability (agents acting on pages) is deferred until the accounting domain lands — see [`docs/api/AGENT-STRUCTURE.md`](docs/api/AGENT-STRUCTURE.md) + issue #439. (#438)

## [v0.10.1] — 2026-07-01

Patch release: Intrastat placeholder pages on the app skeleton, plus admin security-scan hygiene. Mock-surface + hygiene only, no runtime behavior change.

### Added

- **web**: Intrastat obligation surface on the app skeleton — a **Closing › Obligations › Intrastat** page with **Dispatches** / **Arrivals** subpages (TBA-flagged `ModulePage` placeholders, matching every other closing leaf). Statistical filing to ČSÚ via the Celní správa INTRASTAT-CZ portal (threshold 15M CZK/flow; §58 Act 242/2016 + NV 333/2021). Also documents the VAT-registration turnover watcher (rolling-12mo gauge, §6/§6c ZDPH) on Company › Overview and flags the §89/§90 VAT margin schemes as a V2-deferred scope-out. (#434)

### Fixed

- **admin**: cleared the three open security-scan findings, all on the staff-gated admin surface (two-advisor verified as real root-cause fixes). CodeQL `js/file-system-race` (TOCTOU) in the Storybook static route removed by dropping the `stat` check and reading directly with an `EISDIR` fallback; the one unpinned `storybook-builder` Docker stage pinned to the same digest as the other four (also clears a latent Dependabot mixed-reference under-update); and the `js-yaml <3.15.0` quadratic-DoS (GHSA-h67p-54hq-rp68, dev/test-only transitive) closed with a bounded pnpm override to exactly `3.15.0`. (#435)

## [v0.10.0] — 2026-07-01

Minor release: the org application surface skeleton — the full navigable sidebar built from the enriched SITEMAP, plus the four reusable content-panel archetypes.

### Added

- **web**: the full org application nav skeleton — all 10 module sidebars + 101 mock leaf `page.tsx` placeholders, generated from the enriched `docs/specs/SITEMAP.md` (two independent latest-Opus advisor passes + a confirmation pass over the Czech-accounting IA). Regime is a superset for now, marked with `TODO(regime)` swap points. Mock-backed skeleton only — no data wiring yet. (#429)
- **ui**: four content-panel archetypes so a new org page can be scaffolded by picking one and feeding it data — **Launchpad** (folder/overview card grid), **Dashboard** (KPI tiles + sparklines + chart cards + a metrics matrix on the real Table grid), and **Single** (the ABRA three-panel `RecordWorkspace` via a new additive `formLayout="panels"`), on top of the pre-existing Table gold standard. Adds a shared content-header `⋯` menu and dev-only demo routes (`/demo-table`, `/demo-launchpad`, `/demo-dashboard`, `/demo-single`) that 404 in production. (#432)

### Fixed

- **ci**: unpinned `wranglerVersion` in the `deploy-sleeping` workflow. (#428)

### Documentation

- **readme**: added the release tag-format section + a link to `docs/conventions/RELEASES.md`. (#430)

## [v0.9.0] — 2026-06-30

Minor release: the cold-pause "app is asleep" edge page, redesigned onto the in-app auth shell.

### Changed

- **infra**: redesigned the cold-pause "app is asleep" edge page (`infra/cloudflare-sleeping`) onto the in-app auth split-shell — light/dark via `prefers-color-scheme`, adaptive brand logo, a corporate watercolor aside, a header return-link + single "Try again" action, and a contact-support line. Stays self-contained static HTML (zero network deps; watercolor inlined as a base64 webp). (#426)

## [v0.8.1] — 2026-06-29

Patch release: cold-start deploy reliability — resilient RDS resume + the per-env `Audit` stack drop. No app-surface change.

### Fixed

- **deploy**: cold-start deploys now resume RDS reliably and parallel staging+prod deploys no longer collide. The brittle single `aws rds wait` (hard-capped ~30 min, which a deeply-cold DB exceeded) is replaced by a resilient poll loop (`infra/scripts/rds-resume.sh`, shared by `_deploy-aws.yml` + `power.yml`) that tolerates transitional states, re-issues start, re-asserts the cost-stop tag removal each iteration, and disables the `RdsRestartWatcher` EventBridge rule for the resume window (re-enabled on every exit via a trap) so it cannot re-stop the DB mid-resume. The account-global `Audit` CloudTrail stack is no longer deployed by the per-env workflow (it ships once, manually, like `SecretsBootstrap`) — including it made parallel deploys collide on the shared CFN stack. (#422, #423)

## [v0.8.0] — 2026-06-29

Minor release: the staff admin back-office (`apps/admin`) on the shared AppShell layout.

### Added

- **admin**: staff back-office on the AppShell chrome — rail + collapsible sidebar + header, five operator modules (Now, Customers, Ops, Platform, Staff), detail-page header tabs. Capability-gated security spine: `admin_staff_role` (7 roles), `SECTION_ACCESS` map, workspace-allowlist gate, and step-up re-auth whose 2FA requirement is server-derived from the operator's enrollment (not the request). Real-data surfaces for orgs / users / workspaces / staff / audit / impersonation / kill switches / maintenance / critical systems / domains / TLS / email deliverability / command palette. `/invites` is the production account-creation path (signup + invite token minting, capability + step-up gated, `WEB_BASE_URL`-targeted links). Plus a reusable `DataTable`, a live GitHub-Releases changelog, and an operator profile. (#409)

## [v0.7.0] — 2026-06-29

Minor release: org/period context switchers wired to real data, public sign-up closed on web, operator DB-access tooling, plus a dependency + CI tail.

### Added

- **web**: org switcher wired to real organization data; the accounting-period switcher now tracks live state. (#406, #408)

### Fixed

- **auth**: closed the public sign-up/email endpoint on web — accounts are admin-provisioned only, no self-service signup. (#405)
- **deps**: pinned `rolldown` to `1.0.0-rc.18` to fix the Storybook bundle crash. (#417)

### Operations

- **db**: fast ECS-exec `db-query.sh` read helper; hardened the EC2 bastion migrate path. (#407)
- **ci**: skip the issue-sync job on Dependabot PRs (no secret access). (#415)

### Infrastructure

- Dependency bumps: github-actions group (#414), `axllent/mailpit` (#412), `postgres` (#410, #411), dev-dependencies group (#413).

## [v0.6.3] — 2026-06-25

Patch release: pinned infra image bumps. No app-surface change. **Not deployed** — takes effect at the next CDK deploy / Vault-VPS sidecar restart.

### Infrastructure

- **edoburu/pgbouncer** `v1.25.1-p0` → `v1.25.2-p0` (#378).
- **openfga/openfga** `v1.15.1` → `v1.17.1` (both task defs, #377). No datastore migration or breaking change on this path (verified against upstream release notes; v1.18 is the next migration boundary).
- **cloudflare/cloudflared** `2026.6.0` → `2026.6.1` — AWS tunnel sidecar (`app-stack.ts`) plus the Vault-VPS sidecar in `infra/vault/compose.yaml` (tag + digest `sha256:6d91c121…`). The Vault-VPS container restart is a separate manual step on the secrets host (#393).

## [v0.6.2] — 2026-06-25

Patch release: security-only transitive dependency overrides. Clears all 23 open Dependabot alerts (+ the 3 Trivy code-scanning mirrors). No product-surface change.

### Security

- **`pnpm.overrides`** forces patched floors for transitive advisories: `undici` ≥7.28.0 (bounded to 7.x so jsdom's deep import keeps working; DB#69–75), `ws` ≥8.21.0 (DB#54), `multer` ≥2.2.0 (DB#67,68), `form-data` ≥4.0.6 (DB#58), `protobufjs` ≥7.6.3 (DB#59), `@opentelemetry/core` ≥2.8.0 (DB#61), `vite` ≥8.0.16 (DB#56,57), `js-yaml` ≥4.2.0 scoped to the 4.x line (DB#55), `tmp` ≥0.2.7 (DB#53, supersedes the earlier ≥0.2.6), `esbuild` ≥0.28.1 (DB#51), `hono` floor raised to ≥4.12.25 (DB#62–66, already shipped direct in v0.5.2).
- Lockfile regenerated from scratch; `pnpm typecheck` (23/23) + `pnpm test` (17/17) green.

## [v0.6.1] — 2026-06-25

Minor release: app-shell global header context switchers + the page-adding runbook refresh.

### Added

- **ui**: `app-header` block — `OrgSwitcher` (current-org identity + dropdown) and an accounting-period switcher for the app-shell global header. Stacked follow-up to the App Shell (#397). (#400)

### Documentation

- Refresh the app-shell page-adding runbook with page / module / tab recipes. (#402)

## [v0.6.0] — 2026-06-25

Minor release: the app-shell **Content Panel** + a persistent, structure-driven org layout. One persistent shell now mounts across every `/[orgSlug]` route; the sidebar nav is derived per module from co-located config and guarded against the route tree. (#397)

### Added

- **ui**: `data-grid-view` — a presentational grid bound to a TanStack table (resize / reorder / pin / sort / hide, keyboard nav, scroll-gated pin shadow); `ContentPanel` Inspector (panel / dialog) + a status-bar clearance contract + a five-variant taxonomy (Table / Launchpad / Dashboard / Single / Blank) with stories; `Separator` `inset` prop; a generic data-table column manager + `DetailField` extracted into `packages/ui`. `data-grid-view` added to the admin showcase; app-sidebar block stories.
- **web**: the persistent `AppShell` mounted in the org layout; a structure-driven sidebar nav (co-located `<module>/nav.ts` + an `_nav` aggregator, active module via the rail); one Overview page per module; a `nav-drift` guard (`scripts/check-nav.ts`) and a `ui-location` lefthook guard for reusable-UI placement.

### Changed

- **web**: sidebar reminders + insight are on-call — the sidebar self-hides them until a real source pushes data. The invoices Content Panel demo moved to a dev-only `/<org>/demo` route.

### Fixed

- **ui**: `useDataTable` controlled-pagination render crash; `InsightProgress`'s progress bar now has an accessible name; the content-header collapsed-tabs trigger composes `Button` instead of a raw element.

### Removed

- **web**: the legacy `SectionTabs` / `SectionStub` scaffolds and the non-module placeholder routes.

## [v0.5.2] — 2026-06-25

Patch release: bundled dependency bumps. No product-surface change. Supersedes the seven open Dependabot PRs (#384, #387–#392), applied on one branch with a single regenerated + deduped lockfile.

### Infrastructure

- **npm**: `hono` 4.12.23 → 4.12.25 (#384); production-dependencies group (12 updates, #392); dev-dependencies group (8 updates, #391). One regenerated `pnpm-lock.yaml`, `pnpm dedupe` applied.
- **GitHub Actions**: github-actions group (3 SHA-pinned action updates across all workflows). (#390)
- **Docker / compose**: `postgres:18-alpine` digest (#387); `ubuntu:26.04` devcontainer digest (#388); `axllent/mailpit` v1.30.1 → v1.30.2 (#389).

## [v0.5.1] — 2026-06-21

Patch release: dependency, CI, accessibility, observability, and docs cleanup tail. No new product surface.

### Changed

- **observability**: deduped the client-error gate into `@workspace/notify` so app + worker error capture share one path. (#368)
- **web**: code-quality leftovers from the D wave (DEV-78). (#371)

### Fixed

- **ui**: mobile a11y — 40px sheet-close target + shell tokens for the bottom nav. (#370)
- **admin**: resolve only the brand name in the root layout. (#385)
- **ci**: install deps before `wrangler-action` in `deploy-sleeping` (#364); force `joi >=18.2.1` (CVE-2026-48038) (#365); gate `sbom-diff` on version upgrades, not just added components (#367); allow the `bot` scope in PR titles (#345); post-audit corrections — wrangler deploy pin, PII redaction, override-aligned deps (#380).

### Infrastructure

- Dependency bumps: production deps (25 then 15) (#366, #375), dev deps (35) (#376), GitHub Actions group (#352), `aws-actions/amazon-ecr-login` (#374), postgres image (#359, #360, #372, #373), infra-compose images (#358).

### Documentation

- Generalize the break-glass escrow location across the repo (#349); normalize runbook filenames (drop `-RUNBOOK`, `AWS-DEPLOY`→`AWS-SETUP`, `COST-INCIDENT`) (#347).

## [v0.5.0] — 2026-06-11

Minor release: pre-v1 hardening — mobile UI, brand surface, performance, i18n — plus infra cost/alarm fixes.

### Added

- **Pre-v1 hardening (feature wave)** — UI mobile support, brand surface, performance, and i18n. (#361)

### Fixed

- **Pre-v1 hardening (fix wave)** — security, docs, observability, API platform, CI, tests, and DX. (#356)

### Infrastructure

- Cut Vault→SSM sync KMS usage to zero in steady state. (#354)
- Wire facade-generated CloudWatch alarms to the `BillingTopic`. (#355)

## [v0.4.1] — 2026-06-07

Patch release: web layout re-land and supporting docs/UX fixes.

### Changed

- **ui**: switch the AppShell content area to flex and drop `react-resizable-panels`; re-land the web layout changes after the unreviewed direct-to-main push was reverted. (#350, #351)
- **web**: rename the `/personnel` org route to `/hr` and move section titles to design tokens.

### Fixed

- App errors now open deduped GitHub issues; dropped the Next.js control-flow signals from error capture. (#342)

### Documentation

- Repo-wide drift sweep (root docs, ADRs, runbooks, inventory) + register `app-context-menu` and the verify script (#341); root-doc security + freshness pass (#348).

### Added

- Theme-adaptive `favicon.svg` at the repo root for the Conductor sidebar icon. (#343)

## [v0.4.0] — 2026-06-07

Minor release: the agent human-in-the-loop (HITL) round-trip and the Telegram command/control surface.

### Added

- **Agent HITL round-trip** — complete free-text replies, timeout policy, and agent wiring (#337); hybrid asks (options + type-your-own) with crisp agent recipes (#338); answer-as-trigger so the reply WAKES the consumer with no agent polling (#340).
- **Telegram bot control plane** (PR-2) — continues the dev alert + control hub from v0.3.0. (#332)
- **Telegram command surface** — command menu + interactive button pickers (#336).
- **Security findings fan-in** (DEV-59). (#333)

### Changed

- Point the bot `/status` at `api/health` and set `ENVIRONMENT=production`. (#334)
- **ci**: gate `cdk-synth` + icon-parity heavy work on change-detection. (#335)

### Fixed

- Keep the HITL question visible + strip options when Other is chosen. (#339)

## [v0.3.0] — 2026-06-06

Minor release: the Afframe Telegram dev alert + control hub (epic DEV-48).

### Added

- **Telegram dev alert + control hub** (`apps/bot`): a Cloudflare Worker (grammY + Hono) that is the single choke point for developer-facing Telegram I/O. Outbound `POST /ingest`; inbound `/webhook` (secret-token + Telegram user-id allowlist, constant-time auth); `/issue` + `/sns`; a scheduled health scan (cron 06:00/18:00 Prague) with a `/scan` command; and an auto-issue engine (Cloudflare D1 dedup → GitHub issue in **DEV — Incidents** with source/type/risk/area labels). New `@workspace/notify` typed client. AWS CloudWatch alarms fan in via SNS (Billing + KillSwitch topics); an independent GitHub Actions watchdog monitors the bot's `/health`.
- App-side error capture + business pings wired to the bot: `apps/api` `DomainExceptionFilter` (Sentry + notify), Next.js `global-error`/`error`/`instrumentation-client` + a same-origin client-error route, `packages/workers` `permissions-drain` dead-letter, plus feedback + new-workspace pings.

### Infrastructure

- `BOT_INGEST_URL` + `NOTIFY_SHARED_SECRET` wired into the **web** + **api** task definitions; `notify-shared-secret` added to the Vault→SSM sync loop and the `vault-ssm-sync` IAM allowlist.
- Rolled out the codified account-wide $55 cost guard + cost kill-switch to AWS staging + production. The three CloudFormation budgets (`BudgetTotal`, `BudgetDataTransfer`, `BudgetAccountTotal`) are recreated with the codified config and the `AutoStopFn` gains `rds:StopDBInstance`. Deployed with `v0.2.5` alongside the env-power auto-stop wiring. (CDK budget replace — non-data-bearing; reviewed cdk diff.)

## [v0.2.5] — 2026-06-01

Patch release: code-scanning + supply-chain follow-ups to v0.2.4. No app-surface changes.

### Fixed

- `js/log-injection` (CodeQL) in the email console transport — `stripLineBreaks` now uses `/[\r\n]/g` with an empty replacement so CodeQL recognises it as a sanitizer. A `+` quantifier silently defeated the prior fix (verified against the real `js/log-injection` query with the CodeQL CLI). Behaviour is unchanged — the global flag still strips every CR/LF. (#306)

### Added

- CI workflow to seed the Cloudflare routes token into SSM. (#305)

## [v0.2.4] — 2026-06-01

Largest release since v0.2.0. Introduces the public API v1 surface, the Vault-on-VPS secrets architecture (M1–M10), AWS cost-runaway protection, and env power controls — plus a security-findings sweep and a CI/supply-chain hardening pass.

### Added

- **Public API v1** — `/v1` release candidate: Scalar API reference, generated SDK + MCP tool surface + CLI, OpenAPI registry codegen, status + feedback endpoints, topnav/brand polish.
- **Secrets architecture — Vault → SSM (M1–M10)** — Vault-on-VPS bring-up assets (compose, HCL, env, logrotate); `SecretsBootstrap` CDK stack (KMS auto-unseal + IAM user); Vault AWS IAM auth verifier + operator-admin policy (M3 / M3.5); vault-to-SSM sync (script + systemd + drift CI); M4 CDK flip of 3 workflow secrets to SSM SecureString + `vault-ssm-sync` IAM user; restic backup + DR-drill assets; GitHub OIDC → Vault JWT pilot (M5); `infisical-scan` gate.
- **AWS cost-runaway protection** — account-wide $55 production cost guard; always-on cost reduction + hardened cost kill-switch.
- **env power** — `env-power` workflow (resume / warm-pause / cold-pause) with auto-cold-pause on staging + prod and an `all`-envs matrix fan-out. Auto-pause binds an edge "app is asleep" page served by the `cloudflare-sleeping` worker (the in-app `/sleeping` twin was dropped).
- **ECS Exec** enabled on the App stack.
- **admin** allowlist now read from a database table.

### Changed

- All Docker base images pinned by digest (Scorecard `PinnedDependencies`). (#300)
- CI / supply-chain hardening: `timeout-minutes` on required jobs; corrected stale action version comments; `workflow-lint` runs on every PR so required checks always report; secret tooling hardened (gitleaks Vault rule, deploy gate, scoped access, runbooks).
- Dependency bumps: production (31), dev (37), and GitHub Actions (10) groups; codegraph MCP server wired in.
- Docs: secrets M-series rewrites with an honest DR caveat, VAULT-OPS escrow-location correction, Czech-accounting KB roadmap, GSD references removed; `.context/` gitignored.
- `patch-emails.sh` deploy helper scoped to `/app/apps` instead of `/app` (perf).

### Fixed

- **admin** sign-in now always surfaces "invalid email or password" after a Better Auth success-then-fail.
- **api** full horizontal logo + topnav polish; `RESEND_API_KEY` / `EMAIL_FROM` / `EMAIL_TRANSPORT` wired on the api container.
- **infra**: ECS Exec agent crash on read-only rootfs; `_app_migrations` checksum-schema alignment across bootstrap paths; CDK replace-guard drops `Logs::LogGroup`; `BUILD_VERSION` shows the nearest release tag for untagged deploys; migration rollback / checksum safety.

### Security

- Remediated the open GitHub security findings: `js/log-injection` (CodeQL) fixed with a recognized empty-string sanitizer (#302); three transitive dependency CVEs — `tmp`, `qs`, `uuid` — bumped via pnpm overrides (#299); base-image CVE patches (gnutls) + allowlist for unfixable entries.

## [v0.2.3] — 2026-05-21

Supply-chain follow-up to v0.2.2. No app surface changes.

### Fixed

- `_supply-chain.yml` now **extracts the release tarball before SBOM scan**. v0.2.2's SBOM was 497 bytes with a single opaque "file" component because `anchore/sbom-action` was passed `file: <tarball>` and syft never descended into the archive. v0.2.3 unpacks the tarball into `sbom-target/`, then runs syft against the directory tree — the JS cataloger walks every `package.json` under `node_modules/` in the Next.js standalone bundle and emits the full component list. (#246, AFF-229)
- `_supply-chain.yml` dropped the explicit `sbom.cdx.json.cosign.bundle` entry from the `gh release upload` list. The `./*.cosign.bundle` glob already matches it, and the duplicate listing raced with `--clobber` on v0.2.2 → HTTP 404 → the SBOM cosign signature never attached. (#246, AFF-229)

### Added

- `_supply-chain.yml` post-upload verification step. Asserts the GitHub Release has `sbom.cdx.json`, `sbom.cdx.json.cosign.bundle`, and `<package>-<version>.cosign.bundle` attached after the release-mode upload, fails the job if any is missing. Silent missing-asset bugs (as on v0.2.2) now fail loud instead of waiting for the next release attempt.

## [v0.2.2] — 2026-05-21

CI + observability follow-ups to v0.2.0. No app surface changes.

### Fixed

- `_supply-chain.yml` now downloads the tarball workflow artifact before computing its digest, AND passes it to `anchore/sbom-action` as `file:` instead of `path:`. `path:` treats the input as a directory (`syft dir:…`) and rejects a `.tar.gz` with "not a directory" — surfaced on both v0.2.0 and the burned v0.2.1 attempts. `file:` lets syft auto-decompose the tarball into a meaningful SBOM. From v0.2.2 onward, every GitHub Release attaches all four artifacts: tarball, SLSA L3 `.intoto.jsonl`, CycloneDX `sbom.cdx.json`, and `*.cosign.bundle`. (#240, this release, AFF-229)

### Changed

- `_deploy-aws.yml` decouples the image's `BUILD_VERSION` env from `IMAGE_TAG`. The deploy pipeline resolves `BUILD_VERSION` in order: (1) explicit `build_version` input, (2) `git describe --exact-match` to discover a tag at HEAD, (3) fallback `sha-<short-7-char>`. `IMAGE_TAG` stays `sha-<full>` to preserve ECR deterministic pin + rollback semantics + the `image_tag_override` flow. Result: after `git tag v0.2.2` the deploy auto-bakes `BUILD_VERSION=0.2.2` without any extra flag — the runtime footer, `/api/version`, OpenAPI `info.version`, and Sentry `release` tag all read `v0.2.2`. Before this change everything ran on a 40-char full SHA regardless of git tag state. (#241)
- `docs/conventions/RELEASES.md` rewritten to match actual mechanics: corrected "Tag → deploy order", added per-service-coherence note (`force_rebuild_images=true` to align unchanged services), documented the `build_version` escape hatch. (#241)
- `docs/runbooks/DEPLOY.md` corrected: `release.yml` does not call `_deploy-aws.yml` — they are independent workflows. (#241)

## [v0.2.0] — 2026-05-21

First tagged release. Establishes the brand surface, release + version conventions, AWS deploy pipeline, and Storybook + test infrastructure on top of the existing app shell.

### Brand surface

- `@workspace/ui/brand-assets` package — single source of truth for logo, brand text, URLs, emails, social handles.
- `<Logo>` SVG component — 4 variants (horizontal, stacked, logomark, wordmark) × 9 tones (6 explicit + 3 adaptive sugar).
- `<BrandName>`, `<BrandTagline>`, `<BrandLegalName>`, `<BrandCopyrightHolder>`, ... — 19 i18n-localized brand-text components + `getBrandText()` server resolver.
- Non-localized constants — `BRAND_SUPPORT_EMAIL`, `BRAND_MARKETING_URL`, `BRAND_GITHUB_URL`, ... with `<BRAND-*>` placeholder pattern for slots awaiting copy.
- Brand color tokens in `globals.css` — `--brand-primary-light/dark`, `--brand-admin-light/dark`, `--brand-mono-light/dark`, exposed as Tailwind utilities.
- Adaptive favicon set across web/admin/api — SVG with internal `@media (prefers-color-scheme)`, dual PNG raster with `<link media>`, PWA manifest icons, apple-touch-icon, legacy `.ico`. Regenerated from tokens via `scripts/build-favicons.py`.
- Production-deploy guard — `scripts/check-brand-placeholders.mjs` fails the deploy when unfilled `<BRAND-*>` placeholders remain (currently bypassed via `CHECK_BRAND_STRICT=false` while content lands — tracked in AFF-228).
- Logo SVG sources committed in-repo under `packages/ui/src/brand-assets/source/`; path data extracted into typed TS modules via `scripts/build-logo-paths.mjs`.
- AGENTS.md + brand-assets README + UI README document the surface end-to-end.

### Release + version conventions

- Tag format: `v<MAJOR>.<MINOR>.<PATCH>` for stable, `v<MAJOR>.<MINOR>.<PATCH>-rc.<N>` for release candidates. Regex-enforced in `release.yml`.
- `docs/conventions/RELEASES.md` — bump rules, RC promotion flow, **tag → deploy** operational order, `image_tag_override` / `force_rebuild_images` escape hatches, truth table for ordering trade-offs.
- `release.yml` auto-marks `-rc.*` tags as GitHub Pre-release.
- Build version surfaced at runtime — `getBuildVersion()` reads `BUILD_VERSION` env at SSR; auth + onboarding footers render `© {year} {brand}. v0.2.0`. Local dev falls back to `dev`.
- AGENTS.md `Releases` section + COMMITS.md cross-link.

### Infrastructure + deploys

- AWS CDK v2 single-account stacks (network, data, app, security, observability, backup), eu-central-1.
- ECS Fargate task with init containers for DB migrations + OpenFGA bootstrap.
- Cloudflare Tunnel for staging + production routing.
- Container image tagging via `docker/metadata-action` — `sha-<short>`, `branch-<name>`, `<semver>`, `latest` on main. Build args propagate `BUILD_SHA`, `BUILD_TIME`, `BUILD_VERSION` into image labels + runtime env.
- `_deploy-aws.yml` workflow — manual via `gh workflow run`, per-env SSM tracking, change-detection-driven image build skips, production approval gate.
- Public Swagger UI at `/v1/docs` with brand-customized title + favicon.
- `/api/version` (web) + `/api/health` (api) expose `BUILD_SHA`, `BUILD_TIME`, `BUILD_VERSION`.

### Release artifacts + supply chain

- SLSA L3 provenance for `apps/web` tarball on every tag.
- CycloneDX SBOM + cosign keyless signature attached to every GitHub Release.
- License-check + osv-scanner gates in CI.
- `scripts/sbom-diff.mjs` fails on new copyleft licenses or HIGH/CRITICAL CVEs.

### Testing + Storybook

- Storybook 10 + Vite + addons (docs, a11y, themes, links, chromatic, vitest, test-runner).
- 28 component interaction tests (play functions).
- 21 viewport presets (iPhones, iPads, MacBooks, Windows PCs).
- Vitest coverage (v8 provider).
- axe-playwright a11y checks in CI (warn mode).
- WebKit (Safari) testing via Playwright.
- 506 unit tests across 114 files, 66 dedicated to `<Logo>`.

### Documentation

- ARCHITECTURE.md system reference.
- AGENTS.md `Brand Assets` + `Releases` sections.
- `docs/conventions/RELEASES.md`, `docs/conventions/COMMITS.md`, `docs/conventions/CI-POLICY.md`, `docs/conventions/code-naming.md`, `docs/conventions/typescript.md`.
- Brand-assets README with full API surface + variant/tone tables.
- ADRs covering architecture decisions (see `docs/adr/`).

### Changed

- Auth + onboarding layouts use `<Logo>` (5 sites previously rendered the `WalletMinimal` lucide placeholder).
- Admin auth metadata uses `getBrandText()` instead of hardcoded "Afframe Admin".
- API Swagger site title reads brand name from i18n.
- `apps/api/src/main.ts` registers helmet before `useStaticAssets` so security headers attach to static asset responses.
- CONTRIBUTING.md rewritten with closed-beta rules and pre-merge gates.
- LICENSE — All Rights Reserved (closed beta).
- `.gitignore` expanded (`_junk/`, `.claude/`, `.auth`, playwright artifacts).

### Removed

- `packages/shared/src/brand.ts` (`BRAND`, `AUTH_ASIDE_LOGOS`, `type Brand`) — migrated to `@workspace/ui/brand-assets`.
- `WalletMinimal` re-export from `@workspace/ui/lib/icons` — replaced by `<Logo>`.

### Fixed

- `apps/api/Dockerfile` circular dependency on `builder` stage (public/ COPY moved to runner).
- AWS deploy auto-rollback when migrations applied during the deploy.
- Prod safety + visibility hardening (CR-02, CR-03, HI-07).
- Infra hygiene bundle (HI-03, ME-01/07/08/09, LO-03).
- Batched deploy hardening (PR M code-review items).
- Log-group pre-create only for groups CFN owns.
