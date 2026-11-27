import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ExternalLink, ShieldCheck } from "lucide-react";
import { getTicketById } from "@/lib/store";
import { formatIdrFromSol, lamportsToSol, shortenAddress } from "@/lib/security";
import { TicketActionClient } from "@/components/TicketActionClient";

export const dynamic = "force-dynamic";

export default async function ShareableTicketPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const ticket = await getTicketById(id);

  if (!ticket) {
    notFound();
  }

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
          Kembali ke Buku Besar PawnChain
        </Link>

        <div className="rounded-lg border border-[var(--border-ledger)] bg-white p-6">
          <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[var(--border-ledger)] pb-4">
            <div>
              <span className="font-mono text-xs text-[var(--ink-muted)]">
                Tiket Gadai #{ticket.publicTicketId}
              </span>
              <h1 className="mt-1 text-2xl font-bold text-[var(--ink-primary)]">
                {ticket.asset.brand} {ticket.asset.model}
              </h1>
              <p className="mt-1 text-sm text-[var(--ink-muted)]">
                {ticket.asset.description}
              </p>
            </div>
            <span className="rounded border border-[var(--border-ledger)] bg-[var(--bg-canvas)] px-2.5 py-1 font-mono text-xs font-semibold text-[var(--accent-vault)]">
              {ticket.status}
            </span>
          </div>

          {/* Financial Summary */}
          <div className="my-5 grid grid-cols-2 gap-4 rounded-md bg-[var(--bg-canvas)] p-4 sm:grid-cols-3">
            <div>
              <span className="block text-xs text-[var(--ink-muted)]">Pinjaman Diminta</span>
              <span className="font-mono text-lg font-bold tabular-nums">
                {principalSol.toFixed(2)} SOL
              </span>
              <span className="block font-mono text-xs text-[var(--ink-muted)]">
                {formatIdrFromSol(principalSol)}
              </span>
            </div>
            <div>
              <span className="block text-xs text-[var(--ink-muted)]">Bunga / Tenor</span>
              <span className="font-mono text-lg font-bold tabular-nums">
                {(ticket.interestBps / 100).toFixed(1)}%
              </span>
              <span className="block text-xs text-[var(--ink-muted)]">
                {ticket.tenorDays} hari
              </span>
            </div>
            <div>
              <span className="block text-xs text-[var(--ink-muted)]">Total Pengembalian</span>
              <span className="font-mono text-lg font-bold tabular-nums text-[var(--accent-vault)]">
                {totalRepaySol} SOL
              </span>
              <span className="block font-mono text-xs text-[var(--ink-muted)]">
                LTV {Math.round(ticket.ltv * 100)}%
              </span>
            </div>
          </div>

          {/* AI Valuation & Firecrawl Proof */}
          <div className="mb-5 rounded-md border border-[var(--border-ledger)] p-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-[var(--ink-primary)]">
                Bukti Taksiran AI ({ticket.appraisal.modelVersion})
              </span>
              <span className="font-mono text-xs text-[var(--accent-vault)]">
                Nilai Median: {ticket.appraisal.medianBenchmarkSol} SOL
              </span>
            </div>
            <ul className="mt-2.5 space-y-1.5">
              {ticket.appraisal.comparableReferences.map((ref, idx) => (
                <li key={idx} className="flex items-center justify-between text-xs">
                  <a
                    href={ref.url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-[var(--accent-vault)] hover:underline"
                  >
                    <ExternalLink className="h-3 w-3" />
                    {ref.source}
                  </a>
                  <span className="font-mono tabular-nums">
                    {ref.priceSol} SOL
                  </span>
                </li>
              ))}
            </ul>
          </div>

          {/* Custody & Borrower Info */}
          <div className="mb-6 flex flex-wrap items-center justify-between gap-2 text-xs text-[var(--ink-muted)]">
            <span className="inline-flex items-center gap-1.5">
              <ShieldCheck className="h-4 w-4 text-[var(--accent-vault)]" />
              {ticket.asset.assetType === "DIGITAL"
                ? "Jaminan NFT terkunci di Escrow PDA Solana"
                : ticket.custodyAttestationHash
                  ? `Terverifikasi Custodian (${shortenAddress(ticket.custodyAttestationHash, 6)})`
                  : "Menunggu verifikasi fisik Custodian"}
            </span>
            <span className="font-mono">
              Borrower: {shortenAddress(ticket.borrowerWallet)}
            </span>
          </div>

          <TicketActionClient ticket={ticket} />
        </div>
      </div>
    </div>
  );
}
