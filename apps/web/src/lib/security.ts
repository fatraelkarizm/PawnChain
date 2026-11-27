import crypto from "node:crypto";

export const LAMPORTS_PER_SOL = 1_000_000_000;
export const SOL_PRICE_IDR_ESTIMATE = 2_400_000; // Demo reference rate for UI display

const DEFAULT_DEV_HMAC_SECRET = "pawnchain-devnet-hmac-secret-do-not-use-in-prod";

export function hashAssetIdentifier(rawIdentifier: string): string {
  const normalized = rawIdentifier.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
  const secret = process.env.SERIAL_HMAC_SECRET || DEFAULT_DEV_HMAC_SECRET;
  return crypto.createHmac("sha256", secret).update(normalized).digest("hex");
}

export function solToLamports(sol: number): number {
  return Math.round(sol * LAMPORTS_PER_SOL);
}

export function lamportsToSol(lamports: number): number {
  return lamports / LAMPORTS_PER_SOL;
}

export function calculateInterestLamports(principalLamports: number, interestBps: number): number {
  // Integer math only to avoid floating-point drift
  return Math.floor((principalLamports * interestBps) / 10_000);
}

export function formatSol(lamports: number): string {
  return `${(lamports / LAMPORTS_PER_SOL).toFixed(3)} SOL`;
}

export function formatIdrFromSol(sol: number): string {
  const idr = Math.round(sol * SOL_PRICE_IDR_ESTIMATE);
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(idr);
}

export function shortenAddress(address: string, chars = 4): string {
  if (!address || address.length <= chars * 2 + 3) return address;
  return `${address.slice(0, chars)}...${address.slice(-chars)}`;
}
