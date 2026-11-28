import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import type { PawnTicket, TicketMode } from "@/types/pawn";
import { SAMPLE_SOURCE } from "./appraisal";
import { SANDBOX_WALLETS } from "./sandbox";
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
      mode: "sandbox",
      custodianWallet: SANDBOX_WALLETS.custodian,
      borrowerWallet: "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU",
      lenderWallet: null,
      principalLamports: solToLamports(1.8),
      interestBps: 500, // 5%
      tenorDays: 14,
      ltv: 0.56,
      dueAt: null,
      chainTicketPubkey: null,
      chainTxSignature: null,
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
        description: "Original box included, 89% battery health, no screen cracks. Verified at custody hub.",
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
          "IMEI passed duplicate collateral check (HMAC registry clear)",
          "Custody Hub signed physical verification attestation",
        ],
        missingInformation: [],
        comparableReferences: [
          {
            title: "Sample listing 1",
            source: SAMPLE_SOURCE,
            url: "",
            priceIdr: 8_000_000,
            priceSol: Number((8_000_000 / SOL_PRICE_IDR_ESTIMATE).toFixed(3)),
            fetchedAt: now.toISOString(),
            sourceType: "sample_data",
          },
          {
            title: "Sample listing 2",
            source: SAMPLE_SOURCE,
            url: "",
            priceIdr: 7_750_000,
            priceSol: Number((7_750_000 / SOL_PRICE_IDR_ESTIMATE).toFixed(3)),
            fetchedAt: now.toISOString(),
            sourceType: "sample_data",
          },
        ],
        humanReviewRequired: false,
        modelVersion: "sample-data",
        createdAt: now.toISOString(),
      },
    },
    {
      id: "ticket-102",
      publicTicketId: 102,
      mode: "sandbox",
      custodianWallet: null,
      borrowerWallet: "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM",
      lenderWallet: null,
      principalLamports: solToLamports(1.5),
      interestBps: 400, // 4%
      tenorDays: 7,
      ltv: 0.44,
      dueAt: null,
      chainTicketPubkey: null,
      chainTxSignature: null,
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
        description: "Verified Solana NFT collateral locked in simulated sandbox escrow.",
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
        riskFactors: ["Digital collateral locked in Solana PDA escrow"],
        missingInformation: [],
        comparableReferences: [
          {
            title: "Sample floor price",
            source: SAMPLE_SOURCE,
            url: "",
            priceIdr: Math.round(3.4 * SOL_PRICE_IDR_ESTIMATE),
            priceSol: 3.4,
            fetchedAt: now.toISOString(),
            sourceType: "sample_data",
          },
        ],
        humanReviewRequired: false,
        modelVersion: "sample-data",
        createdAt: now.toISOString(),
      },
    },
  ];
}

// Fallback when the filesystem is read-only (serverless without Supabase).
// Data then lives only as long as the server instance does.
let memoryTickets: PawnTicket[] | null = null;

function readLocalTickets(): PawnTicket[] {
  if (memoryTickets) return memoryTickets;
  try {
    const parsed = JSON.parse(fs.readFileSync(LOCAL_STORE_PATH, "utf-8")) as PawnTicket[];
    if (Array.isArray(parsed) && parsed.length > 0) {
      return parsed.map((t) => ({ ...t, mode: t.mode ?? "sandbox" }));
    }
  } catch {
    // Missing or unreadable store: start from the seed data.
  }
  return buildSeedTickets();
}

function writeLocalTickets(tickets: PawnTicket[]): void {
  try {
    fs.writeFileSync(LOCAL_STORE_PATH, JSON.stringify(tickets, null, 2), "utf-8");
    memoryTickets = null;
  } catch (err) {
    console.warn("Local ticket store is not writable; keeping tickets in memory.", err);
    memoryTickets = tickets;
  }
}

export async function listTickets(): Promise<PawnTicket[]> {
  const sb = getSupabaseAdmin();
  if (!sb) return readLocalTickets();

  const { data, error } = await sb
    .from("audit_logs")
    .select("after_json")
    .eq("entity_type", "ticket_snapshot")
    .order("created_at", { ascending: false });
  if (error) throw new Error(`Supabase read failed: ${error.message}`);

  // Newest snapshot wins; seed tickets stay listed until they get their own snapshot.
  const map = new Map<string, PawnTicket>();
  for (const row of data) {
    const t = row.after_json as PawnTicket | null;
    if (t && !map.has(t.id)) map.set(t.id, t);
  }
  for (const seed of buildSeedTickets()) {
    if (!map.has(seed.id)) map.set(seed.id, seed);
  }
  return Array.from(map.values()).sort((a, b) => b.publicTicketId - a.publicTicketId);
}

export async function getTicketById(idOrPublicId: string): Promise<PawnTicket | null> {
  const all = await listTickets();
  return (
    all.find(
      (t) => t.id === idOrPublicId || String(t.publicTicketId) === String(idOrPublicId)
    ) || null
  );
}

/** Scoped by mode so sandbox play can never block a real devnet pledge. */
export async function checkDuplicateSerialHash(
  serialHash: string,
  mode: TicketMode
): Promise<PawnTicket | null> {
  const all = await listTickets();
  return (
    all.find(
      (t) =>
        t.mode === mode &&
        t.asset.serialHash === serialHash &&
        t.status !== "REPAID" &&
        t.status !== "CANCELLED" &&
        t.status !== "DEFAULT_CLAIMED"
    ) || null
  );
}

export async function saveTicket(ticket: PawnTicket): Promise<PawnTicket> {
  const sb = getSupabaseAdmin();
  if (sb) {
    const { error } = await sb.from("audit_logs").insert({
      actor_wallet: ticket.borrowerWallet,
      action: `TICKET_${ticket.status}`,
      entity_type: "ticket_snapshot",
      entity_id: ticket.id,
      after_json: ticket,
    });
    if (error) throw new Error(`Supabase write failed: ${error.message}`);
    return ticket;
  }

  const all = [...readLocalTickets()];
  const idx = all.findIndex((t) => t.id === ticket.id);
  if (idx >= 0) all[idx] = ticket;
  else all.unshift(ticket);
  writeLocalTickets(all);
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
