# Conductor Worktree Health Runbook

Operational runbook for agents working in a Conductor worktree. Run the health
check at the start of every session and follow the prevention rule throughout.

## What Conductor is

Conductor runs many agents in parallel, each in its own **git worktree**. One
shared object store, many checkouts:

```
repos/monorepo/.git                       <- shared objects + refs
repos/monorepo/.git/worktrees/<name>/      <- this session's private metadata
  index          <- per-worktree staging area
  index.lock     <- exclusive write lock
  HEAD           <- which branch this worktree is on
  rebase-merge/  <- rebase state, when mid-rebase
```

Each worktree has its own `index`, `HEAD`, and lock files, but they all share
the same object database under the main repo's `.git`.

## Why corruption happens

1. A mutating git command (`rebase`, `checkout -B`, `reset --hard`, `clean`,
   `cherry-pick`) is run.
2. The harness backgrounds it, so the `git` process keeps running after the
   tool call returns.
3. A backgrounded `git` process holds `.git/worktrees/<name>/index.lock` until
   it exits.
4. The next git command fires before the previous one finished:
   `fatal: Unable to create '.../worktrees/<name>/index.lock': File exists.`
5. Removing the lock with `rm` while the original process is still alive lets
   the live writer recreate it and risks index corruption.
6. A backgrounded `rebase` raced by a foreground `git status` can lose
   `rebase-merge/git-rebase-todo`, breaking `git rebase --continue`.
7. A `checkout -B` whose worktree/index update was blocked moves the branch ref
   while files on disk stay stale, leaving the worktree in a mixed state.

## Three anti-patterns — never do these in a worktree

1. Chaining or backgrounding **mutating** git commands.
2. `rm`-ing a lock file without an `lsof` check first.
3. Issuing a new git command before the previous git process has exited.

## Health check — run at the start of every session

**DETECT** (paths resolved by git itself, worktree-aware):

```bash
git worktree list                              # note prunable / locked entries
git rev-parse --git-path index.lock            # exact lock path for THIS worktree
git rev-parse --git-path rebase-merge          # rebase-in-progress dir
git rev-parse --git-path MERGE_HEAD            # merge-in-progress marker
git rev-parse --git-path CHERRY_PICK_HEAD      # cherry-pick-in-progress marker
```

**CLASSIFY** — stale vs live (the critical step):

```bash
lsof "$(git rev-parse --git-path index.lock)" 2>/dev/null
#   holder PID present  -> LIVE  -> DO NOT touch, wait
#   no output           -> STALE -> safe to remove
```

**ACT:**

| Finding | Action |
|---------|--------|
| STALE `index.lock` (no lsof holder) | `rm` it |
| LIVE lock | wait; if the process is genuinely hung, `kill <PID>`, then remove |
| `rebase-merge/` present, no live git | `git rebase --abort` |
| `MERGE_HEAD` present, no live git | `git merge --abort` |
| `CHERRY_PICK_HEAD` present, no live git | `git cherry-pick --abort` |
| ref/worktree mismatch, commits on remote | `git reset --hard @{u}` |
| worktree marked `prunable` | `git worktree prune` |

**VERIFY:**

```bash
test ! -e "$(git rev-parse --git-path index.lock)" && echo "no lock OK"
git status --short        # clean-ish
git rev-parse HEAD        # == expected SHA
```

## Prevention rule

For any agent operating in a worktree: never background a mutating git command,
run one git command per tool call, and wait for it to exit before the next.
