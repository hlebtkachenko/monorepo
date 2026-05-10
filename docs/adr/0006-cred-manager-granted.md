# 6. AWS credential manager: Granted CLI

- Status: Accepted
- Date: 2026-05-10
- Deciders: Hleb Tkachenko

## Context and Problem Statement

Once AWS Identity Center lands (post-bootstrap), local CLI access to multiple accounts needs a credential manager. AWS CLI v2's native `aws sso login` works but the multi-account, multi-tab browser experience is rough.

## Decision Drivers

- AWS Identity Center is the source of truth (per AWS-INTEGRATION-PLAN).
- Multi-account workflows: jumping between staging, production, log-archive, audit several times an hour.
- Browser isolation per profile: avoid cross-account session bleed in tabs.
- Profile registry that survives a re-install.

## Considered Options

1. **Granted (Common Fate).** Identity-Center-native, opens each profile in a Firefox container or named profile so sessions don't share cookies, profile registry, MFA-friendly, OSS.
2. **aws-vault.** Mature, OS-keychain-backed, but Identity Center support is limited and the multi-account browser experience is worse.
3. **Native `aws sso login` only.** Free, no extra tool, but every account switch is a full re-auth round trip.

## Decision Outcome

Chosen: **Option 1, Granted.**

Reasoning:
- Identity Center support is first-class.
- Firefox container isolation per profile prevents the "wrong account in another tab" mistake.
- `assume <profile>` is a single-line UX win.
- aws-vault rejected: less suited to Identity Center; OS-keychain integration matters more for static credentials, which we are not using.

## Consequences

Positive:
- One-line account switch.
- Browser isolation reduces blast radius of "I clicked the wrong tab" mistakes.
- OSS, no vendor lock-in.

Negative:
- Third-party tool. Pinned to a release in `mise.toml`.
- Firefox container integration is Firefox-only; Chrome users lose that benefit (Hleb defaults to Firefox for AWS work, accepted).

## Validation

- `granted --version` listed in `mise.toml` and `.devcontainer/Dockerfile`.
- Profile bootstrap documented in `docs/runbooks/AWS-BOOTSTRAP.md` step 6.

## References

- `mise.toml`
- `.devcontainer/Dockerfile`
- `docs/runbooks/SECRETS.md`
