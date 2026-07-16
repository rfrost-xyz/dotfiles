# CR review procedure

Full workflow for reviewing one or more CRs. Identifier normalisation and
the platform-neutral terminology are defined in SKILL.md.

## Modes

- **Single mode**: one identifier. Full review, one review note.
- **Chain mode**: two or more identifiers. Full review on each,
  sequentially, each in its own worktree; one note per CR plus a final
  consolidated rundown. Mixed GitLab and GitHub identifiers are allowed.
  Process in the order supplied; if no order was given, ask whether to use
  submission order, target-branch proximity, or label priority.

## Environment assumptions

- `wt` (worktrunk) on `$PATH`; `~/.config/worktrunk/config.toml` defines the
  worktree path template.
- `glab` authenticated for GitLab MRs (typically `git.squintopera.com`);
  `gh` authenticated for GitHub PRs. Only the CLI for the requested
  platform is required; do not demand both up front.
- Repos are bare with sibling worktrees (see the git skill).
- Default branch is `main` unless the project config says otherwise.

If a required tool is missing or unauthenticated, stop and surface the gap
instead of guessing.

## Workflow per CR

Run in order. Do not parallelise across CRs in chain mode.

### 1. Enter the worktree

- Record the platform (`gitlab` or `github`) and numeric ID from the
  normalised shortcut.
- Run `wt switch <shortcut> --format json --no-cd` from any existing
  worktree or the bare repo. Capture `worktree_path` from the JSON and use
  it as the working directory for every subsequent command (`-C
  <worktree_path>` for git).
- `--no-cd` because commands are scripted; the path is wanted, not an
  interactive directory change.
- Do not pass `--create` (`mr:<n>`/`pr:<n>` resolve to existing branches;
  worktrunk disallows it) and do not pass `--clobber` automatically. On
  "Path occupied" or "Stale directory", stop and surface the message.
- For fork CRs, worktrunk fetches the head ref and sets `pushRemote` to the
  fork. If a local branch with the source-branch name already tracks
  something else, surface this rather than overwriting.
- Treat the worktree as read-only for the whole review. No edits, no
  commits, no branch switches.

### 2. Pull CR metadata

**GitLab**: `glab mr view <iid> --output json` — capture `title`, `author`,
`source_branch`, `target_branch`, `web_url`, `description`, `labels`,
`draft`, `merge_status`, `head_pipeline.status`. Cross-check
`source_branch` against `branch` from the `wt switch` JSON; a mismatch
means the MR was rebased or retargeted, so re-run step 1.

**GitHub**: `gh pr view <num> --json
title,author,headRefName,baseRefName,url,body,labels,isDraft,mergeable,mergeStateStatus,statusCheckRollup,headRepositoryOwner,headRepository`
and map to the same slots. Cross-check `headRefName` the same way. Note
whether the PR is from a fork (`headRepositoryOwner.login` differs from the
upstream owner).

If `target_branch` is not `main`, flag it and confirm before proceeding.

### 3. Gather review material

Git (both platforms), parallel where possible:

- `git log --oneline <target_branch>..HEAD` — commit list
- `git diff --stat <target_branch>...HEAD` — file scope
- `git diff <target_branch>...HEAD` — full diff; ground every observation
  in it and cite `path:line`

Platform CLI:

- GitLab: `glab mr diff <iid>`, `glab mr view <iid> --comments`
- GitHub: `gh pr diff <num>`, `gh pr view <num> --comments`

Project conventions from the repo: `CLAUDE.md` / `AGENTS.md` at root,
`CONTRIBUTING.md` if present. These define the project-specific checks in
step 4.

### 4. Run the checklist

Apply every relevant item; name skipped items in the note with the reason,
never silently drop them.

**Behaviour parity** (any runtime-code change):

- Public API surface: signatures, CLI flags, exit codes, env vars —
  intentional or accidental changes?
- Logging and error messages preserved where downstream tools or humans
  rely on their shape?
- Side effects (filesystem, network, subprocess) all intentional?

**Refactor-specific** (when the CR is labelled or shaped as a refactor):

- Old logic fully replaced, not deprecated. No shim left behind.
- Helper signatures are the minimum viable surface; no speculative
  parameters.
- Each commit independently green so `git bisect` works.

**Commit hygiene** (conventions in the git skill):

- Every subject is Conventional; no "WIP", "fixup", or merge commits in the
  branch history.
- Subjects describe the change, not the workstream label.
- Each commit reviewable in isolation.

**Tests**:

- Test tree mirrors source tree.
- Every bug fix has a regression test that would fail without the fix.
- New helpers have unit tests, not just coverage via callers.
- No real network or filesystem writes outside temp dirs.
- Pre-existing tests untouched, or modified with justification (loosened
  asserts are a red flag; asserting the same behaviour from a new vantage
  point is fine).

**Typing and style** (adapt to the project's language and linters):

- Public surfaces annotated where the language supports it; no new
  suppressions (`# type: ignore`, `# noqa`, `@ts-ignore`, bare `except:` or
  equivalent).
- Imports and file layout follow the project's established grouping.
- No magic strings where a registry/enum pattern is established.

**Project-specific checks**:

- Derive from the repo's `CLAUDE.md` / `AGENTS.md` / `CONTRIBUTING.md`:
  docs or manifests that must track code changes, task-runner conventions,
  required generators.
- Run the project's own lint, type-check, and test entry points if the
  toolchain is set up locally, scoped to the changed packages; only flag
  new findings on changed files. Note anything skipped because the
  toolchain was unavailable.

**Red-flag grep over the diff**:

- `TODO`, `FIXME`, `XXX`, `HACK` introduced by this branch
- Debug prints in non-CLI modules
- New mutable default args
- New sleeps in hot paths
- New broad catch-all exception handlers
- Hardcoded paths under `/home`, `/Users`, `C:\\`
- Secrets-shaped strings (`api_key`, `token`, `password` followed by `=`
  and a literal)

Never run `git push`, `glab mr merge`, `gh pr merge`, `gh pr close`,
`glab mr close`, destructive cleanup commands, or any mutating CR action
during a review.

### 5. Render the review note in-session

Reply in chat; write no files. Use this structure verbatim, omitting only
sections that genuinely have nothing (and saying so). Platform-specific
header: `MR !<iid>` or `PR #<num>`.

```markdown
# <MR !<iid> | PR #<num>>: <title>

- **Platform**: <gitlab | github>
- **Author**: <name>
- **Source**: <source_branch>
- **Target**: <target_branch>
- **URL**: <web_url>
- **Checks**: <pipeline_status | statusCheckRollup_summary>

## Verdict

One of: `approve`, `approve-with-nits`, `request-changes`, `block`.
One sentence justifying the verdict.

## Summary of changes

2-4 bullets describing what the CR actually does, grounded in the diff.

## Findings

### Blocking

- `path:line` — what is wrong, why it blocks, what the fix looks like.

### Non-blocking

- `path:line` — observation and suggested follow-up.

### Nits

- `path:line` — style or wording suggestions.

## Checklist results

Tabulate which checklist sections passed, failed, and were skipped (with
reason).

## Suggested reply

A drafted comment the user can paste verbatim into the MR or PR. Markdown,
friendly, specific, references `path:line`, follows the no-bullshit prose
rules. Match the destination platform's conventions (`@username` mentions,
`Closes #N`).
```

### 6. Hand off

- Do not post the comment; the user reviews and posts.
- Leave the worktree in place; do not run `wt remove`.

## Chain mode rundown

After the last CR, render in-session:

- One row per CR: platform + ID, title, verdict, blocking-finding count.
- Cross-CR observations: shared root causes, conflicts, ordering
  dependencies between branches.

Each `wt switch` call returns its worktree path independently; just rebind
the working directory per CR.

## Stop conditions

Stop and ask before continuing on:

- A CR targeting a branch other than `main`.
- Merge conflicts (GitLab `merge_status != "can_be_merged"`; GitHub
  `mergeable != "MERGEABLE"` or a conflicted `mergeStateStatus`).
- A draft CR — the user may not want a full review yet.
- Failing required checks where the failure is in the CR's own changes.
- A CR larger than ~1000 changed lines or ~30 files (suggest splitting the
  review).
- Any tool (`glab`, `gh`, `wt`) returning an unexpected error.
- An ambiguous bare-number identifier.
