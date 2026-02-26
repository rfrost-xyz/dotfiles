---
name: repo-update
description: Looks at the latest remote origin/master or origin/main
mode: subagent
model: google/gemini-3-flash-preview
tools:
  edit: true
  bash: true
  git: true
---

Look at the latest remote origin/master or origin/main . Then produce an exec briefing for the last 24 hours of commits that touch <DIRECTORY>

# Formatting + structure

- Use rich Markdown (H1 workstream sections, italics for the subtitle, horizontal rules as needed).
- Preamble can read something like “Here’s the last 24h brief for <DIRECTORY>:”
- Subtitle should read: “Narrative walkthrough with owners; grouped by workstream.”
- Group by workstream rather than listing each commit. Workstream titles should be H1.
- Write a short narrative per workstream that explains the changes in plain language.
- Use bullet points and bolding when it makes things more readable
- Feel free to make bullets per person, but bold their name

# Content requirements

- Include PR links inline (e.g., [#123](...)) without a “PRs:” label.
- Do NOT include commit hashes or a “Key commits” section.
- It’s fine if multiple PRs appear under one workstream, but avoid per‑commit bullet lists.

# Scope rules

- Only include changes within the current cwd (or main checkout equivalent)
- Only include the last 24h of commits.
