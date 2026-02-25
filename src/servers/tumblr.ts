// src/servers/tumblr.ts
import { tool, createSdkMcpServer } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import { getDb } from "../utils/db.js";
import * as http from "node:http";
import * as crypto from "node:crypto";
import { exec } from "node:child_process";

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
  const d = getDb("tumblr");
  d.exec(`
    CREATE TABLE IF NOT EXISTS tumblr_auth (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      oauth_token TEXT NOT NULL,
      oauth_token_secret TEXT NOT NULL,
      blog_name TEXT NOT NULL,
      blog_url TEXT NOT NULL,
      blog_uuid TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS tumblr_posts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tumblr_post_id TEXT NOT NULL,
      title TEXT NOT NULL,
      blog_name TEXT NOT NULL,
      post_url TEXT NOT NULL,
      category TEXT,
      tags TEXT,
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
  return getDb("tumblr");
}

/** Reset schema flag (for test isolation). */
export function _resetSchema(): void {
  schemaReady = false;
}

// ---------------------------------------------------------------------------
// OAuth 1.0a helpers
// ---------------------------------------------------------------------------

const TUMBLR_API = "https://api.tumblr.com/v2";

function getConsumerKey(): string {
  const key = process.env.TUMBLR_CONSUMER_KEY;
  if (!key) throw new Error("TUMBLR_CONSUMER_KEY not set");
  return key;
}

function getConsumerSecret(): string {
  const secret = process.env.TUMBLR_CONSUMER_SECRET;
  if (!secret) throw new Error("TUMBLR_CONSUMER_SECRET not set");
  return secret;
}

/** RFC 5849 percent-encode. */
function percentEncode(str: string): string {
  return encodeURIComponent(str).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
}

function generateNonce(): string {
  return crypto.randomBytes(16).toString("hex");
}

function generateTimestamp(): string {
  return Math.floor(Date.now() / 1000).toString();
}

function hmacSha1(key: string, data: string): string {
  return crypto.createHmac("sha1", key).update(data).digest("base64");
}

/** Build OAuth 1.0a base string for signing. */
function buildBaseString(method: string, url: string, params: Record<string, string>): string {
  const sorted = Object.keys(params)
    .sort()
    .map((k) => `${percentEncode(k)}=${percentEncode(params[k]!)}`)
    .join("&");
  return `${method.toUpperCase()}&${percentEncode(url)}&${percentEncode(sorted)}`;
}

/** HMAC-SHA1 sign a request, return the signature string. */
function oauthSign(
  method: string,
  url: string,
  params: Record<string, string>,
  consumerSecret: string,
  tokenSecret = "",
): string {
  const baseString = buildBaseString(method, url, params);
  const signingKey = `${percentEncode(consumerSecret)}&${percentEncode(tokenSecret)}`;
  return hmacSha1(signingKey, baseString);
}

/** Build an OAuth 1.0a Authorization header value. */
function oauthHeader(params: Record<string, string>): string {
  const parts = Object.keys(params)
    .filter((k) => k.startsWith("oauth_"))
    .sort()
    .map((k) => `${percentEncode(k)}="${percentEncode(params[k]!)}"`);
  return `OAuth ${parts.join(", ")}`;
}

// ---------------------------------------------------------------------------
// OAuth 1.0a token exchange
// ---------------------------------------------------------------------------

async function getRequestToken(callbackUrl: string): Promise<{ oauth_token: string; oauth_token_secret: string }> {
  const url = "https://www.tumblr.com/oauth/request_token";
  const params: Record<string, string> = {
    oauth_callback: callbackUrl,
    oauth_consumer_key: getConsumerKey(),
    oauth_nonce: generateNonce(),
    oauth_signature_method: "HMAC-SHA1",
    oauth_timestamp: generateTimestamp(),
    oauth_version: "1.0",
  };
  params.oauth_signature = oauthSign("POST", url, params, getConsumerSecret());

  const res = await fetch(url, {
    method: "POST",
    headers: { Authorization: oauthHeader(params) },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Request token failed (${res.status}): ${text}`);
  }
  const body = await res.text();
  const parsed = new URLSearchParams(body);
  const token = parsed.get("oauth_token");
  const secret = parsed.get("oauth_token_secret");
  if (!token || !secret) throw new Error(`Invalid request token response: ${body}`);
  return { oauth_token: token, oauth_token_secret: secret };
}

async function exchangeForAccessToken(
  requestToken: string,
  requestTokenSecret: string,
  verifier: string,
): Promise<{ oauth_token: string; oauth_token_secret: string }> {
  const url = "https://www.tumblr.com/oauth/access_token";
  const params: Record<string, string> = {
    oauth_consumer_key: getConsumerKey(),
    oauth_nonce: generateNonce(),
    oauth_signature_method: "HMAC-SHA1",
    oauth_timestamp: generateTimestamp(),
    oauth_token: requestToken,
    oauth_verifier: verifier,
    oauth_version: "1.0",
  };
  params.oauth_signature = oauthSign("POST", url, params, getConsumerSecret(), requestTokenSecret);

  const res = await fetch(url, {
    method: "POST",
    headers: { Authorization: oauthHeader(params) },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Access token exchange failed (${res.status}): ${text}`);
  }
  const body = await res.text();
  const parsed = new URLSearchParams(body);
  const token = parsed.get("oauth_token");
  const secret = parsed.get("oauth_token_secret");
  if (!token || !secret) throw new Error(`Invalid access token response: ${body}`);
  return { oauth_token: token, oauth_token_secret: secret };
}

// ---------------------------------------------------------------------------
// Auth & API helpers
// ---------------------------------------------------------------------------

/** Get stored OAuth 1.0a credentials. Throws if not connected. */
export function getAuth(): {
  oauth_token: string;
  oauth_token_secret: string;
  blog_uuid: string;
  blog_name: string;
} {
  const d = db();
  const auth = d.prepare("SELECT * FROM tumblr_auth WHERE id = 1").get() as any;
  if (!auth) throw new Error("Not connected to Tumblr. Use connect_tumblr first.");
  return {
    oauth_token: auth.oauth_token,
    oauth_token_secret: auth.oauth_token_secret,
    blog_uuid: auth.blog_uuid,
    blog_name: auth.blog_name,
  };
}

/** Sign and call the Tumblr API with OAuth 1.0a. */
async function tumblrApi(method: string, path: string, body?: unknown): Promise<any> {
  const auth = getAuth();
  const url = `${TUMBLR_API}${path}`;

  const oauthParams: Record<string, string> = {
    oauth_consumer_key: getConsumerKey(),
    oauth_nonce: generateNonce(),
    oauth_signature_method: "HMAC-SHA1",
    oauth_timestamp: generateTimestamp(),
    oauth_token: auth.oauth_token,
    oauth_version: "1.0",
  };
  oauthParams.oauth_signature = oauthSign(method, url, oauthParams, getConsumerSecret(), auth.oauth_token_secret);

  const opts: RequestInit = {
    method,
    headers: {
      Authorization: oauthHeader(oauthParams),
      "Content-Type": "application/json",
    },
  };
  if (body) opts.body = JSON.stringify(body);

  const res = await fetch(url, opts);
  const data = (await res.json()) as any;
  if (data.meta?.status && data.meta.status >= 400) {
    throw new Error(`Tumblr API error (${data.meta.status}): ${data.meta.msg ?? "unknown"}`);
  }
  return data;
}

// ---------------------------------------------------------------------------
// OAuth flow (browser-based)
// ---------------------------------------------------------------------------

function openBrowser(url: string): void {
  const cmd = process.platform === "darwin"
    ? `open "${url}"`
    : process.platform === "win32"
      ? `start "${url}"`
      : `xdg-open "${url}"`;
  exec(cmd);
}

async function startOAuthFlow(): Promise<{
  requestToken: string;
  requestTokenSecret: string;
  verifier: string;
}> {
  const OAUTH_PORT = 8080;
  const callbackUrl = `http://localhost:${OAUTH_PORT}/callback`;

  // Step 1: Get request token from Tumblr
  const requestTokenData = await getRequestToken(callbackUrl);

  // Step 2: Open browser for user authorization & wait for callback
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const url = new URL(req.url ?? "/", `http://localhost:${OAUTH_PORT}`);
      const oauthToken = url.searchParams.get("oauth_token");
      const oauthVerifier = url.searchParams.get("oauth_verifier");

      if (oauthToken && oauthVerifier) {
        res.writeHead(200, { "Content-Type": "text/html" });
        res.end("<h2>Connected to Tumblr!</h2><p>You can close this tab and return to Crate.</p>");
        server.close();
        resolve({
          requestToken: oauthToken,
          requestTokenSecret: requestTokenData.oauth_token_secret,
          verifier: oauthVerifier,
        });
        return;
      }

      // User denied authorization
      const denied = url.searchParams.get("denied");
      if (denied) {
        res.writeHead(200, { "Content-Type": "text/html" });
        res.end("<h2>Authorization denied</h2><p>You can close this tab.</p>");
        server.close();
        reject(new Error("User denied Tumblr authorization."));
        return;
      }

      // Ignore favicon / other requests
      res.writeHead(200);
      res.end();
    });

    server.on("error", (err: NodeJS.ErrnoException) => {
      if (err.code === "EADDRINUSE") {
        reject(new Error(`Port ${OAUTH_PORT} is already in use. Kill the process using it and try again.`));
      } else {
        reject(err);
      }
    });

    server.listen(OAUTH_PORT, "127.0.0.1", () => {
      const authUrl = `https://www.tumblr.com/oauth/authorize?oauth_token=${encodeURIComponent(requestTokenData.oauth_token)}`;
      openBrowser(authUrl);
    });

    // 120-second timeout
    setTimeout(() => {
      server.close();
      reject(new Error("OAuth timed out — no authorization received within 120 seconds."));
    }, 120_000);
  });
}

// ---------------------------------------------------------------------------
// Markdown → NPF converter
// ---------------------------------------------------------------------------

interface NpfFormatting {
  start: number;
  end: number;
  type: "bold" | "italic" | "strikethrough" | "link" | "small";
  url?: string;
}

interface NpfBlock {
  type: string;
  subtype?: string;
  text?: string;
  formatting?: NpfFormatting[];
}

/** Parse inline markdown formatting and return plain text + formatting array. */
export function parseInlineFormatting(text: string): { plainText: string; formatting: NpfFormatting[] } {
  const formatting: NpfFormatting[] = [];
  let plain = "";
  // Process: `code` (→ small), **bold**, *italic*, [text](url)
  const re = /`([^`]+?)`|\*\*(.+?)\*\*|\*(.+?)\*|\[([^\]]+)\]\(([^)]+)\)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = re.exec(text)) !== null) {
    // Text before match
    if (match.index > lastIndex) {
      plain += text.slice(lastIndex, match.index);
    }

    const start = plain.length;

    if (match[1] !== undefined) {
      // `code` → small formatting
      plain += match[1];
      formatting.push({ start, end: plain.length, type: "small" });
    } else if (match[2] !== undefined) {
      // **bold**
      plain += match[2];
      formatting.push({ start, end: plain.length, type: "bold" });
    } else if (match[3] !== undefined) {
      // *italic*
      plain += match[3];
      formatting.push({ start, end: plain.length, type: "italic" });
    } else if (match[4] !== undefined && match[5] !== undefined) {
      // [text](url)
      plain += match[4];
      formatting.push({ start, end: plain.length, type: "link", url: match[5] });
    }

    lastIndex = match.index + match[0].length;
  }

  // Remaining text
  if (lastIndex < text.length) {
    plain += text.slice(lastIndex);
  }

  return { plainText: plain, formatting };
}

/** Convert markdown text to Tumblr NPF blocks. */
export function markdownToNpf(text: string): NpfBlock[] {
  const blocks: NpfBlock[] = [];
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
      // NPF has no <hr> equivalent — skip or use a visual separator
      i++;
      continue;
    }

    // Heading ## → heading1, ### → heading2
    const h2Match = line.match(/^##\s+(.+)$/);
    if (h2Match) {
      const { plainText, formatting } = parseInlineFormatting(h2Match[1]!);
      const block: NpfBlock = { type: "text", subtype: "heading1", text: plainText };
      if (formatting.length > 0) block.formatting = formatting;
      blocks.push(block);
      i++;
      continue;
    }

    const h3Match = line.match(/^###\s+(.+)$/);
    if (h3Match) {
      const { plainText, formatting } = parseInlineFormatting(h3Match[1]!);
      const block: NpfBlock = { type: "text", subtype: "heading2", text: plainText };
      if (formatting.length > 0) block.formatting = formatting;
      blocks.push(block);
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
      const combined = quoteLines.join("\n");
      const { plainText, formatting } = parseInlineFormatting(combined);
      const block: NpfBlock = { type: "text", subtype: "quote", text: plainText };
      if (formatting.length > 0) block.formatting = formatting;
      blocks.push(block);
      continue;
    }

    // Unordered list (- item or * item)
    if (/^[-*]\s+/.test(line)) {
      while (i < lines.length && /^[-*]\s+/.test(lines[i] ?? "")) {
        const itemText = (lines[i] ?? "").replace(/^[-*]\s+/, "");
        const { plainText, formatting } = parseInlineFormatting(itemText);
        const block: NpfBlock = { type: "text", subtype: "unordered-list-item", text: plainText };
        if (formatting.length > 0) block.formatting = formatting;
        blocks.push(block);
        i++;
      }
      continue;
    }

    // Ordered list (1. item)
    if (/^\d+\.\s+/.test(line)) {
      while (i < lines.length && /^\d+\.\s+/.test(lines[i] ?? "")) {
        const itemText = (lines[i] ?? "").replace(/^\d+\.\s+/, "");
        const { plainText, formatting } = parseInlineFormatting(itemText);
        const block: NpfBlock = { type: "text", subtype: "ordered-list-item", text: plainText };
        if (formatting.length > 0) block.formatting = formatting;
        blocks.push(block);
        i++;
      }
      continue;
    }

    // Markdown table (| col | col |)
    if (line.includes("|") && line.trim().startsWith("|")) {
      const tableLines: string[] = [];
      while (i < lines.length && lines[i]!.trim().startsWith("|")) {
        tableLines.push(lines[i]!);
        i++;
      }
      // Parse into rows, skip separator row (|---|---|)
      const rows: string[][] = [];
      for (const tl of tableLines) {
        const cells = tl
          .split("|")
          .slice(1, -1) // drop empty first/last from leading/trailing |
          .map((c) => c.trim());
        // Skip separator rows like |---|---|
        if (cells.every((c) => /^[-:]+$/.test(c))) continue;
        rows.push(cells);
      }
      if (rows.length > 0) {
        // Calculate column widths for alignment
        const colCount = Math.max(...rows.map((r) => r.length));
        const colWidths: number[] = Array(colCount).fill(0);
        for (const row of rows) {
          for (let c = 0; c < colCount; c++) {
            colWidths[c] = Math.max(colWidths[c]!, (row[c] ?? "").length);
          }
        }
        // Render as aligned preformatted text
        const formatted = rows.map((row, ri) => {
          const line = row
            .map((cell, ci) => cell.padEnd(colWidths[ci]!))
            .join("  │  ");
          if (ri === 0) {
            // Add underline after header row
            const separator = colWidths.map((w) => "─".repeat(w)).join("──┼──");
            return line + "\n" + separator;
          }
          return line;
        });
        blocks.push({ type: "text", subtype: "indented", text: formatted.join("\n") });
      }
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
      blocks.push({ type: "text", subtype: "indented", text: codeLines.join("\n") });
      continue;
    }

    // Default: paragraph
    const { plainText, formatting } = parseInlineFormatting(line);
    const block: NpfBlock = { type: "text", text: plainText };
    if (formatting.length > 0) block.formatting = formatting;
    blocks.push(block);
    i++;
  }

  return blocks;
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

export async function connectTumblrHandler(args: { blog_name?: string }): Promise<ToolResult> {
  try {
    const d = db();

    // Check if already connected
    const existing = d.prepare("SELECT * FROM tumblr_auth WHERE id = 1").get() as any;
    if (existing) {
      return toolResult({
        status: "already_connected",
        blog_name: existing.blog_name,
        blog_url: existing.blog_url,
        hint: "Use disconnect_tumblr first, then reconnect to switch blogs.",
      });
    }

    // Run OAuth 1.0a flow
    const { requestToken, requestTokenSecret, verifier } = await startOAuthFlow();
    const accessTokenData = await exchangeForAccessToken(requestToken, requestTokenSecret, verifier);

    // Fetch user info to discover blogs (sign request manually since auth isn't stored yet)
    const userInfoUrl = `${TUMBLR_API}/user/info`;
    const oauthParams: Record<string, string> = {
      oauth_consumer_key: getConsumerKey(),
      oauth_nonce: generateNonce(),
      oauth_signature_method: "HMAC-SHA1",
      oauth_timestamp: generateTimestamp(),
      oauth_token: accessTokenData.oauth_token,
      oauth_version: "1.0",
    };
    oauthParams.oauth_signature = oauthSign(
      "GET",
      userInfoUrl,
      oauthParams,
      getConsumerSecret(),
      accessTokenData.oauth_token_secret,
    );

    const userInfo = await fetch(userInfoUrl, {
      headers: { Authorization: oauthHeader(oauthParams) },
    });
    const userData = (await userInfo.json()) as any;
    const blogs: any[] = userData.response?.user?.blogs ?? [];
    if (!blogs.length) {
      throw new Error("No blogs found on your Tumblr account.");
    }

    // Pick the requested blog or fall back to primary
    let chosen: any;
    if (args.blog_name) {
      const target = args.blog_name.toLowerCase();
      chosen = blogs.find((b: any) => (b.name as string).toLowerCase() === target);
      if (!chosen) {
        return toolResult({
          error: `Blog "${args.blog_name}" not found on your account.`,
          available_blogs: blogs.map((b: any) => ({
            name: b.name,
            url: b.url,
            title: b.title,
            primary: b.primary ?? false,
          })),
          hint: "Pass one of these blog names to blog_name, or omit to use the primary blog.",
        });
      }
    } else {
      chosen = blogs.find((b: any) => b.primary) ?? blogs[0];
    }

    const blogName = chosen.name as string;
    const blogUrl = chosen.url as string;
    const blogUuid = chosen.uuid as string;

    // Store in SQLite
    d.prepare(
      "INSERT INTO tumblr_auth (id, oauth_token, oauth_token_secret, blog_name, blog_url, blog_uuid) VALUES (1, ?, ?, ?, ?, ?)",
    ).run(accessTokenData.oauth_token, accessTokenData.oauth_token_secret, blogName, blogUrl, blogUuid);

    // Return connected info + list of other available blogs for awareness
    const otherBlogs = blogs
      .filter((b: any) => b.name !== blogName)
      .map((b: any) => ({ name: b.name, url: b.url, title: b.title }));

    return toolResult({
      status: "connected",
      blog_name: blogName,
      blog_url: blogUrl,
      ...(otherBlogs.length > 0 ? { other_blogs: otherBlogs } : {}),
    });
  } catch (error) {
    return toolError(error);
  }
}

export async function postToTumblrHandler(args: {
  title: string;
  content: string;
  tags?: string[];
  category?: string;
}): Promise<ToolResult> {
  try {
    const { blog_uuid, blog_name } = getAuth();

    // Convert markdown to NPF
    const npfBlocks = markdownToNpf(args.content);

    // Prepend title as heading
    const contentBlocks: NpfBlock[] = [
      { type: "text", subtype: "heading1", text: args.title },
      ...npfBlocks,
    ];

    // Build tags array
    const tags: string[] = [...(args.tags ?? [])];
    if (args.category && !tags.includes(args.category)) {
      tags.unshift(args.category);
    }
    tags.push("crate", "music");

    // Create post via NPF
    const postData = await tumblrApi("POST", `/blog/${blog_uuid}/posts`, {
      content: contentBlocks,
      tags: tags.join(","),
      state: "published",
    });

    const postId = String(postData.response?.id ?? "unknown");
    const postUrl = `https://${blog_name}.tumblr.com/post/${postId}`;

    // Store in SQLite
    const d = db();
    d.prepare(
      "INSERT INTO tumblr_posts (tumblr_post_id, title, blog_name, post_url, category, tags) VALUES (?, ?, ?, ?, ?, ?)",
    ).run(postId, args.title, blog_name, postUrl, args.category ?? null, JSON.stringify(tags));

    return toolResult({
      status: "published",
      post_url: postUrl,
      tumblr_post_id: postId,
    });
  } catch (error) {
    return toolError(error);
  }
}

export async function tumblrBlogInfoHandler(_args: Record<string, never>): Promise<ToolResult> {
  try {
    const d = db();
    const auth = d.prepare("SELECT * FROM tumblr_auth WHERE id = 1").get() as any;
    if (!auth) {
      return toolResult({
        status: "not_connected",
        message: "Not connected to Tumblr. Use connect_tumblr first.",
      });
    }

    const recentPosts = d
      .prepare("SELECT * FROM tumblr_posts WHERE blog_name = ? ORDER BY created_at DESC LIMIT 20")
      .all(auth.blog_name) as any[];

    const totalCount = (
      d.prepare("SELECT COUNT(*) as count FROM tumblr_posts WHERE blog_name = ?").get(auth.blog_name) as any
    ).count;

    return toolResult({
      blog_name: auth.blog_name,
      blog_url: auth.blog_url,
      post_count: totalCount,
      recent_posts: recentPosts.map((p) => ({
        id: p.id,
        tumblr_post_id: p.tumblr_post_id,
        title: p.title,
        post_url: p.post_url,
        category: p.category,
        tags: p.tags ? JSON.parse(p.tags) : [],
        created_at: p.created_at,
      })),
    });
  } catch (error) {
    return toolError(error);
  }
}

export async function disconnectTumblrHandler(_args: Record<string, never>): Promise<ToolResult> {
  try {
    const d = db();
    const auth = d.prepare("SELECT blog_name FROM tumblr_auth WHERE id = 1").get() as any;
    if (!auth) {
      return toolResult({ status: "not_connected", message: "Already disconnected." });
    }

    d.prepare("DELETE FROM tumblr_auth WHERE id = 1").run();

    return toolResult({
      status: "disconnected",
      blog_name: auth.blog_name,
      note: "Credentials removed. Post history is preserved.",
    });
  } catch (error) {
    return toolError(error);
  }
}

export async function tumblrStatusHandler(_args: Record<string, never>): Promise<ToolResult> {
  try {
    const d = db();
    const auth = d.prepare("SELECT * FROM tumblr_auth WHERE id = 1").get() as any;
    if (!auth) {
      return toolResult({ connected: false });
    }

    return toolResult({
      connected: true,
      blog_name: auth.blog_name,
      blog_url: auth.blog_url,
    });
  } catch (error) {
    return toolError(error);
  }
}

// ---------------------------------------------------------------------------
// Tool definitions
// ---------------------------------------------------------------------------

const connectTumblr = tool(
  "connect_tumblr",
  "Connect your Tumblr blog via OAuth 1.0a. One-time setup — opens your browser for authorization. Requires TUMBLR_CONSUMER_KEY and TUMBLR_CONSUMER_SECRET. If you have multiple blogs, pass blog_name to choose which one to connect.",
  {
    blog_name: z.string().optional().describe("Name of the blog to connect. If omitted, uses the primary blog. If the name doesn't match, returns available blogs."),
  },
  connectTumblrHandler,
);

const postToTumblr = tool(
  "post_to_tumblr",
  "Publish a post to your Tumblr blog. Content is markdown (headings, bold, italic, links, lists, blockquotes, code). Converted to Tumblr NPF format.",
  {
    title: z.string().max(256).describe("Post title"),
    content: z.string().describe("Post content in markdown format"),
    tags: z.array(z.string()).optional().describe("Tags for the post"),
    category: z
      .enum(["influence", "artist", "playlist", "collection", "note"])
      .optional()
      .describe("Category tag (auto-added to tags)"),
  },
  postToTumblrHandler,
);

const tumblrBlogInfo = tool(
  "tumblr_blog_info",
  "Get your Tumblr blog details and recent posts.",
  {},
  tumblrBlogInfoHandler,
);

const disconnectTumblr = tool(
  "disconnect_tumblr",
  "Remove stored Tumblr credentials. Post history is preserved.",
  {},
  disconnectTumblrHandler,
);

const tumblrStatus = tool(
  "tumblr_status",
  "Check if Tumblr is connected.",
  {},
  tumblrStatusHandler,
);

// ---------------------------------------------------------------------------
// Server export
// ---------------------------------------------------------------------------

export const tumblrTools = [connectTumblr, postToTumblr, tumblrBlogInfo, disconnectTumblr, tumblrStatus];

export const tumblrServer = createSdkMcpServer({
  name: "tumblr",
  version: "1.0.0",
  tools: tumblrTools,
});
