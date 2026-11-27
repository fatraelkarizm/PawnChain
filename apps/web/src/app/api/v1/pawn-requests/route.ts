import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { runAiAppraisal } from "@/lib/appraisal";
import { hashAssetIdentifier, solToLamports } from "@/lib/security";
import { derivePawnTicketPda, verifyDevnetTransaction } from "@/lib/solana";
import { checkDuplicateSerialHash, nextPublicTicketId, saveTicket } from "@/lib/store";
import type { AssetCondition, AssetType, PawnTicket } from "@/types/pawn";

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
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
      chainTxSignature?: string;
      lang?: "en" | "id";
    };
    const isId = body.lang === "id";

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
      return NextResponse.json(
        { error: isId ? "Parameter pengajuan gadai tidak valid." : "Invalid pawn request parameters." },
        { status: 400 }
      );
    }
    if (interestBps < 0 || interestBps > 5000) {
      return NextResponse.json(
        { error: isId ? "Bunga maksimal 50% (5000 bps)." : "Maximum interest is 50% (5000 bps)." },
        { status: 400 }
      );
    }
    if (tenorDays < 1 || tenorDays > 90) {
      return NextResponse.json(
        {
          error: isId
            ? "Tenor pinjaman harus antara 1 sampai 90 hari."
            : "Loan tenor must be between 1 and 90 days.",
        },
        { status: 400 }
      );
    }

    const serialRaw = (body.serialNumber || "").trim();
    const serialHash = serialRaw ? hashAssetIdentifier(serialRaw) : null;
    if (serialHash) {
      const dup = await checkDuplicateSerialHash(serialHash);
      if (dup) {
        return NextResponse.json(
          {
            error: isId
              ? `Serial/IMEI sudah aktif di Tiket #${dup.publicTicketId}. Gadai ganda ditolak.`
              : `Serial/IMEI is already active on Ticket #${dup.publicTicketId}. Double-pledging rejected.`,
          },
          { status: 409 }
        );
      }
    }

    // Recompute appraisal server-side so frontend cannot spoof valuation or LTV
    const assetId = crypto.randomUUID();
    const appraisal = await runAiAppraisal({
      assetId,
      assetType,
      category: body.category || (assetType === "DIGITAL" ? "NFT" : "Electronics"),
      brand,
      model,
      condition,
      hasSerial: Boolean(serialHash),
    });

    if (principalSol > appraisal.suggestedMaxLoanSol) {
      return NextResponse.json(
        {
          error: isId
            ? `Pinjaman ${principalSol} SOL melebihi batas aman AI (${appraisal.suggestedMaxLoanSol} SOL pada LTV ${Math.round(appraisal.suggestedLtv * 100)}%).`
            : `Requested loan ${principalSol} SOL exceeds AI safe limit (${appraisal.suggestedMaxLoanSol} SOL at ${Math.round(appraisal.suggestedLtv * 100)}% LTV).`,
        },
        { status: 400 }
      );
    }

    const txCheck = await verifyDevnetTransaction(body.chainTxSignature || `SandboxTx_${Date.now()}`);
    if (!txCheck.verified) {
      return NextResponse.json({ error: txCheck.error || "Invalid chain transaction" }, { status: 400 });
    }

    const publicTicketId = await nextPublicTicketId();
    const nowIso = new Date().toISOString();
    const ltv = Number((principalSol / Math.max(appraisal.conditionAdjustedSol, 0.001)).toFixed(2));

    // Rule: Physical collateral CANNOT enter OPEN marketplace until Custodian attests custody
    const isDigital = assetType === "DIGITAL";

    const ticket: PawnTicket = {
      id: `ticket-${publicTicketId}`,
      publicTicketId,
      borrowerWallet,
      lenderWallet: null,
      principalLamports: solToLamports(principalSol),
      interestBps,
      tenorDays,
      ltv,
      dueAt: null,
      chainTicketPubkey: derivePawnTicketPda(borrowerWallet, publicTicketId),
      chainTxSignature: body.chainTxSignature || `SandboxTx_Create_${publicTicketId}`,
      repayTxSignature: null,
      custodyAttestationHash: null,
      status: isDigital ? "OPEN" : "PENDING_VERIFICATION",
      createdAt: nowIso,
      updatedAt: nowIso,
      asset: {
        id: assetId,
        ownerWallet: borrowerWallet,
        assetType,
        category: body.category || (isDigital ? "NFT" : "Electronics"),
        brand,
        model,
        description: (body.description || "").trim() || `${brand} ${model} (${condition})`,
        serialHash,
        mintAddress: body.mintAddress || `RWA${publicTicketId}MintDevnet1111111111111111111`,
        condition,
        verificationStatus: isDigital ? "VERIFIED" : "PENDING_REVIEW",
        custodyStatus: isDigital ? "LOCKED_ON_CHAIN" : "UNVERIFIED",
        createdAt: nowIso,
      },
      appraisal,
    };

    await saveTicket(ticket);
    return NextResponse.json({ ticket }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Failed to create pawn ticket" }, { status: 500 });
  }
}
