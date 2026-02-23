import { describe, it, expect } from "vitest";
import {
  renderInfluencePath,
  renderAdjacencyList,
  renderInfluenceWeb,
  renderArtistCard,
  renderStrengthBar,
  renderInlineChain,
} from "../src/utils/viz.js";

/** Strip ANSI codes for assertion matching */
function strip(s: string): string {
  // eslint-disable-next-line no-control-regex
  return s.replace(/\x1b\[[0-9;]*m/g, "");
}

describe("viz utilities", () => {
  // -----------------------------------------------------------------------
  // renderInfluencePath
  // -----------------------------------------------------------------------
  describe("renderInfluencePath", () => {
    it("returns empty string for empty path", () => {
      expect(renderInfluencePath([])).toBe("");
    });

    it("renders single artist", () => {
      const result = strip(renderInfluencePath([{ artist: "Aphex Twin" }]));
      expect(result).toContain("Aphex Twin");
    });

    it("renders 2-node path with connection", () => {
      const result = strip(
        renderInfluencePath([
          { artist: "Kraftwerk", connection: "influenced", evidence: "Wikipedia" },
          { artist: "Depeche Mode" },
        ]),
      );
      expect(result).toContain("Kraftwerk");
      expect(result).toContain("influenced");
      expect(result).toContain("Wikipedia");
      expect(result).toContain("Depeche Mode");
      expect(result).toContain("▼");
    });

    it("renders 3-node path", () => {
      const result = strip(
        renderInfluencePath([
          { artist: "Kraftwerk", connection: "influenced" },
          { artist: "Depeche Mode", connection: "co-mentioned" },
          { artist: "Nine Inch Nails" },
        ]),
      );
      expect(result).toContain("Kraftwerk");
      expect(result).toContain("Depeche Mode");
      expect(result).toContain("Nine Inch Nails");
      // Two connecting arrows for 3 nodes
      const arrows = (result.match(/▼/g) ?? []).length;
      expect(arrows).toBe(2);
    });

    it("renders 5-node path", () => {
      const result = strip(
        renderInfluencePath([
          { artist: "A", connection: "influenced" },
          { artist: "B", connection: "co-mentioned" },
          { artist: "C", connection: "collaborated" },
          { artist: "D", connection: "sampled" },
          { artist: "E" },
        ]),
      );
      const arrows = (result.match(/▼/g) ?? []).length;
      expect(arrows).toBe(4);
    });
  });

  // -----------------------------------------------------------------------
  // renderAdjacencyList
  // -----------------------------------------------------------------------
  describe("renderAdjacencyList", () => {
    it("renders empty connections message", () => {
      const result = strip(renderAdjacencyList("Aphex Twin", []));
      expect(result).toContain("Aphex Twin");
      expect(result).toContain("no connections found");
    });

    it("renders single connection with direction", () => {
      const result = strip(
        renderAdjacencyList("Aphex Twin", [
          { artist: "Boards of Canada", direction: "to", type: "influence", evidence: "Last.fm: 0.78" },
        ]),
      );
      expect(result).toContain("Aphex Twin");
      expect(result).toContain("→");
      expect(result).toContain("Boards of Canada");
      expect(result).toContain("Last.fm: 0.78");
    });

    it("renders multiple connection types with correct arrows", () => {
      const result = strip(
        renderAdjacencyList("Aphex Twin", [
          { artist: "Kraftwerk", direction: "from", type: "influence" },
          { artist: "Squarepusher", direction: "mutual", type: "collaboration" },
          { artist: "Autechre", direction: "to", type: "similar" },
        ]),
      );
      expect(result).toContain("←");
      expect(result).toContain("↔");
      expect(result).toContain("→");
    });

    it("renders weight as percentage", () => {
      const result = strip(
        renderAdjacencyList("Aphex Twin", [
          { artist: "Autechre", direction: "to", type: "similar", weight: 0.71 },
        ]),
      );
      expect(result).toContain("[71%]");
    });
  });

  // -----------------------------------------------------------------------
  // renderInfluenceWeb
  // -----------------------------------------------------------------------
  describe("renderInfluenceWeb", () => {
    it("renders empty state", () => {
      const result = strip(renderInfluenceWeb("Aphex Twin", []));
      expect(result).toContain("Aphex Twin's Influence Network");
      expect(result).toContain("No connections found");
    });

    it("renders categorized groups", () => {
      const result = strip(
        renderInfluenceWeb("Aphex Twin", [
          { artist: "Kraftwerk", direction: "from", type: "influence", evidence: "Wikipedia" },
          { artist: "Squarepusher", direction: "mutual", type: "collaboration", evidence: "Warp Records" },
          { artist: "Boards of Canada", direction: "to", type: "influence", evidence: "Last.fm: 0.78" },
        ]),
      );
      expect(result).toContain("Influenced by:");
      expect(result).toContain("Collaborators:");
      expect(result).toContain("Influenced:");
      expect(result).toContain("Kraftwerk");
      expect(result).toContain("Squarepusher");
      expect(result).toContain("Boards of Canada");
    });

    it("renders bridge connections", () => {
      const result = strip(
        renderInfluenceWeb("Aphex Twin", [
          { artist: "Burial", direction: "to", type: "bridge", evidence: "connects to dubstep" },
        ]),
      );
      expect(result).toContain("Bridge connections:");
      expect(result).toContain("Burial");
    });
  });

  // -----------------------------------------------------------------------
  // renderArtistCard
  // -----------------------------------------------------------------------
  describe("renderArtistCard", () => {
    it("renders card with border", () => {
      const result = strip(renderArtistCard("David Bowie", { role: "Bridge Artist" }));
      expect(result).toContain("┌");
      expect(result).toContain("┘");
      expect(result).toContain("David Bowie");
      expect(result).toContain("Bridge Artist");
    });

    it("renders card with genres and connections", () => {
      const result = strip(
        renderArtistCard("Brian Eno", {
          role: "Bridge Artist",
          genres: ["Ambient", "Art Rock", "Electronic"],
          connections: 361,
        }),
      );
      expect(result).toContain("Brian Eno");
      expect(result).toContain("Ambient · Art Rock · Electronic");
      expect(result).toContain("361 connections");
    });
  });

  // -----------------------------------------------------------------------
  // renderStrengthBar
  // -----------------------------------------------------------------------
  describe("renderStrengthBar", () => {
    it("renders full bar", () => {
      expect(renderStrengthBar(5, 5)).toBe("█████ 5/5");
    });

    it("renders partial bar", () => {
      expect(renderStrengthBar(3, 5)).toBe("███░░ 3/5");
    });

    it("renders empty bar", () => {
      expect(renderStrengthBar(0, 5)).toBe("░░░░░ 0/5");
    });
  });

  // -----------------------------------------------------------------------
  // renderInlineChain
  // -----------------------------------------------------------------------
  describe("renderInlineChain", () => {
    it("renders single artist", () => {
      const result = strip(renderInlineChain(["Aphex Twin"]));
      expect(result).toBe("Aphex Twin");
    });

    it("renders chain with arrows", () => {
      const result = strip(renderInlineChain(["Kraftwerk", "Depeche Mode", "Nine Inch Nails"]));
      expect(result).toBe("Kraftwerk → Depeche Mode → Nine Inch Nails");
    });
  });
});
