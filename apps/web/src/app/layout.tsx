import type { Metadata } from "next";
import { IBM_Plex_Mono, Plus_Jakarta_Sans } from "next/font/google";
import { SolanaProviders } from "@/components/SolanaProviders";
import "./globals.css";

const jakarta = Plus_Jakarta_Sans({
  variable: "--font-jakarta",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const plexMono = IBM_Plex_Mono({
  variable: "--font-plex-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(APP_URL),
  title: {
    default: "PawnChain — AI-Powered P2P Pawnshop & RWA Escrow on Solana",
    template: "%s | PawnChain",
  },
  description:
    "P2P pawnshop on Solana with live Firecrawl market appraisal, HMAC & on-chain CollateralLock anti-duplicate checks, ElevenLabs voice contract briefing, and atomic Anchor escrow.",
  keywords: [
    "Solana",
    "DeFi",
    "P2P Pawnshop",
    "RWA",
    "Anchor Escrow",
    "Firecrawl",
    "ElevenLabs",
    "Dev3pack",
  ],
  openGraph: {
    title: "PawnChain — AI-Powered P2P Pawnshop on Solana",
    description:
      "Lock digital or custodian-verified RWA collateral on Solana with live AI market appraisal and instant P2P liquidity.",
    siteName: "PawnChain",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "PawnChain — Solana P2P Pawnshop",
    description: "Live Firecrawl AI appraisal + ElevenLabs voice briefing + atomic Anchor escrow.",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${jakarta.variable} ${plexMono.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        <SolanaProviders>{children}</SolanaProviders>
      </body>
    </html>
  );
}
