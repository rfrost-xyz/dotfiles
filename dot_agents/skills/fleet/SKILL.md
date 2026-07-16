---
name: fleet
description: Rich's machine fleet — which host does what, how to reach it, and where config lives. Load when work spans machines or needs one specifically: SSH or tailscale access, the Sagan relay or GitLab CI/runners, Unreal Engine, WSL/Docker, headless boot, chezmoi dotfiles, GPU work, or any "which machine / how do I reach it" question.
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
- Reach it: `ssh omaterm@ws-255` (Tailscale). `ws-255` / `100.93.192.79`.
- Local access from a Windows terminal (no SSH; the tailnet IP is not
  routable from the Windows host itself):
  `wsl -d archlinux -- docker exec -it -u omaterm -w /home/omaterm omaterm tmux new -A -s Work`

## teamcity-ldn-01 — DevOps / services host
- **Also Windows + WSL (Arch) + omaterm**, not a bare Linux server. Reached
  `ssh omaterm@teamcity-ldn-01` (Tailscale). `teamcity-ldn-01` / `100.77.135.7`.
- Still on **Docker Desktop** (session-tied); its headless migration is
  pending (see "Headless operation").
- Runs, in **Docker**:
  - the **GitLab CI runner** — group runner **#18** on the `agentic` group
    (serves sagan, dirac, anton), tag `arch-docker`, `--restart unless-stopped`,
    Docker executor, `concurrent=3`. (A runner was first put on ws-255 by
    mistake and removed; it belongs here.)
  - a second runner, **gitlab-runner-qiddiya-docs** (config in the named
    volume `gitlab-runner-qiddiya-docs-config`).
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
restore it and the node returns with its name and IP.

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

*(also on the tailnet: `pixel-8` / `100.107.104.60` — phone, not a dev target.)*

# Access

- All remote access is over **Tailscale**; the tailnet is the network boundary,
  so SSH needs no extra auth beyond the tailnet (zero-trust setup).
- Prefer MagicDNS hostnames (`ws-255`, `teamcity-ldn-01`) over raw tailnet IPs.
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
