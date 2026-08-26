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
- A lifecycle request to start, work on, deliver or finish a change runs end
  to end through a merge-ready PR or MR unless the user explicitly limits
  the request to planning or another intermediate outcome.
- Continue unaided through planning, implementation, verification, review
  remediation, spec synchronisation, archive and publication. Pause only for
  genuine ambiguity that materially changes intent, work outside the accepted
  scope, missing authority or credentials, or an external blocker that cannot
  be resolved safely.
- Treat an explicit plan-only or proposal-only request as planning authority
  only. Do not infer implementation authority from `openspec-propose` alone.
- Create branches from `origin/main`, rebase onto `origin/main`, and never
  merge `main` into a feature branch.
- Use rebase merge only when the user explicitly authorises merging.
- Keep OpenSpec task checkboxes as verified implementation evidence, not as
  a substitute for commits or PR review.
- Never archive with warnings during end-to-end delivery. Resolve the warning
  or stop at a genuine blocker.
- Do not merge, delete branches or remove worktrees without explicit user
  authorisation for that action.
- Confirm the required tools before work begins: `git`, `wt`, the relevant
  forge CLI, and OpenSpec when the repository uses it. If an active host
  lacks one, use fleet to select an equipped host. Do not install tools as a
  workaround.

## Select the delivery mode

- **End-to-end:** Use by default for lifecycle requests. The terminal outcome
  is a cleanly reviewed, synchronised, archived and published PR or MR ready
  for human review.
- **Plan-only:** Use only when the user explicitly asks to plan, propose or
  stop before implementation. The terminal outcome is committed planning
  artefacts; publish a draft PR or MR only when requested.
- A user-specified intermediate outcome overrides these defaults. Stop at that
  outcome without silently advancing further.

## Start and plan a change

1. Inspect repository state, worktrees, active OpenSpec changes and project
   instructions.
2. Create a conventional branch and worktree with worktrunk.
3. Use `openspec-propose` when a new OpenSpec change is needed.
4. Review the proposal, delta specs, design and tasks together for scope,
   acceptance coverage, dependency order and architectural coherence. Correct
   planning defects before implementation.
5. Commit planning artefacts. For end-to-end delivery, continue directly to
   implementation and open a draft PR or MR once the branch has meaningful
   work.
6. For plan-only delivery, stop after the requested planning and publication
   outcome.

## Apply a planned change

1. Use `openspec-apply-change <change-name>`.
2. Read every CLI-reported context artefact before implementation.
3. Implement in task order unless the specification requires a different
   dependency order.
4. Run each task's verification before marking its checkbox complete.
5. When implementation exposes an in-scope planning defect, use
   `openspec-update-change`, reconcile every affected artefact and continue
   implementation without asking the user.
6. Commit coherent completed work, rebase before pushing and update the draft
   PR or MR.
7. Stop and ask only when a task is genuinely ambiguous, blocked or requires
   a material expansion beyond the accepted intent.

## Verify, review and remediate

1. Run the repository's required checks and strict OpenSpec validation.
2. Audit every completed task against the implementation, tests and recorded
   evidence. Reopen any checkbox whose claimed behaviour is missing or
   insufficiently tested.
3. Run an independent final review against the proposal, delta specs, design,
   task evidence, repository instructions and applicable architecture
   documents. Review implementation conformance and missing negative paths,
   not merely style or whether existing tests pass.
4. Fix every in-scope finding, update planning artefacts when required, rerun
   affected checks and repeat the independent review until it has no
   actionable findings.
5. Treat an implementation or planning edit after a clean review as
   invalidating that review. Rerun the applicable checks and final review.
6. Confirm every task is complete, every acceptance claim has evidence and
   the final review is clean. This is the hold point before spec
   synchronisation and archive.

## Synchronise, archive and publish

1. Use `openspec-archive-change <change-name>` and select spec
   synchronisation when delta specs would change canonical `openspec/specs/`.
2. Verify every delta requirement and scenario is present in the canonical
   specs before archiving. Do not archive when synchronisation is incomplete
   or inconsistent.
3. Archive only with complete artefacts, complete tasks, passing gates and a
   clean final review.
4. Commit the synchronised specs and archive move.
5. Rebase onto `origin/main`, rerun checks affected by the rebase, and push
   with `--force-with-lease` when history changed.
6. Update the PR or MR description and evidence, then mark it ready for
   review.
7. Do not treat creating or archiving an OpenSpec change as creating,
   publishing or merging a PR or MR; verify each outcome separately.

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

Report the delivery mode, OpenSpec change, task progress, branch, worktree,
independent-review result, verification, spec-sync state, archive state, PR or
MR, and any managed configuration targets or hosts.
