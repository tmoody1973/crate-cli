const CHAT_PATTERNS = [
  /^(hi|hello|hey|yo|sup|howdy)\b/i,
  /^(thanks|thank you|thx)\b/i,
  /^(good morning|good afternoon|good evening)\b/i,
  /^(who are you|what can you do)\??$/i,
  /^(help|\/help)\b/i,
];

const RESEARCH_PATTERNS = [
  /\b(compare|comparison|analy[sz]e|analysis|map|trace|timeline|history|evolution)\b/i,
  /\b(deep dive|tell me everything|full (?:profile|analysis|breakdown)|complete (?:analysis|discography))\b/i,
  /\b(scene|movement|lineage|influence|connection|bridge artists?)\b/i,
  /\b(build|curate|make)\b.+\b(playlist|set|tracklist)\b/i,
  /\bfor each\b/i,
  /\bfrom .+ to .+\b/i,
];

export type QueryTier = "chat" | "lookup" | "research";

function countWords(message: string): number {
  return message.trim().split(/\s+/).filter(Boolean).length;
}

export function classifyQuery(message: string): QueryTier {
  const trimmed = message.trim();
  if (!trimmed) return "chat";

  const wordCount = countWords(trimmed);

  if (wordCount <= 6 && CHAT_PATTERNS.some((pattern) => pattern.test(trimmed))) {
    return "chat";
  }

  if (trimmed.includes("\n") && trimmed.split("\n").filter((line) => line.trim()).length >= 3) {
    return "research";
  }

  if (RESEARCH_PATTERNS.some((pattern) => pattern.test(trimmed))) {
    return "research";
  }

  if (wordCount >= 18 || /[;]/.test(trimmed)) {
    return "research";
  }

  return "lookup";
}
