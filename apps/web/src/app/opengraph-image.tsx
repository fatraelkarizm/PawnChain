import { ImageResponse } from "next/og";

export const alt = "Spawn — Your Assets. Your Liquidity. Verified On-Chain.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          backgroundColor: "#f4f6f9",
          padding: "56px 64px",
          fontFamily: "system-ui, -apple-system, sans-serif",
          borderTop: "10px solid #0b5d4b",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
            <div
              style={{
                width: "48px",
                height: "48px",
                borderRadius: "10px",
                backgroundColor: "#0b5d4b",
                color: "#ffffff",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "26px",
                fontWeight: 800,
              }}
            >
              S
            </div>
            <div style={{ fontSize: "30px", fontWeight: 800, color: "#0f172a" }}>Spawn</div>
          </div>
          <div
            style={{
              fontSize: "18px",
              fontWeight: 700,
              color: "#0b5d4b",
              backgroundColor: "#e8f5f2",
              border: "1px solid #a7f3d0",
              borderRadius: "999px",
              padding: "8px 20px",
            }}
          >
            Dev3pack Global Hackathon
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "18px", maxWidth: "960px" }}>
          <div
            style={{
              fontSize: "52px",
              fontWeight: 800,
              lineHeight: 1.12,
              color: "#0f172a",
              letterSpacing: "-0.02em",
            }}
          >
            Unlock liquidity from your assets. Without compromising trust.
          </div>
          <div style={{ fontSize: "24px", color: "#526071", lineHeight: 1.4 }}>
            Turn physical and digital assets into financing opportunities through AI-driven
            valuation, verified custody, and transparent Solana-powered escrow.
          </div>
        </div>

        <div style={{ display: "flex", gap: "14px", flexWrap: "wrap" }}>
          {[
            "Solana Anchor Program",
            "AI Market Appraisal",
            "Verified Physical Custody",
            "Voice Terms",
          ].map((label) => (
            <div
              key={label}
              style={{
                fontSize: "18px",
                fontWeight: 600,
                color: "#0f172a",
                backgroundColor: "#ffffff",
                border: "1px solid #dce1e8",
                borderRadius: "8px",
                padding: "10px 18px",
              }}
            >
              {label}
            </div>
          ))}
        </div>
      </div>
    ),
    { ...size }
  );
}
