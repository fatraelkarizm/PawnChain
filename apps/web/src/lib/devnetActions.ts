// Browser side: build program instructions, have the wallet sign, then ask the
// server to re-read the chain.
import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  TransactionInstruction,
} from "@solana/web3.js";
import type { WalletContextState } from "@solana/wallet-adapter-react";
import * as program from "./program";
import type { PawnTicket, PreparedPledge } from "@/types/pawn";

export type TicketAction = "custody_attest" | "fund" | "repay" | "cancel" | "claim_default";

function connectedKey(wallet: WalletContextState) {
  if (!wallet.publicKey) throw new Error("Hubungkan wallet Devnet terlebih dahulu.");
  return wallet.publicKey;
}

/** Simulates first so program errors surface with their message, not a generic wallet error. */
async function sendInstructions(
  connection: Connection,
  wallet: WalletContextState,
  instructions: TransactionInstruction[],
  signers: Keypair[] = []
): Promise<string> {
  const latest = await connection.getLatestBlockhash("confirmed");
  const tx = new Transaction({ feePayer: connectedKey(wallet), ...latest }).add(...instructions);

  const simulation = await connection.simulateTransaction(tx);
  if (simulation.value.err) {
    const logs = simulation.value.logs ?? [];
    const reason =
      logs.find((l) => l.includes("Error Message:"))?.split("Error Message:")[1] ??
      logs.find((l) => l.includes("already in use") || l.includes("insufficient lamports")) ??
      JSON.stringify(simulation.value.err);
    throw new Error(`Transaksi ditolak: ${reason.trim()}`);
  }

  const signature = await wallet
    .sendTransaction(tx, connection, { signers })
    .catch((err: unknown) => {
      // Wallet adapters can reject with an empty message, e.g. on an unsupported network.
      throw new Error(
        (err instanceof Error && err.message) ||
          "Wallet tidak mengirim transaksi. Pastikan wallet memakai jaringan Devnet, lalu coba lagi."
      );
    });
  const result = await connection.confirmTransaction({ signature, ...latest }, "confirmed");
  if (result.value.err) throw new Error("Transaksi gagal di devnet.");
  return signature;
}

async function postJson<T>(url: string, body: object): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = (await res.json()) as T & { error?: string; message?: string };
  if (!res.ok) throw new Error(data.message || data.error || "Request failed.");
  return data;
}

export interface PledgeForm {
  assetType: "DIGITAL" | "PHYSICAL";
  brand: string;
  model: string;
  condition: string;
  description: string;
  serialNumber: string;
  /** Existing collateral mint; empty mints a new single-supply receipt token. */
  mintAddress: string;
  principalSol: number;
  interestBps: number;
  tenorDays: number;
}

export async function createDevnetPledge(
  connection: Connection,
  wallet: WalletContextState,
  form: PledgeForm
): Promise<{ ticket: PawnTicket; signature: string }> {
  const borrower = connectedKey(wallet);
  const needsMint = form.assetType === "PHYSICAL" || !form.mintAddress.trim();
  const newMint = needsMint ? Keypair.generate() : null;
  const mintAddress = newMint?.publicKey.toBase58() ?? form.mintAddress.trim();

  const { prepared, appraisalToken } = await postJson<{
    prepared: PreparedPledge;
    appraisalToken: string;
  }>("/api/v1/appraisal", { ...form, mode: "devnet", mintAddress });

  const loanLamports = Math.round(form.principalSol * 1_000_000_000);
  const { appraisal } = prepared;
  if (
    appraisal.comparableReferences.length > 0 &&
    form.principalSol > appraisal.suggestedMaxLoanSol
  ) {
    throw new Error(`Pinjaman melebihi batas aman (${appraisal.suggestedMaxLoanSol} SOL).`);
  }

  const mint = newMint?.publicKey ?? new PublicKey(mintAddress);
  const ticketId = Date.now();
  const instructions = [
    ...(newMint ? await program.mintCollateralInstructions(connection, borrower, newMint) : []),
    program.createTicketInstruction({
      borrower,
      mint,
      ticketId,
      fingerprintHex: prepared.serialHash,
      loanLamports,
      interestBps: form.interestBps,
      durationSeconds: form.tenorDays * 86_400,
      aiValuationLamports: Math.round(appraisal.conditionAdjustedSol * 1_000_000_000),
      assetType: prepared.assetType,
      metadataUri: prepared.metadataUri,
    }),
  ];
  const signature = await sendInstructions(
    connection,
    wallet,
    instructions,
    newMint ? [newMint] : []
  );

  const ticketPubkey = program.ticketPda(borrower, ticketId).toBase58();
  // The collateral is locked from here on, so ride out RPC lag before giving up.
  for (let attempt = 1; ; attempt++) {
    try {
      const { ticket } = await postJson<{ ticket: PawnTicket }>("/api/v1/pawn-requests", {
        mode: "devnet",
        appraisalToken,
        ticketPubkey,
        chainTxSignature: signature,
      });
      return { ticket, signature };
    } catch (err) {
      if (attempt >= 4) {
        throw new Error(
          `Tiket sudah dibuat on-chain (${ticketPubkey}) tetapi gagal didaftarkan: ${
            err instanceof Error ? err.message : "unknown error"
          }`
        );
      }
      await new Promise((resolve) => setTimeout(resolve, attempt * 1500));
    }
  }
}

async function attestationHash(parts: string[]): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(parts.join(":")));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

export async function runDevnetAction(
  connection: Connection,
  wallet: WalletContextState,
  ticket: PawnTicket,
  action: TicketAction
): Promise<{ ticket: PawnTicket; signature: string }> {
  const actor = connectedKey(wallet);
  if (!ticket.chainTicketPubkey) throw new Error("Tiket ini tidak punya akun on-chain.");
  const onChain = await program.fetchTicket(connection, ticket.chainTicketPubkey);
  if (!onChain) throw new Error("Akun tiket tidak ditemukan di devnet.");

  const needs = (address: string | null, role: string) => {
    if (address !== actor.toBase58()) throw new Error(`Aksi ini hanya untuk wallet ${role}.`);
  };

  let instruction: TransactionInstruction;
  if (action === "fund") {
    instruction = program.fundLoanInstruction(actor, onChain);
  } else if (action === "repay") {
    needs(onChain.borrower, "peminjam");
    instruction = program.repayInstruction(onChain);
  } else if (action === "cancel") {
    needs(onChain.borrower, "peminjam");
    instruction = program.cancelInstruction(onChain);
  } else if (action === "claim_default") {
    needs(onChain.lender, "pendana");
    instruction = program.claimDefaultInstruction(actor, onChain);
  } else {
    if (!(await connection.getAccountInfo(program.custodianPda(actor)))) {
      throw new Error("Wallet ini belum terdaftar sebagai custodian on-chain.");
    }
    instruction = program.attestCustodyInstruction(
      actor,
      onChain.address,
      await attestationHash([onChain.address, actor.toBase58(), onChain.fingerprintHex])
    );
  }

  const signature = await sendInstructions(connection, wallet, [instruction]);
  const { ticket: synced } = await postJson<{ ticket: PawnTicket }>(
    `/api/v1/pawn-tickets/${ticket.id}`,
    { action: "sync", txSignature: signature }
  );
  return { ticket: synced, signature };
}
