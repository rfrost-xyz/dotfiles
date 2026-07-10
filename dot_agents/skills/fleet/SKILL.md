---
name: fleet
description: Rich's machine fleet — which host does what, how to reach it, and where config lives. Load when work spans machines or needs one specifically: SSH or tailscale access, the Sagan relay or GitLab CI/runners, Unreal Engine, WSL/Docker Desktop, chezmoi dotfiles, GPU work, or any "which machine / how do I reach it" question.
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
- Linux coding is done in **WSL** (Arch) with **Docker Desktop** hooked into WSL.
- Used for frequent/long-running agentic tasks, driven in `tmux` over SSH.
- Reach it: `ssh omaterm@ws-255` (Tailscale). `ws-255` / `100.93.192.79`.
- No hosted services here yet, only `omaterm`. It should be *able* to host
  system services once headless operation is set up (see below); for now
  its Docker Desktop is tied to a login session.

## teamcity-ldn-01 — DevOps / services host
- **Also Windows + WSL (Arch) + omaterm + Docker Desktop**, not a bare Linux
  server. Reached `ssh omaterm@teamcity-ldn-01` (Tailscale).
  `teamcity-ldn-01` / `100.77.135.7`.
- Runs, in **Docker**:
  - the **GitLab CI runner** — group runner **#18** on the `agentic` group
    (serves sagan, dirac, anton), tag `arch-docker`, `--restart unless-stopped`,
    Docker executor, `concurrent=3`. (A runner was first put on ws-255 by
    mistake and removed; it belongs here.)
  - the **Sagan relay server** (`sagan-relay-relay-1`, `restart=unless-stopped`).
- The default home for new hosted services. Inspect/manage with `docker ps` /
  `docker compose` / `docker logs`.

## SSH lands inside the omaterm container
On **both** ws-255 and teamcity-ldn-01, `ssh omaterm@<host>` drops you INSIDE
the `omaterm` container (`/.dockerenv` present), whose `docker` CLI is wired to
the host's Docker Desktop daemon via the mounted socket. So `docker ps` shows
the host's containers, but `systemctl`/host-init are NOT visible from that
shell, and you cannot edit the WSL distro's `/etc/wsl.conf`, install distro
packages, or touch Windows Task Scheduler from there — those need a shell on the
WSL distro itself plus PowerShell on Windows.

## Headless operation (open work item)
Docker Desktop runs as a per-user Windows app: it starts after login and dies at
logout, so containers here are only as persistent as someone's session. Making
Docker + `omaterm` + the runner/relay run headless (survive logout/reboot) needs
Docker Engine inside the WSL Arch distro with systemd (`/etc/wsl.conf`
`[boot] systemd=true`) plus a Windows Task Scheduler task starting the distro at
boot "whether logged on or not". Tracked as a work item for both hosts.

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
