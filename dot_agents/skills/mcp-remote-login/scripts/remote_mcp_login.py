#!/usr/bin/env python3
"""Authenticate a remote Codex MCP server through a local SSH callback tunnel."""

from __future__ import annotations

import argparse
import re
import shlex
import signal
import subprocess
import time
import urllib.parse
import webbrowser
from typing import Iterable

URL_RE = re.compile(r"https?://[^\s)]+")


def log(message: str) -> None:
    print(message, flush=True)


def build_target(user: str | None, host: str) -> str:
    if "@" in host or not user:
        return host
    return f"{user}@{host}"


def shell_join(argv: Iterable[str]) -> str:
    return " ".join(shlex.quote(part) for part in argv)


def extract_auth_url(text: str) -> str | None:
    for match in URL_RE.finditer(text):
        url = match.group(0).rstrip(".,;'")
        if "redirect_uri=" in url or "/authorize" in urllib.parse.urlparse(url).path:
            return url
    return None


def extract_callback_port(url: str) -> int:
    parsed = urllib.parse.urlparse(url)
    query = urllib.parse.parse_qs(parsed.query)
    redirect_values = query.get("redirect_uri")
    callback_url = redirect_values[0] if redirect_values else url
    callback = urllib.parse.urlparse(callback_url)
    if callback.hostname not in {"127.0.0.1", "localhost"}:
        raise ValueError(f"callback host is not localhost: {callback_url}")
    if callback.port is None:
        raise ValueError(f"callback URL has no port: {callback_url}")
    return callback.port


def start_tunnel(ssh_bin: str, ssh_options: list[str], target: str, port: int) -> subprocess.Popen[str]:
    cmd = [ssh_bin, "-N", "-o", "ExitOnForwardFailure=yes", *ssh_options, "-L", f"{port}:127.0.0.1:{port}", target]
    log(f"Starting callback tunnel: {shell_join(cmd)}")
    proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
    time.sleep(0.75)
    if proc.poll() is not None:
        output = ""
        if proc.stdout:
            output = proc.stdout.read() or ""
        raise RuntimeError(f"SSH tunnel failed to start.\n{output}".rstrip())
    return proc


def terminate(proc: subprocess.Popen[str] | None) -> None:
    if proc is None or proc.poll() is not None:
        return
    proc.terminate()
    try:
        proc.wait(timeout=3)
    except subprocess.TimeoutExpired:
        proc.kill()
        proc.wait(timeout=3)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("server", help="MCP server name passed to `codex mcp login`")
    parser.add_argument("--host", required=True, help="Remote SSH/Tailscale host, for example ws-255")
    parser.add_argument("--user", help="Remote SSH user. Omit if --host already includes user@host")
    parser.add_argument("--ssh-bin", default="ssh", help="SSH executable to use; default: ssh")
    parser.add_argument("--ssh-option", action="append", default=[], help="Extra ssh -o option, repeatable, for example StrictHostKeyChecking=accept-new")
    parser.add_argument("--remote-codex", default="codex", help="Remote codex executable or command prefix; default: codex")
    parser.add_argument("--open-browser", action="store_true", help="Open the authorization URL in the local default browser")
    args = parser.parse_args()

    target = build_target(args.user, args.host)
    ssh_options = [item for option in args.ssh_option for item in ("-o", option)]
    remote_codex = shlex.split(args.remote_codex)
    remote_cmd = [args.ssh_bin, "-tt", *ssh_options, target, *remote_codex, "mcp", "login", args.server]

    tunnel: subprocess.Popen[str] | None = None
    login: subprocess.Popen[str] | None = None

    def handle_signal(signum: int, _frame: object) -> None:
        log(f"Received signal {signum}; cleaning up.")
        terminate(tunnel)
        terminate(login)
        raise SystemExit(130)

    signal.signal(signal.SIGINT, handle_signal)
    signal.signal(signal.SIGTERM, handle_signal)

    try:
        log(f"Starting remote MCP login: {shell_join(remote_cmd)}")
        login = subprocess.Popen(remote_cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, bufsize=1)
        assert login.stdout is not None

        auth_url: str | None = None
        for line in login.stdout:
            print(line, end="", flush=True)
            if auth_url is None:
                candidate = extract_auth_url(line)
                if candidate:
                    auth_url = candidate
                    port = extract_callback_port(auth_url)
                    tunnel = start_tunnel(args.ssh_bin, ssh_options, target, port)
                    log("")
                    log("Open this authorization URL in your local browser:")
                    log(auth_url)
                    log("")
                    if args.open_browser:
                        webbrowser.open(auth_url)

        rc = login.wait()
        if rc == 0:
            log("Remote MCP login process completed successfully.")
        else:
            log(f"Remote MCP login process exited with status {rc}.")
        return rc
    except Exception as exc:
        log(f"error: {exc}")
        return 1
    finally:
        terminate(tunnel)


if __name__ == "__main__":
    raise SystemExit(main())
