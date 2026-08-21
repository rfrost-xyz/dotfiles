# PiedPi discovery wrapper

This directory is intentionally the Pi-discoverable wrapper for the real PiedPi worktree in `main/`.

Pi auto-discovers one level under `~/.pi/agent/extensions/` and reads this wrapper's `package.json` `pi.extensions` entries. JSON cannot carry comments, so keep this note with the wrapper manifest.

The wrapper currently points at `./main/src/index.ts`, the single PiedPi suite entrypoint. If the suite entrypoint moves, update this wrapper too. Do not remove the wrapper unless Pi discovery is changed to load the nested `main/package.json` directly.
