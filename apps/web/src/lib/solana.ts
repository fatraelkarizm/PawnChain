import { Connection } from "@solana/web3.js";

export const SOLANA_RPC_URL =
  process.env.NEXT_PUBLIC_SOLANA_RPC_URL || "https://api.devnet.solana.com";

export function getSolanaConnection(): Connection {
  return new Connection(SOLANA_RPC_URL, "confirmed");
}

export function explorerTxUrl(signature: string): string | null {
  if (!signature || signature.startsWith("SandboxTx_")) return null;
  return `https://explorer.solana.com/tx/${signature}?cluster=devnet`;
}

export function explorerAddressUrl(address: string): string {
  return `https://explorer.solana.com/address/${address}?cluster=devnet`;
}
