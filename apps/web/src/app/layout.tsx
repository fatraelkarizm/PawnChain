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
  icons: {
    icon: "/logo.png",
    apple: "/logo.png",
  },
  title: {
    default: "Spawn — Your Assets. Your Liquidity. Verified On-Chain.",
    template: "%s | Spawn",
  },
  description:
    "Unlock the value of physical and digital assets through AI-powered appraisal, verified physical custody, and transparent Solana-powered escrow.",
  keywords: [
    "Spawn",
    "Solana",
    "DeFi",
    "Collateral Financing",
    "RWA",
    "Solana Escrow",
    "AI Asset Valuation",
    "Dev3pack",
  ],
  openGraph: {
    title: "Spawn — Your Assets. Your Liquidity. Verified On-Chain.",
    description:
      "Unlock the value of physical and digital assets through AI-powered appraisal, verified physical custody, and transparent Solana-powered escrow.",
    siteName: "Spawn",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Spawn — Your Assets. Your Liquidity. Verified On-Chain.",
    description:
      "AI-powered asset valuation, verified physical custody, and transparent Solana escrow.",
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
