// src/utils/env.ts — .env file read/write utilities
import { readFileSync, writeFileSync, existsSync } from "fs";
import { resolve } from "path";

export interface EnvLine {
  raw: string;
  key?: string;
  value?: string;
  commented?: boolean;
}

export interface EnvFile {
  lines: EnvLine[];
  vars: Map<string, { value: string; lineIndex: number; commented: boolean }>;
}

/** Resolve the .env file path (project root). */
export function getEnvPath(): string {
  return resolve(process.cwd(), ".env");
}

/** Parse a .env file, preserving comments and blank lines. */
export function readEnvFile(path: string): EnvFile {
  const vars = new Map<string, { value: string; lineIndex: number; commented: boolean }>();

  if (!existsSync(path)) {
    return { lines: [], vars };
  }

  const raw = readFileSync(path, "utf-8");
  const lines: EnvLine[] = raw.split("\n").map((line) => {
    const trimmed = line.trim();

    // Blank line or pure comment (not a commented-out var)
    if (!trimmed || (trimmed.startsWith("#") && !trimmed.match(/^#\s*[A-Z][A-Z0-9_]+=/))){
      return { raw: line };
    }

    // Commented-out variable: # KEY=value
    const commentedMatch = trimmed.match(/^#\s*([A-Z][A-Z0-9_]+)=(.*)/);
    if (commentedMatch) {
      return {
        raw: line,
        key: commentedMatch[1],
        value: commentedMatch[2],
        commented: true,
      };
    }

    // Active variable: KEY=value
    const activeMatch = trimmed.match(/^([A-Z][A-Z0-9_]+)=(.*)/);
    if (activeMatch) {
      return {
        raw: line,
        key: activeMatch[1],
        value: activeMatch[2],
        commented: false,
      };
    }

    return { raw: line };
  });

  // Build vars map (last occurrence wins)
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    if (line.key) {
      vars.set(line.key, {
        value: line.value ?? "",
        lineIndex: i,
        commented: !!line.commented,
      });
    }
  }

  return { lines, vars };
}

/** Serialize EnvFile lines back to string. */
function serializeEnv(lines: EnvLine[]): string {
  return lines.map((l) => l.raw).join("\n");
}

/** Set a key in .env (uncomments if commented, appends if missing). Preserves all other content. */
export function writeEnvKey(path: string, key: string, value: string): void {
  const env = readEnvFile(path);
  const existing = env.vars.get(key);

  if (existing !== undefined) {
    // Update existing line (uncomment if needed)
    const line = env.lines[existing.lineIndex]!;
    line.raw = `${key}=${value}`;
    line.key = key;
    line.value = value;
    line.commented = false;
  } else {
    // Append new line
    env.lines.push({ raw: `${key}=${value}`, key, value, commented: false });
  }

  writeFileSync(path, serializeEnv(env.lines), "utf-8");
}

/** Comment out a key (prefix with "# "). Does NOT delete the line. */
export function deleteEnvKey(path: string, key: string): void {
  const env = readEnvFile(path);
  const existing = env.vars.get(key);

  if (existing === undefined || existing.commented) return;

  const line = env.lines[existing.lineIndex]!;
  line.raw = `# ${key}=${line.value ?? ""}`;
  line.commented = true;

  writeFileSync(path, serializeEnv(env.lines), "utf-8");
}
