---
name: git
description: Git conventions for all repos — bare-repo worktrees via worktrunk, Conventional Branches, atomic Conventional Commits, daily rebase onto origin/main, force-with-lease pushes, no LLM attribution. Load for any git work, committing, branching, or history editing. For MR/PR authoring and review, see change-request.
allowed-tools: Bash Read Edit Write Grep Glob Agent
---

Git conventions. Apply to every repo unless the repo or user says otherwise.
MR/PR authoring and review live in the change-request skill; worktree
mechanics live in the worktrunk skill.

# Workflow

- All changes reach `main` through a change request. Never commit directly to
  `main`; branch first.
- Repos are bare with sibling worktrees, managed by worktrunk (`wt`). Work in
  a worktree, never in the bare repo. See the worktrunk skill for `wt` usage.
- Rebase onto `origin/main` at least daily; never merge `main` into your
  branch; push with `git push --force-with-lease`.

# Branches

- Conventional Branches: one of five prefixes only, `feat/`, `fix/`,
  `hotfix/`, `release/`, `chore/`, plus a short kebab description, e.g.
  `feat/add-export-command`, `release/v1.2.0`. Branches use only these five;
  commits use the full type set, so a `docs:` or `refactor:` commit lives on
  a `chore/` or `feat/` branch.
- Issue numbers are optional. Prefer a short descriptive branch such as
  `feat/scaffold-crate`; use `feat/scaffold-crate-issue-1` only when the
  project explicitly wants issue numbers in branch names.

# Commits

- One logical change per commit. If staged + unstaged span multiple concerns,
  split them.
- Subject: `<type>(scope): <description>`. Lowercase, imperative, no trailing
  period, <=72 chars.
- Types: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`,
  `ci`, `chore`, `revert`.
- Scope (optional): a noun for the area touched, e.g. `feat(cli):`. Add one
  only when it narrows the change for a reader; default to none.
- Body: omit by default. Include only when the _why_ is non-obvious. ~30
  words max. Human prose, terse - no LLM waffle, no bullet lists of the diff.
- Breaking change: append `!` before `:` and/or add `BREAKING CHANGE:`
  footer.
- NEVER add `Co-Authored-By`, `Generated with`, or any LLM attribution. No
  trailers unless the user asked.

# Committing procedure

1. `git status` and `git diff` (staged + unstaged) to inventory changes.
2. Group hunks by logical intent. Reset the index if needed (`git reset`) and
   stage groups with `git add -p` or explicit paths.
3. For each group: pick the narrowest accurate type, write a terse subject.
   Add a body only if a reader would ask "why" from the diff alone.
4. Commit via heredoc to preserve formatting:

   ```
   git commit -m "$(cat <<'EOF'
   <type>(<scope>): <description>
   EOF
   )"
   ```

5. After all commits: `git log --oneline <base>..HEAD` to confirm the
   sequence reads as a clean story.

# Splitting heuristics

- Refactor + feature in same file → two commits (`refactor:` first, then
  `feat:`).
- Fix + unrelated cleanup → split.
- Test added for an existing fix on this branch → squash into the `fix:`
  commit, do not create a separate `test:`.
- Generated files / lockfiles → bundle with the change that caused them.
- Formatting-only churn → `style:`, kept separate from logic changes.

# Anti-patterns

- "various improvements", "update files", "wip" — reject, rewrite.
- Restating the diff in the body.
- Padding subjects with motivation that belongs in the body.
- Footers, sign-offs, or attribution the user did not request.
