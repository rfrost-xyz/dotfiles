```text
████████▄   ▄██████▄      ███        ▄████████  ▄█   ▄█          ▄████████    ▄████████
███   ▀███ ███    ███ ▀█████████▄   ███    ███ ███  ███         ███    ███   ███    ███
███    ███ ███    ███    ▀███▀▀██   ███    █▀  ███▌ ███         ███    █▀    ███    █▀
███    ███ ███    ███     ███   ▀  ▄███▄▄▄     ███▌ ███        ▄███▄▄▄       ███
███    ███ ███    ███     ███     ▀▀███▀▀▀     ███▌ ███       ▀▀███▀▀▀     ▀███████████
███    ███ ███    ███     ███       ███        ███  ███         ███    █▄           ███
███   ▄███ ███    ███     ███       ███        ███  ███▌    ▄   ███    ███    ▄█    ███
████████▀   ▀██████▀     ▄████▀     ███        █▀   █████▄▄██   ██████████  ▄████████▀
```

_"Have I shown you the conjoined triangles of success?"_ — "Action Jack" Barker

[chezmoi](https://chezmoi.io)-managed dotfiles. Files prefixed `dot_` map to
`~/.*`; `chezmoi apply` lays them down. Omarchy ships the defaults, this repo
is the local override layer, middle-out, if you will.

The repo holds **config, not credentials**.

1. **Machine- & OS-specifics → chezmoi templates.** `*.tmpl` files render at
   `chezmoi apply` from `.chezmoi.*` data (`homeDir`, `os`, `kernel`), so paths
   and platform branches resolve per-host instead of being hardcoded. See
   `dot_claude/settings.json.tmpl` and `dot_local/bin/executable_p4client.tmpl`.

2. **Runtime secrets → untracked `.env`, loaded on demand.** API keys and
   tokens never enter git. They live in local `*.env` files (untracked) and get
   pulled into the shell only when needed via the `loadenv` function
   (`dot_config/bash/functions/`), which does `set -a; source <file>`. Pied Piper
   stored to the box; we just source from it.
