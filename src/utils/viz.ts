// src/utils/viz.ts
/**
 * Terminal-safe visualization utilities for influence networks.
 * All output is plain text / Unicode that embeds in markdown code blocks.
 * Uses chalk for color-coding connection types.
 */

import chalk from "chalk";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PathStep {
  artist: string;
  connection?: string; // e.g., "influenced", "co-mentioned", "collaborated"
  evidence?: string; // e.g., "Last.fm similarity: 0.82", "Pitchfork review"
  sources?: SourceCitation[]; // Review/article URLs supporting this connection
}

export interface SourceCitation {
  url: string;
  title?: string;
  domain: string; // e.g., "pitchfork.com"
  author?: string; // Article author/byline when available
  published_date?: string; // Publication date when available
}

export interface Connection {
  artist: string;
  direction: "to" | "from" | "mutual";
  type: string; // "influence", "co_mention", "collaboration", "sample", "similar"
  evidence?: string;
  weight?: number; // 0-1 strength
  sources?: SourceCitation[]; // Review/article URLs supporting this connection
}

export interface GraphNode {
  id: string;
  label: string;
  group?: string;
}

export interface GraphEdge {
  from: string;
  to: string;
  label?: string;
  weight?: number;
}

// ---------------------------------------------------------------------------
// Color coding by connection type
// ---------------------------------------------------------------------------

const TYPE_COLORS: Record<string, (s: string) => string> = {
  influence: chalk.cyan,
  co_mention: chalk.yellow,
  collaboration: chalk.green,
  sample: chalk.magenta,
  cover: chalk.magenta,
  remix: chalk.magenta,
  similar: chalk.blue,
  bridge: chalk.red,
};

function colorForType(type: string): (s: string) => string {
  return TYPE_COLORS[type] ?? chalk.white;
}

// ---------------------------------------------------------------------------
// Direction arrows
// ---------------------------------------------------------------------------

const ARROWS: Record<string, string> = {
  to: "→",
  from: "←",
  mutual: "↔",
};

// ---------------------------------------------------------------------------
// renderInfluencePath
// ---------------------------------------------------------------------------

/**
 * Render a chain of artists as a vertical influence path.
 *
 * Example:
 *   Kraftwerk
 *     │ influenced (Wikipedia: "pioneered electronic pop")
 *     ▼
 *   Depeche Mode
 *     │ co-mentioned (Pitchfork review, 1997)
 *     ▼
 *   Radiohead
 */
export function renderInfluencePath(path: PathStep[]): string {
  if (path.length === 0) return "";
  if (path.length === 1) return `  ${chalk.bold(path[0]!.artist)}`;

  const lines: string[] = [];

  for (let i = 0; i < path.length; i++) {
    const step = path[i]!;
    lines.push(`  ${chalk.bold.white(step.artist)}`);

    if (i < path.length - 1) {
      const conn = step.connection ?? "connected";
      const ev = step.evidence ? ` (${step.evidence})` : "";
      const color = colorForType(conn.includes("co-mention") ? "co_mention" :
        conn.includes("collab") ? "collaboration" :
        conn.includes("sample") ? "sample" : "influence");
      lines.push(`    ${chalk.dim("│")} ${color(conn)}${chalk.dim(ev)}`);
      lines.push(`    ${chalk.dim("▼")}`);
    }
  }

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// renderAdjacencyList
// ---------------------------------------------------------------------------

/**
 * Render connections around a center artist as a categorized adjacency list.
 *
 * Example:
 *   Aphex Twin
 *     → Boards of Canada (Last.fm: 0.78, 8 review co-mentions)
 *     → Autechre (Last.fm: 0.71, same label)
 *     ← Kraftwerk (Wikipedia, Last.fm: 0.34)
 *     ↔ Squarepusher (Warp Records, collaborated)
 */
export function renderAdjacencyList(
  centerArtist: string,
  connections: Connection[],
): string {
  if (connections.length === 0) {
    return `  ${chalk.bold(centerArtist)}\n    ${chalk.dim("(no connections found)")}`;
  }

  // Sort: mutual first, then "from" (influenced by), then "to" (influenced)
  const sorted = [...connections].sort((a, b) => {
    const order = { mutual: 0, from: 1, to: 2 };
    return (order[a.direction] ?? 3) - (order[b.direction] ?? 3);
  });

  const lines: string[] = [];
  lines.push(`  ${chalk.bold.white(centerArtist)}`);

  for (const conn of sorted) {
    const arrow = ARROWS[conn.direction] ?? "→";
    const color = colorForType(conn.type);
    const ev = conn.evidence ? chalk.dim(` (${conn.evidence})`) : "";
    const weight = conn.weight != null ? chalk.dim(` [${(conn.weight * 100).toFixed(0)}%]`) : "";
    lines.push(`    ${color(arrow)} ${chalk.white(conn.artist)}${ev}${weight}`);
  }

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// renderInfluenceWeb
// ---------------------------------------------------------------------------

/**
 * Render a categorized influence web around a center artist.
 * Groups connections by type for readability.
 *
 * Example:
 *   Aphex Twin's Influence Network
 *   ═══════════════════════════════
 *
 *   Influenced by:
 *     ← Kraftwerk (Wikipedia, Last.fm: 0.34)
 *
 *   Collaborators:
 *     ↔ Squarepusher (Warp Records)
 *
 *   Influenced:
 *     → Boards of Canada (Last.fm: 0.78)
 *
 *   Bridge connections:
 *     ⋯ Burial (connects to dubstep/garage)
 */
export function renderInfluenceWeb(
  centerArtist: string,
  connections: Connection[],
): string {
  if (connections.length === 0) {
    return `  ${chalk.bold(centerArtist)}'s Influence Network\n\n    ${chalk.dim("No connections found.")}`;
  }

  const lines: string[] = [];
  const title = `${centerArtist}'s Influence Network`;
  lines.push(`  ${chalk.bold.white(title)}`);
  lines.push(`  ${chalk.dim("═".repeat(title.length))}`);

  // Group by category
  const influencedBy = connections.filter(
    (c) => c.direction === "from" && (c.type === "influence" || c.type === "similar"),
  );
  const collaborators = connections.filter(
    (c) => c.direction === "mutual" || c.type === "collaboration",
  );
  const influenced = connections.filter(
    (c) => c.direction === "to" && c.type !== "collaboration",
  );
  const bridges = connections.filter((c) => c.type === "bridge");

  const renderGroup = (label: string, items: Connection[]) => {
    if (items.length === 0) return;
    lines.push("");
    lines.push(`  ${chalk.bold(label)}`);
    for (const conn of items) {
      const arrow = ARROWS[conn.direction] ?? "⋯";
      const color = colorForType(conn.type);
      const ev = conn.evidence ? chalk.dim(` (${conn.evidence})`) : "";
      lines.push(`    ${color(arrow)} ${chalk.white(conn.artist)}${ev}`);
    }
  };

  renderGroup("Influenced by:", influencedBy);
  renderGroup("Collaborators:", collaborators);
  renderGroup("Influenced:", influenced);
  renderGroup("Bridge connections:", bridges);

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// renderArtistCard
// ---------------------------------------------------------------------------

/**
 * Render a highlighted artist card using boxen-style Unicode borders.
 * Lightweight — no boxen dependency, just Unicode box-drawing.
 */
export function renderArtistCard(
  artist: string,
  details: { role?: string; genres?: string[]; connections?: number; evidence?: string },
): string {
  const lines: string[] = [];
  lines.push(chalk.bold.white(artist));
  if (details.role) lines.push(chalk.dim(details.role));
  if (details.genres?.length) lines.push(chalk.cyan(details.genres.join(" · ")));
  if (details.connections != null) lines.push(chalk.dim(`${details.connections} connections`));
  if (details.evidence) lines.push(chalk.dim(details.evidence));

  const maxLen = Math.max(...lines.map((l) => stripAnsi(l).length));
  const pad = (s: string) => s + " ".repeat(Math.max(0, maxLen - stripAnsi(s).length));

  const top = `  ┌${"─".repeat(maxLen + 2)}┐`;
  const bottom = `  └${"─".repeat(maxLen + 2)}┘`;
  const body = lines.map((l) => `  │ ${pad(l)} │`).join("\n");

  return `${top}\n${body}\n${bottom}`;
}

// ---------------------------------------------------------------------------
// renderStrengthBar
// ---------------------------------------------------------------------------

/**
 * Render a simple strength/confidence bar.
 * Example: ████████░░ 4/5
 */
export function renderStrengthBar(value: number, max: number = 5): string {
  const filled = Math.round(value);
  const empty = max - filled;
  return `${"█".repeat(filled)}${"░".repeat(empty)} ${filled}/${max}`;
}

// ---------------------------------------------------------------------------
// renderInlineChain
// ---------------------------------------------------------------------------

/**
 * Render a compact inline influence chain.
 * Example: Kraftwerk → Depeche Mode → Nine Inch Nails
 */
export function renderInlineChain(artists: string[]): string {
  return artists.map((a) => chalk.white(a)).join(chalk.dim(" → "));
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Strip ANSI escape codes for length calculations */
function stripAnsi(s: string): string {
  // eslint-disable-next-line no-control-regex
  return s.replace(/\x1b\[[0-9;]*m/g, "");
}
