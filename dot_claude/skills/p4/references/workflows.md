# P4 Workflows

## Sync Safely

1. Check active work:

```bash
p4 opened
```

2. Preview incoming changes for the relevant path:

```bash
p4 sync -n ...
p4 sync -n //depot/project/...
```

3. Sync the smallest useful scope:

```bash
p4 sync ...
p4 sync //depot/project/...
p4 sync //depot/project/file.txt
```

4. If conflicts are reported, run resolve only for affected files:

```bash
p4 resolve -n ...
p4 resolve ...
```

Use `p4 sync -s` when writable local files may exist and clobbering would be risky. Use `p4 sync --parallel=threads=4 ...` for large syncs only when the server/client supports parallel sync.

## Edit and Submit

1. Sync the relevant path and confirm the file is mapped:

```bash
p4 sync path/to/file.ext
p4 where path/to/file.ext
```

2. Open tracked files for edit, optionally into a numbered changelist:

```bash
p4 change
p4 edit -c CHANGE path/to/file.ext
p4 edit path/to/file.ext
```

3. Make the file edits, then inspect:

```bash
p4 opened
p4 diff path/to/file.ext
p4 diff -du path/to/file.ext
```

4. Revert unchanged files and resolve before submit:

```bash
p4 revert -a ...
p4 sync ...
p4 resolve -n ...
p4 resolve ...
```

5. Submit deliberately:

```bash
p4 submit -c CHANGE
p4 submit
```

Avoid `p4 submit -d` unless the description is already final and the file set is known.

## Reconcile Local Changes

Use reconcile when files were edited, created, or deleted outside Perforce commands.

```bash
# Preview all local differences under the current tree.
p4 reconcile -n ...

# Open detected edits/adds/deletes.
p4 reconcile ...

# Limit by type.
p4 reconcile -e ...   # edits
p4 reconcile -a ...   # adds
p4 reconcile -d ...   # deletes

# Put reconciled files into a changelist.
p4 reconcile -c CHANGE ...
```

After reconcile, inspect `p4 opened` and revert accidental generated files before submitting.

## Add Files

```bash
p4 add path/to/newfile.txt
p4 add -c CHANGE path/to/newfile.txt
p4 add -t binary+l Assets/Textures/hero.psd
p4 add -t text+x scripts/build.sh
```

For many files, prefer `p4 reconcile -n ...` first so ignored/generated files are visible before opening them.

## Delete Files

```bash
p4 delete path/to/file.txt
p4 delete -c CHANGE path/to/file.txt
```

Do not use shell deletion alone for tracked files unless following with `p4 reconcile -d`. To recover a deleted file before submit, use:

```bash
p4 revert path/to/file.txt
p4 sync path/to/file.txt
```

## Resolve Before Submit

Preview resolve work:

```bash
p4 resolve -n ...
```

Common choices:

```bash
p4 resolve          # interactive
p4 resolve -as ...  # safe automatic resolve where possible
p4 resolve -am ...  # automatic merge where possible
```

Avoid blanket `-ay` or `-at` unless the user explicitly wants to accept yours or theirs for the scoped files.

## Shelve and Unshelve

Use shelves for review, handoff, or backup without submitting:

```bash
p4 shelve -c CHANGE
p4 describe -S CHANGE
p4 unshelve -s CHANGE
p4 shelve -d -c CHANGE
```

If unshelving into a different changelist:

```bash
p4 unshelve -s SOURCE_CHANGE -c TARGET_CHANGE
```
