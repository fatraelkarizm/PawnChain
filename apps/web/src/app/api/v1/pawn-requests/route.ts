import crypto from "node:crypto";
import { PublicKey } from "@solana/web3.js";
import { NextResponse } from "next/server";
import { runAiAppraisal } from "@/lib/appraisal";
import { applyChainState, syncDevnetTicket } from "@/lib/devnet";
import { fetchTicket } from "@/lib/program";
import { hashAssetIdentifier, solToLamports, verifyToken } from "@/lib/security";
import { getSolanaConnection } from "@/lib/solana";
import { checkDuplicateSerialHash, listTickets, nextPublicTicketId, saveTicket } from "@/lib/store";
import type { AssetCondition, AssetType, PawnTicket, PreparedPledge } from "@/types/pawn";

const fail = (status: number, error: string) => NextResponse.json({ error }, { status });

const ltvOf = (principalSol: number, collateralSol: number) =>
  collateralSol > 0 ? Number((principalSol / collateralSol).toFixed(2)) : 0;

/** Lists a ticket that already exists on chain. Money terms come from the chain only. */
async function registerDevnetTicket(body: {
  appraisalToken?: string;
  ticketPubkey?: string;
  chainTxSignature?: string;
}) {
  const prepared = verifyToken<PreparedPledge>(body.appraisalToken || "");
  if (!prepared) return fail(400, "Token taksiran tidak valid atau kedaluwarsa.");

  let address: string;
  try {
    address = new PublicKey(body.ticketPubkey || "").toBase58();
  } catch {
    return fail(400, "Alamat tiket tidak valid.");
  }

  const registered = (await listTickets()).find((t) => t.chainTicketPubkey === address);
  if (registered) return NextResponse.json({ ticket: registered });

  const chain = await fetchTicket(getSolanaConnection(), address);
  if (!chain) return fail(404, "Akun tiket belum ditemukan di devnet.");
  if (chain.status !== "OPEN") return fail(409, "Tiket on-chain sudah tidak terbuka.");
  if (
    chain.metadataUri !== prepared.metadataUri ||
    chain.fingerprintHex !== prepared.serialHash ||
    chain.assetType !== prepared.assetType ||
    (prepared.mintAddress && chain.collateralMint !== prepared.mintAddress)
  ) {
    return fail(400, "Data on-chain tidak cocok dengan data yang ditaksir.");
  }

  const { appraisal } = prepared;
  const isAppraised = appraisal.comparableReferences.length > 0;
  if (isAppraised && chain.loanLamports > solToLamports(appraisal.suggestedMaxLoanSol)) {
    return fail(400, `Pinjaman melebihi batas aman (${appraisal.suggestedMaxLoanSol} SOL).`);
  }

  const publicTicketId = await nextPublicTicketId();
  const nowIso = new Date().toISOString();
  const base: PawnTicket = {
    id: `ticket-${publicTicketId}`,
    publicTicketId,
    mode: "devnet",
    custodianWallet: null,
    borrowerWallet: chain.borrower,
    lenderWallet: null,
    principalLamports: chain.loanLamports,
    interestBps: chain.interestBps,
    tenorDays: Math.max(1, Math.round(chain.durationSeconds / 86_400)),
    ltv: ltvOf(chain.loanLamports / 1_000_000_000, appraisal.conditionAdjustedSol),
    dueAt: null,
    chainTicketPubkey: address,
    chainTxSignature: null,
    repayTxSignature: null,
    custodyAttestationHash: null,
    status: "PENDING_VERIFICATION",
    createdAt: nowIso,
    updatedAt: nowIso,
    asset: {
      id: appraisal.assetId,
      ownerWallet: chain.borrower,
      assetType: prepared.assetType,
      category: prepared.category,
      brand: prepared.brand,
      model: prepared.model,
      description: prepared.description,
      serialHash: prepared.serialHash,
      mintAddress: chain.collateralMint,
      condition: prepared.condition,
      verificationStatus: "PENDING_REVIEW",
      custodyStatus: "UNVERIFIED",
      createdAt: nowIso,
    },
    appraisal,
  };

  const saved = await saveTicket(applyChainState(base, chain));
  const ticket = await syncDevnetTicket(saved, body.chainTxSignature);
  return NextResponse.json({ ticket }, { status: 201 });
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      mode?: string;
      appraisalToken?: string;
      ticketPubkey?: string;
      chainTxSignature?: string;
      borrowerWallet?: string;
      assetType?: AssetType;
      category?: string;
      brand?: string;
      model?: string;
      description?: string;
      condition?: AssetCondition;
      serialNumber?: string;
      mintAddress?: string;
      principalSol?: number;
      interestBps?: number;
      tenorDays?: number;
    };

    if (body.mode === "devnet") return await registerDevnetTicket(body);

    const borrowerWallet = (body.borrowerWallet || "").trim();
    const brand = (body.brand || "").trim();
    const model = (body.model || "").trim();
    const principalSol = Number(body.principalSol);
    const interestBps = Math.round(Number(body.interestBps ?? 500));
    const tenorDays = Math.round(Number(body.tenorDays ?? 14));
    const assetType: AssetType = body.assetType === "DIGITAL" ? "DIGITAL" : "PHYSICAL";
    const condition: AssetCondition =
      body.condition === "Mint" || body.condition === "Fair" ? body.condition : "Good";

    if (!borrowerWallet || !brand || !model || !Number.isFinite(principalSol) || principalSol <= 0) {
      return fail(400, "Parameter pengajuan gadai tidak valid.");
    }
    if (interestBps < 0 || interestBps > 5000) {
      return fail(400, "Bunga maksimal 50% (5000 bps).");
    }
    if (tenorDays < 1 || tenorDays > 90) {
      return fail(400, "Tenor pinjaman harus antara 1 sampai 90 hari.");
    }

    const serialRaw = (body.serialNumber || "").trim();
    const serialHash = serialRaw ? hashAssetIdentifier(serialRaw) : null;
    if (serialHash) {
      const dup = await checkDuplicateSerialHash(serialHash, "sandbox");
      if (dup) {
        return fail(409, `Serial/IMEI sudah aktif di Tiket #${dup.publicTicketId}. Gadai ganda ditolak.`);
      }
    }

    // Recompute appraisal server-side so frontend cannot spoof valuation or LTV
    const assetId = crypto.randomUUID();
    const category = body.category || (assetType === "DIGITAL" ? "NFT" : "Electronics");
    const appraisal = await runAiAppraisal(
      { assetId, assetType, category, brand, model, condition, hasSerial: Boolean(serialHash) },
      { allowSample: true }
    );
    if (!appraisal) return fail(422, "INSUFFICIENT_DATA");

    if (principalSol > appraisal.suggestedMaxLoanSol) {
      return fail(
        400,
        `Pinjaman ${principalSol} SOL melebihi batas aman AI (${appraisal.suggestedMaxLoanSol} SOL pada LTV ${Math.round(appraisal.suggestedLtv * 100)}%).`
      );
    }

    const publicTicketId = await nextPublicTicketId();
    const nowIso = new Date().toISOString();
    // Physical collateral cannot enter the open marketplace before custody is attested.
    const isDigital = assetType === "DIGITAL";

    const ticket: PawnTicket = {
      id: `ticket-${publicTicketId}`,
      publicTicketId,
      mode: "sandbox",
      custodianWallet: null,
      borrowerWallet,
      lenderWallet: null,
      principalLamports: solToLamports(principalSol),
      interestBps,
      tenorDays,
      ltv: ltvOf(principalSol, appraisal.conditionAdjustedSol),
      dueAt: null,
      chainTicketPubkey: null,
      chainTxSignature: `SandboxTx_Create_${publicTicketId}`,
      repayTxSignature: null,
      custodyAttestationHash: null,
      status: isDigital ? "OPEN" : "PENDING_VERIFICATION",
      createdAt: nowIso,
      updatedAt: nowIso,
      asset: {
        id: assetId,
        ownerWallet: borrowerWallet,
        assetType,
        category,
        brand,
        model,
        description: (body.description || "").trim() || `${brand} ${model} (${condition})`,
        serialHash,
        mintAddress: body.mintAddress || null,
        condition,
        verificationStatus: isDigital ? "VERIFIED" : "PENDING_REVIEW",
        custodyStatus: isDigital ? "LOCKED_ON_CHAIN" : "UNVERIFIED",
        createdAt: nowIso,
      },
      appraisal,
    };

    await saveTicket(ticket);
    return NextResponse.json({ ticket }, { status: 201 });
  } catch (err) {
    console.error("Create pawn ticket failed", err);
    return fail(500, "Failed to create pawn ticket");
  }
}
