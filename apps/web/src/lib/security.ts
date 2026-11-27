import crypto from "node:crypto";

export const LAMPORTS_PER_SOL = 1_000_000_000;
export const SOL_PRICE_IDR_ESTIMATE = 2_400_000; // Demo reference rate for UI display

const DEFAULT_DEV_HMAC_SECRET = "pawnchain-devnet-hmac-secret-do-not-use-in-prod";

const hmacSecret = () => process.env.SERIAL_HMAC_SECRET || DEFAULT_DEV_HMAC_SECRET;

export function normalizeIdentifier(rawIdentifier: string): string {
  return rawIdentifier.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export function hashAssetIdentifier(rawIdentifier: string): string {
  return crypto
    .createHmac("sha256", hmacSecret())
    .update(normalizeIdentifier(rawIdentifier))
    .digest("hex");
}

const mac = (body: string) =>
  crypto.createHmac("sha256", hmacSecret()).update(`token:${body}`).digest("base64url");

/** Lets the server hand data to the browser and trust it when it comes back. */
export function signToken(payload: object, ttlSeconds: number): string {
  const body = Buffer.from(
    JSON.stringify({ payload, exp: Date.now() + ttlSeconds * 1000 })
  ).toString("base64url");
  return `${body}.${mac(body)}`;
}

export function verifyToken<T>(token: string): T | null {
  const [body, signature] = token.split(".");
  if (!body || !signature) return null;
  const expected = Buffer.from(mac(body));
  const given = Buffer.from(signature);
  if (given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) return null;
  const { payload, exp } = JSON.parse(Buffer.from(body, "base64url").toString("utf-8")) as {
    payload: T;
    exp: number;
  };
  return Date.now() <= exp ? payload : null;
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
