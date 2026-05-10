#!/usr/bin/env bash
set -e

pnpm install --frozen-lockfile
pnpm prepare 2>/dev/null || true
