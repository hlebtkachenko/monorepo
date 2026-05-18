FROM ubuntu:26.04@sha256:f3d28607ddd78734bb7f71f117f3c6706c666b8b76cbff7c9ff6e5718d46ff64

ARG TARGETARCH=amd64

ENV DEBIAN_FRONTEND=noninteractive \
    PNPM_HOME=/home/vscode/.local/share/pnpm \
    PATH=/home/vscode/.local/share/pnpm:/usr/local/bin:/usr/bin:/bin

RUN apt-get update && apt-get install -y --no-install-recommends \
      build-essential \
      ca-certificates \
      curl \
      gnupg \
      git \
      jq \
      make \
      sudo \
      unzip \
      wget \
    && rm -rf /var/lib/apt/lists/*

# Non-root user
RUN groupadd --gid 1000 vscode \
    && useradd --uid 1000 --gid vscode --shell /bin/bash --create-home vscode \
    && echo "vscode ALL=(root) NOPASSWD:ALL" > /etc/sudoers.d/vscode \
    && chmod 0440 /etc/sudoers.d/vscode

# Node 24 (NodeSource)
RUN curl -fsSL https://deb.nodesource.com/setup_24.x | bash - \
    && apt-get install -y --no-install-recommends nodejs \
    && rm -rf /var/lib/apt/lists/*

# pnpm via corepack
RUN corepack enable && corepack prepare pnpm@11.0.9 --activate

# GitHub CLI
RUN curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg \
      | dd of=/usr/share/keyrings/githubcli-archive-keyring.gpg \
    && chmod go+r /usr/share/keyrings/githubcli-archive-keyring.gpg \
    && echo "deb [arch=${TARGETARCH} signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" \
      > /etc/apt/sources.list.d/github-cli.list \
    && apt-get update \
    && apt-get install -y --no-install-recommends gh \
    && rm -rf /var/lib/apt/lists/*

# AWS CLI v2
RUN ARCH_AWS=$([ "${TARGETARCH}" = "arm64" ] && echo "aarch64" || echo "x86_64") \
    && curl -fsSL "https://awscli.amazonaws.com/awscli-exe-linux-${ARCH_AWS}.zip" -o /tmp/awscliv2.zip \
    && unzip -q /tmp/awscliv2.zip -d /tmp \
    && /tmp/aws/install \
    && rm -rf /tmp/aws /tmp/awscliv2.zip

# Granted CLI (Identity Center friendly profile manager) — see ADR 0006
RUN curl -fsSL "https://releases.commonfate.io/granted/v0.32.0/granted_0.32.0_linux_${TARGETARCH}.tar.gz" -o /tmp/granted.tgz \
    && tar -xzf /tmp/granted.tgz -C /usr/local/bin granted assume \
    && rm /tmp/granted.tgz

# Cosign
RUN curl -fsSL "https://github.com/sigstore/cosign/releases/download/v2.4.1/cosign-linux-${TARGETARCH}" -o /usr/local/bin/cosign \
    && chmod +x /usr/local/bin/cosign

# Syft (SBOM) — pinned version + checksum
RUN SYFT_VERSION=1.23.0 \
    && ARCH_SYFT=$([ "${TARGETARCH}" = "arm64" ] && echo "arm64" || echo "amd64") \
    && CHECKSUM=$([ "${TARGETARCH}" = "arm64" ] \
         && echo "8119429a83a38ee174129413a1452586362f91342b84d963a3b277995c29ea18" \
         || echo "c51b3f0104a28fee233eee07de22d6e73704d1be5c40b34b81ec749a5f37efc3") \
    && curl -fsSL "https://github.com/anchore/syft/releases/download/v${SYFT_VERSION}/syft_${SYFT_VERSION}_linux_${ARCH_SYFT}.tar.gz" -o /tmp/syft.tar.gz \
    && echo "${CHECKSUM}  /tmp/syft.tar.gz" | sha256sum -c - \
    && tar -xzf /tmp/syft.tar.gz -C /usr/local/bin syft \
    && rm /tmp/syft.tar.gz

# osv-scanner (CVE scan) — pinned version + checksum
RUN OSV_VERSION=2.3.8 \
    && CHECKSUM=$([ "${TARGETARCH}" = "arm64" ] \
         && echo "8158b18edd2d03b1a30d905ca91b032bc62262167be8f206c27114f08823e27c" \
         || echo "bc98e15319ed0d515e3f9235287ba53cdc5535d576d24fd573978ecfe9ab92dc") \
    && curl -fsSL "https://github.com/google/osv-scanner/releases/download/v${OSV_VERSION}/osv-scanner_linux_${TARGETARCH}" -o /usr/local/bin/osv-scanner \
    && echo "${CHECKSUM}  /usr/local/bin/osv-scanner" | sha256sum -c - \
    && chmod +x /usr/local/bin/osv-scanner

# mise (tool version manager) — pinned version + checksum
RUN MISE_VERSION=2026.5.5 \
    && ARCH_MISE=$([ "${TARGETARCH}" = "arm64" ] && echo "arm64" || echo "x64") \
    && CHECKSUM=$([ "${TARGETARCH}" = "arm64" ] \
         && echo "084487717ba01adb233ceb26fa897532fc206476fd4bda97b147deb36e5b5148" \
         || echo "3aaab5c05a8a94a93b42b4f581779bbd5c44ddb251e7f3639fc671ec5c6aab8a") \
    && curl -fsSL "https://github.com/jdx/mise/releases/download/v${MISE_VERSION}/mise-v${MISE_VERSION}-linux-${ARCH_MISE}" -o /usr/local/bin/mise \
    && echo "${CHECKSUM}  /usr/local/bin/mise" | sha256sum -c - \
    && chmod +x /usr/local/bin/mise

# Docker CLI + buildx (docker-in-docker via devcontainer feature provides daemon)
RUN install -m 0755 -d /etc/apt/keyrings \
    && curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg \
    && chmod a+r /etc/apt/keyrings/docker.gpg \
    && echo "deb [arch=${TARGETARCH} signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu noble stable" \
      > /etc/apt/sources.list.d/docker.list \
    && apt-get update \
    && apt-get install -y --no-install-recommends docker-ce-cli docker-buildx-plugin \
    && rm -rf /var/lib/apt/lists/*

USER vscode
WORKDIR /workspaces/monorepo
