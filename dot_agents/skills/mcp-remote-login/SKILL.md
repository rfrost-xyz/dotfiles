---
name: mcp-remote-login
description: Authenticate Codex MCP servers that run on a remote machine by driving `codex mcp login <server>` over SSH/Tailscale, creating the matching localhost callback tunnel, parsing OAuth callback ports, and confirming completion. Use when Codex needs to log in to an MCP server on hosts such as ws-255 or teamcity-ldn-01, when OAuth callbacks point at remote 127.0.0.1 ports, or when the user asks to manage MCP auth from a host machine using canonical fleet details from `~/.agents/skills/fleet/SKILL.md`.
---

# MCP Remote Login

## Overview

Use this skill to complete `codex mcp login <server>` for a Codex instance running on a remote host while the browser is on the user's local host. The core problem is that the OAuth callback URL uses `127.0.0.1:<port>` on the remote machine, so the local host must create an SSH local-forward for exactly that callback port.

## Canonical Skill Home

Treat `~/.agents` as the canonical skill tree. This skill lives at `~/.agents/skills/mcp-remote-login`, and machine/access details live in the fleet skill at `~/.agents/skills/fleet/SKILL.md`.

These files are managed through chezmoi from `~/.local/share/chezmoi/dot_agents`. Do not hand-patch machine inventory or access rules in generated copies; update the chezmoi source when changing shared skill content.

## Preferred Automation

When running on the user's host machine, use the bundled helper script:

```bash
python3 ~/.agents/skills/mcp-remote-login/scripts/remote_mcp_login.py <mcp-server-name> --host <remote-host> --user <remote-user>
```

Example using current fleet data:

```bash
python3 ~/.agents/skills/mcp-remote-login/scripts/remote_mcp_login.py atlassian-journey --host ws-255 --user omaterm
```

The script starts `codex mcp login` over SSH, parses the authorization URL and callback port, starts `ssh -N -L <port>:127.0.0.1:<port>`, prints the authorization URL, waits for the remote login to finish, and tears down the tunnel.

Add `--open-browser` only when it is appropriate to launch a browser on the local host. Do not use this script from the remote host unless that host is also where the browser runs.

## Fleet Details

Before choosing host details, read `~/.agents/skills/fleet/SKILL.md`. It is the authority for which machines exist, what each machine is for, SSH usernames, Tailscale hostnames, and access conventions.

Use fleet-provided aliases, users, SSH commands, Tailscale names, and role guidance. As of the current fleet skill, remote access is over Tailscale, MagicDNS hostnames are preferred, and remotes are reached as `omaterm@<host>`.

Do not invent fleet data. If the target host or user is ambiguous after reading the fleet skill, ask for the missing value.


## Manual Remote Workflow

Use this when the agent is already running on the remote host, when the helper script is unavailable, or when the user only wants the exact local command.

1. Start the login on the remote machine and keep it running:

```bash
codex mcp login <mcp-server-name>
```

2. Copy the callback port from the printed authorization URL's `redirect_uri`. For example, `redirect_uri=http://127.0.0.1:45705/callback/...` means the port is `45705`.

3. Tell the user to run this on their local host, substituting the exact port and using the SSH target from the fleet skill:

```bash
ssh -N -o ExitOnForwardFailure=yes -L <port>:127.0.0.1:<port> <user>@<remote-host>
```

4. Tell the user to leave the tunnel running, then open the authorization URL in their local browser.

5. Poll the remote login process. Confirm success only after it prints `Successfully logged in to MCP server '<name>'.`

## Security Rules

Treat callback URLs containing `code=` as short-lived secrets. If such a URL has been pasted into chat or logs, rerun `codex mcp login` and use the fresh authorization URL and callback state.

Only share authorization URLs that point to the provider and do not contain `code=`. Avoid repeating callback URLs in final answers.

## Troubleshooting

- If the SSH tunnel appears to hang, that is normal for `ssh -N`; it stays open as the tunnel.
- If the callback errors, verify the tunnel port exactly matches the current login attempt's `redirect_uri` port.
- If the user restarted `codex mcp login`, discard prior URLs because the OAuth `state` changed.
- If SSH fails for a target from the fleet skill, re-read the fleet access section and try the documented MagicDNS hostname or SSH alias.
- If local port forwarding fails, ask the user to close the process occupying that local port and retry the same login attempt if it is still waiting; otherwise rerun login.
