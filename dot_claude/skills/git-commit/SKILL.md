---
name: git-commit
description: Split pending changes into logical, atomic Conventional Commits. Terse human subjects; bodies only when needed. No LLM attribution.
allowed-tools: Bash Read Edit Write Grep Glob Agent
---

Make atomic Conventional Commits from the current working tree.

# Rules

- One logical change per commit. If staged + unstaged span multiple concerns, split them.
- Subject: `<type>(scope): <description>`. Lowercase, imperative, no trailing period, <=72 chars.
- Body: omit by default. Include only when the _why_ is non-obvious. ~30 words max. Human prose, keep description terse - no LLM waffle, no bullet lists of the diff.
- NEVER add `Co-Authored-By`, `Generated with`, or any LLM attribution. No trailers unless the user asked.
- Types: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`, `revert`.
- Breaking change: append `!` before `:` and/or add `BREAKING CHANGE:` footer.
- Scope (optional): a noun for the area touched, e.g. `feat(cli):`.

# Procedure

1. `git status` and `git diff` (staged + unstaged) to inventory changes.
2. Group hunks by logical intent. Reset the index if needed (`git reset`) and stage groups with `git add -p` or explicit paths.
3. For each group: pick the narrowest accurate type, write a terse subject. Add a body only if a reader would ask "why" from the diff alone.
4. Commit via heredoc to preserve formatting:

   ```
   git commit -m "$(cat <<'EOF'
   <type>(<scope>): <description>
   EOF
   )"
   ```

5. After all commits: `git log --oneline <base>..HEAD` to confirm the sequence reads as a clean story.

# Splitting heuristics

- Refactor + feature in same file → two commits (`refactor:` first, then `feat:`).
- Fix + unrelated cleanup → split.
- Test added for an existing fix on this branch → squash into the `fix:` commit, do not create a separate `test:`.
- Generated files / lockfiles → bundle with the change that caused them.
- Formatting-only churn → `style:`, kept separate from logic changes.

# Anti-patterns

- "various improvements", "update files", "wip" — reject, rewrite.
- Restating the diff in the body.
- Padding subjects with motivation that belongs in the body.
- Footers, sign-offs, or attribution the user did not request.
