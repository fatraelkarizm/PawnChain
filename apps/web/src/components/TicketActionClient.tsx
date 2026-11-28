"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import type { PawnTicket } from "@/types/pawn";
import { lamportsToSol } from "@/lib/security";
import { runDevnetAction } from "@/lib/devnetActions";
import { SANDBOX_WALLETS } from "@/lib/sandbox";
import { explorerTxUrl } from "@/lib/solana";

const WalletMultiButton = dynamic(
  async () => (await import("@solana/wallet-adapter-react-ui")).WalletMultiButton,
  { ssr: false }
);

type Action = "fund" | "repay" | "custody_attest";

export function TicketActionClient({ ticket }: { ticket: PawnTicket }) {
  const router = useRouter();
  const { connection } = useConnection();
  const wallet = useWallet();
  const isDevnet = ticket.mode === "devnet";
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string; signature?: string } | null>(
    null
  );

  const principalSol = lamportsToSol(ticket.principalLamports);
  const totalDue = (principalSol * (1 + ticket.interestBps / 10_000)).toFixed(3);
  const disabled = busy || (isDevnet && !wallet.publicKey);
  // Sandbox plays every role from this page; on devnet the connected wallet decides.
  const address = isDevnet ? wallet.publicKey?.toBase58() : undefined;
  const isBorrower = address === ticket.borrowerWallet;
  const isOtherWallet = !!address && !isBorrower;

  async function runAction(action: Action) {
    setBusy(true);
    setMessage(null);
    try {
      let updated: PawnTicket;
      let signature: string | undefined;
      if (isDevnet) {
        ({ ticket: updated, signature } = await runDevnetAction(connection, wallet, ticket, action));
      } else {
        const actorWallet =
          action === "fund"
            ? SANDBOX_WALLETS.lender
            : action === "custody_attest"
              ? SANDBOX_WALLETS.custodian
              : ticket.borrowerWallet;
        const res = await fetch(`/api/v1/pawn-tickets/${ticket.id}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action, actorWallet }),
        });
        const data = (await res.json()) as { error?: string; ticket?: PawnTicket };
        if (!res.ok || !data.ticket) throw new Error(data.error || "Action failed.");
        updated = data.ticket;
      }
      const text =
        action === "repay"
          ? "Repayment confirmed. Your collateral is now eligible for release."
          : action === "custody_attest"
            ? "Physical inspection completed. This collateral request is now open for funding."
            : `Collateral request updated to ${updated.status}.`;
      setMessage({ ok: true, signature, text });
      router.refresh();
    } catch (err) {
      setMessage({
        ok: false,
        text: err instanceof Error ? err.message : "Transaction could not be completed.",
      });
    } finally {
      setBusy(false);
    }
  }

  const explorer = message?.signature ? explorerTxUrl(message.signature) : null;

  return (
    <div className="space-y-3 border-t border-[var(--border-ledger)] pt-4">
      {message && (
        <div
          role="status"
          className={`break-words rounded border px-3 py-2 text-xs ${
            message.ok
              ? "border-emerald-200 bg-emerald-50 text-emerald-900"
              : "border-rose-200 bg-rose-50 text-rose-900"
          }`}
        >
          {message.text}
          {explorer && (
            <a href={explorer} target="_blank" rel="noreferrer" className="ml-2 font-semibold underline">
              View on Solana Explorer
            </a>
          )}
        </div>
      )}

      {isDevnet && <WalletMultiButton />}

      <div className="flex flex-wrap items-center gap-2">
        {ticket.status === "PENDING_VERIFICATION" && !isBorrower && (
          <button
            type="button"
            disabled={disabled}
            onClick={() => runAction("custody_attest")}
            className="rounded bg-amber-700 hover:bg-amber-800 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            Verify Collateral
          </button>
        )}

        {ticket.status === "OPEN" && !isBorrower && (
          <button
            type="button"
            disabled={disabled}
            onClick={() => runAction("fund")}
            className="rounded bg-[var(--accent-vault)] hover:bg-[var(--accent-vault-hover)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            Fund This Request ({principalSol.toFixed(2)} SOL)
          </button>
        )}

        {ticket.status === "ACTIVE" && !isOtherWallet && (
          <button
            type="button"
            disabled={disabled}
            onClick={() => runAction("repay")}
            className="rounded bg-[var(--ink-primary)] hover:bg-slate-800 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            Repay &amp; Reclaim Collateral ({totalDue} SOL)
          </button>
        )}

        {isBorrower && (ticket.status === "PENDING_VERIFICATION" || ticket.status === "OPEN") && (
          <span className="text-xs text-[var(--ink-muted)]">
            {ticket.status === "OPEN"
              ? "Waiting for a lender to fund this request."
              : "Collateral verification is required before funding."}
          </span>
        )}

        {isOtherWallet && ticket.status === "ACTIVE" && (
          <span className="text-xs text-[var(--ink-muted)]">
            Financing successfully funded. Awaiting repayment.
          </span>
        )}
      </div>
    </div>
  );
}
