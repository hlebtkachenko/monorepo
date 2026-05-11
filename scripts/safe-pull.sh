#!/usr/bin/env bash
set -euo pipefail
IFS=$'\n\t'

# safe-pull -- fetch + ff-only pull with collision and dirty-tree guards.

info() { printf '\033[1;34minfo\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33mwarn\033[0m %s\n' "$*" >&2; }
err()  { printf '\033[1;31merr\033[0m  %s\n' "$*" >&2; exit 1; }

main() {
  git rev-parse --git-dir >/dev/null 2>&1 || err "not in a git repo"

  info "fetch --prune"
  git fetch --prune

  upstream=$(git rev-parse --abbrev-ref --symbolic-full-name '@{u}' 2>/dev/null) || \
    err "no upstream set for $(git rev-parse --abbrev-ref HEAD)"

  ahead_behind=$(git rev-list --left-right --count "@{u}...HEAD")
  behind=$(echo "$ahead_behind" | awk '{print $1}')
  ahead=$(echo "$ahead_behind" | awk '{print $2}')

  if [ "$behind" = "0" ]; then
    info "already up to date with $upstream"
    exit 0
  fi

  info "$behind incoming, $ahead local commits"

  incoming_files=$(git diff --name-only HEAD.."@{u}" || true)
  if [ -n "$incoming_files" ]; then
    untracked=$(git ls-files --others --exclude-standard)
    collisions=""
    if [ -n "$untracked" ]; then
      collisions=$(comm -12 <(echo "$untracked" | sort -u) <(echo "$incoming_files" | sort -u) || true)
    fi
    if [ -n "$collisions" ]; then
      warn "untracked files would be overwritten by merge:"
      echo "$collisions" | sed 's/^/  /'
      err "move to _junk/ or remove before pulling"
    fi
  fi

  info "pull --ff-only --autostash"
  git pull --ff-only --autostash
  info "done"
}

main "$@"
