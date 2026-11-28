import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Spawn — AI-Powered P2P Collateral Financing on Solana",
    short_name: "Spawn",
    description:
      "Unlock liquidity from physical and digital assets through AI-driven valuation, verified custody, and Solana-powered escrow.",
    start_url: "/",
    display: "standalone",
    background_color: "#f4f6f9",
    theme_color: "#0b5d4b",
    icons: [
      {
        src: "/logo.png",
        sizes: "512x512",
        type: "image/png",
      },
    ],
  };
}
