## Summary

<!-- 1-3 bullets: what changed and why. -->

## Type

- [ ] feat
- [ ] fix
- [ ] chore
- [ ] docs
- [ ] refactor
- [ ] test
- [ ] perf
- [ ] ci
- [ ] build

## Risk Classification (DORA)

- **Data sensitivity touched**: [ ] None  [ ] Internal  [ ] Customer PII  [ ] Financial / cardholder
- **Breaking change**: [ ] No  [ ] Yes (describe migration in body)
- **Blast radius**: [ ] Single package  [ ] Monorepo-wide  [ ] Production / multi-account

## Rollback Plan

<!-- Feature flag? Previous-image redeploy? Migration reversal? Be specific.
     If none: explain why this change is forward-only. -->

## ADR

<!-- Link to docs/adr/NNNN-*.md if this introduces or changes an architectural decision.
     If no ADR is needed, write "n/a". -->

## Cost Estimate

<!-- Required when AWS or other paid resources are added or scaled.
     Format: monthly delta in USD. <$5 = "negligible". Else show calculation. -->

## Verification

- [ ] `pnpm typecheck`
- [ ] `pnpm lint`
- [ ] `pnpm test`
- [ ] `pnpm build`
- [ ] Manual smoke (UI changes only)
- [ ] Migration safety reviewed (schema changes only)

## Compliance

- [ ] No real customer data in fixtures
- [ ] No long-lived secrets added
- [ ] CODEOWNERS reviewer satisfied if sensitive path touched
