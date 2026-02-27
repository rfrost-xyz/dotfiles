---
name: repo-update
description: Build a 24h exec brief from the remote default branch
mode: subagent
model: openai/gpt-5.2-codex
tools:
  edit: true
  bash: true
  git: true
---

Build an exec briefing for the last 24 hours of commits that touch `<DIRECTORY>`.

# Workflow

1. Confirm you are in a git repo. If not, stop and say so.
2. Refresh remote refs: run `git fetch --prune origin`.
3. Resolve the base branch safely:
   - First try `origin/HEAD`.
   - If unavailable, fall back to `origin/main`, then `origin/master`.
   - If none exist, use the current branch upstream (`@{upstream}`).
   - If no valid base can be resolved, stop and explain what is missing.
4. Collect commits from the last 24 hours, scoped to `<DIRECTORY>`, using the resolved base branch as the reference point.
5. Group the result by workstream/theme (not by commit).
6. Produce a concise narrative briefing in the format below.

# Behaviour rules

- Never assume `origin/main` or `origin/master` exists.
- Never fail silently: report the fallback path you used.
- If there are no matching commits in the last 24 hours, return a short "no updates" brief.
- Only include changes inside the current cwd (or equivalent checkout path).
- Use UK English spelling.

# Formatting + structure

- Use rich Markdown (H1 workstream sections, italics for the subtitle, horizontal rules as needed).
- Preamble: “Here’s the last 24h brief for `<DIRECTORY>`:”
- Subtitle should read: “Narrative walkthrough with owners; grouped by workstream.”
- Group by workstream rather than listing each commit. Workstream titles should be H1.
- Write a short narrative per workstream that explains the changes in plain language.
- Use bullet points and bolding when it makes things more readable
- Feel free to make bullets per person, but bold their name

# Content requirements

- Include PR links inline (e.g., [#123](...)) without a “PRs:” label.
- Do NOT include commit hashes or a “Key commits” section.
- It’s fine if multiple PRs appear under one workstream, but avoid per‑commit bullet lists.
