import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import type { PawnTicket } from "@/types/pawn";
import { hashAssetIdentifier, SOL_PRICE_IDR_ESTIMATE, solToLamports } from "./security";

const LOCAL_STORE_PATH = path.join(process.cwd(), ".pawnchain-local-store.json");

function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

function buildSeedTickets(): PawnTicket[] {
  const now = new Date();
  const asset1Id = "11111111-1111-4111-8111-111111111101";
  const asset2Id = "22222222-2222-4222-8222-222222222202";

  return [
    {
      id: "ticket-101",
      publicTicketId: 101,
      borrowerWallet: "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU",
      lenderWallet: null,
      principalLamports: solToLamports(1.8),
      interestBps: 500, // 5%
      tenorDays: 14,
      ltv: 0.56,
      dueAt: null,
      chainTicketPubkey: "PawnTicket101DevnetPDA1111111111111111111111",
      chainTxSignature: "DemoSeedTx101SolanaDevnetEscrowVerified",
      repayTxSignature: null,
      custodyAttestationHash: hashAssetIdentifier("CUSTODY-JKT-01-IPHONE13PRO"),
      status: "OPEN",
      createdAt: new Date(now.getTime() - 3600_000 * 5).toISOString(),
      updatedAt: new Date(now.getTime() - 3600_000 * 5).toISOString(),
      asset: {
        id: asset1Id,
        ownerWallet: "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU",
        assetType: "PHYSICAL",
        category: "Electronics",
        brand: "Apple",
        model: "iPhone 13 Pro 256GB",
        description: "Fullset box, battery health 89%, tanpa retak. Sudah dicek fisik di Hub Jakarta.",
        serialHash: hashAssetIdentifier("356984110029384"),
        mintAddress: "RWA13ProMintDevnet111111111111111111111111",
        condition: "Good",
        verificationStatus: "VERIFIED",
        custodyStatus: "IN_CUSTODY",
        createdAt: new Date(now.getTime() - 3600_000 * 6).toISOString(),
      },
      appraisal: {
        id: "appr-101",
        assetId: asset1Id,
        estimatedMinSol: 3.1,
        estimatedMaxSol: 3.55,
        medianBenchmarkSol: 3.33,
        conditionAdjustedSol: 3.0,
        suggestedLtv: 0.6,
        suggestedMaxLoanSol: 1.8,
        riskScore: 24,
        riskLevel: "LOW",
        confidenceScore: 0.89,
        riskFactors: [
          "IMEI lolos cek duplikasi (HMAC registry bersih)",
          "Custody Hub Jakarta sudah menandatangani attestation",
        ],
        missingInformation: [],
        comparableReferences: [
          {
            title: "iPhone 13 Pro 256GB Mulus Ex iBox",
            source: "Tokopedia (Cached Benchmark)",
            url: "https://www.tokopedia.com",
            priceIdr: 8_000_000,
            priceSol: Number((8_000_000 / SOL_PRICE_IDR_ESTIMATE).toFixed(3)),
            fetchedAt: now.toISOString(),
            sourceType: "cached_benchmark",
          },
          {
            title: "iPhone 13 Pro 256GB Second Fullset",
            source: "OLX Indonesia (Cached Benchmark)",
            url: "https://www.olx.co.id",
            priceIdr: 7_750_000,
            priceSol: Number((7_750_000 / SOL_PRICE_IDR_ESTIMATE).toFixed(3)),
            fetchedAt: now.toISOString(),
            sourceType: "cached_benchmark",
          },
        ],
        humanReviewRequired: false,
        modelVersion: "pawnchain-benchmark-v1",
        createdAt: now.toISOString(),
      },
    },
    {
      id: "ticket-102",
      publicTicketId: 102,
      borrowerWallet: "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM",
      lenderWallet: null,
      principalLamports: solToLamports(1.5),
      interestBps: 400, // 4%
      tenorDays: 7,
      ltv: 0.44,
      dueAt: null,
      chainTicketPubkey: "PawnTicket102DevnetPDA2222222222222222222222",
      chainTxSignature: "DemoSeedTx102SolanaDevnetEscrowVerified",
      repayTxSignature: null,
      custodyAttestationHash: null,
      status: "OPEN",
      createdAt: new Date(now.getTime() - 3600_000 * 2).toISOString(),
      updatedAt: new Date(now.getTime() - 3600_000 * 2).toISOString(),
      asset: {
        id: asset2Id,
        ownerWallet: "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM",
        assetType: "DIGITAL",
        category: "NFT",
        brand: "Mad Lads",
        model: "Mad Lads #4821 (Devnet)",
        description: "Solana NFT collateral locked directly inside PDA escrow vault.",
        serialHash: null,
        mintAddress: "MadLadsDemoMintDevnet2222222222222222222222",
        condition: "Mint",
        verificationStatus: "VERIFIED",
        custodyStatus: "LOCKED_ON_CHAIN",
        createdAt: new Date(now.getTime() - 3600_000 * 3).toISOString(),
      },
      appraisal: {
        id: "appr-102",
        assetId: asset2Id,
        estimatedMinSol: 3.2,
        estimatedMaxSol: 3.6,
        medianBenchmarkSol: 3.4,
        conditionAdjustedSol: 3.4,
        suggestedLtv: 0.6,
        suggestedMaxLoanSol: 2.04,
        riskScore: 18,
        riskLevel: "LOW",
        confidenceScore: 0.92,
        riskFactors: ["Aset digital dikunci 100% on-chain di PDA Escrow"],
        missingInformation: [],
        comparableReferences: [
          {
            title: "Mad Lads Collection Floor",
            source: "Magic Eden (Cached Floor)",
            url: "https://magiceden.io",
            priceIdr: Math.round(3.4 * SOL_PRICE_IDR_ESTIMATE),
            priceSol: 3.4,
            fetchedAt: now.toISOString(),
            sourceType: "cached_benchmark",
          },
        ],
        humanReviewRequired: false,
        modelVersion: "pawnchain-benchmark-v1",
        createdAt: now.toISOString(),
      },
    },
  ];
}

function readLocalTickets(): PawnTicket[] {
  try {
    if (!fs.existsSync(LOCAL_STORE_PATH)) {
      const seed = buildSeedTickets();
      fs.writeFileSync(LOCAL_STORE_PATH, JSON.stringify(seed, null, 2), "utf-8");
      return seed;
    }
    const raw = fs.readFileSync(LOCAL_STORE_PATH, "utf-8");
    const parsed = JSON.parse(raw) as PawnTicket[];
    return Array.isArray(parsed) && parsed.length > 0 ? parsed : buildSeedTickets();
  } catch {
    return buildSeedTickets();
  }
}

function writeLocalTickets(tickets: PawnTicket[]): void {
  try {
    fs.writeFileSync(LOCAL_STORE_PATH, JSON.stringify(tickets, null, 2), "utf-8");
  } catch {
    // Ignore read-only serverless fs errors gracefully
  }
}

export async function listTickets(): Promise<PawnTicket[]> {
  const sb = getSupabaseAdmin();
  if (sb) {
    const { data } = await sb
      .from("audit_logs")
      .select("after_json")
      .eq("entity_type", "ticket_snapshot")
      .order("created_at", { ascending: false });
    if (data && data.length > 0) {
      const map = new Map<string, PawnTicket>();
      for (const row of data) {
        const t = row.after_json as PawnTicket | null;
        if (t && !map.has(t.id)) map.set(t.id, t);
      }
      if (map.size > 0) return Array.from(map.values());
    }
  }
  return readLocalTickets();
}

export async function getTicketById(idOrPublicId: string): Promise<PawnTicket | null> {
  const all = await listTickets();
  return (
    all.find(
      (t) => t.id === idOrPublicId || String(t.publicTicketId) === String(idOrPublicId)
    ) || null
  );
}

export async function checkDuplicateSerialHash(serialHash: string): Promise<PawnTicket | null> {
  const all = await listTickets();
  return (
    all.find(
      (t) =>
        t.asset.serialHash === serialHash &&
        t.status !== "REPAID" &&
        t.status !== "CANCELLED" &&
        t.status !== "DEFAULT_CLAIMED"
    ) || null
  );
}

export async function saveTicket(ticket: PawnTicket): Promise<PawnTicket> {
  const all = readLocalTickets();
  const idx = all.findIndex((t) => t.id === ticket.id);
  if (idx >= 0) all[idx] = ticket;
  else all.unshift(ticket);
  writeLocalTickets(all);

  const sb = getSupabaseAdmin();
  if (sb) {
    await sb.from("audit_logs").insert({
      actor_wallet: ticket.borrowerWallet,
      action: `TICKET_${ticket.status}`,
      entity_type: "ticket_snapshot",
      entity_id: ticket.id,
      after_json: ticket,
    });
  }
  return ticket;
}

export async function nextPublicTicketId(): Promise<number> {
  const all = await listTickets();
  const maxId = all.reduce((acc, t) => Math.max(acc, t.publicTicketId), 100);
  return maxId + 1;
}

export function generateAttestationHash(ticketId: string, custodianWallet: string): string {
  return crypto
    .createHash("sha256")
    .update(`${ticketId}:${custodianWallet}:${Date.now()}`)
    .digest("hex");
}
