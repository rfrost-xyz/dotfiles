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
behaviour. `headless` keeps Omaterm's omadots `.bashrc` as the base, installs
only the terminal override layer, skips Hyprland/Ghostty/Parsec/P4/1Password
desktop pieces, and disables Git commit/tag signing unless you provision a
signing key in the container.

Typical Omaterm bootstrap:

```bash
chezmoi init rfrost-xyz
mkdir -p ~/.config/chezmoi
cat > ~/.config/chezmoi/chezmoi.toml <<'EOF'
[data]
role = "headless"
EOF
chezmoi apply
```
