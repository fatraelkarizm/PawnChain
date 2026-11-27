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
  if (!prepared) return fail(400, "Valuation token is invalid or expired.");

  let address: string;
  try {
    address = new PublicKey(body.ticketPubkey || "").toBase58();
  } catch {
    return fail(400, "Invalid collateral ticket address.");
  }

  const registered = (await listTickets()).find((t) => t.chainTicketPubkey === address);
  if (registered) return NextResponse.json({ ticket: registered });

  const chain = await fetchTicket(getSolanaConnection(), address);
  if (!chain) return fail(404, "On-chain collateral account was not found on Devnet.");
  if (chain.status !== "OPEN") return fail(409, "On-chain collateral request is no longer open.");
  if (
    chain.metadataUri !== prepared.metadataUri ||
    chain.fingerprintHex !== prepared.serialHash ||
    chain.assetType !== prepared.assetType ||
    (prepared.mintAddress && chain.collateralMint !== prepared.mintAddress)
  ) {
    return fail(400, "On-chain collateral data does not match the appraised asset.");
  }

  const { appraisal } = prepared;
  const isAppraised = appraisal.comparableReferences.length > 0;
  if (isAppraised && chain.loanLamports > solToLamports(appraisal.suggestedMaxLoanSol)) {
    return fail(400, `Requested loan exceeds the maximum recommended limit (${appraisal.suggestedMaxLoanSol} SOL).`);
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
      return fail(400, "Invalid collateral request parameters.");
    }
    if (interestBps < 0 || interestBps > 5000) {
      return fail(400, "Interest rate cannot exceed 50% (5000 bps).");
    }
    if (tenorDays < 1 || tenorDays > 90) {
      return fail(400, "Loan duration must be between 1 and 90 days.");
    }

    const mintRaw = (body.mintAddress || "").trim();
    if (assetType === "DIGITAL" && mintRaw.length > 0) {
      try {
        new PublicKey(mintRaw);
      } catch {
        return fail(
          400,
          "Invalid Solana mint address. Leave this field empty to automatically generate a demo token."
        );
      }
    }

    const serialRaw = (body.serialNumber || "").trim();
    const serialHash = serialRaw ? hashAssetIdentifier(serialRaw) : null;
    if (serialHash) {
      const dup = await checkDuplicateSerialHash(serialHash, "sandbox");
      if (dup) {
        return fail(409, `Serial/IMEI is already active on request #${dup.publicTicketId}. Double-pledging rejected.`);
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
        `Requested loan (${principalSol} SOL) exceeds the maximum recommended limit (${appraisal.suggestedMaxLoanSol} SOL at ${Math.round(appraisal.suggestedLtv * 100)}% LTV).`
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
