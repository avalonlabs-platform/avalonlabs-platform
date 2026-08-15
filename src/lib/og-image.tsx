import { ImageResponse } from "next/og";
import { siteConfig } from "@/lib/site-config";

export const ogImageSize = { width: 1200, height: 630 };

export function renderOgImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "#000000",
          backgroundImage:
            "radial-gradient(circle at 25% 20%, rgba(99,102,241,0.35), transparent 55%), " +
            "radial-gradient(circle at 80% 80%, rgba(34,211,238,0.25), transparent 55%)",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            padding: "10px 24px",
            borderRadius: 999,
            border: "1px solid rgba(255,255,255,0.15)",
            marginBottom: 40,
          }}
        >
          <div style={{ display: "flex", width: 10, height: 10, borderRadius: 999, backgroundColor: "#22d3ee" }} />
          <div style={{ display: "flex", fontSize: 24, color: "rgba(255,255,255,0.7)" }}>
            AI-powered automation, on demand
          </div>
        </div>

        <div style={{ display: "flex", fontSize: 104, fontWeight: 700, color: "white" }}>
          Avalon
          <span
            style={{
              backgroundImage: "linear-gradient(90deg, #6366f1, #a855f7, #22d3ee)",
              backgroundClip: "text",
              color: "transparent",
            }}
          >
            Labs
          </span>
        </div>

        <div
          style={{
            display: "flex",
            marginTop: 28,
            fontSize: 32,
            color: "rgba(255,255,255,0.6)",
            maxWidth: 880,
            textAlign: "center",
          }}
        >
          {siteConfig.tagline}
        </div>
      </div>
    ),
    { ...ogImageSize }
  );
}
