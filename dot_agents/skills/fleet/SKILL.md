---
name: fleet
description: Rich's machine fleet — which host does what, how to reach it, and where config lives. Load when work spans machines or needs one specifically: SSH or tailscale access, the Sagan relay or GitLab CI/runners, Unreal Engine, WSL/Docker, headless boot, chezmoi dotfiles, GPU work, running local models via ollama on the ws-255 5090, or any "which machine / how do I reach it" question.
---

Three machines on one tailnet, one shared dotfiles source. Coding is normally on
**iapetus**; the remotes are reached over Tailscale as `omaterm@<host>` and
driven inside `tmux`. `omaterm` ([omacom-io/omaterm](https://github.com/omacom-io/omaterm))
is the Omarchy terminal environment used on the remote hosts.

# Machines

## iapetus — primary dev laptop
- Dell XPS 14 (DA14260). Intel Core Ultra X7 358H, 16 cores, 62 GB RAM,
  Intel Arc B390 iGPU, 1.9 TB NVMe.
- OS: Omarchy (Arch Linux + Hyprland). This is the machine you are usually on.
- Tailscale: `iapetus` / `100.127.23.50`.
- All interactive coding happens here unless a task needs a remote's hardware
  or role.

## ws-255 — Windows workstation (Unreal + heavy agentic work)
- Windows host. NVIDIA RTX 5090, 128 GB RAM.
- **Unreal Engine** development runs natively on Windows, accessed via **Parsec**.
- Linux side: WSL2 distro `archlinux` with systemd enabled, running a
  **native Docker Engine** (systemd-managed). Docker Desktop is still
  installed for interactive Windows use but is out of the service path (its
  WSL integration for `archlinux` is off; do not re-enable it, that re-injects
  its socket over the native one on every distro start).
- Hosts system services headless: the native engine and its containers survive
  logout and reboot with nobody logged in (see "Headless operation").
- `omaterm` runs on the native engine: `--restart unless-stopped`,
  `--network host`, `-t` (the entrypoint needs a TTY or it exits and
  crash-loops), docker socket mounted, home in the named volume
  `omaterm-home`.
- Used for frequent/long-running agentic tasks, driven in `tmux` over SSH.
- Runs **anton serve** (v0.4.2 binary at `~/.local/bin/anton` in the omaterm
  home) in the detached tmux session `anton-serve`, port 4173, syncing local
  harness usage to the central Turso store. Creds in `~/.config/anton/env`
  (mode 600); restart with
  `tmux new -d -s anton-serve 'set -a; . ~/.config/anton/env; set +a; exec ~/.local/bin/anton serve'`.
  It does not survive a container restart; restart it by hand until it moves
  to something supervised.
- Runs **ollama on the RTX 5090**, as the compose project `~/ollama` in the
  omaterm home (`restart: unless-stopped`, loopback `127.0.0.1:11434`). See
  "Local models on the 5090" below before touching it.
- Reach it: `ssh omaterm@ws-255` (Tailscale). `ws-255` / `100.73.192.110`.
- Local access from a Windows terminal (no SSH; the tailnet IP is not
  routable from the Windows host itself):
  `wsl -d archlinux -- docker exec -it -u omaterm -w /home/omaterm omaterm tmux new -A -s Work`

## teamcity-ldn-01 — DevOps / services host
- **Also Windows + WSL (Arch) + omaterm**, not a bare Linux server. Reached
  `ssh omaterm@teamcity-ldn-01` (Tailscale). `teamcity-ldn-01` / `100.77.135.7`.
- Still on **Docker Desktop** (session-tied); its headless migration is
  pending (see "Headless operation").
- Runs, in **Docker**:
  - the **GitLab CI runners**, as the compose project `gitlab-runners`
    (`~/gitlab-runners/docker-compose.yml` in the omaterm home):
    - **gitlab-runner-agentic** — group runner **#18** on the `agentic` group
      (serves sagan, dirac, anton), tag `arch-docker`, Docker executor,
      `concurrent=3`, config in the named volume
      `gitlab-runner-agentic-config`. (A runner was first put on ws-255 by
      mistake and removed; it belongs here.)
    - **gitlab-runner-qiddiya** — group runner **#19** on the `qiddiya`
      group, tag `arch-docker`, Docker executor, `concurrent=3`, config in
      the named volume `gitlab-runner-qiddiya-config`.
    - **gitlab-runner-utilities** — group runner **#21** on the `utilities`
      group (serves wafflecut), tag `arch-docker`, Docker executor,
      `concurrent=3`, config in the named volume
      `gitlab-runner-utilities-config`.
    - **gitlab-runner-docs** — group runner **#22** on the `docs` group
      (serves the sagan room content repos), tag `arch-docker`, Docker
      executor, `concurrent=3`, config in the named volume
      `gitlab-runner-docs-config`. Added 2026-07-24.
  - the **Sagan relay server** (`sagan-relay-relay-1`, `restart=unless-stopped`,
    port 8787; state in the named volume `sagan-relay_relay-data`, config in
    `sagan-relay-config`; compose project dir `~/sagan-relay` in the omaterm
    home).
- The default home for new hosted services. Inspect/manage with `docker ps` /
  `docker compose` / `docker logs`.

## SSH lands inside the omaterm container
On **both** ws-255 and teamcity-ldn-01, `ssh omaterm@<host>` drops you INSIDE
the `omaterm` container (`/.dockerenv` present), whose `docker` CLI is wired to
the host's daemon via the mounted socket: the native in-distro engine on
ws-255 (`docker info` shows `Name=ws-255`), Docker Desktop on teamcity-ldn-01
until it migrates. `systemctl`/host-init are NOT visible from that shell, and
you cannot edit the WSL distro's `/etc/wsl.conf`, install distro packages, or
touch Windows Task Scheduler from there — those need a shell on the WSL distro
itself (`wsl -d archlinux` from Windows) plus PowerShell on Windows.

## The tailnet node is the omaterm container
On the Windows hosts the tailnet node is not Windows: the omaterm entrypoint
runs its own userspace `tailscaled` inside the container, and SSH arrives via
Tailscale SSH. There is no Tailscale on Windows. Node identity lives in
`/var/lib/tailscale` inside the container (on ws-255 still in the container
layer; move it to a named volume when the container is next recreated).
Recreating the container without that state knocks the host off the tailnet;
restore it and the node returns with its name and IP. This bit ws-255 in the
2026-07-15 headless recreation: the state was not carried over, so the node
re-registered and its tailnet IP changed from `100.93.192.79` to
`100.73.192.110` (remove the old node in the admin console if it lingers).

## Headless operation
Docker Desktop is a per-user Windows app (starts at login, dies at logout), so
nothing it hosts is a true system service. The migration to native
Docker-in-WSL is **done on ws-255** (passed the unattended-reboot test,
2026-07-15) and **pending on teamcity-ldn-01**. The recipe, per host:

- `/etc/wsl.conf` in the distro: `[boot] systemd=true`.
- Docker Desktop WSL integration for the distro toggled OFF first, then native
  Docker Engine installed in the distro (`pacman -S docker docker-compose`,
  `systemctl enable --now docker.socket docker.service`).
- Services recreated as `--restart unless-stopped` containers on the native
  engine. The omaterm home and the tailscale state (`/var/lib/tailscale`)
  must be carried over from the old container; they live in its writable
  layer, not volumes.
- `%UserProfile%\.wslconfig`: `[wsl2] vmIdleTimeout=-1` and
  `[general] instanceIdleTimeout=-1` (WSL otherwise reaps the instance seconds
  after the last client exits).
- Task Scheduler task `WSL-Headless-archlinux`: trigger at startup +60s, runs
  as the distro-owning user (`squintopera\richard.frost`) with stored
  password, "run whether user is logged on or not", highest privileges, action
  `"C:\Program Files\WSL\wsl.exe" -d archlinux -e /usr/bin/sleep infinity`
  (the command itself is the keepalive). It must use the Program Files
  launcher (the System32 `wsl.exe` cannot start from session 0) and must NOT
  run as SYSTEM (distros are registered per-user).
- After a domain password change the task's stored credential goes stale and
  the next boot silently fails. Re-save it:
  `schtasks /Change /TN "WSL-Headless-archlinux" /RP`.

The full runbook (with the teamcity-specific relay/runner migration steps) is
`deploy/headless-wsl-runbook.md` in the sagan main worktree.

## Local models on the 5090 (ws-255)

Set up 2026-08-11. Runbook: `~/ollama/README.md` in the omaterm home. Read it
before changing the service; the essentials to reason correctly are here.

**Do not install ollama inside the omaterm container.** That shell has no
`/dev/nvidia*`, no `/dev/dxg` and no `/usr/lib/wsl`, so it would run **CPU-only
while looking fine**. The GPU belongs to the WSL distro, not the container.

The working shape is server-in-its-own-container, client-in-omaterm:

- GPU passthrough on WSL is `--device /dev/dxg` plus a read-only bind of
  `/usr/lib/wsl` (the Windows driver's Linux libs) with `/usr/lib/wsl/lib` on
  `LD_LIBRARY_PATH`. **The nvidia container toolkit is not installed and is not
  needed** — do not go looking for it or try to install it.
- `network_mode: host` puts the server in the same netns as the omaterm
  container, so the client reaches it on its default `127.0.0.1:11434` with **no
  env var and no dotfile change**. This is the same trick that makes any
  host-networked container's ports visible from an omaterm shell.
- The client is `~/.local/bin/ollama`, copied out of the image
  (`docker cp ollama:/usr/bin/ollama`). It ships no `/usr/lib/ollama` runners, so
  it cannot accidentally start a rival CPU server.

Checks that actually prove things, because the cheap ones lie:

- `ollama ps` must show **`100% GPU`** in the PROCESSOR column. `nvidia-smi`
  succeeding inside a container proves passthrough only, **not** that a model
  loaded on CUDA — some models ship MLX/Apple-Silicon-first.
- **`ollama pull` can exit 0 while failing** (e.g. `412: requires a newer version
  of Ollama` when a model's manifest outruns the daemon). Confirm with
  `ollama list`, never the exit code.
- Docker Hub's `ollama/ollama:latest` can lag a model release. `~/ollama/Dockerfile`
  layers a specific release tarball over the official image, checksum-verified;
  delete it once Hub catches up. `docker compose up -d` will **not** rebuild an
  existing image tag — bump `OLLAMA_VERSION` *and* the `image:` tag, then
  `docker compose build`.

Driving the harnesses (`ollama launch` sets env vars; ollama serves the Anthropic
`/v1/messages` shape as well as OpenAI `/v1/chat/completions`, so **no proxy is
needed** for Claude Code). Harness args need a `--` separator:

    ollama launch claude --model <model> -- -p "prompt"
    ollama launch codex  --model <model> -- exec "prompt"

**Never use `ollama launch pi`.** It rewrites `~/.pi/agent/settings.json`
(chezmoi-managed), setting `defaultProvider`/`defaultModel` globally, and installs
a package into `~/.pi/agent/npm/` — which is *not* managed, so `chezmoi status`
hides half the drift. Use flags, which touch nothing:
`pi --provider ollama --model <model>`.

Two tradeoffs, both live in `docker-compose.yml`:

- A coding harness spends 16k+ context on its system prompt alone, so ollama's
  VRAM-derived default window is roughly half-consumed before you type. Raise
  `OLLAMA_CONTEXT_LENGTH` and re-check `ollama ps` still reads `100% GPU`.
- **Unreal runs natively on this box's GPU** and a loaded model pins ~20 of 32 GB
  of VRAM. `OLLAMA_KEEP_ALIVE` is therefore a real conflict, not a free knob;
  `docker compose stop ollama` before heavy Unreal work.

Bound to loopback deliberately: the omaterm container's userspace `tailscaled`
shares this netns, so `0.0.0.0` is a tailnet exposure decision. Reaching the 5090
from iapetus is **not** set up and needs that decision plus the
`ProxyCommand tailscale nc` route (see "Access").

*(also on the tailnet: `pixel-8` / `100.107.104.60` — phone, not a dev target.)*

# Access

- All remote access is over **Tailscale**; the tailnet is the network boundary
  (zero-trust setup). The hosts run **Tailscale SSH**; when the tailnet SSH
  policy uses **check mode**, a session may print a
  `https://login.tailscale.com/a/…` URL and wait for browser re-authentication
  before proceeding. In batch/agent use this looks like a silent hang: read
  the connection's stderr for the check URL, approve it, and the session (and
  further ones, for the check period) proceeds.
- On the omaterm remotes, `tailscaled` runs inside the omaterm container with
  `--tun=userspace-networking`: outbound plain TCP to `100.x` addresses does
  NOT traverse the tailnet (it leaks to the regular network and fails
  confusingly). From those shells, reach tailnet peers via
  `ssh -o ProxyCommand='tailscale nc %h %p' <user>@<100.x IP>`. MagicDNS names
  do not resolve there either; use tailnet IPs.
- Prefer MagicDNS hostnames (`ws-255`, `teamcity-ldn-01`) over raw tailnet IPs
  where they resolve (e.g. from iapetus).
- Remote work runs inside `tmux` sessions; attach/reattach rather than starting
  duplicate sessions.

# Config / dotfiles

- Managed with **chezmoi**; source of truth is
  [`rfrost-xyz/dotfiles`](https://github.com/rfrost-xyz/dotfiles)
  (`git@github.com:rfrost-xyz/dotfiles.git`).
- Local source dir on iapetus: `~/.local/share/chezmoi`.
- The same dotfiles are shared across iapetus and the omaterm remotes. Config
  changes belong in chezmoi and should be re-runnable, not hand-patched on one
  host. Apply with `chezmoi apply`; edit via `chezmoi edit <file>`.

## Rules for changing managed config

These are shared dotfiles across omarchy (iapetus) and omaterm (ws-255,
teamcity-ldn-01). A change is not done until it is safe on every system that
uses the file.

- **Change for the fleet, not one box.** A config edit must not fix the machine
  you are on while breaking another. Before changing a managed file, ask which
  hosts consume it and whether the change holds on all of them (different OS
  surface, packages, paths, GPU, WSL vs bare metal).
- **Per-host differences go through chezmoi, not hardcoding.** When behaviour
  must differ by host, use chezmoi templating (`.chezmoi.hostname`, `{{ if }}`
  guards, `.tmpl` files), not a value that only suits the current machine.
- **No drift.** Never hand-edit the applied file in `$HOME` — that diverges the
  target from the source. Edit the chezmoi source and `chezmoi apply`. Check
  state with `chezmoi status` / `chezmoi diff` and reconcile before and after a
  change; the target should always match the source.
- **Manage the push deliberately.** Config isn't shared until it's pushed. After
  applying, commit in the chezmoi source repo and push to `rfrost-xyz/dotfiles`
  following the playbook conventions (branch, conventional commit, British
  English, no LLM attribution). Don't leave the source repo dirty or unpushed,
  and don't force changes onto other hosts without confirming.
