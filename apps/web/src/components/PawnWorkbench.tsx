"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useWallet } from "@solana/wallet-adapter-react";
import {
  Check,
  Copy,
  ExternalLink,
  FlaskConical,
  ShieldAlert,
  ShieldCheck,
  Volume2,
} from "lucide-react";
import type {
  AppraisalResult,
  AssetCondition,
  AssetType,
  PawnTicket,
} from "@/types/pawn";
import { explorerTxUrl } from "@/lib/solana";

const WalletMultiButton = dynamic(
  async () => (await import("@solana/wallet-adapter-react-ui")).WalletMultiButton,
  { ssr: false }
);

const SANDBOX_WALLETS = {
  borrower: "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU",
  lender: "4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R",
  custodian: "CustodianHubJakartaVerified11111111111111111",
};

type SandboxRole = keyof typeof SANDBOX_WALLETS;
type MarketFilter = "ALL" | "OPEN" | "PENDING_VERIFICATION" | "ACTIVE" | "REPAID";

const LAMPORTS_PER_SOL = 1_000_000_000;
const SOL_IDR_RATE = 2_400_000;

function formatIdr(idr: number): string {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(idr);
}

function shortAddr(addr: string | null): string {
  if (!addr) return "-";
  if (addr.length <= 11) return addr;
  return `${addr.slice(0, 4)}...${addr.slice(-4)}`;
}

function StatusBadge({ status }: { status: PawnTicket["status"] }) {
  const map: Record<PawnTicket["status"], { label: string; cls: string }> = {
    PENDING_VERIFICATION: {
      label: "Menunggu Cek Toko",
      cls: "bg-amber-50 text-amber-800 border-amber-200",
    },
    OPEN: {
      label: "Siap Didanai",
      cls: "bg-emerald-50 text-emerald-800 border-emerald-200",
    },
    ACTIVE: {
      label: "Pinjaman Berjalan",
      cls: "bg-sky-50 text-sky-800 border-sky-200",
    },
    REPAID: {
      label: "Lunas & Dilepas",
      cls: "bg-slate-100 text-slate-700 border-slate-200",
    },
    DEFAULT_CLAIMED: {
      label: "Gagal Bayar (Diklaim)",
      cls: "bg-rose-50 text-rose-800 border-rose-200",
    },
    CANCELLED: {
      label: "Dibatalkan",
      cls: "bg-slate-100 text-slate-500 border-slate-200",
    },
  };
  const cfg = map[status];
  return (
    <span className={`inline-flex items-center rounded border px-2 py-0.5 text-xs font-medium ${cfg.cls}`}>
      {cfg.label}
    </span>
  );
}

export function PawnWorkbench({ initialTickets }: { initialTickets: PawnTicket[] }) {
  const { publicKey, connected } = useWallet();
  const [sandboxEnabled, setSandboxEnabled] = useState(true);
  const [sandboxRole, setSandboxRole] = useState<SandboxRole>("borrower");
  const activeWallet =
    connected && publicKey && !sandboxEnabled
      ? publicKey.toBase58()
      : SANDBOX_WALLETS[sandboxRole];

  const [tickets, setTickets] = useState<PawnTicket[]>(initialTickets);
  const [filter, setFilter] = useState<MarketFilter>("ALL");

  // Appraisal & Pawn Form State
  const [assetType, setAssetType] = useState<AssetType>("PHYSICAL");
  const [brand, setBrand] = useState("Apple");
  const [model, setModel] = useState("iPhone 13 Pro 256GB");
  const [condition, setCondition] = useState<AssetCondition>("Good");
  const [serialNumber, setSerialNumber] = useState("358849102938471");
  const [mintAddress, setMintAddress] = useState("");
  const [description, setDescription] = useState("Unit mulus terawat, kelengkapan fullset.");

  const [appraisal, setAppraisal] = useState<AppraisalResult | null>(null);
  const [appraising, setAppraising] = useState(false);
  const [appraisalError, setAppraisalError] = useState<string | null>(null);

  const [principalSol, setPrincipalSol] = useState("1.5");
  const [interestPct, setInterestPct] = useState("5");
  const [tenorDays, setTenorDays] = useState("14");

  const [voiceLoading, setVoiceLoading] = useState(false);
  const [voiceScript, setVoiceScript] = useState<string | null>(null);
  const [voiceLang, setVoiceLang] = useState<"id" | "en">("id");

  const [submitting, setSubmitting] = useState(false);
  const [actionBusyId, setActionBusyId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const refreshTickets = useCallback(async () => {
    const res = await fetch("/api/v1/tickets");
    if (res.ok) {
      const data = (await res.json()) as { tickets: PawnTicket[] };
      setTickets(data.tickets);
    }
  }, []);

  async function handleRunAppraisal() {
    setAppraising(true);
    setAppraisalError(null);
    setFeedback(null);
    try {
      const res = await fetch("/api/v1/appraisal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          assetType,
          brand,
          model,
          condition,
          serialNumber: assetType === "PHYSICAL" ? serialNumber : "",
        }),
      });
      const data = (await res.json()) as {
        appraisal?: AppraisalResult;
        error?: string;
        message?: string;
      };
      if (!res.ok) {
        setAppraisal(null);
        setAppraisalError(data.message || data.error || "Gagal menjalankan appraisal.");
        return;
      }
      if (data.appraisal) {
        setAppraisal(data.appraisal);
        setPrincipalSol(String(Math.min(1.5, data.appraisal.suggestedMaxLoanSol)));
      }
    } catch {
      setAppraisalError("Koneksi ke layanan appraisal terputus.");
    } finally {
      setAppraising(false);
    }
  }

  async function handleVoiceBriefing() {
    setVoiceLoading(true);
    try {
      const res = await fetch("/api/v1/voice/contract-briefing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          assetName: `${brand} ${model}`,
          principalSol: Number(principalSol) || 1,
          interestPercent: Number(interestPct) || 5,
          tenorDays: Number(tenorDays) || 14,
          language: voiceLang,
        }),
      });
      const data = (await res.json()) as {
        script?: string;
        audioDataUrl?: string | null;
      };
      if (data.script) setVoiceScript(data.script);

      if (data.audioDataUrl) {
        const audio = new Audio(data.audioDataUrl);
        await audio.play();
      } else if (data.script && typeof window !== "undefined" && "speechSynthesis" in window) {
        window.speechSynthesis.cancel();
        const utter = new SpeechSynthesisUtterance(data.script);
        utter.lang = voiceLang === "en" ? "en-US" : "id-ID";
        window.speechSynthesis.speak(utter);
      }
    } finally {
      setVoiceLoading(false);
    }
  }

  async function handleCreateTicket(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setFeedback(null);
    try {
      const res = await fetch("/api/v1/pawn-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          borrowerWallet: activeWallet,
          assetType,
          brand,
          model,
          description,
          condition,
          serialNumber: assetType === "PHYSICAL" ? serialNumber : "",
          mintAddress: assetType === "DIGITAL" ? mintAddress || undefined : undefined,
          principalSol: Number(principalSol),
          interestBps: Math.round(Number(interestPct) * 100),
          tenorDays: Number(tenorDays),
        }),
      });
      const data = (await res.json()) as { ticket?: PawnTicket; error?: string };
      if (!res.ok) {
        setFeedback({ type: "err", text: data.error || "Gagal membuat tiket gadai." });
        return;
      }
      if (data.ticket) {
        setFeedback({
          type: "ok",
          text:
            data.ticket.status === "PENDING_VERIFICATION"
              ? `Tiket #${data.ticket.publicTicketId} dibuat! Pindah ke peran Custodian untuk verifikasi fisik.`
              : `Tiket #${data.ticket.publicTicketId} terkunci di Escrow dan tayang di Marketplace.`,
        });
        await refreshTickets();
      }
    } catch {
      setFeedback({ type: "err", text: "Gagal terhubung ke server." });
    } finally {
      setSubmitting(false);
    }
  }

  async function handleTicketAction(
    ticketId: string,
    action: "custody_attest" | "fund" | "repay" | "cancel"
  ) {
    setActionBusyId(ticketId);
    setFeedback(null);
    try {
      const res = await fetch(`/api/v1/pawn-tickets/${ticketId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          actorWallet: activeWallet,
          conditionReport:
            action === "custody_attest" ? "Segel fisik & serial terverifikasi di Hub Jakarta" : undefined,
        }),
      });
      const data = (await res.json()) as { ticket?: PawnTicket; error?: string };
      if (!res.ok) {
        setFeedback({ type: "err", text: data.error || "Aksi gagal dijalankan." });
        return;
      }
      if (data.ticket) {
        setFeedback({
          type: "ok",
          text: `Tiket #${data.ticket.publicTicketId} diperbarui ke status ${data.ticket.status}.`,
        });
        await refreshTickets();
      }
    } finally {
      setActionBusyId(null);
    }
  }

  function applyPreset(preset: "iphone" | "duplicate" | "nft") {
    setAppraisal(null);
    setAppraisalError(null);
    setFeedback(null);
    if (preset === "iphone") {
      setAssetType("PHYSICAL");
      setBrand("Apple");
      setModel("iPhone 14 Pro 256GB");
      setCondition("Mint");
      setSerialNumber(`359011223344${Math.floor(100 + Math.random() * 899)}`);
      setDescription("Mulus fullset box, bebas iCloud, siap dicek di Hub Jakarta.");
    } else if (preset === "duplicate") {
      setAssetType("PHYSICAL");
      setBrand("Apple");
      setModel("iPhone 13 Pro 256GB");
      setCondition("Good");
      // Matches seeded ticket #101 IMEI to demonstrate HMAC duplicate block
      setSerialNumber("356984110029384");
      setDescription("Uji coba deteksi gadai ganda dengan IMEI yang sudah aktif.");
    } else {
      setAssetType("DIGITAL");
      setBrand("Tensorians");
      setModel("Tensorian #1904 (Devnet)");
      setCondition("Mint");
      setSerialNumber("");
      setMintAddress("TensorianDevnetMint9999999999999999999999");
      setDescription("NFT Solana siap dikunci langsung di PDA Escrow.");
    }
  }

  function copyShareLink(publicTicketId: number) {
    const url = `${window.location.origin}/ticket/${publicTicketId}`;
    navigator.clipboard.writeText(url);
    setCopiedId(String(publicTicketId));
    setTimeout(() => setCopiedId(null), 2000);
  }

  const visibleTickets =
    filter === "ALL" ? tickets : tickets.filter((t) => t.status === filter);

  return (
    <div className="min-h-screen flex flex-col">
      {/* Top Utility Bar */}
      <header className="sticky top-0 z-30 border-b border-[var(--border-ledger)] bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded bg-[var(--accent-vault)] text-sm font-bold text-white">
              P
            </div>
            <div>
              <span className="text-base font-bold tracking-tight text-[var(--ink-primary)]">
                PawnChain
              </span>
              <span className="ml-2 rounded border border-[var(--border-ledger)] bg-[var(--bg-canvas)] px-1.5 py-0.5 font-mono text-[11px] text-[var(--ink-muted)]">
                Solana Devnet
              </span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Sandbox Mode Toggle & Role Switcher */}
            <div className="flex items-center gap-1.5 rounded-md border border-[var(--border-ledger)] bg-[var(--bg-canvas)] p-1">
              <button
                type="button"
                onClick={() => setSandboxEnabled((v) => !v)}
                className={`inline-flex items-center gap-1.5 rounded px-2.5 py-1 text-xs font-semibold transition-colors ${
                  sandboxEnabled
                    ? "bg-[var(--accent-vault)] text-white"
                    : "text-[var(--ink-muted)] hover:text-[var(--ink-primary)]"
                }`}
              >
                <FlaskConical className="h-3.5 w-3.5" />
                {sandboxEnabled ? "Sandbox Aktif" : "Mode Wallet"}
              </button>

              {sandboxEnabled && (
                <select
                  aria-label="Pilih peran demo"
                  value={sandboxRole}
                  onChange={(e) => setSandboxRole(e.target.value as SandboxRole)}
                  className="rounded border-0 bg-transparent px-2 py-1 text-xs font-medium text-[var(--ink-primary)] focus:outline-none"
                >
                  <option value="borrower">Peran: Peminjam (Budi)</option>
                  <option value="lender">Peran: Pendana (Siti)</option>
                  <option value="custodian">Peran: Custodian Hub</option>
                </select>
              )}
            </div>

            <WalletMultiButton />
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6">
        {/* Compact Header Strip */}
        <div className="mb-6 flex flex-col justify-between gap-4 border-b border-[var(--border-ledger)] pb-5 md:flex-row md:items-end">
          <div className="max-w-2xl">
            <h1 className="text-2xl font-bold tracking-tight text-[var(--ink-primary)] sm:text-3xl">
              Gadai P2P berbasis taksiran harga pasar dan escrow Solana
            </h1>
            <p className="mt-1.5 text-sm leading-relaxed text-[var(--ink-muted)]">
              Cek nilai pasar jaminan Anda secara transparan lewat Firecrawl, kunci aset di brankas
              on-chain, dan terima dana langsung dari pendana tanpa perantara bank.
            </p>
          </div>
          <div className="flex flex-col items-start md:items-end">
            <span className="text-xs text-[var(--ink-muted)]">Akun Aktif</span>
            <span className="font-mono text-xs font-medium text-[var(--ink-primary)]">
              {shortAddr(activeWallet)} ({sandboxEnabled ? sandboxRole : "Phantom/Solana"})
            </span>
          </div>
        </div>

        {feedback && (
          <div
            role="status"
            className={`mb-5 flex items-center justify-between rounded-md border px-4 py-3 text-sm ${
              feedback.type === "ok"
                ? "border-emerald-200 bg-emerald-50 text-emerald-900"
                : "border-rose-200 bg-rose-50 text-rose-900"
            }`}
          >
            <span>{feedback.text}</span>
            <button
              type="button"
              onClick={() => setFeedback(null)}
              className="ml-4 text-xs font-semibold underline"
            >
              Tutup
            </button>
          </div>
        )}

        {/* Asymmetric 2-Column Ledger Workbench */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          {/* LEFT: Appraisal & Pawn Creation Desk (5 cols) */}
          <section className="lg:col-span-5">
            <div className="rounded-lg border border-[var(--border-ledger)] bg-[var(--bg-surface)]">
              <div className="border-b border-[var(--border-ledger)] px-5 py-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-base font-bold text-[var(--ink-primary)]">
                    Meja Taksiran & Pengajuan Gadai
                  </h2>
                  <span className="font-mono text-xs text-[var(--ink-muted)]">LTV Maks 60%</span>
                </div>
                {/* Quick Demo Presets */}
                <div className="mt-3 flex flex-wrap gap-1.5">
                  <button
                    type="button"
                    onClick={() => applyPreset("iphone")}
                    className="rounded border border-[var(--border-ledger)] bg-[var(--bg-canvas)] px-2.5 py-1 text-xs font-medium text-[var(--ink-primary)] hover:bg-[var(--bg-muted)]"
                  >
                    Demo: iPhone 14 Pro
                  </button>
                  <button
                    type="button"
                    onClick={() => applyPreset("nft")}
                    className="rounded border border-[var(--border-ledger)] bg-[var(--bg-canvas)] px-2.5 py-1 text-xs font-medium text-[var(--ink-primary)] hover:bg-[var(--bg-muted)]"
                  >
                    Demo: NFT Digital
                  </button>
                  <button
                    type="button"
                    onClick={() => applyPreset("duplicate")}
                    className="rounded border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-900 hover:bg-amber-100"
                  >
                    Tes Blokir IMEI Ganda
                  </button>
                </div>
              </div>

              <form onSubmit={handleCreateTicket} className="space-y-4 p-5">
                {/* Mode Selector */}
                <div className="grid grid-cols-2 gap-2 rounded-md bg-[var(--bg-canvas)] p-1">
                  <button
                    type="button"
                    onClick={() => {
                      setAssetType("PHYSICAL");
                      setAppraisal(null);
                    }}
                    className={`rounded py-1.5 text-xs font-semibold transition-colors ${
                      assetType === "PHYSICAL"
                        ? "bg-white text-[var(--ink-primary)] shadow-xs"
                        : "text-[var(--ink-muted)]"
                    }`}
                  >
                    Barang Fisik (RWA)
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setAssetType("DIGITAL");
                      setAppraisal(null);
                    }}
                    className={`rounded py-1.5 text-xs font-semibold transition-colors ${
                      assetType === "DIGITAL"
                        ? "bg-white text-[var(--ink-primary)] shadow-xs"
                        : "text-[var(--ink-muted)]"
                    }`}
                  >
                    Aset Digital (NFT)
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-[var(--ink-muted)]">
                      Merek / Koleksi
                    </label>
                    <input
                      type="text"
                      required
                      value={brand}
                      onChange={(e) => setBrand(e.target.value)}
                      className="w-full rounded border border-[var(--border-ledger)] px-3 py-2 text-sm focus:border-[var(--accent-vault)] focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-[var(--ink-muted)]">
                      Model / Nama Aset
                    </label>
                    <input
                      type="text"
                      required
                      value={model}
                      onChange={(e) => setModel(e.target.value)}
                      className="w-full rounded border border-[var(--border-ledger)] px-3 py-2 text-sm focus:border-[var(--accent-vault)] focus:outline-none"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-[var(--ink-muted)]">
                      Kondisi
                    </label>
                    <select
                      value={condition}
                      onChange={(e) => setCondition(e.target.value as AssetCondition)}
                      className="w-full rounded border border-[var(--border-ledger)] bg-white px-3 py-2 text-sm focus:border-[var(--accent-vault)] focus:outline-none"
                    >
                      <option value="Mint">Mint (Mulus 100%)</option>
                      <option value="Good">Good (Wajar 90%)</option>
                      <option value="Fair">Fair (Ada Minus 70%)</option>
                    </select>
                  </div>

                  {assetType === "PHYSICAL" ? (
                    <div>
                      <label className="mb-1 block text-xs font-medium text-[var(--ink-muted)]">
                        Serial / IMEI (Di-hash HMAC)
                      </label>
                      <input
                        type="text"
                        value={serialNumber}
                        onChange={(e) => setSerialNumber(e.target.value)}
                        placeholder="Contoh: 356984..."
                        className="w-full rounded border border-[var(--border-ledger)] px-3 py-2 font-mono text-xs focus:border-[var(--accent-vault)] focus:outline-none"
                      />
                    </div>
                  ) : (
                    <div>
                      <label className="mb-1 block text-xs font-medium text-[var(--ink-muted)]">
                        Mint Address (Devnet)
                      </label>
                      <input
                        type="text"
                        value={mintAddress}
                        onChange={(e) => setMintAddress(e.target.value)}
                        placeholder="Opsional (otomatis demo)"
                        className="w-full rounded border border-[var(--border-ledger)] px-3 py-2 font-mono text-xs focus:border-[var(--accent-vault)] focus:outline-none"
                      />
                    </div>
                  )}
                </div>

                <div>
                  <label className="mb-1 block text-xs font-medium text-[var(--ink-muted)]">
                    Catatan Kondisi Aset
                  </label>
                  <input
                    type="text"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    className="w-full rounded border border-[var(--border-ledger)] px-3 py-2 text-sm focus:border-[var(--accent-vault)] focus:outline-none"
                  />
                </div>

                <button
                  type="button"
                  disabled={appraising}
                  onClick={handleRunAppraisal}
                  className="w-full rounded-md border border-[var(--ink-primary)] bg-[var(--ink-primary)] px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-slate-800 disabled:opacity-50"
                >
                  {appraising ? "Mengecek harga pasar Firecrawl..." : "Hitung Taksiran AI"}
                </button>

                {/* Duplicate Block or Error */}
                {appraisalError && (
                  <div className="flex items-start gap-2 rounded-md border border-rose-200 bg-rose-50 p-3 text-xs text-rose-900">
                    <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-rose-700" />
                    <span>{appraisalError}</span>
                  </div>
                )}

                {/* Appraisal Valuation Sheet */}
                {appraisal && (
                  <div className="space-y-3 rounded-md border border-[var(--border-ledger)] bg-[var(--bg-canvas)] p-4">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-[var(--ink-primary)]">
                        Hasil Taksiran ({appraisal.modelVersion})
                      </span>
                      <span className="rounded bg-white px-2 py-0.5 font-mono text-xs font-semibold text-[var(--accent-vault)]">
                        Skor Risiko: {appraisal.riskLevel} ({appraisal.riskScore}/100)
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-3 border-y border-[var(--border-ledger)] py-2.5">
                      <div>
                        <span className="block text-[11px] text-[var(--ink-muted)]">
                          Nilai Acuan Median
                        </span>
                        <span className="font-mono text-sm font-bold tabular-nums text-[var(--ink-primary)]">
                          {appraisal.medianBenchmarkSol} SOL
                        </span>
                        <span className="block font-mono text-[11px] text-[var(--ink-muted)]">
                          {formatIdr(appraisal.medianBenchmarkSol * SOL_IDR_RATE)}
                        </span>
                      </div>
                      <div>
                        <span className="block text-[11px] text-[var(--ink-muted)]">
                          Batas Pinjaman ({Math.round(appraisal.suggestedLtv * 100)}% LTV)
                        </span>
                        <span className="font-mono text-sm font-bold tabular-nums text-[var(--accent-vault)]">
                          Maks {appraisal.suggestedMaxLoanSol} SOL
                        </span>
                        <span className="block font-mono text-[11px] text-[var(--ink-muted)]">
                          Confidence {Math.round(appraisal.confidenceScore * 100)}%
                        </span>
                      </div>
                    </div>

                    {/* Firecrawl Evidence Links */}
                    <div>
                      <span className="mb-1.5 block text-[11px] font-semibold text-[var(--ink-muted)]">
                        Sumber Pembanding Harga ({appraisal.comparableReferences[0]?.sourceType === "firecrawl_live" ? "Live Firecrawl" : "Benchmark Ter-cache"})
                      </span>
                      <ul className="space-y-1">
                        {appraisal.comparableReferences.map((ref, i) => (
                          <li key={i} className="flex items-center justify-between text-xs">
                            <a
                              href={ref.url}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex max-w-[65%] items-center gap-1 truncate text-[var(--accent-vault)] hover:underline"
                            >
                              <ExternalLink className="h-3 w-3 shrink-0" />
                              <span className="truncate">{ref.source}</span>
                            </a>
                            <span className="font-mono text-[11px] tabular-nums text-[var(--ink-primary)]">
                              {formatIdr(ref.priceIdr)}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                )}

                {/* Loan Terms */}
                <div className="grid grid-cols-3 gap-2.5 pt-1">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-[var(--ink-muted)]">
                      Pinjaman (SOL)
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      min="0.05"
                      required
                      value={principalSol}
                      onChange={(e) => setPrincipalSol(e.target.value)}
                      className="w-full rounded border border-[var(--border-ledger)] px-2.5 py-2 font-mono text-sm tabular-nums focus:border-[var(--accent-vault)] focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-[var(--ink-muted)]">
                      Bunga (%)
                    </label>
                    <input
                      type="number"
                      step="0.5"
                      min="0"
                      max="50"
                      required
                      value={interestPct}
                      onChange={(e) => setInterestPct(e.target.value)}
                      className="w-full rounded border border-[var(--border-ledger)] px-2.5 py-2 font-mono text-sm tabular-nums focus:border-[var(--accent-vault)] focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-[var(--ink-muted)]">
                      Tenor (Hari)
                    </label>
                    <input
                      type="number"
                      min="1"
                      max="90"
                      required
                      value={tenorDays}
                      onChange={(e) => setTenorDays(e.target.value)}
                      className="w-full rounded border border-[var(--border-ledger)] px-2.5 py-2 font-mono text-sm tabular-nums focus:border-[var(--accent-vault)] focus:outline-none"
                    />
                  </div>
                </div>

                {/* ElevenLabs Voice Contract Briefing */}
                <div className="rounded-md border border-[var(--border-ledger)] bg-[var(--bg-canvas)] p-3">
                  <div className="flex items-center justify-between gap-2">
                    <button
                      type="button"
                      disabled={voiceLoading}
                      onClick={handleVoiceBriefing}
                      className="inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--accent-vault)] hover:underline"
                    >
                      <Volume2 className="h-4 w-4" />
                      {voiceLoading ? "Membuat audio..." : "Dengar Ringkasan Kontrak (ElevenLabs)"}
                    </button>
                    <div className="flex gap-1">
                      <button
                        type="button"
                        onClick={() => setVoiceLang("id")}
                        className={`rounded px-1.5 py-0.5 text-[11px] font-semibold ${
                          voiceLang === "id" ? "bg-[var(--ink-primary)] text-white" : "text-[var(--ink-muted)]"
                        }`}
                      >
                        ID
                      </button>
                      <button
                        type="button"
                        onClick={() => setVoiceLang("en")}
                        className={`rounded px-1.5 py-0.5 text-[11px] font-semibold ${
                          voiceLang === "en" ? "bg-[var(--ink-primary)] text-white" : "text-[var(--ink-muted)]"
                        }`}
                      >
                        EN
                      </button>
                    </div>
                  </div>
                  {voiceScript && (
                    <p className="mt-2 text-xs leading-relaxed text-[var(--ink-muted)]">
                      {voiceScript}
                    </p>
                  )}
                </div>

                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full rounded-md bg-[var(--accent-vault)] px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[var(--accent-vault-hover)] disabled:opacity-50"
                >
                  {submitting
                    ? "Menyimpan ke Brankas Solana..."
                    : assetType === "PHYSICAL"
                      ? "Ajukan Tiket Gadai Fisik"
                      : "Kunci NFT & Terbitkan Tiket"}
                </button>
              </form>
            </div>
          </section>

          {/* RIGHT: Vault Ledger & Marketplace (7 cols) */}
          <section className="lg:col-span-7">
            <div className="rounded-lg border border-[var(--border-ledger)] bg-[var(--bg-surface)]">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border-ledger)] px-5 py-4">
                <div>
                  <h2 className="text-base font-bold text-[var(--ink-primary)]">
                    Buku Besar Tiket & Marketplace P2P
                  </h2>
                  <p className="text-xs text-[var(--ink-muted)]">
                    {visibleTickets.length} tiket tercatat — kelola pendanaan, verifikasi toko, dan
                    pelunasan.
                  </p>
                </div>

                <div className="flex flex-wrap gap-1">
                  {(
                    [
                      ["ALL", "Semua"],
                      ["OPEN", "Siap Didanai"],
                      ["PENDING_VERIFICATION", "Cek Toko"],
                      ["ACTIVE", "Berjalan"],
                      ["REPAID", "Lunas"],
                    ] as const
                  ).map(([key, label]) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setFilter(key)}
                      className={`rounded px-2.5 py-1 text-xs font-medium transition-colors ${
                        filter === key
                          ? "bg-[var(--ink-primary)] text-white"
                          : "bg-[var(--bg-canvas)] text-[var(--ink-muted)] hover:text-[var(--ink-primary)]"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="divide-y divide-[var(--border-ledger)]">
                {visibleTickets.length === 0 ? (
                  <div className="p-10 text-center text-sm text-[var(--ink-muted)]">
                    Belum ada tiket gadai pada filter ini.
                  </div>
                ) : (
                  visibleTickets.map((ticket) => {
                    const principalSolVal = ticket.principalLamports / LAMPORTS_PER_SOL;
                    const interestPctVal = (ticket.interestBps / 100).toFixed(1);
                    const totalDueSol = (
                      principalSolVal *
                      (1 + ticket.interestBps / 10_000)
                    ).toFixed(3);
                    const expUrl = ticket.chainTxSignature
                      ? explorerTxUrl(ticket.chainTxSignature)
                      : null;

                    return (
                      <article key={ticket.id} className="p-5">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="font-mono text-xs font-semibold text-[var(--ink-muted)]">
                                #{ticket.publicTicketId}
                              </span>
                              <h3 className="text-base font-bold text-[var(--ink-primary)]">
                                {ticket.asset.brand} {ticket.asset.model}
                              </h3>
                              <StatusBadge status={ticket.status} />
                            </div>
                            <p className="mt-1 text-xs text-[var(--ink-muted)]">
                              {ticket.asset.description}
                            </p>
                          </div>

                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => copyShareLink(ticket.publicTicketId)}
                              className="inline-flex items-center gap-1 rounded border border-[var(--border-ledger)] px-2.5 py-1 text-xs font-medium text-[var(--ink-primary)] hover:bg-[var(--bg-canvas)]"
                            >
                              {copiedId === String(ticket.publicTicketId) ? (
                                <>
                                  <Check className="h-3.5 w-3.5 text-emerald-700" />
                                  Disalin
                                </>
                              ) : (
                                <>
                                  <Copy className="h-3.5 w-3.5" />
                                  Salin Link
                                </>
                              )}
                            </button>
                            <Link
                              href={`/ticket/${ticket.publicTicketId}`}
                              className="rounded border border-[var(--border-ledger)] px-2.5 py-1 text-xs font-medium text-[var(--accent-vault)] hover:bg-[var(--bg-canvas)]"
                            >
                              Detail
                            </Link>
                          </div>
                        </div>

                        {/* Key Financial Numbers */}
                        <div className="mt-4 grid grid-cols-2 gap-3 rounded-md bg-[var(--bg-canvas)] p-3 sm:grid-cols-4">
                          <div>
                            <span className="block text-[11px] text-[var(--ink-muted)]">
                              Dana Dibutuhkan
                            </span>
                            <span className="font-mono text-sm font-bold tabular-nums">
                              {principalSolVal.toFixed(2)} SOL
                            </span>
                          </div>
                          <div>
                            <span className="block text-[11px] text-[var(--ink-muted)]">
                              Bunga / Tenor
                            </span>
                            <span className="font-mono text-sm font-semibold tabular-nums">
                              {interestPctVal}% / {ticket.tenorDays} hari
                            </span>
                          </div>
                          <div>
                            <span className="block text-[11px] text-[var(--ink-muted)]">
                              Total Tebus
                            </span>
                            <span className="font-mono text-sm font-semibold tabular-nums">
                              {totalDueSol} SOL
                            </span>
                          </div>
                          <div>
                            <span className="block text-[11px] text-[var(--ink-muted)]">
                              Taksiran AI & LTV
                            </span>
                            <span className="font-mono text-sm font-semibold tabular-nums text-[var(--accent-vault)]">
                              {ticket.appraisal.medianBenchmarkSol} SOL ({Math.round(ticket.ltv * 100)}%)
                            </span>
                          </div>
                        </div>

                        {/* Custody & Chain Metadata */}
                        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-[var(--ink-muted)]">
                          <div className="flex flex-wrap items-center gap-3">
                            <span className="inline-flex items-center gap-1">
                              <ShieldCheck className="h-3.5 w-3.5 text-[var(--accent-vault)]" />
                              {ticket.asset.assetType === "DIGITAL"
                                ? "Escrow PDA On-Chain"
                                : ticket.custodyAttestationHash
                                  ? "Custodian Terverifikasi"
                                  : "Belum Dicek Custodian"}
                            </span>
                            <span className="font-mono">
                              Peminjam: {shortAddr(ticket.borrowerWallet)}
                            </span>
                            {ticket.lenderWallet && (
                              <span className="font-mono">
                                Pendana: {shortAddr(ticket.lenderWallet)}
                              </span>
                            )}
                          </div>

                          {expUrl ? (
                            <a
                              href={expUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1 font-mono text-[11px] text-[var(--accent-vault)] hover:underline"
                            >
                              Solana Explorer
                              <ExternalLink className="h-3 w-3" />
                            </a>
                          ) : (
                            <span className="font-mono text-[11px]">
                              PDA: {shortAddr(ticket.chainTicketPubkey)}
                            </span>
                          )}
                        </div>

                        {/* Action Bar */}
                        <div className="mt-3.5 flex flex-wrap items-center gap-2">
                          {ticket.status === "PENDING_VERIFICATION" && (
                            <button
                              type="button"
                              disabled={actionBusyId === ticket.id}
                              onClick={() => handleTicketAction(ticket.id, "custody_attest")}
                              className="rounded bg-amber-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-800 disabled:opacity-50"
                            >
                              Verifikasi & Terima Barang (Custodian)
                            </button>
                          )}

                          {ticket.status === "OPEN" && (
                            <button
                              type="button"
                              disabled={actionBusyId === ticket.id}
                              onClick={() => handleTicketAction(ticket.id, "fund")}
                              className="rounded bg-[var(--accent-vault)] px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-[var(--accent-vault-hover)] disabled:opacity-50"
                            >
                              Danai Sekarang ({principalSolVal.toFixed(2)} SOL)
                            </button>
                          )}

                          {ticket.status === "ACTIVE" && (
                            <button
                              type="button"
                              disabled={actionBusyId === ticket.id}
                              onClick={() => handleTicketAction(ticket.id, "repay")}
                              className="rounded bg-[var(--ink-primary)] px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
                            >
                              Lunasi & Ambil Jaminan ({totalDueSol} SOL)
                            </button>
                          )}

                          {(ticket.status === "OPEN" || ticket.status === "PENDING_VERIFICATION") &&
                            activeWallet === ticket.borrowerWallet && (
                              <button
                                type="button"
                                disabled={actionBusyId === ticket.id}
                                onClick={() => handleTicketAction(ticket.id, "cancel")}
                                className="rounded border border-[var(--border-ledger)] px-3 py-1.5 text-xs font-medium text-[var(--ink-muted)] hover:text-[var(--ink-primary)]"
                              >
                                Batalkan Tiket
                              </button>
                            )}
                        </div>
                      </article>
                    );
                  })
                )}
              </div>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
