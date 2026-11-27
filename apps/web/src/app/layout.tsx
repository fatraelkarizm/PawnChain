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

export const metadata: Metadata = {
  title: "PawnChain — AI-Powered P2P Pawnshop & RWA Escrow on Solana",
  description:
    "P2P pawnshop on Solana with live Firecrawl market appraisal, HMAC anti-duplicate collateral checks, ElevenLabs voice briefing, and atomic escrow.",
  openGraph: {
    title: "PawnChain — AI-Powered P2P Pawnshop on Solana",
    description:
      "Lock digital or custodian-verified RWA collateral on Solana and access instant P2P liquidity.",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "PawnChain — Solana P2P Pawnshop",
    description: "Live AI market appraisal + atomic Solana escrow.",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="id" className={`${jakarta.variable} ${plexMono.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        <SolanaProviders>{children}</SolanaProviders>
      </body>
    </html>
  );
}
