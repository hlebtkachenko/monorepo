# syntax=docker/dockerfile:1.10
#
# Cerbos PDP sidecar image — bakes our policies + config into the upstream
# Cerbos server image. CDK consumes this via DockerImageAsset; the build runs
# at `cdk synth` time and pushes to the CDK-managed asset ECR repo.
#
# Why a baked image instead of an init-copy or compose-style bind mount:
#   - Fargate has no shared filesystem between containers in a task; bind
#     mounting policies from one image to another requires an init container
#     with a shared volume, which adds startup race + complexity.
#   - The image is content-hashed by CDK, so a policy edit triggers a new
#     image push automatically. No manual tag bumps.
#
# Upstream cerbos pin: ghcr.io/cerbos/cerbos:0.53.0@sha256:c3fe64202e3793b7e9c41c5cbfcf390a51fb28ebce0a7d70754155e70db839c4. Tracked by Dependabot
# Docker ecosystem via the /infra/cerbos directory entry in
# .github/dependabot.yml. Re-pin via Dependabot PRs.
FROM ghcr.io/cerbos/cerbos:0.53.0@sha256:c3fe64202e3793b7e9c41c5cbfcf390a51fb28ebce0a7d70754155e70db839c4
COPY policies /policies
COPY config/cerbos-config.yaml /etc/cerbos/config.yaml
CMD ["server", "--config=/etc/cerbos/config.yaml"]
