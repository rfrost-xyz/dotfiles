---
name: change-lifecycle
description: Orchestrate an end-to-end repository change through OpenSpec, worktrunk worktrees, Git and GitHub PRs or GitLab MRs. Use when the user asks to start, continue, finish, archive, merge or clean up a repository change.
allowed-tools: Bash Read Edit Write Grep Glob Agent
---

Coordinate the lifecycle. Do not duplicate the specialist skills: load
no-bullshit, git and worktrunk for every lifecycle; load change-request for
PR or MR work; load the repository's OpenSpec skills when `openspec/` exists.
Load fleet only when shared chezmoi configuration or a remote host is in
scope.

## Defaults

- One independently reviewable OpenSpec change maps to one worktree, branch
  and PR or MR by default.
- Do not apply a programme or master OpenSpec change when its tasks require
  smaller follow-up changes.
- Create branches from `origin/main`, rebase onto `origin/main`, and never
  merge `main` into a feature branch.
- Use rebase merge only when the user explicitly authorises merging.
- Keep OpenSpec task checkboxes as verified implementation evidence, not as
  a substitute for commits or PR review.
- Do not merge, archive with warnings, delete branches or remove worktrees
  without explicit user authorisation for that action.
- Confirm the required tools before work begins: `git`, `wt`, the relevant
  forge CLI, and OpenSpec when the repository uses it. If an active host
  lacks one, use fleet to select an equipped host. Do not install tools as a
  workaround.

## Start a new change

1. Inspect repository state, worktrees, active OpenSpec changes and project
   instructions.
2. Create a conventional branch and worktree with worktrunk.
3. Use `openspec-propose` when a new OpenSpec change is needed.
4. Stop after planning artefacts are complete. Proposal work authorises
   planning only; wait for an explicit request before applying the change.
5. Commit planning artefacts and create a draft PR or MR when the user asks
   to publish the plan or the request covers end-to-end delivery.

## Apply a planned change

1. Use `openspec-apply-change <change-name>`.
2. Read every CLI-reported context artefact before implementation.
3. Implement in task order unless the specification requires a different
   dependency order.
4. Run each task's verification before marking its checkbox complete.
5. Commit coherent completed work, rebase before pushing and update the
   draft PR or MR.
6. Stop and ask when a task is ambiguous, blocked or requires a design or
   scope change. Use `openspec-update-change` for planning revisions.

## Verify and archive

1. Run the repository's required checks and strict OpenSpec validation.
2. Confirm every task is complete and its acceptance evidence is available.
3. Use `openspec-archive-change <change-name>`.
4. Assess and, when selected, synchronise delta specs into canonical
   `openspec/specs/` before archiving.
5. Commit the synchronised specs and archive move, then mark the PR or MR
   ready for review.

## Merge and clean up

1. Confirm review status, mergeability and required checks.
2. Merge only with explicit current-session authorisation.
3. Use the platform's rebase-merge mode.
4. Rebase local `main` onto `origin/main`.
5. Remove the merged worktree and branch through worktrunk.
6. Confirm `main`, `origin/main`, worktrees, local branches and remote
   branches separately.

## Managed configuration and fleet changes

- Identify chezmoi-managed targets with `chezmoi source-path`.
- Edit the chezmoi source worktree, never its rendered target under `$HOME`.
- Treat the dotfiles repository as the change repository and apply the same
  branch, PR or MR, rebase and cleanup lifecycle.
- Run lifecycle control from iapetus or another equipped host. Do not assume
  an omaterm remote exposes `wt`, a forge CLI or OpenSpec in its agent path.
- Use fleet to determine every consuming host and required host-specific
  templating before changing shared configuration.
- Inspect targeted `chezmoi diff` before applying. After merge, apply only
  the named target paths and verify them with targeted `chezmoi status`.
- Do not apply shared configuration to remote hosts without the user's
  confirmation. Report Git cleanliness and chezmoi drift separately.

## Handoff

Report the OpenSpec change, task progress, branch, worktree, PR or MR,
verification, archive state and any managed configuration targets or hosts.
