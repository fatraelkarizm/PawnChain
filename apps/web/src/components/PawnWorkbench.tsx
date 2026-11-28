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
import { explorerAddressUrl, explorerTxUrl } from "@/lib/solana";
import { PROGRAM_ID } from "@/lib/program";
import { createDevnetPledge, runDevnetAction, type TicketAction } from "@/lib/devnetActions";
import { SANDBOX_WALLETS, type SandboxRole } from "@/lib/sandbox";
import { AppraisalSources } from "@/components/AppraisalSources";

const WalletMultiButton = dynamic(
  async () => (await import("@solana/wallet-adapter-react-ui")).WalletMultiButton,
  { ssr: false }
);

type MarketFilter = "ALL" | "OPEN" | "PENDING_VERIFICATION" | "ACTIVE" | "REPAID" | "CANCELLED";

const LAMPORTS_PER_SOL = 1_000_000_000;
const SOL_USD_RATE = 150;

function formatUsd(usd: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(usd);
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

function isOverdue(ticket: PawnTicket): boolean {
  return ticket.status === "ACTIVE" && !!ticket.dueAt && Date.parse(ticket.dueAt) < Date.now();
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
  const walletMissing = !sandboxEnabled && !(connected && publicKey);
  const connectedAddress = publicKey?.toBase58() ?? "";
  const activeWallet = sandboxEnabled ? SANDBOX_WALLETS[sandboxRole] : connectedAddress;

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
  const [feedback, setFeedback] = useState<{
    type: "ok" | "err";
    text: string;
    signature?: string;
  } | null>(null);
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
          // The devnet preview for digital assets needs an existing mint to check.
          mode: sandboxEnabled || (assetType === "DIGITAL" && !mintAddress) ? "sandbox" : "devnet",
          assetType,
          brand,
          model,
          description,
          condition,
          serialNumber: assetType === "PHYSICAL" ? serialNumber : "",
          mintAddress,
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
        if (data.appraisal.comparableReferences.length > 0) {
          setPrincipalSol(String(Math.min(1.5, data.appraisal.suggestedMaxLoanSol)));
        }
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
      let ticket: PawnTicket;
      let signature: string | undefined;
      if (!sandboxEnabled) {
        ({ ticket, signature } = await createDevnetPledge(connection, wallet, {
          assetType,
          brand,
          model,
          condition,
          description,
          serialNumber: assetType === "PHYSICAL" ? serialNumber : "",
          mintAddress: assetType === "DIGITAL" ? mintAddress : "",
          principalSol: Number(principalSol),
          interestBps: Math.round(Number(interestPct) * 100),
          tenorDays: Number(tenorDays),
        }));
      } else {
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
        if (!res.ok || !data.ticket) {
          throw new Error(data.error || "Failed to create pawn ticket.");
        }
        ticket = data.ticket;
      }
      setFeedback({
        type: "ok",
        signature,
        text:
          ticket.status === "PENDING_VERIFICATION"
            ? `Ticket #${ticket.publicTicketId} created. A custodian must verify the physical item next.`
            : `Ticket #${ticket.publicTicketId} is open on the marketplace.`,
      });
      await refreshTickets();
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

  async function handleTicketAction(ticket: PawnTicket, action: TicketAction) {
    if (action === "cancel" && typeof window !== "undefined" && !window.confirm(t.confirmCancel)) {
      return;
    }
    setActionBusyId(ticket.id);
    setFeedback(null);
    try {
      let updated: PawnTicket;
      let signature: string | undefined;
      if (ticket.mode === "devnet") {
        ({ ticket: updated, signature } = await runDevnetAction(connection, wallet, ticket, action));
      } else {
        const res = await fetch(`/api/v1/pawn-tickets/${ticket.id}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action,
            actorWallet: SANDBOX_WALLETS[sandboxRole],
            conditionReport:
              action === "custody_attest"
                ? "Asset serial number and physical condition verified at the Jakarta Custody Hub."
                : undefined,
          }),
        });
        const data = (await res.json()) as { ticket?: PawnTicket; error?: string };
        if (!res.ok || !data.ticket) throw new Error(data.error || "Action failed.");
        updated = data.ticket;
      }
      const successText =
        action === "repay"
          ? lang === "en"
            ? "Repayment confirmed. Your collateral is now eligible for release."
            : "Pelunasan dikonfirmasi. Agunan Anda kini siap dikembalikan."
          : action === "custody_attest"
            ? lang === "en"
              ? `Physical inspection completed. Collateral request #${updated.publicTicketId} is now open for funding.`
              : `Inspeksi fisik selesai. Permintaan agunan #${updated.publicTicketId} kini terbuka untuk pendanaan.`
            : lang === "en"
              ? `Collateral request #${updated.publicTicketId} updated to ${t.status[updated.status]}.`
              : `Permintaan agunan #${updated.publicTicketId} diperbarui menjadi ${t.status[updated.status]}.`;
      setFeedback({
        type: "ok",
        signature,
        text: successText,
      });
      await refreshTickets();
    } catch (err) {
      setFeedback({
        type: "err",
        text:
          err instanceof Error && err.message === "Failed to fetch"
            ? lang === "en"
              ? "Unable to reach the server or Solana Devnet RPC. Check your connection or switch to Sandbox environment."
              : "Gagal terhubung ke server atau Solana Devnet RPC. Periksa koneksi Anda atau gunakan lingkungan sandbox."
            : err instanceof Error
              ? err.message
              : "Transaction could not be completed.",
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
      setDescription("Mint condition with original box and accessories, ready for custody verification.");
    } else if (preset === "duplicate") {
      setAssetType("PHYSICAL");
      setBrand("Apple");
      setModel("iPhone 13 Pro 256GB");
      setCondition("Good");
      setSerialNumber("356984110029384");
      setDescription(
        "This asset's IMEI matches an existing active collateral request. Review the previous record before proceeding."
      );
    } else {
      setAssetType("DIGITAL");
      setBrand("Tensorians");
      setModel("Tensorian #1904 (Devnet)");
      setCondition("Mint");
      setSerialNumber("");
      setMintAddress("");
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
    <div className="min-h-screen flex flex-col overflow-x-hidden">
      {/* Top Utility Bar */}
      <header className="sticky top-0 z-30 border-b border-[var(--border-ledger)] bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-col gap-2.5 px-4 py-3 sm:px-6 lg:flex-row lg:items-center lg:justify-between">
          {/* Row 1 on mobile: Brand + Quick Actions */}
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2.5">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/logo.png"
                alt="Spawn logo"
                className="h-8 w-8 shrink-0 object-contain"
              />
              <span className="text-base font-bold tracking-tight text-[var(--ink-primary)]">
                Spawn
              </span>
            </div>

            {/* Mobile-only compact EN/ID + Guide */}
            <div className="flex items-center gap-1.5 lg:hidden">
              <div className="flex rounded-md border border-[var(--border-ledger)] bg-[var(--bg-canvas)] p-0.5">
                {(["en", "id"] as const).map((code) => (
                  <button
                    key={code}
                    type="button"
                    onClick={() => setLang(code)}
                    className={`rounded px-2 py-1 text-[11px] font-semibold uppercase transition-colors ${
                      lang === code
                        ? "bg-[var(--ink-primary)] text-white"
                        : "text-[var(--ink-muted)] hover:text-[var(--ink-primary)]"
                    }`}
                  >
                    {code}
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={() => setShowGuide(true)}
                aria-label={lang === "en" ? "Open guide" : "Buka panduan"}
                className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-[var(--border-ledger)] bg-[var(--bg-canvas)] text-[var(--ink-primary)]"
              >
                <HelpCircle className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Row 2 on mobile / Right side on desktop */}
          <div className="flex flex-wrap items-center justify-between gap-2 lg:justify-end">
            {/* Desktop EN/ID */}
            <div className="hidden rounded-md border border-[var(--border-ledger)] bg-[var(--bg-canvas)] p-0.5 lg:flex">
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
            <div className="flex w-full min-w-0 items-center justify-between gap-1 rounded-md border border-[var(--border-ledger)] bg-[var(--bg-canvas)] p-1 sm:w-auto sm:justify-start">
              <button
                type="button"
                onClick={() => setSandboxEnabled((v) => !v)}
                className={`inline-flex shrink-0 items-center gap-1.5 rounded px-2.5 py-1 text-xs font-semibold transition-colors ${
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
                  className="min-w-0 flex-1 truncate rounded border-0 bg-transparent px-1.5 py-1 text-xs font-medium text-[var(--ink-primary)] focus:outline-none sm:flex-initial"
                >
                  <option value="borrower">{t.roleBorrower}</option>
                  <option value="lender">{t.roleLender}</option>
                  <option value="custodian">{t.roleCustodian}</option>
                </select>
              )}
            </div>

            <div className="w-full shrink-0 sm:w-auto [&_.wallet-adapter-button]:w-full [&_.wallet-adapter-button]:justify-center sm:[&_.wallet-adapter-button]:w-auto">
              <WalletMultiButton />
            </div>

            <button
              type="button"
              onClick={() => setShowGuide(true)}
              aria-label={lang === "en" ? "Open guide" : "Buka panduan"}
              title={lang === "en" ? "How it works & Guide" : "Panduan Penggunaan"}
              className="hidden h-9 w-9 items-center justify-center rounded-md border border-[var(--border-ledger)] bg-[var(--bg-canvas)] text-[var(--ink-primary)] transition-colors hover:bg-[var(--bg-muted)] lg:inline-flex"
            >
              <HelpCircle className="h-4 w-4" />
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-5 sm:px-6 sm:py-6">
        {/* Compact Header Strip */}
        <div className="mb-5 flex flex-col justify-between gap-3 pb-1 md:flex-row md:items-end">
          <div className="max-w-2xl">
            <span className="inline-block text-[11px] font-bold tracking-wider text-[var(--accent-vault)] uppercase">
              {t.heroEyebrow}
            </span>
            <h1 className="mt-1 text-xl font-bold tracking-tight text-[var(--ink-primary)] sm:text-3xl">
              {t.heroTitle}
            </h1>
            <p className="mt-1.5 text-sm leading-relaxed text-[var(--ink-muted)]">
              {t.heroDesc}
            </p>
          </div>
          <div className="flex items-center justify-between gap-2 md:flex-col md:items-end">
            <span className="text-xs text-[var(--ink-muted)]">{t.activeAccount}</span>
            <span
              className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 font-mono text-xs font-semibold ${
                !sandboxEnabled
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
                  !sandboxEnabled
                    ? "bg-emerald-600"
                    : sandboxRole === "borrower"
                      ? "bg-sky-600"
                      : sandboxRole === "lender"
                        ? "bg-emerald-600"
                        : "bg-amber-600"
                }`}
              />
              {shortAddr(activeWallet || null)} ({sandboxEnabled ? sandboxRole : "Devnet"})
            </span>
          </div>
        </div>

        {/* 4-Step Mechanism Strip */}
        <div className="mb-6 grid grid-cols-1 gap-2 rounded-lg border border-[var(--border-ledger)] bg-white p-3 shadow-xs sm:grid-cols-2 lg:grid-cols-4">
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
                        ? feedback.signature
                          ? "Transaction Confirmed"
                          : "Sandbox Updated"
                        : "Berhasil Diproses"
                      : lang === "en"
                        ? "Action Blocked / Alert"
                        : "Peringatan Sistem"}
                  </h3>
                  <p className="mt-1.5 break-words text-sm leading-relaxed text-[var(--ink-muted)]">
                    {feedback.text}
                  </p>
                  {feedback.signature && (
                    <a
                      href={explorerTxUrl(feedback.signature) ?? "#"}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-[var(--accent-vault)] hover:underline"
                    >
                      Solana Explorer <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
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
                    {lang === "en" ? "Spawn quick guide" : "Panduan cepat Spawn"}
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
                    {lang === "en" ? "1. Sandbox vs Devnet wallet" : "1. Lingkungan sandbox vs Wallet Devnet"}
                  </p>
                  <p>
                    {lang === "en"
                      ? "Use 'Sandbox environment' to switch between Borrower, Custodian, and Lender in one click. Switch to 'Devnet wallet' with Phantom (Devnet) to sign real Solana transactions using separate wallet accounts."
                      : "Gunakan 'Lingkungan sandbox' untuk berganti peran Peminjam, Custodian, dan Pendana dalam satu klik. Pilih 'Wallet Devnet' dengan Phantom (Devnet) untuk transaksi Solana asli."}
                  </p>
                </div>

                <div>
                  <p className="font-semibold text-[var(--ink-primary)]">
                    {lang === "en" ? "2. Roles & permissions" : "2. Tiga peran utama"}
                  </p>
                  <ul className="mt-1 list-disc space-y-0.5 pl-4">
                    <li>
                      <strong className="text-[var(--ink-primary)]">Borrower:</strong>{" "}
                      {lang === "en"
                        ? "Estimates asset value, creates collateral requests, and repays loans to reclaim assets."
                        : "Mengestimasi nilai aset, membuat permintaan agunan, dan melunasi pinjaman."}
                    </li>
                    <li>
                      <strong className="text-[var(--ink-primary)]">Custodian Hub:</strong>{" "}
                      {lang === "en"
                        ? "Inspects physical collateral (serial/IMEI & condition) before it can be funded."
                        : "Memeriksa agunan fisik (serial/IMEI & kondisi) sebelum dapat didanai."}
                    </li>
                    <li>
                      <strong className="text-[var(--ink-primary)]">Lender:</strong>{" "}
                      {lang === "en"
                        ? "Funds verified OPEN requests in SOL and earns interest upon repayment."
                        : "Mendanai permintaan OPEN dalam SOL dan memperoleh bunga saat pelunasan."}
                    </li>
                  </ul>
                </div>

                <div>
                  <p className="font-semibold text-[var(--ink-primary)]">
                    {lang === "en" ? "3. Physical vs digital collateral" : "3. Agunan fisik vs agunan digital"}
                  </p>
                  <p>
                    {lang === "en"
                      ? "Physical collateral requires Custodian verification before funding. Digital collateral locks directly in Solana escrow (leave Mint address empty to auto-generate a demo token)."
                      : "Agunan fisik memerlukan verifikasi Custodian sebelum didanai. Agunan digital langsung terkunci di escrow Solana (kosongkan alamat Mint untuk membuat token demo otomatis)."}
                  </p>
                </div>

                <div>
                  <p className="font-semibold text-[var(--ink-primary)]">
                    {lang === "en" ? "4. Risk score & LTV limit" : "4. Skor risiko & batas LTV"}
                  </p>
                  <p>
                    {lang === "en"
                      ? "Lower risk scores mean safer collateral (22/100 = Low risk, 60% max LTV). Leaving Serial/IMEI empty raises risk to 47/100 (Medium risk) and lowers the recommended limit to 50% LTV."
                      : "Skor risiko lebih rendah berarti agunan lebih aman (22/100 = risiko rendah, maks LTV 60%). Jika Serial/IMEI kosong, risiko naik ke 47/100 (sedang) dan batas pinjaman turun ke 50% LTV."}
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
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <h2 className="text-base font-bold text-[var(--ink-primary)]">
                      {t.deskTitle}
                    </h2>
                    <p className="mt-0.5 text-xs text-[var(--ink-muted)]">{t.deskSubtitle}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowGuide(true)}
                    title={t.ltvTooltip}
                    className="inline-flex shrink-0 items-center gap-1 font-mono text-xs text-[var(--ink-muted)] hover:text-[var(--accent-vault)]"
                  >
                    {t.maxLtv}
                    <HelpCircle className="h-3.5 w-3.5" />
                  </button>
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
                      if (assetType !== "PHYSICAL") applyPreset("iphone");
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
                      if (assetType !== "DIGITAL") applyPreset("nft");
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

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
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

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-[var(--ink-muted)]">
                      {t.labelCondition}
                    </label>
                    <select
                      value={condition}
                      onChange={(e) => setCondition(e.target.value as AssetCondition)}
                      className="w-full rounded border border-[var(--border-ledger)] bg-white px-3 py-2 text-sm focus:border-[var(--accent-vault)] focus:outline-none"
                    >
                      <option value="Mint">{t.condMint}</option>
                      <option value="Good">{t.condGood}</option>
                      <option value="Fair">{t.condFair}</option>
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
                        placeholder="Empty = mint a demo token"
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
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-xs font-semibold text-[var(--ink-primary)]">
                        {t.appraisalTitle} · {t.appraisalSourceLabel}
                      </span>
                      <button
                        type="button"
                        onClick={() => setShowGuide(true)}
                        title={
                          lang === "en"
                            ? "Lower score = safer collateral (22/100 Low, 47/100 Medium when Serial/IMEI is empty). Click for details."
                            : "Skor lebih kecil = agunan lebih aman (22/100 Rendah, 47/100 Sedang jika Serial/IMEI kosong). Klik untuk panduan."
                        }
                        className="inline-flex items-center gap-1 rounded bg-white px-2 py-0.5 font-mono text-xs font-semibold text-[var(--accent-vault)] hover:bg-[var(--accent-vault-light)]"
                      >
                        {appraisal.riskLevel.charAt(0) + appraisal.riskLevel.slice(1).toLowerCase()} risk · {appraisal.riskScore}/100
                        <HelpCircle className="h-3 w-3 opacity-70" />
                      </button>
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
                          {formatUsd(appraisal.medianBenchmarkSol * SOL_USD_RATE)}
                        </span>
                      </div>
                      <div>
                        <span
                          title={t.ltvTooltip}
                          className="block cursor-help text-[11px] text-[var(--ink-muted)]"
                        >
                          {t.maxLoan} ({Math.round(appraisal.suggestedLtv * 100)}% LTV)
                        </span>
                        <span className="font-mono text-sm font-bold tabular-nums text-[var(--accent-vault)]">
                          {appraisal.comparableReferences.length > 0
                            ? `${appraisal.suggestedMaxLoanSol} SOL`
                            : "Not appraised"}
                        </span>
                        <span className="block font-mono text-[11px] text-[var(--ink-muted)]">
                          {t.confidence}: {Math.round(appraisal.confidenceScore * 100)}%
                        </span>
                      </div>
                    </div>

                    <div>
                      <span className="mb-1.5 block text-[11px] font-semibold text-[var(--ink-muted)]">
                        {t.priceSources}
                      </span>
                      <AppraisalSources references={appraisal.comparableReferences} />
                    </div>

                    <p className="text-[11px] leading-relaxed text-[var(--ink-muted)]">
                      {t.appraisalDisclaimer}
                    </p>
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
                    {t.hintBorrowerRole}
                  </p>
                )}

                <button
                  type="submit"
                  disabled={submitting || walletMissing || (sandboxEnabled && sandboxRole !== "borrower")}
                  className="w-full rounded-md bg-[var(--accent-vault)] px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[var(--accent-vault-hover)] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {walletMissing
                    ? t.connectWallet
                    : submitting
                    ? t.btnCreating
                    : sandboxEnabled && sandboxRole !== "borrower"
                      ? t.btnBorrowerRequired
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
                    {t.ledgerSubtitle} · {visibleTickets.length} {t.ledgerCount}
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
                      ["CANCELLED", t.filterCancelled],
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
                    const lastSignature = ticket.repayTxSignature ?? ticket.chainTxSignature;
                    const expUrl = lastSignature ? explorerTxUrl(lastSignature) : null;
                    const isDevnet = ticket.mode === "devnet";
                    const viewer = isDevnet ? connectedAddress : SANDBOX_WALLETS[sandboxRole];
                    // Which actions to offer; the program (or the API) still enforces each one.
                    const isBorrowerView = viewer === ticket.borrowerWallet;
                    const canAttest = isDevnet ? !isBorrowerView : sandboxRole === "custodian";
                    const canFund = isDevnet ? !isBorrowerView : sandboxRole === "lender";
                    const canRepay = isBorrowerView || (isDevnet && !publicKey);

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
                              <span className="rounded border border-[var(--border-ledger)] px-1.5 py-0.5 font-mono text-[10px] uppercase text-[var(--ink-muted)]">
                                {ticket.mode}
                              </span>
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
                              {ticket.appraisal.comparableReferences.length > 0
                                ? `${ticket.appraisal.medianBenchmarkSol} SOL (${Math.round(ticket.ltv * 100)}%)`
                                : "—"}
                            </span>
                          </div>
                        </div>

                        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-[var(--ink-muted)]">
                          <div className="flex flex-wrap items-center gap-3">
                            <span className="inline-flex items-center gap-1">
                              <ShieldCheck className="h-3.5 w-3.5 text-[var(--accent-vault)]" />
                              {ticket.asset.assetType === "DIGITAL"
                                ? isDevnet
                                  ? t.escrowOnChain
                                  : t.escrowSimulated
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
                              {t.explorerLink}
                              <ExternalLink className="h-3 w-3" />
                            </a>
                          ) : ticket.chainTicketPubkey ? (
                            <a
                              href={explorerAddressUrl(ticket.chainTicketPubkey)}
                              target="_blank"
                              rel="noreferrer"
                              className="font-mono text-[11px] text-[var(--accent-vault)] hover:underline"
                            >
                              PDA: {shortAddr(ticket.chainTicketPubkey)}
                            </a>
                          ) : (
                            <span className="font-mono text-[11px]">{t.simulated}</span>
                          )}
                        </div>

                        <div className="mt-3.5 flex flex-wrap items-center gap-2">
                          {ticket.status === "PENDING_VERIFICATION" &&
                            (canAttest ? (
                              <button
                                type="button"
                                disabled={actionBusyId === ticket.id || (isDevnet && !publicKey)}
                                onClick={() => handleTicketAction(ticket, "custody_attest")}
                                className="rounded bg-amber-700 hover:bg-amber-800 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
                              >
                                {t.btnAttest}
                              </button>
                            ) : (
                              <span className="rounded border border-amber-200 bg-amber-50 text-amber-800 px-2.5 py-1 text-[11px] font-medium">
                                {t.hintNeedCustodian}
                              </span>
                            ))}

                          {ticket.status === "OPEN" &&
                            (canFund ? (
                              <button
                                type="button"
                                disabled={actionBusyId === ticket.id || (isDevnet && !publicKey)}
                                onClick={() => handleTicketAction(ticket, "fund")}
                                className="rounded bg-[var(--accent-vault)] hover:bg-[var(--accent-vault-hover)] px-3.5 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
                              >
                                {t.btnFund} ({principalSolVal.toFixed(2)} SOL)
                              </button>
                            ) : (
                              <span className="rounded border border-emerald-200 bg-emerald-50 text-emerald-800 px-2.5 py-1 text-[11px] font-medium">
                                {t.hintWaitingLender}
                              </span>
                            ))}

                          {ticket.status === "ACTIVE" &&
                            (canRepay ? (
                              <button
                                type="button"
                                disabled={actionBusyId === ticket.id || (isDevnet && !publicKey)}
                                onClick={() => handleTicketAction(ticket, "repay")}
                                className="rounded bg-[var(--ink-primary)] hover:bg-slate-800 px-3.5 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
                              >
                                {t.btnRepay} ({totalDueSol} SOL)
                              </button>
                            ) : (
                              <span className="rounded border border-sky-200 bg-sky-50 text-sky-800 px-2.5 py-1 text-[11px] font-medium">
                                {t.hintActiveRepay}
                              </span>
                            ))}

                          {isOverdue(ticket) && viewer === ticket.lenderWallet && (
                            <button
                              type="button"
                              disabled={actionBusyId === ticket.id}
                              onClick={() => handleTicketAction(ticket, "claim_default")}
                              className="rounded bg-rose-700 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-rose-800 disabled:opacity-50"
                            >
                              {t.btnClaim}
                            </button>
                          )}

                          {(ticket.status === "OPEN" || ticket.status === "PENDING_VERIFICATION") &&
                            viewer === ticket.borrowerWallet && (
                              <button
                                type="button"
                                disabled={actionBusyId === ticket.id || (isDevnet && !publicKey)}
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
      <footer className="border-t border-[var(--border-ledger)] bg-white py-5">
        <div className="mx-auto flex max-w-7xl flex-col gap-2 px-4 text-xs text-[var(--ink-muted)] sm:px-6 md:flex-row md:items-center md:justify-between">
          <div>
            <span className="font-semibold text-[var(--ink-primary)]">Spawn</span>
            <span className="mx-1.5">|</span>
            <span>Built for Dev3pack Global Hackathon</span>
          </div>
          <div className="flex flex-wrap items-center gap-2.5 font-mono text-[11px]">
            <span>AI Market Appraisal</span>
            <span>·</span>
            <span>Verified Physical Custody</span>
            <span>·</span>
            <a
              href={explorerAddressUrl(PROGRAM_ID.toBase58())}
              target="_blank"
              rel="noreferrer"
              className="text-[var(--accent-vault)] hover:underline"
            >
              Solana Smart Contract Escrow ↗
            </a>
            <span>·</span>
            <span>Voice-Assisted Loan Terms</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
