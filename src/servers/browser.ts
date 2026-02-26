// src/servers/browser.ts
/**
 * Cloud browser tools powered by Kernel.sh — stealth browsing for music research.
 *
 * Enables the agent to read full articles, scrape dynamic pages, and capture
 * screenshots from sources that block simple HTTP fetches (Pitchfork, RYM,
 * Resident Advisor, etc.).
 *
 * Uses playwright-core (no bundled browser binaries) connecting to Kernel's
 * remote Chromium instances via CDP.
 */

import { tool, createSdkMcpServer } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import Kernel from "@onkernel/sdk";
import { chromium } from "playwright-core";
import type { Browser, Page } from "playwright-core";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type ToolResult = { content: Array<{ type: "text"; text: string } | { type: "image"; data: string; mimeType: string }> };

function toolResult(data: unknown): ToolResult {
  return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
}

function toolError(error: unknown): ToolResult {
  const message = error instanceof Error ? error.message : String(error);
  return { content: [{ type: "text" as const, text: JSON.stringify({ error: message }) }] };
}

// ---------------------------------------------------------------------------
// Kernel + Playwright session management
// ---------------------------------------------------------------------------

let _kernel: Kernel | null = null;
function getKernel(): Kernel {
  if (!_kernel) _kernel = new Kernel();
  return _kernel;
}

const NAVIGATE_TIMEOUT_MS = 30_000;
const MAX_CONTENT_LENGTH = 15_000;

/**
 * Check whether the Kernel browser backend is available (API key present).
 */
export function isBrowserAvailable(): boolean {
  return !!process.env.KERNEL_API_KEY;
}

/**
 * Create a Kernel browser session, run a callback with the page, then clean up.
 * Ensures the remote browser is always torn down even if the callback throws.
 */
async function withBrowser<T>(fn: (page: Page, browser: Browser) => Promise<T>): Promise<T> {
  const kernel = getKernel();
  const session = await kernel.browsers.create();
  const browser = await chromium.connectOverCDP(session.cdp_ws_url);
  try {
    const context = browser.contexts()[0];
    if (!context) throw new Error("No browser context available");
    const page = context.pages()[0] ?? (await context.newPage());
    return await fn(page, browser);
  } finally {
    try { await browser.close(); } catch { /* ignore */ }
    try { await kernel.browsers.deleteByID(session.session_id); } catch { /* ignore */ }
  }
}

// ---------------------------------------------------------------------------
// Shared browser-fetch helper (used by other servers as fallback)
// ---------------------------------------------------------------------------

/**
 * Fetch a URL using the Kernel cloud browser and return the full page HTML.
 * Returns null on any failure. Designed as a drop-in fallback for simple HTTP
 * fetches that get blocked by anti-bot protections.
 */
export async function browserFetchHtml(url: string): Promise<string | null> {
  if (!isBrowserAvailable()) return null;
  try {
    return await withBrowser(async (page) => {
      await page.goto(url, {
        waitUntil: "domcontentloaded",
        timeout: NAVIGATE_TIMEOUT_MS,
      });
      // Brief settle for any client-side hydration
      await page.waitForTimeout(2000);
      return await page.content();
    });
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Content extraction
// ---------------------------------------------------------------------------

/** CSS selectors for common music publication article containers. */
const ARTICLE_SELECTORS = [
  "article",
  '[role="article"]',
  ".review-body",
  ".article-body",
  ".post-content",
  ".entry-content",
  ".story-body",
  ".article__body",
  ".article-content",
  ".body-text",
  "main",
];

/** Elements to strip when falling back to full-page text extraction. */
const STRIP_SELECTORS = [
  "nav", "header", "footer", "aside",
  "script", "style", "noscript", "iframe",
  '[role="navigation"]', '[role="banner"]', '[role="complementary"]',
  ".ad", ".ads", ".advertisement", ".sidebar",
  ".cookie-banner", ".newsletter-signup", ".popup",
];

/**
 * Extract meaningful article/page content from the current page.
 * Tries targeted article selectors first, then falls back to stripped body text.
 */
async function extractContent(page: Page): Promise<string> {
  // Try each article selector in order
  for (const selector of ARTICLE_SELECTORS) {
    const text = await page.evaluate((sel) => {
      const el = document.querySelector(sel);
      return el ? el.textContent?.trim() ?? "" : "";
    }, selector);
    if (text.length > 200) {
      return text.slice(0, MAX_CONTENT_LENGTH);
    }
  }

  // Fallback: strip noise elements, return body text
  const bodyText = await page.evaluate((stripSels) => {
    for (const sel of stripSels) {
      document.querySelectorAll(sel).forEach((el) => el.remove());
    }
    return document.body?.textContent?.trim() ?? "";
  }, STRIP_SELECTORS);

  return bodyText.slice(0, MAX_CONTENT_LENGTH);
}

/**
 * Extract page metadata from <meta> tags.
 */
async function extractMeta(page: Page): Promise<Record<string, string>> {
  return page.evaluate(() => {
    const get = (name: string): string => {
      const el =
        document.querySelector(`meta[property="${name}"]`) ??
        document.querySelector(`meta[name="${name}"]`);
      return el?.getAttribute("content") ?? "";
    };
    return {
      description: get("og:description") || get("description"),
      author: get("author") || get("article:author"),
      published: get("article:published_time") || get("date"),
      siteName: get("og:site_name"),
    };
  });
}

// ---------------------------------------------------------------------------
// Tools
// ---------------------------------------------------------------------------

const browseUrl = tool(
  "browse_url",
  "Navigate to a URL using a cloud browser and extract the page content. " +
    "Use this for reading full articles, reviews, and pages that may block simple HTTP requests. " +
    "Returns the extracted text content, page title, and metadata. " +
    "Best for music publications (Pitchfork, Resident Advisor, RYM, etc.) and any page with anti-bot protection.",
  {
    url: z.string().url().describe("The URL to navigate to"),
    wait_for: z.string().optional().describe(
      "Optional CSS selector to wait for before extracting content (e.g., '.article-body')"
    ),
  },
  async (input): Promise<ToolResult> => {
    try {
      return await withBrowser(async (page) => {
        await page.goto(input.url, {
          waitUntil: "domcontentloaded",
          timeout: NAVIGATE_TIMEOUT_MS,
        });

        // Wait for a specific element if requested
        if (input.wait_for) {
          await page.waitForSelector(input.wait_for, { timeout: 10_000 }).catch(() => {});
        } else {
          // Brief settle for dynamic content
          await page.waitForTimeout(2000);
        }

        const [title, meta, content] = await Promise.all([
          page.title(),
          extractMeta(page),
          extractContent(page),
        ]);

        return toolResult({
          url: page.url(),
          title,
          meta,
          contentLength: content.length,
          content,
        });
      });
    } catch (err) {
      return toolError(err);
    }
  }
);

const screenshotUrl = tool(
  "screenshot_url",
  "Take a screenshot of a web page using a cloud browser. " +
    "Returns the screenshot as an image. " +
    "Useful for capturing visual layouts, charts, images, or pages where text extraction alone isn't enough.",
  {
    url: z.string().url().describe("The URL to screenshot"),
    full_page: z.boolean().optional().default(false).describe(
      "Capture the full scrollable page instead of just the viewport"
    ),
    selector: z.string().optional().describe(
      "CSS selector of a specific element to screenshot instead of the whole page"
    ),
  },
  async (input): Promise<ToolResult> => {
    try {
      return await withBrowser(async (page) => {
        await page.goto(input.url, {
          waitUntil: "domcontentloaded",
          timeout: NAVIGATE_TIMEOUT_MS,
        });

        // Let page settle
        await page.waitForTimeout(2000);

        let screenshotBuffer: Buffer;
        if (input.selector) {
          const el = await page.$(input.selector);
          if (!el) {
            return toolError(`Element not found: ${input.selector}`);
          }
          screenshotBuffer = await el.screenshot({ type: "png" });
        } else {
          screenshotBuffer = await page.screenshot({
            type: "png",
            fullPage: input.full_page,
          });
        }

        const base64 = screenshotBuffer.toString("base64");
        const title = await page.title();

        return {
          content: [
            {
              type: "image" as const,
              data: base64,
              mimeType: "image/png",
            },
            {
              type: "text" as const,
              text: JSON.stringify({
                url: page.url(),
                title,
                screenshotSize: `${Math.round(screenshotBuffer.length / 1024)}KB`,
              }),
            },
          ],
        };
      });
    } catch (err) {
      return toolError(err);
    }
  }
);

// ---------------------------------------------------------------------------
// Server export
// ---------------------------------------------------------------------------

export const browserServer = createSdkMcpServer({
  name: "browser",
  version: "0.1.0",
  tools: [browseUrl, screenshotUrl],
});
