import crypto from "node:crypto";
import { PublicKey } from "@solana/web3.js";
import { NextResponse } from "next/server";
import { runAiAppraisal } from "@/lib/appraisal";
import { METADATA_PREFIX } from "@/lib/devnet";
import { hashAssetIdentifier, normalizeIdentifier, signToken } from "@/lib/security";
import { checkDuplicateSerialHash } from "@/lib/store";
import type { AssetCondition, AssetType, PreparedPledge, TicketMode } from "@/types/pawn";

const fail = (status: number, error: string, message = error) =>
  NextResponse.json({ error, message }, { status });

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      mode?: TicketMode;
      assetType?: AssetType;
      category?: string;
      brand?: string;
      model?: string;
      description?: string;
      condition?: AssetCondition;
      serialNumber?: string;
      mintAddress?: string;
    };

    const mode: TicketMode = body.mode === "devnet" ? "devnet" : "sandbox";
    const assetType: AssetType = body.assetType === "DIGITAL" ? "DIGITAL" : "PHYSICAL";
    const brand = (body.brand || "").trim();
    const model = (body.model || "").trim();
    const condition: AssetCondition =
      body.condition === "Mint" || body.condition === "Fair" ? body.condition : "Good";
    const description = (body.description || "").trim() || `${brand} ${model} (${condition})`;
    const serialRaw = assetType === "PHYSICAL" ? (body.serialNumber || "").trim() : "";

    if (!brand || !model) {
      return fail(400, "Brand and asset name are required for valuation.");
    }

    let mintAddress: string | null = null;
    if (mode === "devnet" && assetType === "PHYSICAL" && normalizeIdentifier(serialRaw).length < 5) {
      return fail(400, "Serial number / IMEI is required for physical collateral on Devnet.");
    }
    if (assetType === "DIGITAL" && (body.mintAddress || "").trim().length > 0) {
      try {
        mintAddress = new PublicKey((body.mintAddress || "").trim()).toBase58();
      } catch {
        return fail(
          400,
          "Invalid Solana mint address. Leave this field empty to automatically generate a demo token."
        );
      }
    }

    // Duplicate collateral prevention via server-side HMAC hash
    const serialHash = serialRaw ? hashAssetIdentifier(serialRaw) : null;
    const fingerprintHex = mintAddress ? hashAssetIdentifier(`MINT${mintAddress}`) : serialHash;
    if (fingerprintHex) {
      const existing = await checkDuplicateSerialHash(fingerprintHex, mode);
      if (existing) {
        return NextResponse.json(
          {
            error: "POTENTIAL_DUPLICATE",
            message: `This asset is already registered as active collateral on request #${existing.publicTicketId} (${existing.status}). Submission blocked to prevent double-pledging.`,
            duplicateTicketId: existing.publicTicketId,
          },
          { status: 409 }
        );
      }
    }

    const assetId = crypto.randomUUID();
    const category = body.category || (assetType === "DIGITAL" ? "NFT" : "Electronics");
    const appraisal = await runAiAppraisal(
      { assetId, assetType, category, brand, model, condition, hasSerial: Boolean(serialHash) },
      { allowSample: mode === "sandbox" }
    );
    if (!appraisal) {
      return fail(
        422,
        "INSUFFICIENT_DATA",
        process.env.FIRECRAWL_API_KEY
          ? "Insufficient market price evidence (at least 2 live listings required). Refine the brand or asset name and try again."
          : "Market data service is not configured for Devnet appraisals."
      );
    }

    if (mode === "sandbox" || !fingerprintHex) {
      return NextResponse.json({ assetId, serialHash, appraisal });
    }

    const metadataHash = crypto
      .createHash("sha256")
      .update(JSON.stringify([assetType, brand, model, condition, description]))
      .digest("hex");
    const prepared: PreparedPledge = {
      assetType,
      category,
      brand,
      model,
      condition,
      description,
      serialHash: fingerprintHex,
      mintAddress,
      metadataUri: `${METADATA_PREFIX}${metadataHash}`,
      appraisal,
    };
    return NextResponse.json({
      assetId,
      serialHash,
      appraisal,
      prepared,
      appraisalToken: signToken(prepared, 30 * 60),
    });
  } catch (err) {
    console.error("Appraisal failed", err);
    return fail(500, "Appraisal service error");
  }
}
