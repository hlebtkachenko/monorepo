#!/usr/bin/env bash
# Afframe Brain — live operator session environment (W1.6).
#
# COMMITTED TEMPLATE — SECRET-FREE. This file carries ONLY placeholders. Never paste a real API key,
# raw agent key, or auth token here. Copy it to the gitignored local file, fill in the real values there,
# and source THAT:
#
#   cp docs/runbooks/mlive.example.sh docs/runbooks/mlive.local.sh
#   $EDITOR docs/runbooks/mlive.local.sh   # paste real creds
#   source docs/runbooks/mlive.local.sh
#
# `docs/runbooks/mlive.local.sh` is gitignored (.gitignore -> mlive.local.sh). Keep it chmod 600.
# See docs/runbooks/BRAIN-OPERATOR-SESSION.md for the full procedure.

# --- The write-lane kill-switch. MUST be exactly "1" for `brain book` / `brain run` to run live. ---
# A set-but-not-"1" value is still closed. `brain extract` does NOT need this (it never books).
export BRAIN_RUNTIME_ACTIVE="1"

# --- Explicit opt-in that live creds are present and you intend a real session. ---
export BRAIN_LIVE="1"

# --- The deployed REST API BASE URL (NOT an /mcp path). ---
# The CLI spawns a LOCAL stdio MCP bridge (the `@afframe/mcp` server run via `tsx` from inside this monorepo —
# no build step) which reaches prod as an ordinary outbound HTTPS client at this base (its `AFFRAME_API_BASE`).
# The var name is kept `BRAIN_MCP_ENDPOINT` for continuity; only its meaning is the REST base.
export BRAIN_MCP_ENDPOINT="https://api.afframe.com"

# --- The RAW agent key issued via admin -> Platform -> API keys -> "Issue Brain agent key". ---
# actor_kind='agent', user-bound. Resolves org + workspace + responsible user server-side. Shown once.
# PLACEHOLDER — put the real value in mlive.local.sh, never here.
export BRAIN_API_KEY="<PASTE-RAW-AGENT-KEY-IN-mlive.local.sh>"

# --- Agent-SDK auth. A subscription-auth token for dev sessions, OR an sk-... API key. ---
# PLACEHOLDER — put the real value in mlive.local.sh, never here.
export BRAIN_AGENT_SDK_AUTH="<PASTE-AGENT-SDK-AUTH-IN-mlive.local.sh>"

# Sanity echo (prints names only, never values).
echo "Brain live env loaded: BRAIN_RUNTIME_ACTIVE, BRAIN_LIVE, BRAIN_MCP_ENDPOINT, BRAIN_API_KEY, BRAIN_AGENT_SDK_AUTH"
