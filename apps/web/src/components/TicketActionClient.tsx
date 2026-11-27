"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useWallet } from "@solana/wallet-adapter-react";
import type { PawnTicket } from "@/types/pawn";
import { lamportsToSol } from "@/lib/security";

const LENDER_DEMO_WALLET = "4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R";
const CUSTODIAN_DEMO_WALLET = "CustodianHubJakartaVerified11111111111111111";

export function TicketActionClient({ ticket }: { ticket: PawnTicket }) {
  const router = useRouter();
  const { publicKey, connected } = useWallet();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const principalSol = lamportsToSol(ticket.principalLamports);
  const totalDue = (principalSol * (1 + ticket.interestBps / 10_000)).toFixed(3);

  async function runAction(action: "fund" | "repay" | "custody_attest") {
    setBusy(true);
    setMessage(null);

    const actorWallet =
      connected && publicKey
        ? publicKey.toBase58()
        : action === "fund"
          ? LENDER_DEMO_WALLET
          : action === "custody_attest"
            ? CUSTODIAN_DEMO_WALLET
            : ticket.borrowerWallet;

    try {
      const res = await fetch(`/api/v1/pawn-tickets/${ticket.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, actorWallet }),
      });
      const data = (await res.json()) as { error?: string; ticket?: PawnTicket };
      if (!res.ok) {
        setMessage(data.error || "Aksi gagal.");
        return;
      }
      setMessage(`Berhasil! Status tiket sekarang: ${data.ticket?.status}`);
      router.refresh();
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

      <div className="flex flex-wrap gap-2">
        {ticket.status === "PENDING_VERIFICATION" && (
          <button
            type="button"
            disabled={busy}
            onClick={() => runAction("custody_attest")}
            className="rounded bg-amber-700 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-800 disabled:opacity-50"
          >
            Verifikasi Barang Fisik (Custodian)
          </button>
        )}

        {ticket.status === "OPEN" && (
          <button
            type="button"
            disabled={busy}
            onClick={() => runAction("fund")}
            className="rounded bg-[var(--accent-vault)] px-4 py-2 text-sm font-semibold text-white hover:bg-[var(--accent-vault-hover)] disabled:opacity-50"
          >
            Danai Sekarang ({principalSol.toFixed(2)} SOL)
          </button>
        )}

        {ticket.status === "ACTIVE" && (
          <button
            type="button"
            disabled={busy}
            onClick={() => runAction("repay")}
            className="rounded bg-[var(--ink-primary)] px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
          >
            Lunasi & Ambil Jaminan ({totalDue} SOL)
          </button>
        )}
      </div>
    </div>
  );
}
