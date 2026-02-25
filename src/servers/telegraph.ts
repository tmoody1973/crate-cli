// src/servers/telegraph.ts
import { tool, createSdkMcpServer } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import { getDb } from "../utils/db.js";

type ToolResult = { content: [{ type: "text"; text: string }] };

function toolResult(data: unknown): ToolResult {
  return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
}

function toolError(error: unknown): ToolResult {
  const message = error instanceof Error ? error.message : String(error);
  return { content: [{ type: "text" as const, text: JSON.stringify({ error: message }) }] };
}

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

function ensureSchema(): void {
  const d = getDb("telegraph");
  d.exec(`
    CREATE TABLE IF NOT EXISTS account (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      access_token TEXT NOT NULL,
      author_name TEXT,
      author_url TEXT,
      index_page_path TEXT
    );
    CREATE TABLE IF NOT EXISTS entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      telegraph_path TEXT NOT NULL,
      telegraph_url TEXT NOT NULL,
      category TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );
  `);
}

let schemaReady = false;
function db() {
  if (!schemaReady) {
    ensureSchema();
    schemaReady = true;
  }
  return getDb("telegraph");
}

/** Reset schema flag (for test isolation). */
export function _resetSchema(): void {
  schemaReady = false;
}

// ---------------------------------------------------------------------------
// Telegraph API helpers
// ---------------------------------------------------------------------------

const TELEGRAPH_API = "https://api.telegra.ph";

interface TelegraphNode {
  tag: string;
  attrs?: Record<string, string>;
  children?: (string | TelegraphNode)[];
}

interface TelegraphResponse {
  ok: boolean;
  result?: any;
  error?: string;
}

async function telegraphCall(method: string, params: Record<string, any>): Promise<TelegraphResponse> {
  const res = await fetch(`${TELEGRAPH_API}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });
  return (await res.json()) as TelegraphResponse;
}

// ---------------------------------------------------------------------------
// Markdown -> Telegraph Nodes converter
// ---------------------------------------------------------------------------

function parseInline(text: string): (string | TelegraphNode)[] {
  const result: (string | TelegraphNode)[] = [];
  // Regex matches: `code`, **bold**, *italic*, [text](url), bare URLs
  const inlineRe = /`([^`]+?)`|\*\*(.+?)\*\*|\*(.+?)\*|\[([^\]]+)\]\(([^)]+)\)|(https?:\/\/[^\s,)<>]+)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = inlineRe.exec(text)) !== null) {
    // Text before the match
    if (match.index > lastIndex) {
      result.push(text.slice(lastIndex, match.index));
    }

    if (match[1] !== undefined) {
      // `code`
      result.push({ tag: "code", children: [match[1]] });
    } else if (match[2] !== undefined) {
      // **bold**
      result.push({ tag: "b", children: [match[2]] });
    } else if (match[3] !== undefined) {
      // *italic*
      result.push({ tag: "em", children: [match[3]] });
    } else if (match[4] !== undefined && match[5] !== undefined) {
      // [text](url)
      result.push({ tag: "a", attrs: { href: match[5] }, children: [match[4]] });
    } else if (match[6] !== undefined) {
      // bare URL
      result.push({ tag: "a", attrs: { href: match[6] }, children: [match[6]] });
    }

    lastIndex = match.index + match[0].length;
  }

  // Remaining text
  if (lastIndex < text.length) {
    result.push(text.slice(lastIndex));
  }

  return result;
}

export function markdownToNodes(text: string): TelegraphNode[] {
  const nodes: TelegraphNode[] = [];
  const lines = text.split("\n");
  let i = 0;

  while (i < lines.length) {
    const line = lines[i]!;

    // Blank lines — skip
    if (line.trim() === "") {
      i++;
      continue;
    }

    // Horizontal rule
    if (/^---+$/.test(line.trim())) {
      nodes.push({ tag: "hr" });
      i++;
      continue;
    }

    // Headings (## or ### → h4, Telegraph only supports h3/h4)
    const headingMatch = line.match(/^#{2,3}\s+(.+)$/);
    if (headingMatch) {
      nodes.push({ tag: "h4", children: parseInline(headingMatch[1]!) });
      i++;
      continue;
    }

    // Blockquote (> text)
    if (line.startsWith("> ")) {
      const quoteLines: string[] = [];
      while (i < lines.length && lines[i]?.startsWith("> ")) {
        quoteLines.push(lines[i]!.slice(2));
        i++;
      }
      nodes.push({ tag: "blockquote", children: parseInline(quoteLines.join("\n")) });
      continue;
    }

    // Unordered list (- item)
    if (/^[-*]\s+/.test(line)) {
      const listItems: TelegraphNode[] = [];
      while (i < lines.length && /^[-*]\s+/.test(lines[i] ?? "")) {
        const itemText = (lines[i] ?? "").replace(/^[-*]\s+/, "");
        listItems.push({ tag: "li", children: parseInline(itemText) });
        i++;
      }
      nodes.push({ tag: "ul", children: listItems });
      continue;
    }

    // Fenced code block (```lang ... ```)
    if (line.trimEnd().startsWith("```")) {
      i++;
      const codeLines: string[] = [];
      while (i < lines.length && !lines[i]!.trimEnd().startsWith("```")) {
        codeLines.push(lines[i]!);
        i++;
      }
      if (i < lines.length) i++; // skip closing ```
      nodes.push({ tag: "pre", children: [codeLines.join("\n")] });
      continue;
    }

    // Default: paragraph
    nodes.push({ tag: "p", children: parseInline(line) });
    i++;
  }

  return nodes;
}

// ---------------------------------------------------------------------------
// Index page builder
// ---------------------------------------------------------------------------

interface EntryRow {
  id: number;
  title: string;
  telegraph_path: string;
  telegraph_url: string;
  category: string | null;
  created_at: string;
}

function buildIndexContent(authorName: string, entries: EntryRow[]): TelegraphNode[] {
  const nodes: TelegraphNode[] = [];

  // Header
  nodes.push({ tag: "p", children: [{ tag: "b", children: [`${authorName}'s Crate Digs`] }] });
  nodes.push({ tag: "hr" });

  if (entries.length === 0) {
    nodes.push({ tag: "p", children: [{ tag: "em", children: ["No entries yet. Start sharing your discoveries!"] }] });
    return nodes;
  }

  // Entry list (newest first)
  for (const entry of entries) {
    const date = entry.created_at
      ? new Date(entry.created_at + "Z").toLocaleDateString("en-US", { month: "short", day: "numeric" })
      : "";
    const categoryTag = entry.category ? `[${entry.category.charAt(0).toUpperCase() + entry.category.slice(1)}] ` : "";
    const label = `${categoryTag}${entry.title} (${date})`;

    nodes.push({
      tag: "p",
      children: [
        { tag: "a", attrs: { href: entry.telegraph_url }, children: [label] },
      ],
    });
  }

  return nodes;
}

async function rebuildIndex(): Promise<void> {
  const d = db();
  const account = d.prepare("SELECT * FROM account WHERE id = 1").get() as any;
  if (!account?.index_page_path) return;

  const entries = d
    .prepare("SELECT * FROM entries ORDER BY created_at DESC")
    .all() as EntryRow[];

  const authorName = account.author_name || "My";
  const content = buildIndexContent(authorName, entries);

  const resp = await telegraphCall("editPage", {
    access_token: account.access_token,
    path: account.index_page_path,
    title: `${authorName}'s Crate Digs`,
    content: JSON.stringify(content),
    return_content: false,
  });

  if (!resp.ok) {
    throw new Error(`Failed to update index page: ${resp.error ?? "unknown error"}`);
  }
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

export async function setupPageHandler(args: {
  author_name?: string;
}): Promise<ToolResult> {
  try {
    const d = db();

    // Check if already set up
    const existing = d.prepare("SELECT * FROM account WHERE id = 1").get() as any;
    if (existing?.index_page_path) {
      return toolResult({
        status: "already_setup",
        url: `https://telegra.ph/${existing.index_page_path}`,
        author_name: existing.author_name,
      });
    }

    const authorName = args.author_name || "Crate Digger";

    // Create Telegraph account
    const accountResp = await telegraphCall("createAccount", {
      short_name: "crate",
      author_name: authorName,
    });

    if (!accountResp.ok || !accountResp.result?.access_token) {
      throw new Error(`Failed to create Telegraph account: ${accountResp.error ?? "unknown error"}`);
    }

    const accessToken = accountResp.result.access_token as string;

    // Create index page
    const indexContent = buildIndexContent(authorName, []);
    const pageResp = await telegraphCall("createPage", {
      access_token: accessToken,
      title: `${authorName}'s Crate Digs`,
      content: JSON.stringify(indexContent),
      author_name: authorName,
      return_content: false,
    });

    if (!pageResp.ok || !pageResp.result?.path) {
      throw new Error(`Failed to create index page: ${pageResp.error ?? "unknown error"}`);
    }

    const indexPath = pageResp.result.path as string;
    const indexUrl = pageResp.result.url as string;

    // Store in SQLite
    if (existing) {
      d.prepare(
        "UPDATE account SET access_token = ?, author_name = ?, index_page_path = ? WHERE id = 1",
      ).run(accessToken, authorName, indexPath);
    } else {
      d.prepare(
        "INSERT INTO account (id, access_token, author_name, index_page_path) VALUES (1, ?, ?, ?)",
      ).run(accessToken, authorName, indexPath);
    }

    return toolResult({
      status: "created",
      url: indexUrl,
      author_name: authorName,
    });
  } catch (error) {
    return toolError(error);
  }
}

export async function postToPageHandler(args: {
  title: string;
  content: string;
  category?: string;
}): Promise<ToolResult> {
  try {
    const d = db();
    const account = d.prepare("SELECT * FROM account WHERE id = 1").get() as any;
    if (!account?.access_token) {
      throw new Error("No Crate page set up yet. Use setup_page first.");
    }

    // Convert markdown content to Telegraph nodes
    const contentNodes = markdownToNodes(args.content);

    // Create entry page
    const pageResp = await telegraphCall("createPage", {
      access_token: account.access_token,
      title: args.title,
      content: JSON.stringify(contentNodes),
      author_name: account.author_name || "Crate Digger",
      return_content: false,
    });

    if (!pageResp.ok || !pageResp.result?.path) {
      throw new Error(`Failed to create entry page: ${pageResp.error ?? "unknown error"}`);
    }

    const entryPath = pageResp.result.path as string;
    const entryUrl = pageResp.result.url as string;

    // Store entry in DB
    d.prepare(
      "INSERT INTO entries (title, telegraph_path, telegraph_url, category) VALUES (?, ?, ?, ?)",
    ).run(args.title, entryPath, entryUrl, args.category ?? null);

    // Rebuild index page
    await rebuildIndex();

    return toolResult({
      status: "published",
      url: entryUrl,
      title: args.title,
      category: args.category ?? null,
      index_url: `https://telegra.ph/${account.index_page_path}`,
    });
  } catch (error) {
    return toolError(error);
  }
}

export async function viewMyPageHandler(_args: Record<string, never>): Promise<ToolResult> {
  try {
    const d = db();
    const account = d.prepare("SELECT * FROM account WHERE id = 1").get() as any;
    if (!account?.index_page_path) {
      return toolResult({
        status: "not_setup",
        message: "No Crate page set up yet. Use setup_page to create one.",
      });
    }

    const entries = d
      .prepare("SELECT * FROM entries ORDER BY created_at DESC LIMIT 20")
      .all() as EntryRow[];

    const totalCount = (
      d.prepare("SELECT COUNT(*) as count FROM entries").get() as any
    ).count;

    return toolResult({
      url: `https://telegra.ph/${account.index_page_path}`,
      author_name: account.author_name,
      total_entries: totalCount,
      recent_entries: entries.map((e) => ({
        id: e.id,
        title: e.title,
        url: e.telegraph_url,
        category: e.category,
        created_at: e.created_at,
      })),
    });
  } catch (error) {
    return toolError(error);
  }
}

export async function listEntriesHandler(args: {
  category?: string;
  limit?: number;
}): Promise<ToolResult> {
  try {
    const d = db();
    const params: any[] = [];
    let sql = "SELECT * FROM entries";

    if (args.category) {
      sql += " WHERE category = ?";
      params.push(args.category);
    }

    sql += " ORDER BY created_at DESC LIMIT ?";
    params.push(args.limit ?? 50);

    const entries = d.prepare(sql).all(...params) as EntryRow[];

    return toolResult({
      entries: entries.map((e) => ({
        id: e.id,
        title: e.title,
        url: e.telegraph_url,
        category: e.category,
        created_at: e.created_at,
      })),
      count: entries.length,
    });
  } catch (error) {
    return toolError(error);
  }
}

export async function deleteEntryHandler(args: {
  entry_id: number;
}): Promise<ToolResult> {
  try {
    const d = db();
    const entry = d.prepare("SELECT * FROM entries WHERE id = ?").get(args.entry_id) as EntryRow | undefined;
    if (!entry) {
      throw new Error(`Entry with id ${args.entry_id} not found`);
    }

    d.prepare("DELETE FROM entries WHERE id = ?").run(args.entry_id);

    // Rebuild index page
    await rebuildIndex();

    return toolResult({
      status: "removed",
      id: args.entry_id,
      title: entry.title,
      note: "Entry removed from index. The Telegraph page itself cannot be deleted but is no longer linked.",
    });
  } catch (error) {
    return toolError(error);
  }
}

// ---------------------------------------------------------------------------
// Tool definitions
// ---------------------------------------------------------------------------

const setupPage = tool(
  "setup_page",
  "Create your Crate social page on Telegraph. One-time setup that returns a shareable URL. Idempotent — returns existing page if already set up.",
  {
    author_name: z.string().max(128).optional().describe("Display name for your page (default: 'Crate Digger')"),
  },
  setupPageHandler,
);

const postToPage = tool(
  "post_to_page",
  "Publish a new entry to your Crate social page. Content is markdown (headings, bold, italic, links, lists, blockquotes). The entry gets its own page and is linked from your index.",
  {
    title: z.string().max(256).describe("Entry title"),
    content: z.string().describe("Entry content in markdown format"),
    category: z
      .enum(["influence", "artist", "playlist", "collection", "note"])
      .optional()
      .describe("Entry category shown on index page"),
  },
  postToPageHandler,
);

const viewMyPage = tool(
  "view_my_page",
  "Get your Crate social page URL, entry count, and recent entries.",
  {},
  viewMyPageHandler,
);

const listEntries = tool(
  "list_entries",
  "List all published entries on your Crate page. Optionally filter by category.",
  {
    category: z
      .enum(["influence", "artist", "playlist", "collection", "note"])
      .optional()
      .describe("Filter by entry category"),
    limit: z.number().optional().describe("Max entries to return (default 50)"),
  },
  listEntriesHandler,
);

const deleteEntry = tool(
  "delete_entry",
  "Remove an entry from your Crate page index. The Telegraph page still exists but is unlinked from your index.",
  {
    entry_id: z.number().describe("Entry ID to remove"),
  },
  deleteEntryHandler,
);

// ---------------------------------------------------------------------------
// Server export
// ---------------------------------------------------------------------------

export const telegraphServer = createSdkMcpServer({
  name: "telegraph",
  version: "1.0.0",
  tools: [setupPage, postToPage, viewMyPage, listEntries, deleteEntry],
});
