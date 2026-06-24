# P4 Command Reference

## Revision Specifiers

```bash
file.txt#3                 # specific revision number
file.txt#head              # latest revision
file.txt@12345             # file as of changelist
file.txt@release_1.0       # label
file.txt@2026/05/27        # date
file.txt@2026/05/27:14:30:00
file.txt#2,#5              # revision range
file.txt@10000,@12000      # changelist range
```

## Workspace and Mapping

```bash
p4 info                    # server, user, client, root
p4 client -o               # client spec and view
p4 where path              # local/depot mapping
p4 have path               # synced revisions
p4 files //depot/path/...  # depot files at head
p4 fstat path              # metadata for one or more files
```

## Sync

```bash
p4 sync ...
p4 sync //depot/project/...
p4 sync path/to/file.txt
p4 sync //depot/project/...@12345
p4 sync -n ...                         # preview
p4 sync -s ...                         # avoid clobbering writable files
p4 sync -f path/to/file.txt            # force redownload
p4 sync --parallel=threads=4 ...       # large syncs
```

## Opened Files and Changelists

```bash
p4 opened
p4 opened -c CHANGE
p4 opened -a //depot/project/...
p4 changes -s pending -u "$P4USER" -c "$P4CLIENT"
p4 change                 # create/edit pending changelist
p4 change -o CHANGE       # print changelist spec
p4 change -d CHANGE       # delete empty pending changelist
p4 reopen -c CHANGE files # move open files
```

## Edit, Add, Delete

```bash
p4 edit file.txt
p4 edit -c CHANGE file.txt
p4 add newfile.txt
p4 add -c CHANGE newfile.txt
p4 add -t binary+l asset.psd
p4 delete file.txt
p4 delete -c CHANGE file.txt
```

Common filetypes and modifiers:

```text
text       text file, diff and merge enabled
binary     binary file, no text merge
unicode    Unicode text
symlink    symbolic link
+l         exclusive lock
+w         always writable on client
+x         executable bit
+S         store only limited revisions, often +S or +S<number>
```

## Diff, Revert, Clean

```bash
p4 diff
p4 diff file.txt
p4 diff -du file.txt       # unified diff
p4 diff -se ...            # opened files different from depot
p4 diff -sr ...            # opened files same as depot
p4 revert -n ...           # preview
p4 revert file.txt
p4 revert -a ...           # unchanged opened files only
p4 clean -n ...            # preview workspace cleanup
p4 clean ...               # match workspace to depot
```

## Reconcile and Status

```bash
p4 status
p4 reconcile -n ...
p4 reconcile ...
p4 reconcile -e ...        # edits
p4 reconcile -a ...        # adds
p4 reconcile -d ...        # deletes
p4 reconcile -c CHANGE ...
```

`p4 status` reports local differences. `p4 reconcile` opens those differences in Perforce.

## Resolve

```bash
p4 resolve -n ...
p4 resolve ...
p4 resolve -as ...         # safe automatic resolves
p4 resolve -am ...         # automatic merges
p4 resolve -ay file        # accept yours
p4 resolve -at file        # accept theirs
p4 resolved                # resolved but not submitted
```

Use `-ay` and `-at` only for scoped files when that choice is intended.

## Submit

```bash
p4 submit
p4 submit -c CHANGE
p4 submit -r -c CHANGE     # submit and reopen
p4 submit -d "Message"     # only when message is final
```

## Locks

```bash
p4 lock file
p4 unlock file
p4 opened -a file
```

For `+l` filetypes, the server enforces exclusive checkout. Do not unlock another user's file unless the user has authority and explicitly asks.

## Deleted Files

```bash
p4 files //depot/project/...@head
p4 filelog //depot/project/file.txt
p4 sync //depot/project/file.txt#REV
```

To restore a deleted depot file as new content, sync an earlier revision, then open it appropriately according to the intended history. If the goal is to undo a submitted delete, prefer `p4 undo` where available:

```bash
p4 undo //depot/project/file.txt@CHANGE
```
