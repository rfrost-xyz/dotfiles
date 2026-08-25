---
name: worktrunk
description: Manage Git worktrees with worktrunk (`wt`): create and switch branches, check out PRs or MRs, and remove merged worktrees safely. Use when a task creates, switches, inspects or cleans up a worktree.
allowed-tools: Bash Read Edit Write Grep Glob Agent
---

Use worktrunk for repository worktrees. Git history conventions remain in the
git skill; PR and MR work remains in change-request.

## Prerequisites

- Confirm `wt` and `git` are available before proposing a worktree command.
- If either tool is unavailable, stop. Use fleet to select an equipped host;
  do not install packages or substitute unmanaged worktree commands.

## Create and switch

- Inspect `wt list` and `git worktree list` before creating or removing a
  worktree.
- Create a conventional branch from the current remote default branch:

  ```bash
  git fetch origin --prune
  wt switch --create <branch> --base origin/main --format json --no-cd
  ```

- Capture the `path` field from JSON and use it as the working directory.
- Work in a worktree, never the bare repository.
- Use `wt switch pr:<number>` or `wt switch mr:<number>` to inspect an
  existing change request. Do not use `--create` with a PR or MR reference.
- Do not use `--clobber` automatically. Stop if a target path is occupied or
  stale.

## Clean up

- Confirm the worktree is clean and the branch is already represented in
  `main` or `origin/main` before removal.
- Switch to another worktree before removing the current one.
- Remove safe merged work with:

  ```bash
  wt remove --foreground --yes <branch>
  ```

- Do not use `--force`, `--force-delete` or `--reap` without explicit user
  authorisation.
- Confirm local worktrees, local branches and remote branches separately.

## Safety

- Do not edit a worktree opened solely for PR or MR review.
- Preserve unrelated worktrees and branches.
- Report the branch, path and cleanup result.
