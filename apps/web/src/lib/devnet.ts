// Server side: devnet tickets only ever change to match what the chain says.
import { fetchTicket, type ChainTicket } from "./program";
import { getSolanaConnection } from "./solana";
import { saveTicket } from "./store";
import type { PawnTicket, TicketStatus } from "@/types/pawn";

export const METADATA_PREFIX = "pawnchain:sha256:";

function statusFromChain(chain: ChainTicket): TicketStatus {
  return chain.status === "OPEN" && !chain.custodyAttested
    ? "PENDING_VERIFICATION"
    : chain.status;
}

export function applyChainState(ticket: PawnTicket, chain: ChainTicket): PawnTicket {
  const status = statusFromChain(chain);
  const released = status === "REPAID" || status === "CANCELLED";
  return {
    ...ticket,
    status,
    lenderWallet: chain.lender,
    custodianWallet: chain.custodian,
    custodyAttestationHash: chain.attestationHex,
    dueAt: chain.dueTime ? new Date(chain.dueTime * 1000).toISOString() : null,
    asset: {
      ...ticket.asset,
      verificationStatus: chain.custodyAttested ? "VERIFIED" : "PENDING_REVIEW",
      custodyStatus: released
        ? "RELEASED"
        : chain.assetType === "DIGITAL"
          ? "LOCKED_ON_CHAIN"
          : chain.custodyAttested
            ? "IN_CUSTODY"
            : "UNVERIFIED",
    },
  };
}

/** A signature is only kept for display if it succeeded and touched this ticket. */
async function signatureTouches(signature: string, address: string): Promise<boolean> {
  try {
    const tx = await getSolanaConnection().getTransaction(signature, {
      commitment: "confirmed",
      maxSupportedTransactionVersion: 0,
    });
    if (!tx || tx.meta?.err) return false;
    return tx.transaction.message
      .getAccountKeys({ accountKeysFromLookups: tx.meta?.loadedAddresses })
      .keySegments()
      .flat()
      .some((key) => key.toBase58() === address);
  } catch {
    return false;
  }
}

export async function syncDevnetTicket(
  ticket: PawnTicket,
  signature?: string
): Promise<PawnTicket> {
  if (ticket.mode !== "devnet" || !ticket.chainTicketPubkey) return ticket;
  const chain = await fetchTicket(getSolanaConnection(), ticket.chainTicketPubkey);
  if (!chain) throw new Error("Ticket account not found on chain.");

  const next = applyChainState(ticket, chain);
  if (signature && (await signatureTouches(signature, chain.address))) {
    if (next.status === "REPAID") next.repayTxSignature = signature;
    else next.chainTxSignature = signature;
  }
  if (JSON.stringify(next) === JSON.stringify(ticket)) return ticket;

  next.updatedAt = new Date().toISOString();
  return saveTicket(next);
}
