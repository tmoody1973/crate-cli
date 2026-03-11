// src/servers/ticketmaster.ts
import { tool, createSdkMcpServer } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import { resolveKey } from "../utils/config.js";

const BASE_URL = "https://app.ticketmaster.com/discovery/v2";
const RATE_LIMIT_MS = 220; // 5 req/sec limit
const FETCH_TIMEOUT_MS = 15_000;

let lastRequest = 0;

export async function rateLimit(): Promise<void> {
  const now = Date.now();
  const elapsed = now - lastRequest;
  if (elapsed < RATE_LIMIT_MS) {
    await new Promise((r) => setTimeout(r, RATE_LIMIT_MS - elapsed));
  }
  lastRequest = Date.now();
}

const RATE_LIMIT_MESSAGE =
  "Ticketmaster rate limit reached. Try again in a moment, or add your own Ticketmaster API key for priority access.";

export async function tmFetch(
  endpoint: string,
  params?: Record<string, string>,
): Promise<any> {
  await rateLimit();

  const apiKey = resolveKey("TICKETMASTER_API_KEY");
  if (!apiKey) {
    throw new Error("TICKETMASTER_API_KEY is required");
  }

  const url = new URL(`${BASE_URL}/${endpoint}`);
  url.searchParams.set("apikey", apiKey);
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      url.searchParams.set(k, v);
    }
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(url.toString(), {
      headers: {
        "User-Agent": "Crate-CLI/1.0 (music-research-agent)",
      },
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }

  if (res.status === 429) {
    throw new Error(RATE_LIMIT_MESSAGE);
  }

  if (!res.ok) {
    throw new Error(`Ticketmaster API error: ${res.status}`);
  }

  return res.json();
}

type ToolResult = { content: [{ type: "text"; text: string }] };

function toolResult(data: unknown): ToolResult {
  return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
}

function toolError(error: unknown): ToolResult {
  const message = error instanceof Error ? error.message : String(error);
  return { content: [{ type: "text" as const, text: JSON.stringify({ error: message }) }] };
}

// --- Response shapers ---

function shapeEvent(e: any): Record<string, unknown> {
  const venues = e._embedded?.venues ?? [];
  const attractions = e._embedded?.attractions ?? [];
  const price = e.priceRanges?.[0];
  return {
    name: e.name,
    date: e.dates?.start?.localDate ?? null,
    time: e.dates?.start?.localTime ?? null,
    venue: venues[0]?.name ?? null,
    city: venues[0]?.city?.name ?? null,
    priceRange: price ? { min: price.min, max: price.max, currency: price.currency } : null,
    status: e.dates?.status?.code ?? null,
    url: e.url ?? null,
    artists: attractions.map((a: any) => a.name),
  };
}

function shapeAttraction(a: any): Record<string, unknown> {
  const cls = a.classifications?.[0];
  return {
    name: a.name,
    id: a.id,
    genre: cls?.genre?.name ?? null,
    subGenre: cls?.subGenre?.name ?? null,
    url: a.url ?? null,
    upcomingEvents: a.upcomingEvents?._total ?? 0,
  };
}

function shapeVenue(v: any): Record<string, unknown> {
  return {
    name: v.name,
    city: v.city?.name ?? null,
    state: v.state?.stateCode ?? null,
    country: v.country?.countryCode ?? null,
    address: v.address?.line1 ?? null,
    upcomingEvents: v.upcomingEvents?._total ?? 0,
  };
}

// --- Handler functions (exported for testing) ---

export async function searchEventsHandler(args: {
  keyword: string;
  city?: string;
  stateCode?: string;
  startDateTime?: string;
  endDateTime?: string;
  size?: number;
}) {
  try {
    const params: Record<string, string> = {
      keyword: args.keyword,
      classificationName: "music",
      size: String(args.size ?? 20),
    };
    if (args.city) params.city = args.city;
    if (args.stateCode) params.stateCode = args.stateCode;
    if (args.startDateTime) params.startDateTime = args.startDateTime;
    if (args.endDateTime) params.endDateTime = args.endDateTime;

    const data = await tmFetch("events.json", params);
    const events = (data._embedded?.events ?? []).map(shapeEvent);
    return toolResult({ events, total: data.page?.totalElements ?? 0 });
  } catch (error) {
    return toolError(error);
  }
}

export async function searchAttractionsHandler(args: {
  keyword: string;
  size?: number;
}) {
  try {
    const params: Record<string, string> = {
      keyword: args.keyword,
      size: String(args.size ?? 20),
    };

    const data = await tmFetch("attractions.json", params);
    const attractions = (data._embedded?.attractions ?? []).map(shapeAttraction);
    return toolResult({ attractions, total: data.page?.totalElements ?? 0 });
  } catch (error) {
    return toolError(error);
  }
}

export async function searchVenuesHandler(args: {
  keyword: string;
  size?: number;
}) {
  try {
    const params: Record<string, string> = {
      keyword: args.keyword,
      size: String(args.size ?? 20),
    };

    const data = await tmFetch("venues.json", params);
    const venues = (data._embedded?.venues ?? []).map(shapeVenue);
    return toolResult({ venues, total: data.page?.totalElements ?? 0 });
  } catch (error) {
    return toolError(error);
  }
}

export async function getEventDetailsHandler(args: { eventId: string }) {
  try {
    const data = await tmFetch(`events/${args.eventId}.json`);
    const venues = data._embedded?.venues ?? [];
    const attractions = data._embedded?.attractions ?? [];
    const cls = data.classifications?.[0];

    return toolResult({
      name: data.name,
      date: data.dates?.start?.localDate ?? null,
      time: data.dates?.start?.localTime ?? null,
      venue: venues[0] ? shapeVenue(venues[0]) : null,
      artists: attractions.map((a: any) => a.name),
      priceRange: data.priceRanges?.[0]
        ? { min: data.priceRanges[0].min, max: data.priceRanges[0].max, currency: data.priceRanges[0].currency }
        : null,
      status: data.dates?.status?.code ?? null,
      url: data.url ?? null,
      presales: (data.sales?.presales ?? []).map((p: any) => ({
        name: p.name,
        startDateTime: p.startDateTime,
        endDateTime: p.endDateTime,
      })),
      seatmapUrl: data.seatmap?.staticUrl ?? null,
      classification: cls
        ? {
            genre: cls.genre?.name ?? null,
            subGenre: cls.subGenre?.name ?? null,
            segment: cls.segment?.name ?? null,
          }
        : null,
    });
  } catch (error) {
    return toolError(error);
  }
}

// --- Tool definitions ---

const searchEvents = tool(
  "search_events",
  "Search for upcoming music events and concerts on Ticketmaster. Returns event name, date, time, venue, city, price range, sale status, and performing artists. Always filters to music events only.",
  {
    keyword: z.string().max(200).describe("Search keyword (artist name, event name, etc.)"),
    city: z.string().max(100).optional().describe("Filter by city name"),
    stateCode: z.string().max(5).optional().describe("Filter by state code (e.g., 'NY', 'CA')"),
    startDateTime: z.string().optional().describe("Start date filter (ISO 8601 format, e.g., '2026-06-01T00:00:00Z')"),
    endDateTime: z.string().optional().describe("End date filter (ISO 8601 format)"),
    size: z.number().optional().describe("Number of results (default 20, max 200)"),
  },
  searchEventsHandler,
);

const searchAttractions = tool(
  "search_attractions",
  "Search for artists/attractions on Ticketmaster. Returns artist name, ID, genre, sub-genre, and number of upcoming events. Useful for finding artist IDs or checking tour activity.",
  {
    keyword: z.string().max(200).describe("Artist or attraction name"),
    size: z.number().optional().describe("Number of results (default 20)"),
  },
  searchAttractionsHandler,
);

const searchVenues = tool(
  "search_venues",
  "Search for music venues on Ticketmaster. Returns venue name, city, state, country, address, and number of upcoming events.",
  {
    keyword: z.string().max(200).describe("Venue name or keyword"),
    size: z.number().optional().describe("Number of results (default 20)"),
  },
  searchVenuesHandler,
);

const getEventDetails = tool(
  "get_event_details",
  "Get full details for a specific Ticketmaster event by ID. Returns venue info, performing artists, price ranges, presale dates, seatmap URL, and genre classification.",
  {
    eventId: z.string().describe("Ticketmaster event ID"),
  },
  getEventDetailsHandler,
);

// --- Server export ---

export const ticketmasterTools = [searchEvents, searchAttractions, searchVenues, getEventDetails];

export const ticketmasterServer = createSdkMcpServer({
  name: "ticketmaster",
  version: "1.0.0",
  tools: ticketmasterTools,
});
