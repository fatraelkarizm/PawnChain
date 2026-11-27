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
      return fail(400, "Merek dan model aset wajib diisi untuk appraisal.");
    }

    let mintAddress: string | null = null;
    if (mode === "devnet") {
      if (assetType === "PHYSICAL" && normalizeIdentifier(serialRaw).length < 5) {
        return fail(400, "Serial/IMEI wajib diisi untuk gadai barang fisik di devnet.");
      }
      if (assetType === "DIGITAL") {
        try {
          mintAddress = new PublicKey((body.mintAddress || "").trim()).toBase58();
        } catch {
          return fail(400, "Mint address tidak valid.");
        }
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
            message: `Aset ini sudah terdaftar sebagai agunan aktif pada Tiket #${existing.publicTicketId} (${existing.status}). Pengajuan diblokir untuk mencegah gadai ganda.`,
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
          ? "Bukti harga pasar tidak cukup (minimal 2 listing). Perjelas merek/model, lalu coba lagi."
          : "FIRECRAWL_API_KEY belum diisi, jadi tidak ada bukti harga pasar untuk devnet."
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
