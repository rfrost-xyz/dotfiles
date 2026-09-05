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

[chezmoi](https://chezmoi.io)-managed dotfiles. Files prefixed `dot_` map to
`~/.*`; `chezmoi apply` lays them down. Omarchy ships the defaults, and this
repo acts as a personal override layer and driver of secrets management.

The repo holds **config, not credentials**.

1. **Machine- & OS-specifics → chezmoi templates.** `*.tmpl` files render at
   `chezmoi apply` so paths and platform branches resolve per-host instead of
   being hardcoded.

2. **Runtime secrets → untracked `.env`, loaded on demand.** API keys and
   tokens never enter git. They live in local `*.env` files and get pulled into
   the shell only when needed.

## Machine roles

Set an explicit chezmoi role per machine:

```toml
[data]
role = "desktop"  # Omarchy laptop
# role = "headless"  # Omaterm container
```

`desktop` is the default when no role is configured, preserving the laptop
behaviour. `headless` skips Hyprland/Ghostty/Parsec/P4/1Password *desktop-app*
pieces (the 1Password SSH agent and `op-ssh-sign`). Chezmoi owns the portable
`.bashrc` entrypoint, which loads the omadots defaults before the personal
override layer. Git commit/tag signing still works headless:
it uses an on-disk SSH key rendered from 1Password (`op://Development/SSH Key`)
via the CLI, so a headless box needs a 1Password **service-account token**
available at apply time — set `[onepassword] mode = "service"` and export
`OP_SERVICE_ACCOUNT_TOKEN` (from `~/.config/bash/envs/local`) before applying.

Typical Omaterm bootstrap:

```bash
chezmoi init rfrost-xyz
mkdir -p ~/.config/chezmoi
cat > ~/.config/chezmoi/chezmoi.toml <<'EOF'
[data]
role = "headless"

[onepassword]
mode = "service"
EOF

# 1Password service-account token — required before apply so the signing key
# and any op-backed files render. Paste the ops_... token, then source it.
"$EDITOR" ~/.config/bash/envs/local   # export OP_SERVICE_ACCOUNT_TOKEN="ops_..."
source ~/.config/bash/envs/local

chezmoi apply

exec bash -l
```

## Codex daemon with mise

Codex remains a single mise-managed installation on desktop and headless hosts.
Chezmoi links `~/.codex/packages/standalone/current` to
`~/.local/share/mise/installs/codex/latest/bin` using a home-relative symlink.
This satisfies the fixed executable path required by `codex agents` without
installing another copy or maintaining a second version. Install Codex through
mise before using the link; the existing postinstall hook supplies its complete
runtime. Non-default `MISE_DATA_DIR` or `CODEX_HOME` paths are not covered.

Verified with Codex 0.153.4 on iapetus (2026-09-05). `codex agents` starts the
daemon without an updater. After `mise up codex`, run
`codex app-server daemon restart` when existing tasks can be interrupted, so the
running server uses the updated executable.

Do not run `codex app-server daemon bootstrap`, `codex remote-control`, or the
standalone installer with this arrangement: they introduce a separate installer
and update owner. This link is a compatibility workaround, not an upstream
external-package-manager contract; recheck the daemon lifecycle when upgrading.

Source: [Codex 0.153.4 daemon installation and update semantics](https://github.com/openai/codex/blob/rust-v0.153.4/codex-rs/app-server-daemon/README.md).
