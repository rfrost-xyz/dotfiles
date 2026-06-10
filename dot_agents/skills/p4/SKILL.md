---
name: p4
description: Perforce Helix Core workflow guidance for P4 workspaces, depot paths, changelists, syncs, edits, adds, deletes, resolves, reverts, reconciles, shelves, submits, filetypes, locks, and common troubleshooting. Use when Codex needs to inspect, explain, or run Perforce commands safely in a workspace.
---

# P4

Use this skill when working in a Perforce workspace or answering questions about `p4` commands. Treat Perforce as stateful: first identify the client, current open files, pending changelists, and path mapping before changing files or submitting anything.

## Operating Rules

- Prefer preview commands before broad or destructive operations: `p4 sync -n`, `p4 reconcile -n`, `p4 revert -n`, `p4 clean -n`.
- Never assume `//...` is small. Scope commands to the current project path or files the user named whenever possible.
- Check `p4 opened` before sync, reconcile, revert, resolve, or submit. Open files are the user's active work unless the user says otherwise.
- Do not submit, revert, unlock, delete, or force-sync user work without explicit user intent.
- Use changelists deliberately. Create or reuse a numbered pending changelist for related work instead of leaving large edits in `default` unless the repo's local practice says otherwise.
- Keep file paths quoted in shell examples when spaces are possible. Prefer local file paths inside a configured workspace and depot paths for depot-wide queries.
- For binary and generated assets, inspect filetype and lock requirements before edit/add. Use `+l` only when the team convention or file type requires exclusive checkout.

## First Checks

Run these before acting when context is unclear:

```bash
p4 info
p4 client -o
p4 opened
p4 changes -s pending -u "$P4USER" -c "$P4CLIENT"
p4 where .
```

Use the results to confirm the server, user, client root, client view, and whether the current directory maps to the depot.

## Workflow Decision

- **Need latest files**: Read [workflows.md](references/workflows.md#sync-safely).
- **Need to modify tracked files**: Read [workflows.md](references/workflows.md#edit-and-submit).
- **Need to add, delete, or discover local changes**: Read [workflows.md](references/workflows.md#reconcile-local-changes).
- **Need to resolve conflicts or submit**: Read [workflows.md](references/workflows.md#resolve-before-submit) and [safety.md](references/safety.md#submit-checklist).
- **Need command syntax, revision specs, filetypes, shelving, or troubleshooting**: Read [commands.md](references/commands.md).

## Daily Command Patterns

```bash
# Preview incoming updates for the current mapped tree.
p4 sync -n ...

# Sync only the current tree after checking opened files.
p4 opened
p4 sync ...

# Open tracked files for edit.
p4 edit path/to/file.ext

# Discover local adds/edits/deletes without opening them yet.
p4 reconcile -n ...

# Revert unchanged files only.
p4 revert -a ...

# Inspect changes before submit.
p4 opened
p4 diff
p4 describe -s CHANGE
```

## Safety Notes

- `p4 sync -f` overwrites files from the depot. Use only after confirming local writable changes are disposable or already captured.
- `p4 clean` can delete or overwrite local files to match the depot. Always preview with `p4 clean -n`.
- `p4 revert //...` can discard all open work in the client. Scope it narrowly and preview first.
- `p4 reconcile` opens files for add/edit/delete. Use `-n` first, then scope or move files into a changelist.
- `p4 submit -d "..."` bypasses the editor. Use it only when the requested description is complete.
