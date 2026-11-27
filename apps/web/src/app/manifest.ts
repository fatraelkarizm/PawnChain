import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "PawnChain — AI-Powered P2P Pawnshop on Solana",
    short_name: "PawnChain",
    description:
      "Transparent P2P collateralized pawn lending on Solana with Firecrawl market appraisal and atomic escrow.",
    start_url: "/",
    display: "standalone",
    background_color: "#f7f8fa",
    theme_color: "#0b5d4b",
  };
}
