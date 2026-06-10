```
████████▄   ▄██████▄      ███        ▄████████  ▄█   ▄█          ▄████████    ▄████████ 
███   ▀███ ███    ███ ▀█████████▄   ███    ███ ███  ███         ███    ███   ███    ███ 
███    ███ ███    ███    ▀███▀▀██   ███    █▀  ███▌ ███         ███    █▀    ███    █▀  
███    ███ ███    ███     ███   ▀  ▄███▄▄▄     ███▌ ███        ▄███▄▄▄       ███        
███    ███ ███    ███     ███     ▀▀███▀▀▀     ███▌ ███       ▀▀███▀▀▀     ▀███████████ 
███    ███ ███    ███     ███       ███        ███  ███         ███    █▄           ███ 
███   ▄███ ███    ███     ███       ███        ███  ███▌    ▄   ███    ███    ▄█    ███ 
████████▀   ▀██████▀     ▄████▀     ███        █▀   █████▄▄██   ██████████  ▄████████▀  
                                                    ▀                                   
```

> _"Have I shown you the conjoined traingles of success?"_ — "Action Jack"
> Barker

[chezmoi](https://chezmoi.io)-managed dotfiles for an
[Omarchy](https://omarchy.org). Files prefixed `dot_` map
to `~/.*`; `chezmoi apply` lays them down. Omarchy ships the defaults, this
repo is the local override layer, middle-out, if you will.

## Layout

| Path | What | |------|------| | `dot_bashrc`, `dot_config/bash/` | shell:
`envs` → `aliases` → `functions` → `init`, sourced in that order | |
`dot_config/{hypr,ghostty,nvim,tmux,lazygit,starship}/` | the usual desktop
suspects | | `dot_config/worktrunk/` | `wt` git-worktree config | |
`dot_claude/`, `dot_pi/`, `dot_agents/` | agent harnesses (`piedcc`, `piedpi` —
yes, the name is a Pied Piper tip of the hat) |

## Secrets: externalised, not committed

The repo holds **config, not credentials**. Nothing in here should make a
security researcher sweat. Two mechanisms keep it that way:

1. **Machine- & OS-specifics → chezmoi templates.** `*.tmpl` files render at
   `chezmoi apply` from `.chezmoi.*` data (`homeDir`, `os`, `kernel`), so paths
and platform branches resolve per-host instead of being hardcoded. See
`dot_claude/settings.json.tmpl` and `dot_local/bin/executable_p4client.tmpl`.

2. **Runtime secrets → untracked `.env`, loaded on demand.** API keys and
   tokens never enter git. They live in local `*.env` files (untracked) and get
pulled into the shell only when needed via the `loadenv` function
(`dot_config/bash/functions/`), which does `set -a; source <file>`. Pied Piper
stored to the box; we just source from it.

Rule of thumb: if it's a secret, it goes in a `.env` and stays on the box. If
it varies by machine, it's a `.tmpl`. Everything else is fair game to commit.

