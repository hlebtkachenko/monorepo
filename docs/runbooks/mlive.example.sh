#!/usr/bin/env bash
# Afframe Brain — live operator session environment (W1.6, collapsed M0.2a).
#
# COMMITTED TEMPLATE — SECRET-FREE. This file carries ONLY a placeholder. Never paste a real API key,
# raw agent key, or auth token here. Copy it to the gitignored local file, fill in the real value there,
# and source THAT:
#
#   cp docs/runbooks/mlive.example.sh docs/runbooks/mlive.local.sh
#   $EDITOR docs/runbooks/mlive.local.sh   # paste the real agent key
#   source docs/runbooks/mlive.local.sh
#
# `docs/runbooks/mlive.local.sh` is gitignored (.gitignore -> mlive.local.sh). Keep it chmod 600.
# See docs/runbooks/BRAIN-OPERATOR-SESSION.md for the full procedure.
#
# [M0.2a] ONE-PASTE ONBOARDING: `brain run` / `brain book` / `brain extract --live` need ONLY BRAIN_API_KEY.
# `resolveBrainEnv` (apps/cli/src/brain/env.ts) defaults everything else. The client no longer pre-blocks on
# BRAIN_RUNTIME_ACTIVE / BRAIN_LIVE at all — the SERVER admission lane is the real authority and still HELDs/
# rejects every write regardless of the client; an admission-refused run now prints a clean lane-off message
# instead of those two vars being required up front.

# --- The RAW agent key issued via admin -> Platform -> API keys -> "Issue Brain agent key". ---
# actor_kind='agent', user-bound. Resolves org + workspace + responsible user server-side. Shown once.
# PLACEHOLDER — put the real value in mlive.local.sh, never here. This is the ONE required paste.
export BRAIN_API_KEY="<PASTE-RAW-AGENT-KEY-IN-mlive.local.sh>"

# --- Everything below is OPTIONAL — uncomment only to override a default. ---

# The deployed REST API BASE URL (NOT an /mcp path). Defaults to the production base
# (https://api.afframe.com) when unset. Override to point at staging or a local container.
# export BRAIN_MCP_ENDPOINT="https://api.afframe.com"

# Agent-SDK auth for the NESTED Claude subprocess (the model that runs OCR + booking). Defaults to the
# literal "ambient": on your OWN Mac where Claude Code is logged in, the nested session uses THIS machine's
# existing Claude Code login — no Anthropic token required (proven live 2026-07-07). Only set a real
# `sk-ant-...` API key if you run somewhere with NO Claude Code login.
# export BRAIN_AGENT_SDK_AUTH="ambient"

# Sanity echo (prints names only, never values).
echo "Brain live env loaded: BRAIN_API_KEY (BRAIN_MCP_ENDPOINT / BRAIN_AGENT_SDK_AUTH default unless overridden)"
