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
# Upstream cerbos pin: ghcr.io/cerbos/cerbos:0.53.0. Dependabot Docker
# ecosystem covers this; the SHA digest is whatever upstream publishes.
# Re-pin via .github/dependabot.yml updates.
FROM ghcr.io/cerbos/cerbos:0.53.0
COPY policies /policies
COPY config/cerbos-config.yaml /etc/cerbos/config.yaml
CMD ["server", "--config=/etc/cerbos/config.yaml"]
