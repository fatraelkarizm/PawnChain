"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import {
  Check,
  CheckCircle2,
  Coins,
  Copy,
  ExternalLink,
  FlaskConical,
  HelpCircle,
  Lock,
  Mic,
  Search,
  ShieldAlert,
  ShieldCheck,
  Volume2,
  X,
} from "lucide-react";
import type {
  AppraisalResult,
  AssetCondition,
  AssetType,
  PawnTicket,
} from "@/types/pawn";
import { COPY, type Lang } from "@/lib/i18n";
import { explorerTxUrl } from "@/lib/solana";
import { sendDevnetMemoTx, sendDevnetTransferTx } from "@/lib/walletTx";

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

function StatusBadge({ status, label }: { status: PawnTicket["status"]; label: string }) {
  const clsMap: Record<PawnTicket["status"], string> = {
    PENDING_VERIFICATION: "bg-amber-50 text-amber-800 border-amber-200",
    OPEN: "bg-emerald-50 text-emerald-800 border-emerald-200",
    ACTIVE: "bg-sky-50 text-sky-800 border-sky-200",
    REPAID: "bg-slate-100 text-slate-700 border-slate-200",
    DEFAULT_CLAIMED: "bg-rose-50 text-rose-800 border-rose-200",
    CANCELLED: "bg-slate-100 text-slate-500 border-slate-200",
  };
  return (
    <span className={`inline-flex items-center rounded border px-2 py-0.5 text-xs font-medium ${clsMap[status]}`}>
      {label}
    </span>
  );
}

function TicketProgress({ status, lang }: { status: PawnTicket["status"]; lang: Lang }) {
  if (status === "CANCELLED" || status === "DEFAULT_CLAIMED") return null;
  const stepIndex =
    status === "PENDING_VERIFICATION"
      ? 0
      : status === "OPEN"
        ? 1
        : status === "ACTIVE"
          ? 2
          : 3;

  const labels =
    lang === "en"
      ? ["Custody", "Open", "Active", "Repaid"]
      : ["Cek Toko", "Tayang", "Didanai", "Lunas"];

  return (
    <div className="mt-3 grid grid-cols-4 gap-1.5">
      {labels.map((lbl, idx) => {
        const done = idx <= stepIndex;
        return (
          <div key={lbl} className="space-y-1">
            <div
              className={`h-1 rounded-full ${
                done ? "bg-[var(--accent-vault)]" : "bg-[var(--border-ledger)]"
              }`}
            />
            <span
              className={`block text-[10px] font-medium ${
                done ? "text-[var(--ink-primary)]" : "text-[var(--ink-muted)]"
              }`}
            >
              {lbl}
            </span>
          </div>
        );
      })}
    </div>
  );
}

export function PawnWorkbench({ initialTickets }: { initialTickets: PawnTicket[] }) {
  const { connection } = useConnection();
  const wallet = useWallet();
  const { publicKey, connected } = wallet;

  const [lang, setLang] = useState<Lang>("en");
  const t = COPY[lang];

  const [sandboxEnabled, setSandboxEnabled] = useState(true);
  const [sandboxRole, setSandboxRole] = useState<SandboxRole>("borrower");
  const isWalletMode = !sandboxEnabled && connected && Boolean(publicKey);
  const activeWallet =
    isWalletMode && publicKey ? publicKey.toBase58() : SANDBOX_WALLETS[sandboxRole];

  const [tickets, setTickets] = useState<PawnTicket[]>(initialTickets);
  const [filter, setFilter] = useState<MarketFilter>("ALL");

  const [assetType, setAssetType] = useState<AssetType>("PHYSICAL");
  const [brand, setBrand] = useState("Apple");
  const [model, setModel] = useState("iPhone 14 Pro 256GB");
  const [condition, setCondition] = useState<AssetCondition>("Mint");
  const [serialNumber, setSerialNumber] = useState("358849102938471");
  const [mintAddress, setMintAddress] = useState("");
  const [description, setDescription] = useState("Clean condition with full original box.");

  const [appraisal, setAppraisal] = useState<AppraisalResult | null>(null);
  const [appraising, setAppraising] = useState(false);
  const [appraisalError, setAppraisalError] = useState<string | null>(null);

  const [principalSol, setPrincipalSol] = useState("1.5");
  const [interestPct, setInterestPct] = useState("5");
  const [tenorDays, setTenorDays] = useState("14");

  const [voiceLoading, setVoiceLoading] = useState(false);
  const [voiceScript, setVoiceScript] = useState<string | null>(null);

  const [submitting, setSubmitting] = useState(false);
  const [actionBusyId, setActionBusyId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [showGuide, setShowGuide] = useState(false);
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
          lang,
        }),
      });
      const data = (await res.json()) as {
        appraisal?: AppraisalResult;
        error?: string;
        message?: string;
      };
      if (!res.ok) {
        const msg = data.message || data.error || "Appraisal failed.";
        setAppraisal(null);
        setAppraisalError(msg);
        setFeedback({ type: "err", text: msg });
        return;
      }
      if (data.appraisal) {
        setAppraisal(data.appraisal);
        setPrincipalSol(String(Math.min(1.5, data.appraisal.suggestedMaxLoanSol)));
      }
    } catch {
      const msg = "Failed to connect to appraisal service.";
      setAppraisalError(msg);
      setFeedback({ type: "err", text: msg });
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
          language: lang,
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
        utter.lang = lang === "en" ? "en-US" : "id-ID";
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
      let chainTxSignature: string | undefined;
      if (isWalletMode) {
        chainTxSignature = await sendDevnetMemoTx(
          connection,
          wallet,
          `PawnChain:Create:${brand} ${model}:${principalSol}SOL`
        );
      }

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
          chainTxSignature,
          lang,
        }),
      });
      const data = (await res.json()) as { ticket?: PawnTicket; error?: string };
      if (!res.ok) {
        setFeedback({ type: "err", text: data.error || "Failed to create pawn ticket." });
        return;
      }
      if (data.ticket) {
        setFeedback({
          type: "ok",
          text:
            data.ticket.status === "PENDING_VERIFICATION"
              ? `Ticket #${data.ticket.publicTicketId} created. Switch to Custodian Hub to verify physical check-in.`
              : `Ticket #${data.ticket.publicTicketId} locked in escrow and listed on marketplace.`,
        });
        await refreshTickets();
      }
    } catch (err) {
      setFeedback({
        type: "err",
        text:
          err instanceof Error && err.message === "Failed to fetch"
            ? lang === "en"
              ? "Network or Solana Devnet RPC request failed. Check your connection or switch to Sandbox On."
              : "Koneksi server atau Solana Devnet RPC gagal. Cek koneksi atau gunakan mode Sandbox Aktif."
            : err instanceof Error
              ? err.message
              : "Transaction cancelled or failed.",
      });
    } finally {
      setSubmitting(false);
    }
  }

  async function handleTicketAction(
    ticket: PawnTicket,
    action: "custody_attest" | "fund" | "repay" | "cancel"
  ) {
    setActionBusyId(ticket.id);
    setFeedback(null);
    try {
      let txSignature: string | undefined;
      if (isWalletMode) {
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
        body: JSON.stringify({
          action,
          actorWallet: activeWallet,
          txSignature,
          lang,
          conditionReport:
            action === "custody_attest" ? "Physical seal & serial verified at Hub Jakarta" : undefined,
        }),
      });
      const data = (await res.json()) as { ticket?: PawnTicket; error?: string };
      if (!res.ok) {
        setFeedback({ type: "err", text: data.error || "Action failed." });
        return;
      }
      if (data.ticket) {
        setFeedback({
          type: "ok",
          text: `Ticket #${data.ticket.publicTicketId} updated to ${data.ticket.status}.`,
        });
        await refreshTickets();
      }
    } catch (err) {
      setFeedback({
        type: "err",
        text:
          err instanceof Error && err.message === "Failed to fetch"
            ? lang === "en"
              ? "Network or Solana Devnet RPC request failed. Check your connection or switch to Sandbox On."
              : "Koneksi server atau Solana Devnet RPC gagal. Cek koneksi atau gunakan mode Sandbox Aktif."
            : err instanceof Error
              ? err.message
              : "Wallet transaction failed.",
      });
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
      setDescription("Clean fullset box, verified IMEI ready for Hub check-in.");
    } else if (preset === "duplicate") {
      setAssetType("PHYSICAL");
      setBrand("Apple");
      setModel("iPhone 13 Pro 256GB");
      setCondition("Good");
      setSerialNumber("356984110029384");
      setDescription("Duplicate IMEI fraud test against active Ticket #101.");
    } else {
      setAssetType("DIGITAL");
      setBrand("Tensorians");
      setModel("Tensorian #1904 (Devnet)");
      setCondition("Mint");
      setSerialNumber("");
      setMintAddress("TensorianDevnetMint9999999999999999999999");
      setDescription("Solana NFT collateral locked directly in PDA escrow.");
    }
  }

  function copyShareLink(publicTicketId: number) {
    const url = `${window.location.origin}/ticket/${publicTicketId}`;
    navigator.clipboard.writeText(url);
    setCopiedId(String(publicTicketId));
    setTimeout(() => setCopiedId(null), 2000);
  }

  const visibleTickets =
    filter === "ALL" ? tickets : tickets.filter((tItem) => tItem.status === filter);

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
              <span className="ml-2 rounded border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 font-mono text-[11px] font-semibold text-emerald-800">
                ● {t.subtitle}
              </span>
              <span className="ml-1.5 hidden rounded border border-[var(--border-ledger)] bg-[var(--bg-canvas)] px-1.5 py-0.5 font-mono text-[10px] text-[var(--ink-muted)] sm:inline-block">
                Firecrawl · ElevenLabs · Anchor
              </span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Language Switcher EN / ID */}
            <div className="flex rounded-md border border-[var(--border-ledger)] bg-[var(--bg-canvas)] p-0.5">
              {(["en", "id"] as const).map((code) => (
                <button
                  key={code}
                  type="button"
                  onClick={() => setLang(code)}
                  className={`rounded px-2 py-1 text-xs font-semibold uppercase transition-colors ${
                    lang === code
                      ? "bg-[var(--ink-primary)] text-white"
                      : "text-[var(--ink-muted)] hover:text-[var(--ink-primary)]"
                  }`}
                >
                  {code}
                </button>
              ))}
            </div>

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
                {sandboxEnabled ? t.sandboxOn : t.walletMode}
              </button>

              {sandboxEnabled && (
                <select
                  aria-label="Select demo role"
                  value={sandboxRole}
                  onChange={(e) => setSandboxRole(e.target.value as SandboxRole)}
                  className="rounded border-0 bg-transparent px-2 py-1 text-xs font-medium text-[var(--ink-primary)] focus:outline-none"
                >
                  <option value="borrower">{t.roleBorrower}</option>
                  <option value="lender">{t.roleLender}</option>
                  <option value="custodian">{t.roleCustodian}</option>
                </select>
              )}
            </div>

            <WalletMultiButton />

            <button
              type="button"
              onClick={() => setShowGuide(true)}
              aria-label={lang === "en" ? "Open guide" : "Buka panduan"}
              title={lang === "en" ? "How it works & Guide" : "Panduan Penggunaan"}
              className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-[var(--border-ledger)] bg-[var(--bg-canvas)] text-[var(--ink-primary)] transition-colors hover:bg-[var(--bg-muted)]"
            >
              <HelpCircle className="h-4 w-4" />
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6">
        {/* Compact Header Strip */}
        <div className="mb-5 flex flex-col justify-between gap-4 pb-2 md:flex-row md:items-end">
          <div className="max-w-2xl">
            <h1 className="text-2xl font-bold tracking-tight text-[var(--ink-primary)] sm:text-3xl">
              {t.heroTitle}
            </h1>
            <p className="mt-1.5 text-sm leading-relaxed text-[var(--ink-muted)]">
              {t.heroDesc}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-800">
                <Search className="h-3 w-3" />
                Live Firecrawl Pricing
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-sky-200 bg-sky-50 px-2.5 py-0.5 text-[11px] font-semibold text-sky-800">
                <Mic className="h-3 w-3" />
                ElevenLabs Voice Contract
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-[11px] font-semibold text-amber-800">
                <ShieldCheck className="h-3 w-3" />
                Anti-Fraud LTV 60% &amp; IMEI Hash
              </span>
            </div>
          </div>
          <div className="flex flex-col items-start md:items-end">
            <span className="text-xs text-[var(--ink-muted)]">{t.activeAccount}</span>
            <span
              className={`mt-1 inline-flex items-center gap-2 rounded-full border px-3 py-1 font-mono text-xs font-semibold ${
                isWalletMode
                  ? "border-emerald-300 bg-emerald-50 text-emerald-900"
                  : sandboxRole === "borrower"
                    ? "border-sky-200 bg-sky-50 text-sky-900"
                    : sandboxRole === "lender"
                      ? "border-emerald-200 bg-emerald-50 text-emerald-900"
                      : "border-amber-200 bg-amber-50 text-amber-900"
              }`}
            >
              <span
                className={`h-2 w-2 rounded-full ${
                  isWalletMode
                    ? "bg-emerald-600"
                    : sandboxRole === "borrower"
                      ? "bg-sky-600"
                      : sandboxRole === "lender"
                        ? "bg-emerald-600"
                        : "bg-amber-600"
                }`}
              />
              {shortAddr(activeWallet)} ({isWalletMode ? "Devnet Wallet" : sandboxRole})
            </span>
          </div>
        </div>

        {/* 4-Step Mechanism Strip */}
        <div className="mb-6 grid grid-cols-2 gap-2.5 rounded-lg border border-[var(--border-ledger)] bg-white p-3 shadow-xs sm:grid-cols-4">
          {[
            { Icon: Search, text: t.step1 },
            { Icon: Lock, text: t.step2 },
            { Icon: Coins, text: t.step3 },
            { Icon: CheckCircle2, text: t.step4 },
          ].map(({ Icon, text }) => (
            <div
              key={text}
              className="step-strip-item flex items-center gap-2.5 rounded-md border border-transparent bg-[var(--bg-canvas)] px-3 py-2.5 text-xs font-semibold text-[var(--ink-primary)]"
            >
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded bg-[var(--accent-vault-light)] text-[var(--accent-vault)]">
                <Icon className="h-3.5 w-3.5" />
              </span>
              <span className="leading-snug">{text}</span>
            </div>
          ))}
        </div>

        {feedback && (
          <div
            role="dialog"
            aria-modal="true"
            onClick={() => setFeedback(null)}
            className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 px-4 backdrop-blur-[2px]"
          >
            <div
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-md rounded-lg border border-[var(--border-ledger)] bg-white p-6 shadow-xl"
            >
              <div className="flex items-start gap-3">
                {feedback.type === "ok" ? (
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-emerald-700">
                    <ShieldCheck className="h-5 w-5" />
                  </div>
                ) : (
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-rose-50 text-rose-700">
                    <ShieldAlert className="h-5 w-5" />
                  </div>
                )}
                <div className="flex-1">
                  <h3 className="text-sm font-bold text-[var(--ink-primary)]">
                    {feedback.type === "ok"
                      ? lang === "en"
                        ? "Transaction Confirmed"
                        : "Berhasil Diproses"
                      : lang === "en"
                        ? "Action Blocked / Alert"
                        : "Peringatan Sistem"}
                  </h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-[var(--ink-muted)]">
                    {feedback.text}
                  </p>
                </div>
              </div>
              <div className="mt-5 flex justify-end">
                <button
                  type="button"
                  autoFocus
                  onClick={() => setFeedback(null)}
                  className={`rounded-md px-4 py-2 text-xs font-semibold text-white ${
                    feedback.type === "ok"
                      ? "bg-[var(--accent-vault)] hover:bg-[var(--accent-vault-hover)]"
                      : "bg-rose-700 hover:bg-rose-800"
                  }`}
                >
                  OK
                </button>
              </div>
            </div>
          </div>
        )}

        {showGuide && (
          <div
            role="dialog"
            aria-modal="true"
            onClick={() => setShowGuide(false)}
            className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 px-4 backdrop-blur-[2px]"
          >
            <div
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-lg rounded-lg border border-[var(--border-ledger)] bg-white p-6 shadow-xl"
            >
              <div className="flex items-center justify-between border-b border-[var(--border-ledger)] pb-3">
                <div className="flex items-center gap-2">
                  <HelpCircle className="h-5 w-5 text-[var(--accent-vault)]" />
                  <h3 className="text-base font-bold text-[var(--ink-primary)]">
                    {lang === "en" ? "PawnChain Quick Guide" : "Panduan Cepat PawnChain"}
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setShowGuide(false)}
                  aria-label="Close"
                  className="rounded p-1 text-[var(--ink-muted)] hover:bg-[var(--bg-canvas)] hover:text-[var(--ink-primary)]"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="mt-4 space-y-3 text-xs leading-relaxed text-[var(--ink-muted)]">
                <div>
                  <p className="font-semibold text-[var(--ink-primary)]">
                    {lang === "en" ? "1. Sandbox Mode vs Wallet Mode" : "1. Mode Sandbox vs Mode Wallet"}
                  </p>
                  <p>
                    {lang === "en"
                      ? "Keep 'Sandbox On' to test all roles instantly without a browser wallet. Switch to 'Wallet Mode' + Phantom (Devnet) to sign real Solana transactions."
                      : "Biarkan 'Sandbox Aktif' untuk mencoba semua peran tanpa ekstensi wallet. Pindah ke 'Mode Wallet' + Phantom (Devnet) untuk transaksi Solana asli."}
                  </p>
                </div>

                <div>
                  <p className="font-semibold text-[var(--ink-primary)]">
                    {lang === "en" ? "2. Three Roles" : "2. Tiga Peran Utama"}
                  </p>
                  <ul className="mt-1 list-disc space-y-0.5 pl-4">
                    <li>
                      <strong className="text-[var(--ink-primary)]">Borrower:</strong>{" "}
                      {lang === "en"
                        ? "Runs AI Appraisal, creates pawn ticket, and repays loan to reclaim collateral."
                        : "Hitung taksiran AI, ajukan tiket gadai, dan lunasi pinjaman."}
                    </li>
                    <li>
                      <strong className="text-[var(--ink-primary)]">Custodian Hub:</strong>{" "}
                      {lang === "en"
                        ? "Verifies physical RWA (IMEI/seal) before the ticket can be funded."
                        : "Verifikasi fisik barang (IMEI/segel) sebelum tiket bisa didanai."}
                    </li>
                    <li>
                      <strong className="text-[var(--ink-primary)]">Lender:</strong>{" "}
                      {lang === "en"
                        ? "Funds OPEN tickets in SOL and earns interest upon repayment."
                        : "Mendanai tiket OPEN dengan SOL dan mendapat bunga saat dilunasi."}
                    </li>
                  </ul>
                </div>

                <div>
                  <p className="font-semibold text-[var(--ink-primary)]">
                    {lang === "en" ? "3. Physical RWA vs Digital NFT" : "3. Barang Fisik (RWA) vs NFT Digital"}
                  </p>
                  <p>
                    {lang === "en"
                      ? "Physical RWA requires Custodian check-in first (PENDING_VERIFICATION → OPEN). Digital NFT locks directly in on-chain PDA escrow (immediately OPEN)."
                      : "Barang Fisik wajib dicek Custodian dulu (PENDING_VERIFICATION → OPEN). NFT Digital langsung terkunci di escrow on-chain (langsung OPEN)."}
                  </p>
                </div>
              </div>

              <div className="mt-5 flex justify-end">
                <button
                  type="button"
                  onClick={() => setShowGuide(false)}
                  className="rounded-md bg-[var(--accent-vault)] px-4 py-2 text-xs font-semibold text-white hover:bg-[var(--accent-vault-hover)]"
                >
                  {lang === "en" ? "Got it" : "Mengerti"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Asymmetric 2-Column Ledger Workbench */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          {/* LEFT: Appraisal & Pawn Creation Desk */}
          <section className="lg:col-span-5">
            <div className="rounded-lg border border-[var(--border-ledger)] bg-[var(--bg-surface)]">
              <div className="border-b border-[var(--border-ledger)] px-5 py-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-base font-bold text-[var(--ink-primary)]">
                    {t.deskTitle}
                  </h2>
                  <span className="font-mono text-xs text-[var(--ink-muted)]">{t.maxLtv}</span>
                </div>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  <button
                    type="button"
                    onClick={() => applyPreset("iphone")}
                    className="rounded border border-[var(--border-ledger)] bg-[var(--bg-canvas)] px-2.5 py-1 text-xs font-medium text-[var(--ink-primary)] hover:bg-[var(--bg-muted)]"
                  >
                    {t.presetIphone}
                  </button>
                  <button
                    type="button"
                    onClick={() => applyPreset("nft")}
                    className="rounded border border-[var(--border-ledger)] bg-[var(--bg-canvas)] px-2.5 py-1 text-xs font-medium text-[var(--ink-primary)] hover:bg-[var(--bg-muted)]"
                  >
                    {t.presetNft}
                  </button>
                  <button
                    type="button"
                    onClick={() => applyPreset("duplicate")}
                    className="rounded border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-900 hover:bg-amber-100"
                  >
                    {t.presetDup}
                  </button>
                </div>
              </div>

              <form onSubmit={handleCreateTicket} className="space-y-4 p-5">
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
                    {t.modePhysical}
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
                    {t.modeDigital}
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-[var(--ink-muted)]">
                      {t.labelBrand}
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
                      {t.labelModel}
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
                      {t.labelCondition}
                    </label>
                    <select
                      value={condition}
                      onChange={(e) => setCondition(e.target.value as AssetCondition)}
                      className="w-full rounded border border-[var(--border-ledger)] bg-white px-3 py-2 text-sm focus:border-[var(--accent-vault)] focus:outline-none"
                    >
                      <option value="Mint">Mint (100%)</option>
                      <option value="Good">Good (90%)</option>
                      <option value="Fair">Fair (70%)</option>
                    </select>
                  </div>

                  {assetType === "PHYSICAL" ? (
                    <div>
                      <label className="mb-1 block text-xs font-medium text-[var(--ink-muted)]">
                        {t.labelSerial}
                      </label>
                      <input
                        type="text"
                        value={serialNumber}
                        onChange={(e) => setSerialNumber(e.target.value)}
                        className="w-full rounded border border-[var(--border-ledger)] px-3 py-2 font-mono text-xs focus:border-[var(--accent-vault)] focus:outline-none"
                      />
                    </div>
                  ) : (
                    <div>
                      <label className="mb-1 block text-xs font-medium text-[var(--ink-muted)]">
                        {t.labelMint}
                      </label>
                      <input
                        type="text"
                        value={mintAddress}
                        onChange={(e) => setMintAddress(e.target.value)}
                        placeholder="Auto demo mint"
                        className="w-full rounded border border-[var(--border-ledger)] px-3 py-2 font-mono text-xs focus:border-[var(--accent-vault)] focus:outline-none"
                      />
                    </div>
                  )}
                </div>

                <div>
                  <label className="mb-1 block text-xs font-medium text-[var(--ink-muted)]">
                    {t.labelNotes}
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
                  {appraising ? t.btnAppraising : t.btnAppraise}
                </button>

                {appraisalError && (
                  <div className="flex items-start gap-2 rounded-md border border-rose-200 bg-rose-50 p-3 text-xs text-rose-900">
                    <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-rose-700" />
                    <span>{appraisalError}</span>
                  </div>
                )}

                {appraisal && (
                  <div className="space-y-3 rounded-md border border-[var(--border-ledger)] bg-[var(--bg-canvas)] p-4">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-[var(--ink-primary)]">
                        {t.appraisalTitle} ({appraisal.modelVersion})
                      </span>
                      <span className="rounded bg-white px-2 py-0.5 font-mono text-xs font-semibold text-[var(--accent-vault)]">
                        {t.riskScore}: {appraisal.riskLevel} ({appraisal.riskScore}/100)
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-3 border-y border-[var(--border-ledger)] py-2.5">
                      <div>
                        <span className="block text-[11px] text-[var(--ink-muted)]">
                          {t.medianVal}
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
                          {t.maxLoan} ({Math.round(appraisal.suggestedLtv * 100)}% LTV)
                        </span>
                        <span className="font-mono text-sm font-bold tabular-nums text-[var(--accent-vault)]">
                          Max {appraisal.suggestedMaxLoanSol} SOL
                        </span>
                        <span className="block font-mono text-[11px] text-[var(--ink-muted)]">
                          {t.confidence} {Math.round(appraisal.confidenceScore * 100)}%
                        </span>
                      </div>
                    </div>

                    <div>
                      <span className="mb-1.5 block text-[11px] font-semibold text-[var(--ink-muted)]">
                        {t.priceSources} (
                        {appraisal.comparableReferences[0]?.sourceType === "firecrawl_live"
                          ? "Live Firecrawl"
                          : "Cached Benchmark"}
                        )
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

                <div className="grid grid-cols-3 gap-2.5 pt-1">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-[var(--ink-muted)]">
                      {t.labelLoan}
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
                      {t.labelInterest}
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
                      {t.labelTenor}
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

                <div className="rounded-md border border-[var(--border-ledger)] bg-[var(--bg-canvas)] p-3">
                  <button
                    type="button"
                    disabled={voiceLoading}
                    onClick={handleVoiceBriefing}
                    className="inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--accent-vault)] hover:underline"
                  >
                    <Volume2 className="h-4 w-4" />
                    {voiceLoading ? t.btnVoiceBusy : t.btnVoice}
                  </button>
                  {voiceScript && (
                    <p className="mt-2 text-xs leading-relaxed text-[var(--ink-muted)]">
                      {voiceScript}
                    </p>
                  )}
                </div>

                {sandboxEnabled && sandboxRole !== "borrower" && (
                  <p className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                    {lang === "en"
                      ? "Switch role to Borrower (Budi) to submit a new pawn ticket."
                      : "Ganti peran ke Peminjam (Budi) untuk mengajukan tiket gadai baru."}
                  </p>
                )}

                <button
                  type="submit"
                  disabled={submitting || (sandboxEnabled && sandboxRole !== "borrower")}
                  className="w-full rounded-md bg-[var(--accent-vault)] px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[var(--accent-vault-hover)] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {submitting
                    ? t.btnCreating
                    : sandboxEnabled && sandboxRole !== "borrower"
                      ? lang === "en"
                        ? "Borrower Role Required to Submit"
                        : "Gunakan Peran Peminjam untuk Ajukan"
                      : assetType === "PHYSICAL"
                        ? t.btnCreatePhysical
                        : t.btnCreateDigital}
                </button>
              </form>
            </div>
          </section>

          {/* RIGHT: Vault Ledger & Marketplace */}
          <section className="lg:col-span-7">
            <div className="rounded-lg border border-[var(--border-ledger)] bg-[var(--bg-surface)]">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border-ledger)] px-5 py-4">
                <div>
                  <h2 className="text-base font-bold text-[var(--ink-primary)]">
                    {t.ledgerTitle}
                  </h2>
                  <p className="text-xs text-[var(--ink-muted)]">
                    {visibleTickets.length} {t.ledgerCount}
                  </p>
                </div>

                <div className="flex flex-wrap gap-1">
                  {(
                    [
                      ["ALL", t.filterAll],
                      ["OPEN", t.filterOpen],
                      ["PENDING_VERIFICATION", t.filterCheck],
                      ["ACTIVE", t.filterActive],
                      ["REPAID", t.filterRepaid],
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
                    {t.emptyTickets}
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
                      <article key={ticket.id} className="ticket-card p-5">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="font-mono text-xs font-semibold text-[var(--ink-muted)]">
                                #{ticket.publicTicketId}
                              </span>
                              <h3 className="text-base font-bold text-[var(--ink-primary)]">
                                {ticket.asset.brand} {ticket.asset.model}
                              </h3>
                              <StatusBadge
                                status={ticket.status}
                                label={t.status[ticket.status]}
                              />
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
                                  {t.copied}
                                </>
                              ) : (
                                <>
                                  <Copy className="h-3.5 w-3.5" />
                                  {t.copyLink}
                                </>
                              )}
                            </button>
                            <Link
                              href={`/ticket/${ticket.publicTicketId}`}
                              className="rounded border border-[var(--border-ledger)] px-2.5 py-1 text-xs font-medium text-[var(--accent-vault)] hover:bg-[var(--bg-canvas)]"
                            >
                              {t.detail}
                            </Link>
                          </div>
                        </div>

                        <TicketProgress status={ticket.status} lang={lang} />

                        <div className="mt-3.5 grid grid-cols-2 gap-3 rounded-md bg-[var(--bg-canvas)] p-3 sm:grid-cols-4">
                          <div>
                            <span className="block text-[11px] text-[var(--ink-muted)]">
                              {t.loanNeeded}
                            </span>
                            <span className="font-mono text-sm font-bold tabular-nums">
                              {principalSolVal.toFixed(2)} SOL
                            </span>
                          </div>
                          <div>
                            <span className="block text-[11px] text-[var(--ink-muted)]">
                              {t.rateTenor}
                            </span>
                            <span className="font-mono text-sm font-semibold tabular-nums">
                              {interestPctVal}% / {ticket.tenorDays}d
                            </span>
                          </div>
                          <div>
                            <span className="block text-[11px] text-[var(--ink-muted)]">
                              {t.totalRepay}
                            </span>
                            <span className="font-mono text-sm font-semibold tabular-nums">
                              {totalDueSol} SOL
                            </span>
                          </div>
                          <div>
                            <span className="block text-[11px] text-[var(--ink-muted)]">
                              {t.aiLtv}
                            </span>
                            <span className="font-mono text-sm font-semibold tabular-nums text-[var(--accent-vault)]">
                              {ticket.appraisal.medianBenchmarkSol} SOL ({Math.round(ticket.ltv * 100)}%)
                            </span>
                          </div>
                        </div>

                        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-[var(--ink-muted)]">
                          <div className="flex flex-wrap items-center gap-3">
                            <span className="inline-flex items-center gap-1">
                              <ShieldCheck className="h-3.5 w-3.5 text-[var(--accent-vault)]" />
                              {ticket.asset.assetType === "DIGITAL"
                                ? t.escrowOnChain
                                : ticket.custodyAttestationHash
                                  ? t.custodianVerified
                                  : t.custodianPending}
                            </span>
                            <span className="font-mono">
                              {t.borrower}: {shortAddr(ticket.borrowerWallet)}
                            </span>
                            {ticket.lenderWallet && (
                              <span className="font-mono">
                                {t.lender}: {shortAddr(ticket.lenderWallet)}
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

                        <div className="mt-3.5 flex flex-wrap items-center gap-2">
                          {ticket.status === "PENDING_VERIFICATION" &&
                            (sandboxEnabled
                              ? sandboxRole === "custodian"
                              : activeWallet !== ticket.borrowerWallet) && (
                              <button
                                type="button"
                                disabled={actionBusyId === ticket.id}
                                onClick={() => handleTicketAction(ticket, "custody_attest")}
                                className="rounded bg-amber-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-800 disabled:opacity-50"
                              >
                                {t.btnAttest}
                              </button>
                            )}

                          {ticket.status === "PENDING_VERIFICATION" &&
                            !(sandboxEnabled
                              ? sandboxRole === "custodian"
                              : activeWallet !== ticket.borrowerWallet) && (
                              <span className="rounded border border-amber-200 bg-amber-50 px-2.5 py-1 text-[11px] font-medium text-amber-800">
                                {lang === "en"
                                  ? "Custodian Hub role required to verify"
                                  : "Butuh peran Custodian Hub untuk verifikasi"}
                              </span>
                            )}

                          {ticket.status === "OPEN" &&
                            (sandboxEnabled
                              ? sandboxRole === "lender"
                              : activeWallet !== ticket.borrowerWallet) && (
                              <button
                                type="button"
                                disabled={actionBusyId === ticket.id}
                                onClick={() => handleTicketAction(ticket, "fund")}
                                className="rounded bg-[var(--accent-vault)] px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-[var(--accent-vault-hover)] disabled:opacity-50"
                              >
                                {t.btnFund} ({principalSolVal.toFixed(2)} SOL)
                              </button>
                            )}

                          {ticket.status === "OPEN" &&
                            !(sandboxEnabled
                              ? sandboxRole === "lender"
                              : activeWallet !== ticket.borrowerWallet) && (
                              <span className="rounded border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-medium text-emerald-800">
                                {lang === "en"
                                  ? "Awaiting Lender funding"
                                  : "Menunggu pendanaan Pendana (Lender)"}
                              </span>
                            )}

                          {ticket.status === "ACTIVE" &&
                            activeWallet === ticket.borrowerWallet && (
                              <button
                                type="button"
                                disabled={actionBusyId === ticket.id}
                                onClick={() => handleTicketAction(ticket, "repay")}
                                className="rounded bg-[var(--ink-primary)] px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
                              >
                                {t.btnRepay} ({totalDueSol} SOL)
                              </button>
                            )}

                          {ticket.status === "ACTIVE" &&
                            activeWallet !== ticket.borrowerWallet && (
                              <span className="rounded border border-sky-200 bg-sky-50 px-2.5 py-1 text-[11px] font-medium text-sky-800">
                                {lang === "en"
                                  ? "Active — awaiting Borrower repayment"
                                  : "Aktif — menunggu pelunasan Peminjam"}
                              </span>
                            )}

                          {(ticket.status === "OPEN" || ticket.status === "PENDING_VERIFICATION") &&
                            activeWallet === ticket.borrowerWallet && (
                              <button
                                type="button"
                                disabled={actionBusyId === ticket.id}
                                onClick={() => handleTicketAction(ticket, "cancel")}
                                className="rounded border border-[var(--border-ledger)] px-3 py-1.5 text-xs font-medium text-[var(--ink-muted)] hover:text-[var(--ink-primary)]"
                              >
                                {t.btnCancel}
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

      {/* Clean Infrastructure Footer */}
      <footer className="border-t border-[var(--border-ledger)] bg-white py-4">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-2 px-4 text-xs text-[var(--ink-muted)] sm:px-6">
          <span>PawnChain — Dev3pack Global Hackathon (Solana Devnet)</span>
          <div className="flex flex-wrap items-center gap-3 font-mono text-[11px]">
            <a
              href="https://explorer.solana.com/address/44tTkRHFef9s1TdG9KcH5jKSLQVoDrLUevA6gKr6HDcr?cluster=devnet"
              target="_blank"
              rel="noreferrer"
              className="text-[var(--accent-vault)] hover:underline"
            >
              Anchor Program (Devnet) ↗
            </a>
            <span>·</span>
            <span>Firecrawl Appraisal</span>
            <span>·</span>
            <span>ElevenLabs Voice</span>
            <span>·</span>
            <span>Supabase Ledger</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
