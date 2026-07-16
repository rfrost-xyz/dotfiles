---
name: change-request
description: Author and review GitLab MRs and GitHub PRs. Load when creating, updating, describing, or submitting an MR or PR, and when reviewing one (review runs in an isolated worktrunk worktree with a structured note). Covers templates, titles, draft etiquette, closing keywords, and the review checklist.
allowed-tools: Bash Read Edit Write Grep Glob Agent
---

Authoring and reviewing change requests. "CR" is the platform-neutral term
covering GitLab merge requests and GitHub pull requests; in user-facing
output use the platform term: "MR !1234" for GitLab, "PR #1234" for GitHub.
Branch and commit conventions live in the git skill; prose style in
no-bullshit.

# Identifiers

Accept any of these and normalise to a worktrunk shortcut:

- `mr:1234` (GitLab MR) or `pr:1234` (GitHub PR) — preferred, matches
  `wt switch` syntax verbatim
- `!1234` → `mr:1234`; `#1234` → `pr:1234`
- GitLab URL `.../-/merge_requests/<N>` → `mr:<N>`; GitHub URL
  `.../pull/<N>` → `pr:<N>`

A bare number is ambiguous: ask which platform before doing any work. Do not
guess from the current directory.

# Authoring

- Open a CR as soon as the branch has meaningful work; mark it draft while
  in progress, and request review when it is ready.
- Use the repo's CR template from `.gitlab/merge_request_templates/` or
  `.github/` (pull request template). Fill the sections the template asks
  for; do not invent a different structure. If no template exists, keep the
  body to what changed and why.
- Title is a Conventional Commit subject (see the git skill for the format).
- Body is terse: what changed and why, never a restatement of the diff.
- When the CR resolves an issue, include the platform's closing keyword in
  the description, e.g. `Closes #1`.
- No LLM attribution or trailers anywhere in the CR.

Commands:

- GitLab: `glab mr create --draft --title "<subject>" --description "$(cat
  <<'EOF' ... EOF)"`; update with `glab mr update`. Mark ready with
  `glab mr update --ready`.
- GitHub: `gh pr create --draft --title "<subject>" --body "$(cat <<'EOF'
  ... EOF)"`; update with `gh pr edit`. Mark ready with `gh pr ready`.
- Heredocs preserve template formatting; never inline a multi-section body
  in `-m`-style quoting.

Never merge, close, or approve a CR unless the user explicitly asks for
that action in this session.

# Reviewing

Reviews run in an isolated worktrunk worktree, read-only, one CR at a time,
and produce a structured review note in-session (no files written, nothing
posted to the platform). Full procedure, checklist, note format, chain mode,
and stop conditions: read `references/review.md` before starting any
review.

Summary of the flow:

1. Normalise the identifier; `wt switch <shortcut> --format json --no-cd`
   and use the returned `worktree_path` for all commands.
2. Pull CR metadata via `glab mr view --output json` or `gh pr view --json`.
3. Gather the diff, commit list, comments, and the repo's own conventions
   (`CLAUDE.md`, `AGENTS.md`, `CONTRIBUTING.md`).
4. Run the checklist; grep the diff for red flags.
5. Render the review note in-session with a verdict (`approve`,
   `approve-with-nits`, `request-changes`, `block`) and a suggested reply
   the user can paste.
6. Leave the worktree in place; post nothing.
