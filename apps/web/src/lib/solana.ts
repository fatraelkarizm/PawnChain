import { Connection, PublicKey } from "@solana/web3.js";

export const SOLANA_RPC_URL =
  process.env.NEXT_PUBLIC_SOLANA_RPC_URL || "https://api.devnet.solana.com";

export const PROGRAM_ID_STRING =
  process.env.NEXT_PUBLIC_ANCHOR_PROGRAM_ID || "Pawn111111111111111111111111111111111111111";

export function getSolanaConnection(): Connection {
  return new Connection(SOLANA_RPC_URL, "confirmed");
}

export function derivePawnTicketPda(borrowerAddress: string, ticketId: number): string {
  try {
    const programId = new PublicKey(PROGRAM_ID_STRING);
    const borrowerKey = new PublicKey(borrowerAddress);
    const buf = Buffer.alloc(8);
    buf.writeBigUInt64LE(BigInt(ticketId));
    const [pda] = PublicKey.findProgramAddressSync(
      [Buffer.from("pawn_ticket"), borrowerKey.toBuffer(), buf],
      programId
    );
    return pda.toBase58();
  } catch {
    return `PDA_${ticketId}_${borrowerAddress.slice(0, 8)}`;
  }
}

export async function verifyDevnetTransaction(signature: string): Promise<{
  verified: boolean;
  isSandbox: boolean;
  error?: string;
}> {
  if (!signature || signature.startsWith("SandboxTx_") || signature.startsWith("DemoSeedTx")) {
    return { verified: true, isSandbox: true };
  }

  try {
    const conn = getSolanaConnection();
    const status = await conn.getSignatureStatus(signature, { searchTransactionHistory: true });
    if (!status.value) {
      return { verified: false, isSandbox: false, error: "Transaction not found on Solana Devnet" };
    }
    if (status.value.err) {
      return { verified: false, isSandbox: false, error: "Transaction failed on-chain" };
    }
    return { verified: true, isSandbox: false };
  } catch {
    return { verified: false, isSandbox: false, error: "Unable to verify signature on Devnet RPC" };
  }
}

export function explorerTxUrl(signature: string): string | null {
  if (!signature || signature.startsWith("SandboxTx_") || signature.startsWith("DemoSeedTx")) {
    return null;
  }
  return `https://explorer.solana.com/tx/${signature}?cluster=devnet`;
}
