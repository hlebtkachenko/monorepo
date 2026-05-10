# 5. Container runtime on Mac: Docker Desktop

- Status: Accepted
- Date: 2026-05-10
- Deciders: Hleb Tkachenko

## Context and Problem Statement

Local container runtime on macOS for builds, testcontainers, and dev parity with the Fargate runtime. Two leading options: Docker Desktop (official) and OrbStack (third-party, faster, lower RAM).

## Decision Drivers

- Standard tooling preference.
- Official upstream support.
- No subscription cost surprise.
- Dev parity with CI runners (which use the official Docker daemon).
- RAM budget on a 24 GB MacBook Pro.

## Considered Options

1. **Docker Desktop.** Official, free for personal / small-business use under current license, standard CLI ergonomics, native buildx, official upstream support, BuildKit out of the box.
2. **OrbStack.** Lower RAM footprint, faster startup, Linux-machine emulation built in, costs $8/month for commercial use.
3. **Colima.** Free, OSS, lightweight, but rougher edges around buildx multi-arch and less polished GUI/observability.
4. **Lima + nerdctl.** Closest to "raw" containerd; too much yak-shaving for a daily-driver dev environment.

## Decision Outcome

Chosen: **Option 1, Docker Desktop.**

Reasoning:
- Hleb's preference for standard tooling.
- No $8/month subscription.
- Official upstream support: when something breaks, vendor responds.
- Trade-off accepted: more RAM than OrbStack.

OrbStack rejected on Hleb's preference for standard tooling, despite the technical edge.

## Consequences

Positive:
- Official upstream, predictable behavior.
- Same daemon model as CI.

Negative:
- Higher RAM usage than OrbStack.
- Mac VM startup slower than OrbStack.

## Migration Path

If RAM pressure forces a change, the swap to OrbStack or Colima is mechanical:
1. `brew install orbstack` or `brew install colima docker docker-buildx`.
2. Stop Docker Desktop.
3. Start the alternative; CLI compatible.
4. Replace this ADR.

## References

- `.devcontainer/Dockerfile` (Linux container runtime, parity with Fargate)
- `mise.toml`
