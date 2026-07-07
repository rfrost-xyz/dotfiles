---
name: playbook
description: Baseline working conventions for any git, change-request, or writing task. Bare-repo worktrees, conventional branches and commits, repo CR templates, British English, no LLM attribution, no filler prose. Load before committing, opening an MR or PR, or writing user-facing text.
---

Baseline preferences. Apply these to every task unless the repo or user says
otherwise. The git-commit, git-cr-review, and worktrunk skills carry the
detail; this is the shared baseline they sit on.

# Git workflow

- All changes reach `main` through a change request. Rebase onto `origin/main`
  at least daily; never merge `main` into your branch; push with
  `git push --force-with-lease`.
- Repos are bare with sibling worktrees, managed by worktrunk (`wt`). Work in a
  worktree, never directly in the bare repo. See the worktrunk skill for `wt`.
- Branch names follow Conventional Branches: one of five prefixes only,
  `feat/`, `fix/`, `hotfix/`, `release/`, `chore/`, plus a short kebab
  description, e.g. `feat/add-export-command`, `release/v1.2.0`. Branches use
  only these five; commits use the full type set, so a `docs:` or `refactor:`
  commit lives on a `chore/` or `feat/` branch.
- Issue numbers are optional in branch names. Prefer a short descriptive branch
  such as `feat/scaffold-crate`; use `feat/scaffold-crate-issue-1` only when the
  project explicitly wants issue numbers in branch names.
- Commits are atomic and Conventional: `<type>[scope]: <description>`. One
  logical change each. Add a scope only when it narrows the change for a reader
  (usually a package or subsystem); default to none. See the git-commit skill
  for the full type set, splitting, and body rules.

# Change requests (MRs and PRs)

- Open a CR as soon as the branch has meaningful work; mark it draft while in
  progress, and request review when it is ready.
- Use the repo's CR template from `.gitlab/` or `.github/` (merge or pull
  request templates). Fill the sections the template asks for; do not invent a
  different structure.
- Title is a Conventional Commit subject. Keep the body terse: what changed and
  why, never a restatement of the diff.
- When a CR is intended to resolve an issue, include the platform's closing
  keyword in the CR description, e.g. `Closes #1` for GitLab/GitHub issues.
- See the git-cr-review skill when reviewing someone else's CR.

# No LLM attribution

- Never add `Co-Authored-By`, `Generated with`, "Authored by Claude", or any
  AI or LLM trailer or mention to a commit, MR, PR, or its description. No
  trailers the user did not ask for.

# Prose

- British English everywhere: commits, CR text, code (comments and the
  identifiers you author), docs, content (organise, colour, behaviour, licence
  as the noun).
  - Exception: keep the required spelling when a language, API, or library
    mandates it (CSS `color`, an upstream `initialize` hook, a field named
    `license`). Match the identifier, not the prose rule.
- No em or en dashes as clause separators. Use a comma, full stop, or
  parentheses.
- No filler. Cut "in order to", "it's worth noting", "comprehensive",
  "robust", "seamless", "leverage", "delve". State the thing plainly.
- Concise by default. Add a description or body only when a reader cannot get
  the *why* from the change itself.
