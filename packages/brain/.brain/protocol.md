# Run protocol (how a Brain run proceeds)

Editable (unlike `constitution.md`), but changes ride the librarian's GitHub-PR path + eval gate. The
deterministic stage machine (WP-1.4a) drives transitions; the model never decides a transition.

## Stages (`brain_run.stage` 0–8)

0. **intake** — discover `intake/<org-slug>/`, hash sources, build the manifest.
1. **parse** — deterministic per-format parsers → canonical IR (read-side only, I9). Money S3 XML + Fio first.
2. **dedup** — three-layer dedup; name-keyed until GATE-A1 (`protistrana` IČO/DIČ).
3. **classify** — KB rules + agent reasoning → předkontace candidates.
4. **score** — 4-tier infra-signal router + calibration → `C_final` per item (I8).
5. **stage** — write to `brain_run_item.staged_payload` (I6). Run the 7 online CZ gates (I-gate).
6. **review** — `awaiting_review`: human master gate (I7). Green fast-approve, red focus.
7. **commit** — on human confirm, the client calls the commit endpoint; the **server** flips staged → live
   under `withOrganization` (I1) and stamps `brain_run_id` (I4). The Brain client holds no DB path (reframe R-2).
8. **learn** — librarian distills corrections → proposed rule → GitHub PR (never a local prod-box write).

## Hard pre-flights (constitution invariants, every transition)

- Source-must-be-read before classifying an item.
- Online per-run gate violation (no source doc, closed period, constitution violation, balance/VAT
  mismatch, …) forces `decision = 'deferred'` — never a silent auto-book.
- Commit gate `--on-timeout Hold`: unanswered = do not commit, tenant untouched (I7).
