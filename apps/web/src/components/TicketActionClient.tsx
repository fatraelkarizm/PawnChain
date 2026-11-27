"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import type { PawnTicket } from "@/types/pawn";
import { lamportsToSol } from "@/lib/security";
import { sendDevnetMemoTx, sendDevnetTransferTx } from "@/lib/walletTx";

const LENDER_DEMO_WALLET = "4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R";
const CUSTODIAN_DEMO_WALLET = "CustodianHubJakartaVerified11111111111111111";

export function TicketActionClient({ ticket }: { ticket: PawnTicket }) {
  const router = useRouter();
  const { connection } = useConnection();
  const wallet = useWallet();
  const { publicKey, connected } = wallet;
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const principalSol = lamportsToSol(ticket.principalLamports);
  const totalDue = (principalSol * (1 + ticket.interestBps / 10_000)).toFixed(3);

  async function runAction(action: "fund" | "repay" | "custody_attest") {
    setBusy(true);
    setMessage(null);

    const isWallet = connected && Boolean(publicKey);
    const actorWallet =
      isWallet && publicKey
        ? publicKey.toBase58()
        : action === "fund"
          ? LENDER_DEMO_WALLET
          : action === "custody_attest"
            ? CUSTODIAN_DEMO_WALLET
            : ticket.borrowerWallet;

    try {
      let txSignature: string | undefined;
      if (isWallet) {
        if (action === "fund") {
          txSignature = await sendDevnetTransferTx(
            connection,
            wallet,
            ticket.borrowerWallet,
            ticket.principalLamports,
            `PawnChain:Fund:#${ticket.publicTicketId}`
          );
        } else if (action === "repay" && ticket.lenderWallet) {
          const interest = Math.floor((ticket.principalLamports * ticket.interestBps) / 10_000);
          txSignature = await sendDevnetTransferTx(
            connection,
            wallet,
            ticket.lenderWallet,
            ticket.principalLamports + interest,
            `PawnChain:Repay:#${ticket.publicTicketId}`
          );
        } else if (action === "custody_attest") {
          txSignature = await sendDevnetMemoTx(
            connection,
            wallet,
            `PawnChain:CustodyAttest:#${ticket.publicTicketId}`
          );
        }
      }

      const res = await fetch(`/api/v1/pawn-tickets/${ticket.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, actorWallet, txSignature }),
      });
      const data = (await res.json()) as { error?: string; ticket?: PawnTicket };
      if (!res.ok) {
        setMessage(data.error || "Action failed.");
        return;
      }
      setMessage(`Updated! Ticket status is now: ${data.ticket?.status}`);
      router.refresh();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Wallet transaction failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3 border-t border-[var(--border-ledger)] pt-4">
      {message && (
        <div className="rounded border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-900">
          {message}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {ticket.status === "PENDING_VERIFICATION" &&
          (!connected || publicKey?.toBase58() !== ticket.borrowerWallet) && (
            <button
              type="button"
              disabled={busy}
              onClick={() => runAction("custody_attest")}
              className="rounded bg-amber-700 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-800 disabled:opacity-50"
            >
              Verify Physical Asset (Custodian)
            </button>
          )}

        {ticket.status === "OPEN" &&
          (!connected || publicKey?.toBase58() !== ticket.borrowerWallet) && (
            <button
              type="button"
              disabled={busy}
              onClick={() => runAction("fund")}
              className="rounded bg-[var(--accent-vault)] px-4 py-2 text-sm font-semibold text-white hover:bg-[var(--accent-vault-hover)] disabled:opacity-50"
            >
              Fund Now ({principalSol.toFixed(2)} SOL)
            </button>
          )}

        {ticket.status === "ACTIVE" &&
          (!connected || publicKey?.toBase58() === ticket.borrowerWallet) && (
            <button
              type="button"
              disabled={busy}
              onClick={() => runAction("repay")}
              className="rounded bg-[var(--ink-primary)] px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
            >
              Repay & Reclaim ({totalDue} SOL)
            </button>
          )}

        {connected && publicKey?.toBase58() === ticket.borrowerWallet && ticket.status !== "ACTIVE" && (
          <span className="text-xs text-[var(--ink-muted)]">
            Connected as Borrower — awaiting {ticket.status === "PENDING_VERIFICATION" ? "Custodian verification" : "Lender funding"}.
          </span>
        )}

        {connected && publicKey?.toBase58() !== ticket.borrowerWallet && ticket.status === "ACTIVE" && (
          <span className="text-xs text-[var(--ink-muted)]">
            Active loan — awaiting Borrower repayment.
          </span>
        )}
      </div>
    </div>
  );
}
