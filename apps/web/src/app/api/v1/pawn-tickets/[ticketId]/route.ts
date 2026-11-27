import { NextResponse } from "next/server";
import { verifyDevnetTransaction } from "@/lib/solana";
import { generateAttestationHash, getTicketById, saveTicket } from "@/lib/store";

export async function GET(
  _req: Request,
  context: { params: Promise<{ ticketId: string }> }
) {
  const { ticketId } = await context.params;
  const ticket = await getTicketById(ticketId);
  if (!ticket) {
    return NextResponse.json({ error: "Ticket not found" }, { status: 404 });
  }
  return NextResponse.json({ ticket });
}

export async function POST(
  req: Request,
  context: { params: Promise<{ ticketId: string }> }
) {
  try {
    const { ticketId } = await context.params;
    const ticket = await getTicketById(ticketId);
    if (!ticket) {
      return NextResponse.json({ error: "Ticket not found" }, { status: 404 });
    }

    const body = (await req.json()) as {
      action: "custody_attest" | "fund" | "repay" | "claim_default" | "cancel";
      actorWallet?: string;
      txSignature?: string;
      conditionReport?: string;
    };

    const actor = (body.actorWallet || "").trim();
    if (!actor) {
      return NextResponse.json({ error: "Wallet address wajib diisi." }, { status: 400 });
    }

    const now = new Date();
    const nowIso = now.toISOString();

    if (body.action === "custody_attest") {
      if (ticket.asset.assetType !== "PHYSICAL") {
        return NextResponse.json({ error: "Hanya aset fisik yang memerlukan verifikasi custodian." }, { status: 400 });
      }
      if (ticket.status !== "PENDING_VERIFICATION") {
        return NextResponse.json({ error: "Tiket tidak berada pada status menunggu verifikasi." }, { status: 409 });
      }
      // Separation of authority: borrower cannot self-attest physical custody
      if (actor === ticket.borrowerWallet) {
        return NextResponse.json(
          { error: "Borrower dilarang memverifikasi custody barangnya sendiri." },
          { status: 403 }
        );
      }

      ticket.custodyAttestationHash = generateAttestationHash(ticket.id, actor);
      ticket.asset.verificationStatus = "VERIFIED";
      ticket.asset.custodyStatus = "IN_CUSTODY";
      if (body.conditionReport) {
        ticket.asset.description = `${ticket.asset.description} | Custodian: ${body.conditionReport}`;
      }
      ticket.status = "OPEN";
      ticket.updatedAt = nowIso;
      await saveTicket(ticket);
      return NextResponse.json({ ticket });
    }

    if (body.action === "fund") {
      if (ticket.status !== "OPEN") {
        return NextResponse.json({ error: "Tiket tidak berstatus OPEN (sudah didanai atau belum terverifikasi)." }, { status: 409 });
      }
      if (actor === ticket.borrowerWallet) {
        return NextResponse.json({ error: "Borrower tidak boleh mendanai tiket miliknya sendiri." }, { status: 403 });
      }
      const txCheck = await verifyDevnetTransaction(body.txSignature || `SandboxTx_Fund_${ticket.publicTicketId}`);
      if (!txCheck.verified) {
        return NextResponse.json({ error: txCheck.error || "Transaksi Solana tidak valid." }, { status: 400 });
      }

      const due = new Date(now.getTime() + ticket.tenorDays * 86_400_000);
      ticket.lenderWallet = actor;
      ticket.dueAt = due.toISOString();
      ticket.chainTxSignature = body.txSignature || ticket.chainTxSignature;
      ticket.status = "ACTIVE";
      ticket.updatedAt = nowIso;
      await saveTicket(ticket);
      return NextResponse.json({ ticket });
    }

    if (body.action === "repay") {
      if (ticket.status !== "ACTIVE") {
        return NextResponse.json({ error: "Tiket tidak dalam status ACTIVE." }, { status: 409 });
      }
      if (actor !== ticket.borrowerWallet) {
        return NextResponse.json({ error: "Hanya Borrower pemilik tiket yang dapat melunasi." }, { status: 403 });
      }
      const txCheck = await verifyDevnetTransaction(body.txSignature || `SandboxTx_Repay_${ticket.publicTicketId}`);
      if (!txCheck.verified) {
        return NextResponse.json({ error: txCheck.error || "Transaksi pelunasan tidak valid." }, { status: 400 });
      }

      ticket.repayTxSignature = body.txSignature || `SandboxTx_Repay_${ticket.publicTicketId}`;
      ticket.asset.custodyStatus = "RELEASED";
      ticket.status = "REPAID";
      ticket.updatedAt = nowIso;
      await saveTicket(ticket);
      return NextResponse.json({ ticket });
    }

    if (body.action === "claim_default") {
      if (ticket.status !== "ACTIVE") {
        return NextResponse.json({ error: "Tiket tidak dalam status ACTIVE." }, { status: 409 });
      }
      if (actor !== ticket.lenderWallet) {
        return NextResponse.json({ error: "Hanya Lender tiket ini yang berhak klaim default." }, { status: 403 });
      }
      if (ticket.dueAt && now.getTime() <= new Date(ticket.dueAt).getTime()) {
        return NextResponse.json({ error: "Belum melewati tanggal jatuh tempo." }, { status: 409 });
      }
      ticket.status = "DEFAULT_CLAIMED";
      ticket.updatedAt = nowIso;
      await saveTicket(ticket);
      return NextResponse.json({ ticket });
    }

    if (body.action === "cancel") {
      if (ticket.status !== "OPEN" && ticket.status !== "PENDING_VERIFICATION") {
        return NextResponse.json({ error: "Tiket yang sudah didanai tidak dapat dibatalkan." }, { status: 409 });
      }
      if (actor !== ticket.borrowerWallet) {
        return NextResponse.json({ error: "Hanya Borrower yang dapat membatalkan tiket." }, { status: 403 });
      }
      ticket.status = "CANCELLED";
      ticket.asset.custodyStatus = "RELEASED";
      ticket.updatedAt = nowIso;
      await saveTicket(ticket);
      return NextResponse.json({ ticket });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch {
    return NextResponse.json({ error: "Failed to process ticket action" }, { status: 500 });
  }
}
