# piedcc — statusline reference

Configuration lives at `~/.claude/piedcc/statusline.json`. The script
re-reads it on every render — no restart needed.

If the file is deleted, it re-seeds with defaults on the next render.

## Installation

Requires [bun](https://bun.sh). Install if missing:

```bash
curl -fsSL https://bun.sh/install | bash
```

Drop the `piedcc/` directory at `~/.claude/piedcc/` and wire it into
`~/.claude/settings.json`:

```jsonc
"statusLine": {
  "type": "command",
  "command": "~/.bun/bin/bun ~/.claude/piedcc/statusline.ts",
  "padding": 0,
  "refreshInterval": 60,
  "hideVimModeIndicator": true
}
```

No `bun install` step — piedcc only uses Node stdlib and Bun's
built-in TypeScript support. `statusline.json` is auto-seeded with
defaults on first render.

## Layout

```jsonc
"lines": [
  {
    "left":  ["gitBranch", "gitWorkDiff", "gitAhead", "gitBranchDiff",
              "usage", "context", "rate5h", "rateWeekly"],
    "right": ["effort", "model"]
  }
]
```

- One entry per row. Multi-line layouts work but CC clips below row 1
  when its own chrome (vim mode, bypass-permissions cycler, agent nav)
  takes space. Stick to one row unless you've confirmed your terminal
  has headroom.
- Drop a segment name from both `left` and `right` to hide it.
- Reorder freely.

## Segments

| Name            | Renders                                 | Source                                            |
| --------------- | --------------------------------------- | ------------------------------------------------- |
| `gitBranch`     | `feat/foo*` (asterisk = dirty worktree) | shells to `git`                                   |
| `gitWorkDiff`   | `@+12 @-3` (unstaged add/del)           | `git diff --numstat HEAD`                         |
| `gitAhead`      | `↑3 ↓1` (vs `gitBase`)                  | `git rev-list --left-right --count HEAD...<base>` |
| `gitBranchDiff` | `^+412 ^-78` (vs `gitBase`)             | `git diff --numstat <base>...HEAD`                |
| `gitUpstream`   | `⇡2 ⇣1` (vs `@{upstream}`)              | not in default layout — add to enable             |
| `gitWorktree`   | `wt:feature-x`                          | CC `workspace.git_worktree`                       |
| `usage`         | `↑in ↓out R<cache-read> W<cache-write>` | `context_window.current_usage`                    |
| `context`       | `ctx ◔ 27.5k`                           | `context_window.used_percentage` × size           |
| `rate5h`        | `5h ◑ 5h0m` (pie + reset countdown)     | `rate_limits.five_hour`                           |
| `rateWeekly`    | `wk ● 6d` (pie + reset countdown)       | `rate_limits.seven_day`                           |
| `effort`        | `high`                                  | `effort.level`                                    |
| `model`         | `Opus 4.7 (1M)`                         | `model.display_name`                              |

## Behaviour knobs

| Field                                   | Default                  | Effect                                                                                           |
| --------------------------------------- | ------------------------ | ------------------------------------------------------------------------------------------------ |
| `gitBase`                               | `"origin/main"`          | Branch diff base for `gitBranchDiff` / `gitAhead`                                                |
| `gitDiffStyle`                          | `"symbolsNumbers"`       | `"symbols"` = `+`, `"numbers"` = `412`, `"symbolsNumbers"` = `+412`                              |
| `usageInput`                            | `true`                   | Show `↑<input-tokens>`                                                                           |
| `usageOutput`                           | `true`                   | Show `↓<output-tokens>`                                                                          |
| `usageCacheRead`                        | `true`                   | Show `R<cache-read-tokens>` when nonzero                                                         |
| `usageCacheWrite`                       | `true`                   | Show `W<cache-write-tokens>` when nonzero                                                        |
| `contextAmount`                         | `"used"`                 | `"used"`, `"remaining"`, or `"window"` for the token figure in `ctx <pie> <amount>`              |
| `showContextTotal`                      | `true`                   | Show the token amount after the pie/percent                                                      |
| `pieContext`                            | `true`                   | Use `○ ◔ ◑ ◕ ●` instead of `%` for context                                                       |
| `pieRate5h`                             | `true`                   | Use pie instead of `%` for 5h                                                                    |
| `pieRateWeekly`                         | `true`                   | Use pie instead of `%` for weekly                                                                |
| `showRate5hReset`                       | `true`                   | Suffix 5h with relative reset (`5h0m`)                                                           |
| `showRateWeeklyReset`                   | `true`                   | Suffix weekly with relative reset (`6d`)                                                         |
| `rate5hWarning` / `rate5hError`         | `80` / `90`              | Yellow / red percentage thresholds for 5h                                                        |
| `rateWeeklyWarning` / `rateWeeklyError` | `80` / `90`              | Same, for weekly                                                                                 |
| `usableTokens`                          | `128000`                 | Soft "usable" context-window marker (red ≥ this, yellow within tolerance)                        |
| `tolerancePercent`                      | `15`                     | Yellow buffer below `usableTokens` (15 = yellow from 85% of `usableTokens` upward)               |
| `fillBasis`                             | `"usable"`               | `"usable"` shows %vs `usableTokens`; `"window"` shows %vs full context window                    |
| `modelDisplay`                          | `"displayName"`          | `"id"` shows `claude-opus-4-7`, `"displayName"` shows `Opus 4.7`                                 |
| `modelStripContext`                     | `true`                   | Strip `context)` from display names: `Opus 4.7 (1M context)` → `Opus 4.7 (1M)`                  |
| `separator`                             | `" · "`                  | Text between segments on the same side                                                           |
| `defaultColumns`                        | `200`                    | Fallback width when no auto-detection source works. Only used if your terminal can't be measured |
| `colors`                                | per-segment theme tokens | See below                                                                                        |

## Colours

Each segment's resting colour is a theme token. State colours (success
/ warning / error) override automatically for git diffs and rate-limit
thresholds.

```jsonc
"colors": {
  "gitBranch":     "accent",
  "gitWorkDiff":   "accent",
  "gitAhead":      "accent",
  "gitBranchDiff": "accent",
  "usage":         "dim",
  "context":       "dim",
  "rate5h":        "muted",
  "rateWeekly":    "muted",
  "effort":        "dim",
  "model":         "dim"
}
```

Tokens map to your omarchy palette
(`~/.config/omarchy/current/theme/colors.toml`):

| Token     | Palette slot                                                          |
| --------- | --------------------------------------------------------------------- |
| `accent`  | `accent`                                                              |
| `fg`      | `foreground`                                                          |
| `dim`     | `foreground`                                                          |
| `muted`   | `color8` (bright-black)                                               |
| `success` | `color2` (green)                                                      |
| `warning` | `color11` (bright yellow — more reliable than `color3` across themes) |
| `error`   | `color1` (red)                                                        |

## settings.json knobs (separate from piedcc)

These live in `~/.claude/settings.json` under `statusLine`:

| Field                  | Effect                                                                                                                                   |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `padding`              | Extra horizontal indent. Defaults to `0`.                                                                                                |
| `refreshInterval`      | Re-runs the command every N seconds in addition to event-driven updates. Set to `60` so reset countdowns (`5h0m`) stay live during idle. |
| `hideVimModeIndicator` | Hides CC's built-in `-- INSERT --` strip below the prompt.                                                                               |

## Debugging

Every render dumps two files:

- `/tmp/piedcc-stdin-latest.json` — the JSON CC sent to the script
- `/tmp/piedcc-debug-latest.txt` — detected column count, line widths, raw ANSI output

If a segment looks wrong, those two files tell you whether the data is
absent from CC's payload, whether width detection failed, or whether
the rendered output is being clipped by CC's chrome.

## Force a re-seed

```bash
rm ~/.claude/piedcc/statusline.json
```

Next render writes a fresh defaults file.
