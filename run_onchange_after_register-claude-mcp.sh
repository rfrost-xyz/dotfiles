#!/usr/bin/env bash
# Register user-scope Atlassian MCP servers for Claude Code.
#
# ~/.claude.json is intentionally chezmoi-ignored (Claude Code rewrites
# it with session telemetry, so a tracked copy would churn and clobber).
# The MCP server entries therefore cannot live as a tracked file; this
# script registers them idempotently via the supported `claude mcp add`
# path instead. Authorise once per server with the `/mcp` slash command
# inside Claude Code; OAuth state is owned by the server, not tracked.
#
# Both servers hit the same Atlassian remote MCP endpoint; the name
# selects the site picked during OAuth consent:
#   atlassian-squintopera -> squintopera.atlassian.net  (Jira)
#   atlassian-journey     -> journeyworld.atlassian.net (Confluence)

set -euo pipefail

if ! command -v claude >/dev/null 2>&1; then
  echo "claude CLI not found on PATH; skipping MCP registration" >&2
  exit 0
fi

endpoint="https://mcp.atlassian.com/v1/mcp"

register() {
  local name="$1"
  if claude mcp get "$name" >/dev/null 2>&1; then
    echo "MCP server '${name}' already registered; skipping"
    return
  fi
  claude mcp add --scope user --transport http "$name" "$endpoint"
}

register atlassian-squintopera
register atlassian-journey
