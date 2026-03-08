// src/skills/registry.ts — Load and match SKILL.md research workflows
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

export interface Skill {
  name: string;
  description: string;
  triggers: string[];
  toolsPriority: string[];
  instructions: string;
}

/** Parse YAML-like frontmatter from a SKILL.md file. Minimal parser — no deps. */
function parseFrontmatter(raw: string): { meta: Record<string, string | string[]>; body: string } {
  const lines = raw.split("\n");
  if (lines[0]?.trim() !== "---") {
    return { meta: {}, body: raw };
  }

  let endIdx = -1;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i]?.trim() === "---") {
      endIdx = i;
      break;
    }
  }
  if (endIdx === -1) {
    return { meta: {}, body: raw };
  }

  const meta: Record<string, string | string[]> = {};
  let currentKey = "";

  for (let i = 1; i < endIdx; i++) {
    const line = lines[i]!;

    // Array item: "  - value"
    if (/^\s+-\s+/.test(line)) {
      const value = line.replace(/^\s+-\s+/, "").replace(/^"(.*)"$/, "$1").trim();
      const existing = meta[currentKey];
      if (Array.isArray(existing)) {
        existing.push(value);
      } else {
        meta[currentKey] = [value];
      }
      continue;
    }

    // Key-value: "key: value" or "key: [val1, val2]"
    const kvMatch = line.match(/^(\w[\w_]*)\s*:\s*(.*)/);
    if (kvMatch) {
      currentKey = kvMatch[1]!;
      const rawVal = kvMatch[2]!.trim();

      // Inline array: [val1, val2, val3]
      if (rawVal.startsWith("[") && rawVal.endsWith("]")) {
        meta[currentKey] = rawVal
          .slice(1, -1)
          .split(",")
          .map((s) => s.trim().replace(/^"(.*)"$/, "$1"));
      } else if (rawVal) {
        meta[currentKey] = rawVal.replace(/^"(.*)"$/, "$1");
      }
    }
  }

  const body = lines.slice(endIdx + 1).join("\n").trim();
  return { meta, body };
}

export class SkillRegistry {
  private skills: Skill[] = [];

  /** Scan src/skills/ subdirectories for SKILL.md files and parse frontmatter + body. */
  async loadAll(): Promise<void> {
    this.skills = []; // Clear to ensure idempotency

    // Resolve skills directory — check src/ first (dev), fall back to dist location
    const thisFile = fileURLToPath(import.meta.url);
    const compiledDir = dirname(thisFile);
    const srcDir = join(compiledDir, "..", "..", "src", "skills");
    let skillsDir: string;
    try {
      readdirSync(srcDir);
      skillsDir = srcDir;
    } catch {
      skillsDir = compiledDir;
    }

    let entries: string[];
    try {
      entries = readdirSync(skillsDir);
    } catch {
      return;
    }

    for (const entry of entries) {
      const entryPath = join(skillsDir, entry);
      try {
        if (!statSync(entryPath).isDirectory()) continue;
      } catch {
        continue;
      }

      const skillFile = join(entryPath, "SKILL.md");
      let raw: string;
      try {
        raw = readFileSync(skillFile, "utf-8");
      } catch {
        continue;
      }

      const { meta, body } = parseFrontmatter(raw);
      const name = (typeof meta.name === "string" ? meta.name : entry) || entry;
      const description = typeof meta.description === "string" ? meta.description : "";
      const triggers = Array.isArray(meta.triggers) ? meta.triggers : [];
      const toolsPriority = Array.isArray(meta.tools_priority) ? meta.tools_priority : [];

      this.skills.push({
        name,
        description,
        triggers,
        toolsPriority,
        instructions: body,
      });
    }
  }

  /** Case-insensitive trigger matching against the user's query. Longest trigger wins to avoid false matches. */
  matchQuery(query: string): Skill | null {
    const lower = query.toLowerCase();
    let bestMatch: Skill | null = null;
    let bestLength = 0;

    for (const skill of this.skills) {
      for (const trigger of skill.triggers) {
        const triggerLower = trigger.toLowerCase();
        if (lower.includes(triggerLower) && triggerLower.length > bestLength) {
          bestMatch = skill;
          bestLength = triggerLower.length;
        }
      }
    }
    return bestMatch;
  }

  /** List all loaded skills — for /help output. */
  listSkills(): Array<{ name: string; description: string }> {
    return this.skills.map((s) => ({ name: s.name, description: s.description }));
  }
}
