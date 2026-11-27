import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ShieldCheck } from "lucide-react";
import { getTicketById } from "@/lib/store";
import { formatIdrFromSol, lamportsToSol, shortenAddress } from "@/lib/security";
import { TicketActionClient } from "@/components/TicketActionClient";
import { AppraisalSources } from "@/components/AppraisalSources";
import { syncDevnetTicket } from "@/lib/devnet";
import { explorerAddressUrl } from "@/lib/solana";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const ticket = await getTicketById(id);
  if (!ticket) {
    return { title: "Ticket Not Found — PawnChain" };
  }
  const principalSol = lamportsToSol(ticket.principalLamports).toFixed(2);
  const title = `PawnChain #${ticket.publicTicketId} — ${ticket.asset.brand} ${ticket.asset.model} (${principalSol} SOL)`;
  const description = `Need ${principalSol} SOL · ${(ticket.interestBps / 100).toFixed(1)}% interest · ${ticket.tenorDays} days · AI Median ${ticket.appraisal.medianBenchmarkSol} SOL (LTV ${Math.round(ticket.ltv * 100)}%)`;
  return {
    title,
    description,
    openGraph: { title, description, type: "website" },
    twitter: { card: "summary", title, description },
  };
}

export default async function ShareableTicketPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const stored = await getTicketById(id);

  if (!stored) {
    notFound();
  }

  // Show the last known state if the RPC is unreachable.
  const ticket = await syncDevnetTicket(stored).catch(() => stored);

  const principalSol = lamportsToSol(ticket.principalLamports);
  const totalRepaySol = Number(
    (principalSol * (1 + ticket.interestBps / 10_000)).toFixed(3)
  );

  return (
    <div className="min-h-screen bg-[var(--bg-canvas)] px-4 py-8 sm:px-6">
      <div className="mx-auto max-w-2xl">
        <Link
          href="/"
          className="mb-5 inline-flex items-center gap-1.5 text-sm font-medium text-[var(--ink-muted)] hover:text-[var(--ink-primary)]"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to collateral marketplace
        </Link>

        <div className="rounded-lg border border-[var(--border-ledger)] bg-white p-6">
          <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[var(--border-ledger)] pb-4">
            <div>
              <span className="font-mono text-xs text-[var(--ink-muted)]">
                Collateral request #{ticket.publicTicketId}
              </span>
              <h1 className="mt-1 text-2xl font-bold text-[var(--ink-primary)]">
                {ticket.asset.brand} {ticket.asset.model}
              </h1>
              <p className="mt-1 text-sm text-[var(--ink-muted)]">
                {ticket.asset.description}
              </p>
            </div>
            <span className="rounded border border-[var(--border-ledger)] bg-[var(--bg-canvas)] px-2.5 py-1 font-mono text-xs font-semibold text-[var(--accent-vault)]">
              {ticket.status} · {ticket.mode === "devnet" ? "Solana Devnet" : "Sandbox simulation"}
            </span>
          </div>

          {/* Financial Summary */}
          <div className="my-5 grid grid-cols-2 gap-4 rounded-md bg-[var(--bg-canvas)] p-4 sm:grid-cols-3">
            <div>
              <span className="block text-xs text-[var(--ink-muted)]">Requested loan</span>
              <span className="font-mono text-lg font-bold tabular-nums">
                {principalSol.toFixed(2)} SOL
              </span>
              <span className="block font-mono text-xs text-[var(--ink-muted)]">
                {formatIdrFromSol(principalSol)}
              </span>
            </div>
            <div>
              <span className="block text-xs text-[var(--ink-muted)]">Interest rate / Duration</span>
              <span className="font-mono text-lg font-bold tabular-nums">
                {(ticket.interestBps / 100).toFixed(1)}%
              </span>
              <span className="block text-xs text-[var(--ink-muted)]">
                {ticket.tenorDays} days
              </span>
            </div>
            <div>
              <span className="block text-xs text-[var(--ink-muted)]">Total repayment</span>
              <span className="font-mono text-lg font-bold tabular-nums text-[var(--accent-vault)]">
                {totalRepaySol} SOL
              </span>
              <span className="block font-mono text-xs text-[var(--ink-muted)]">
                LTV {Math.round(ticket.ltv * 100)}%
              </span>
            </div>
          </div>

          {/* Asset Valuation & References */}
          <div className="mb-5 rounded-md border border-[var(--border-ledger)] p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs font-bold text-[var(--ink-primary)]">
                Asset valuation · Market data analysis
              </span>
              <span className="font-mono text-xs text-[var(--accent-vault)]">
                Estimated market value: {ticket.appraisal.medianBenchmarkSol} SOL
              </span>
            </div>
            <div className="mt-2.5">
              <AppraisalSources references={ticket.appraisal.comparableReferences} />
            </div>
            <p className="mt-2.5 text-[11px] text-[var(--ink-muted)]">
              AI-generated valuations are estimates based on available market data. Actual collateral
              value and loan approval may vary.
            </p>
          </div>

          {/* Custody & Borrower Info */}
          <div className="mb-6 flex flex-wrap items-center justify-between gap-2 text-xs text-[var(--ink-muted)]">
            <span className="inline-flex items-center gap-1.5">
              <ShieldCheck className="h-4 w-4 text-[var(--accent-vault)]" />
              {ticket.asset.assetType === "DIGITAL"
                ? ticket.mode === "devnet"
                  ? "On-chain Solana escrow"
                  : "Simulated escrow · Sandbox environment"
                : ticket.custodyAttestationHash
                  ? `Custody verified (${shortenAddress(ticket.custodyAttestationHash, 6)})`
                  : "Awaiting custody verification"}
            </span>
            <span className="font-mono">
              Borrower: {shortenAddress(ticket.borrowerWallet)}
            </span>
          </div>

          {ticket.chainTicketPubkey && (
            <a
              href={explorerAddressUrl(ticket.chainTicketPubkey)}
              target="_blank"
              rel="noreferrer"
              className="mb-4 block break-all font-mono text-xs text-[var(--accent-vault)] hover:underline"
            >
              View on Solana Explorer: {ticket.chainTicketPubkey}
            </a>
          )}

          <TicketActionClient ticket={ticket} />
        </div>
      </div>
    </div>
  );
}
