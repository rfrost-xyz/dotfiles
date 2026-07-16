import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { spawn } from "node:child_process";

// Surfaces pi run state in tmux via ~/.local/bin/harness-status.
function report(state: "working" | "done" | "idle" | "clear"): void {
	try {
		spawn(`${process.env.HOME}/.local/bin/harness-status`, ["pi", state], {
			stdio: "ignore",
			detached: true,
		}).unref();
	} catch {
		// Status reporting must never interfere with the session.
	}
}

export default function harnessStatus(pi: ExtensionAPI) {
	pi.on("session_start", () => report("idle"));
	pi.on("agent_start", () => report("working"));
	pi.on("agent_end", () => report("done"));
	pi.on("session_shutdown", () => report("clear"));
}
