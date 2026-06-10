/**
 * Config<T> — file-backed config with optional project layering.
 *
 * - `userPath` is the canonical user config (e.g. ~/.pi/agent/config/<feature>.json).
 * - `projectPath()` is optional and called lazily; when present it is
 *   deep-merged on top of the user config. Useful for `<worktree>/.pi/<feature>.json`.
 * - `arrayAppendKeys` lists object keys whose array values should be
 *   appended (project rules added after user rules) rather than replaced.
 *   Built for hooks/permissions lists.
 * - `parse` validates/normalises the merged raw object into T. Throws-free:
 *   if anything fails it should fall back to defaults.
 *
 * Behaviour-preserving for current extensions when no project path is set.
 */

import {
  existsSync,
  mkdirSync,
  readFileSync,
  watch,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";

/**
 * Walk up from `cwd` looking for a `.pi/` directory. Returns the directory
 * that contains `.pi/` (the project root), or undefined if none found.
 */
export function findProjectRoot(
  cwd: string = process.cwd(),
): string | undefined {
  let dir = cwd;
  while (true) {
    if (existsSync(join(dir, ".pi"))) return dir;
    const parent = dirname(dir);
    if (parent === dir) return undefined;
    dir = parent;
  }
}

/**
 * `<project-root>/.pi/<fileName>` if a project root is found, else undefined.
 * Suitable as `projectPath` for `Config<T>`.
 */
export function projectConfigPath(fileName: string): string | undefined {
  const root = findProjectRoot();
  return root ? join(root, ".pi", fileName) : undefined;
}

export type ConfigOptions<T> = {
  userPath: string;
  projectPath?: () => string | undefined;
  defaults: T;
  parse: (raw: unknown) => T;
  arrayAppendKeys?: string[];
};

export class Config<T> {
  private cached: T;
  private listeners: Array<(value: T) => void> = [];

  constructor(private readonly opts: ConfigOptions<T>) {
    this.cached = this.computeMerged();
  }

  get(): T {
    return this.cached;
  }

  reload(): T {
    this.cached = this.computeMerged();
    return this.cached;
  }

  save(value: T): void {
    this.cached = value;
    mkdirSync(dirname(this.opts.userPath), { recursive: true });
    writeFileSync(
      this.opts.userPath,
      `${JSON.stringify(value, null, 2)}\n`,
    );
  }

  onChange(callback: (value: T) => void): () => void {
    this.listeners.push(callback);
    return () => {
      this.listeners = this.listeners.filter((cb) => cb !== callback);
    };
  }

  /**
   * Watch user + project paths for external edits. Calls listeners only
   * when the resolved merged config actually changes (cheap JSON-stringify
   * compare). Returns a dispose function.
   */
  watch(): () => void {
    const closers: Array<() => void> = [];
    const fire = () => {
      const prev = JSON.stringify(this.cached);
      this.reload();
      if (JSON.stringify(this.cached) === prev) return;
      for (const cb of this.listeners) cb(this.cached);
    };
    closers.push(safeWatch(this.opts.userPath, fire));
    const projectPath = this.opts.projectPath?.();
    if (projectPath) closers.push(safeWatch(projectPath, fire));
    return () => closers.forEach((c) => c());
  }

  private computeMerged(): T {
    const layers: Array<Record<string, unknown> | undefined> = [];
    layers.push(this.opts.defaults as unknown as Record<string, unknown>);
    layers.push(readJson(this.opts.userPath));
    const projectPath = this.opts.projectPath?.();
    if (projectPath) layers.push(readJson(projectPath));

    let merged: Record<string, unknown> = {};
    for (const layer of layers) {
      if (!layer) continue;
      merged = deepMerge(merged, layer, this.opts.arrayAppendKeys ?? []);
    }
    try {
      return this.opts.parse(merged);
    } catch {
      return structuredClone(this.opts.defaults);
    }
  }
}

function readJson(path: string | undefined): Record<string, unknown> | undefined {
  if (!path) return undefined;
  if (!existsSync(path)) return undefined;
  try {
    const parsed = JSON.parse(readFileSync(path, "utf-8"));
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
    return undefined;
  } catch {
    return undefined;
  }
}

function safeWatch(path: string, onChange: () => void): () => void {
  try {
    if (!existsSync(path)) return () => {};
    const w = watch(path, { persistent: false }, onChange);
    return () => {
      try {
        w.close();
      } catch {
        /* ignore */
      }
    };
  } catch {
    return () => {};
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function deepMerge(
  target: Record<string, unknown>,
  source: Record<string, unknown>,
  arrayAppendKeys: string[],
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...target };
  for (const [key, value] of Object.entries(source)) {
    if (
      arrayAppendKeys.includes(key) &&
      Array.isArray(out[key]) &&
      Array.isArray(value)
    ) {
      out[key] = [...(out[key] as unknown[]), ...value];
    } else if (isPlainObject(out[key]) && isPlainObject(value)) {
      out[key] = deepMerge(
        out[key] as Record<string, unknown>,
        value,
        arrayAppendKeys,
      );
    } else {
      out[key] = value;
    }
  }
  return out;
}
