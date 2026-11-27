import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { runAiAppraisal } from "@/lib/appraisal";
import { hashAssetIdentifier } from "@/lib/security";
import { checkDuplicateSerialHash } from "@/lib/store";
import type { AssetCondition, AssetType } from "@/types/pawn";

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      assetType?: AssetType;
      category?: string;
      brand?: string;
      model?: string;
      condition?: AssetCondition;
      serialNumber?: string;
    };

    const assetType: AssetType = body.assetType === "DIGITAL" ? "DIGITAL" : "PHYSICAL";
    const brand = (body.brand || "").trim();
    const model = (body.model || "").trim();
    const condition: AssetCondition =
      body.condition === "Mint" || body.condition === "Fair" ? body.condition : "Good";
    const serialRaw = (body.serialNumber || "").trim();

    if (!brand || !model) {
      return NextResponse.json(
        { error: "Merek dan model aset wajib diisi untuk appraisal." },
        { status: 400 }
      );
    }

    // Duplicate collateral prevention via server-side HMAC hash
    if (serialRaw.length > 0) {
      const serialHash = hashAssetIdentifier(serialRaw);
      const existing = await checkDuplicateSerialHash(serialHash);
      if (existing) {
        return NextResponse.json(
          {
            error: "POTENTIAL_DUPLICATE",
            message: `Serial/IMEI ini sudah terdaftar sebagai agunan aktif pada Tiket #${existing.publicTicketId} (${existing.status}). Pengajuan diblokir untuk mencegah gadai ganda.`,
            duplicateTicketId: existing.publicTicketId,
          },
          { status: 409 }
        );
      }
    }

    const assetId = crypto.randomUUID();
    const appraisal = await runAiAppraisal({
      assetId,
      assetType,
      category: body.category || (assetType === "DIGITAL" ? "NFT" : "Electronics"),
      brand,
      model,
      condition,
      hasSerial: serialRaw.length > 0,
    });

    return NextResponse.json({
      assetId,
      serialHash: serialRaw ? hashAssetIdentifier(serialRaw) : null,
      appraisal,
    });
  } catch {
    return NextResponse.json({ error: "Appraisal service error" }, { status: 500 });
  }
}
