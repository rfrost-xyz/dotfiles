# P4 Safety and Troubleshooting

## Submit Checklist

Before submit:

```bash
p4 opened -c CHANGE
p4 diff
p4 revert -a ...
p4 sync ...
p4 resolve -n ...
p4 resolved
p4 change -o CHANGE
```

Check that:

- Only intended files are open.
- Generated files, local secrets, logs, caches, and build outputs are not included.
- Text files have meaningful diffs.
- Binary files have the intended filetype and lock policy.
- The changelist description explains the user-visible or operational reason for the change.
- Tests or validation requested by the user have run, or the final response says they were not run.

## Force Operation Guardrails

Use force operations only after preview and scope confirmation:

```bash
p4 sync -f path            # redownloads depot content
p4 clean -n path           # preview cleanup
p4 clean path              # overwrites/deletes local differences
p4 revert -n path          # preview revert
p4 revert path             # discards open work
```

If a command can discard local work, say which files are at risk before running it.

## Common Errors

| Symptom | Likely cause | First response |
| --- | --- | --- |
| `File(s) not in client view` | Path is unmapped | Run `p4 where path` and inspect `p4 client -o` |
| `file(s) not on client` | Not synced locally | Run scoped `p4 sync path` |
| `can't clobber writable file` | Local writable file differs | Inspect file, then use `p4 reconcile`, `p4 clean -n`, or scoped `p4 sync -f` if disposable |
| `file already opened` | File open by this or another client/user | Run `p4 opened -a file` |
| `out of date files must be resolved or reverted` | Depot has newer revision | Run `p4 sync path`, then `p4 resolve -n path` |
| `no permission for operation` | Protections or login issue | Run `p4 login -s`, confirm server/client, ask user if permissions are needed |
| `must refer to client` | Command used depot path where local path required, or no client | Run `p4 info` and `p4 where` |

## Environment Checks

```bash
p4 set
p4 info
p4 login -s
echo "$P4PORT"
echo "$P4USER"
echo "$P4CLIENT"
```

Prefer `p4 info` over environment variables when judging the active context, because config files and command-line flags can override shell variables.

## Path Rules

- `...` is Perforce recursion; use it intentionally.
- `*` is shell globbing unless quoted or escaped. Prefer Perforce wildcards in quoted depot paths when needed.
- `//depot/path/...` is a depot path; `path/to/file` is a local workspace path.
- `p4 where` is the fastest way to diagnose mapping confusion.

## Safer Alternatives

- Use `p4 shelve -c CHANGE` before risky cleanup.
- Use `p4 revert -a ...` instead of broad `p4 revert ...` when the goal is only to remove unchanged opens.
- Use `p4 reconcile -n ...` before `p4 reconcile ...`.
- Use `p4 resolve -n ...` before accepting merge choices.
- Use a numbered changelist and `p4 reopen -c CHANGE files` to isolate intended work.
