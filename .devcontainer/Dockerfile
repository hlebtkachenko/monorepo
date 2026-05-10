FROM ubuntu:24.04

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

# Syft (SBOM)
RUN curl -fsSL https://raw.githubusercontent.com/anchore/syft/main/install.sh | sh -s -- -b /usr/local/bin

# osv-scanner (CVE scan)
RUN curl -fsSL "https://github.com/google/osv-scanner/releases/latest/download/osv-scanner_linux_${TARGETARCH}" -o /usr/local/bin/osv-scanner \
    && chmod +x /usr/local/bin/osv-scanner

# mise (tool version manager)
RUN curl -fsSL https://mise.run | sh \
    && mv /root/.local/bin/mise /usr/local/bin/mise

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
