import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt =
  "Crate — The most powerful AI agent for music research";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          width: "100%",
          height: "100%",
          backgroundColor: "#0a0a0a",
          padding: "60px 80px",
        }}
      >
        {/* Top label */}
        <div
          style={{
            display: "flex",
            fontSize: 14,
            letterSpacing: "0.25em",
            textTransform: "uppercase" as const,
            color: "#888",
            marginBottom: 24,
            fontFamily: "monospace",
          }}
        >
          The only agentic AI tool built for music
        </div>

        {/* Title */}
        <div
          style={{
            display: "flex",
            fontSize: 72,
            fontWeight: 700,
            color: "#ededed",
            textAlign: "center",
            lineHeight: 1.1,
            marginBottom: 32,
          }}
        >
          Crate
        </div>

        {/* Tagline */}
        <div
          style={{
            display: "flex",
            fontSize: 24,
            color: "#b0b0b0",
            textAlign: "center",
            lineHeight: 1.5,
            marginBottom: 48,
            maxWidth: 800,
          }}
        >
          92 tools across 17 sources. Influence tracing powered by Harvard
          research. Every claim cited. Every track verified.
        </div>

        {/* Install command */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            border: "1px solid rgba(232, 168, 73, 0.3)",
            padding: "16px 40px",
            fontSize: 20,
            fontFamily: "monospace",
            marginBottom: 48,
          }}
        >
          <span style={{ color: "#555", marginRight: 12 }}>$</span>
          <span style={{ color: "#ededed" }}>npm install -g crate-cli</span>
        </div>

        {/* Stats row */}
        <div
          style={{
            display: "flex",
            gap: 60,
          }}
        >
          {[
            { number: "92", label: "Tools" },
            { number: "17", label: "Sources" },
            { number: "26", label: "Publications" },
          ].map((stat) => (
            <div
              key={stat.label}
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
              }}
            >
              <div
                style={{
                  fontSize: 40,
                  fontWeight: 700,
                  color: "#e8a849",
                }}
              >
                {stat.number}
              </div>
              <div
                style={{
                  fontSize: 12,
                  letterSpacing: "0.25em",
                  textTransform: "uppercase" as const,
                  color: "#888",
                  fontFamily: "monospace",
                }}
              >
                {stat.label}
              </div>
            </div>
          ))}
        </div>
      </div>
    ),
    { ...size }
  );
}
