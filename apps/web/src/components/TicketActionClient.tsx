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
      setMessage({ ok: true, signature, text: `Ticket status is now: ${updated.status}` });
      router.refresh();
    } catch (err) {
      setMessage({
        ok: false,
        text: err instanceof Error ? err.message : "Wallet transaction failed.",
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
              Solana Explorer
            </a>
          )}
        </div>
      )}

      {isDevnet && <WalletMultiButton />}

      <div className="flex flex-wrap gap-2">
        {ticket.status === "PENDING_VERIFICATION" && (
          <button
            type="button"
            disabled={disabled}
            onClick={() => runAction("custody_attest")}
            className="rounded bg-amber-700 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-800 disabled:opacity-50"
          >
            Verify Physical Asset (Custodian)
          </button>
        )}

        {ticket.status === "OPEN" && (
          <button
            type="button"
            disabled={disabled}
            onClick={() => runAction("fund")}
            className="rounded bg-[var(--accent-vault)] px-4 py-2 text-sm font-semibold text-white hover:bg-[var(--accent-vault-hover)] disabled:opacity-50"
          >
            Fund Now ({principalSol.toFixed(2)} SOL)
          </button>
        )}

        {ticket.status === "ACTIVE" && (
          <button
            type="button"
            disabled={disabled}
            onClick={() => runAction("repay")}
            className="rounded bg-[var(--ink-primary)] px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
          >
            Repay & Reclaim ({totalDue} SOL)
          </button>
        )}
      </div>
    </div>
  );
}
