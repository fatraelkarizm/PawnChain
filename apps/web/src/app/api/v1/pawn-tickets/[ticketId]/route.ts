import { NextResponse } from "next/server";
import { syncDevnetTicket } from "@/lib/devnet";
import { SANDBOX_WALLETS } from "@/lib/sandbox";
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
      action: "sync" | "custody_attest" | "fund" | "repay" | "claim_default" | "cancel";
      actorWallet?: string;
      txSignature?: string;
      conditionReport?: string;
    };

    // Devnet tickets ignore client claims entirely: the chain is the source of truth.
    if (ticket.mode === "devnet") {
      if (body.action !== "sync") {
        return NextResponse.json(
          { error: "Tiket devnet hanya berubah lewat transaksi on-chain." },
          { status: 409 }
        );
      }
      return NextResponse.json({ ticket: await syncDevnetTicket(ticket, body.txSignature) });
    }

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
      // Separation of authority: only the custodian may attest, never the borrower.
      if (actor !== SANDBOX_WALLETS.custodian || actor === ticket.borrowerWallet) {
        return NextResponse.json(
          { error: "Hanya Custodian terdaftar yang dapat memverifikasi barang." },
          { status: 403 }
        );
      }

      ticket.custodyAttestationHash = generateAttestationHash(ticket.id, actor);
      ticket.custodianWallet = actor;
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
      if (actor === ticket.custodianWallet) {
        return NextResponse.json({ error: "Custodian tidak boleh mendanai barang yang ia simpan." }, { status: 403 });
      }

      const due = new Date(now.getTime() + ticket.tenorDays * 86_400_000);
      ticket.lenderWallet = actor;
      ticket.dueAt = due.toISOString();
      ticket.chainTxSignature = `SandboxTx_Fund_${ticket.publicTicketId}`;
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
      ticket.repayTxSignature = `SandboxTx_Repay_${ticket.publicTicketId}`;
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
  } catch (err) {
    console.error("Ticket action failed", err);
    return NextResponse.json({ error: "Failed to process ticket action" }, { status: 500 });
  }
}
