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
      lang?: "en" | "id";
    };
    const isId = body.lang === "id";

    const actor = (body.actorWallet || "").trim();
    if (!actor) {
      return NextResponse.json(
        { error: isId ? "Wallet address wajib diisi." : "Wallet address is required." },
        { status: 400 }
      );
    }

    const now = new Date();
    const nowIso = now.toISOString();

    if (body.action === "custody_attest") {
      if (ticket.asset.assetType !== "PHYSICAL") {
        return NextResponse.json(
          {
            error: isId
              ? "Hanya aset fisik yang memerlukan verifikasi custodian."
              : "Only physical assets require custodian verification.",
          },
          { status: 400 }
        );
      }
      if (ticket.status !== "PENDING_VERIFICATION") {
        return NextResponse.json(
          {
            error: isId
              ? "Tiket tidak berada pada status menunggu verifikasi."
              : "Ticket is not awaiting verification.",
          },
          { status: 409 }
        );
      }
      // Separation of authority: borrower cannot self-attest physical custody
      if (actor === ticket.borrowerWallet) {
        return NextResponse.json(
          {
            error: isId
              ? "Borrower dilarang memverifikasi custody barangnya sendiri."
              : "Borrower cannot self-attest custody of their own asset.",
          },
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
        return NextResponse.json(
          {
            error: isId
              ? "Tiket tidak berstatus OPEN (sudah didanai atau belum terverifikasi)."
              : "Ticket is not OPEN (already funded or unverified).",
          },
          { status: 409 }
        );
      }
      if (actor === ticket.borrowerWallet) {
        return NextResponse.json(
          {
            error: isId
              ? "Borrower tidak boleh mendanai tiket miliknya sendiri."
              : "Borrower cannot fund their own ticket.",
          },
          { status: 403 }
        );
      }
      const txCheck = await verifyDevnetTransaction(body.txSignature || `SandboxTx_Fund_${ticket.publicTicketId}`);
      if (!txCheck.verified) {
        return NextResponse.json(
          { error: txCheck.error || (isId ? "Transaksi Solana tidak valid." : "Invalid Solana transaction.") },
          { status: 400 }
        );
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
        return NextResponse.json(
          { error: isId ? "Tiket tidak dalam status ACTIVE." : "Ticket is not ACTIVE." },
          { status: 409 }
        );
      }
      if (actor !== ticket.borrowerWallet) {
        return NextResponse.json(
          {
            error: isId
              ? "Hanya Borrower pemilik tiket yang dapat melunasi."
              : "Only the ticket's Borrower can repay.",
          },
          { status: 403 }
        );
      }
      const txCheck = await verifyDevnetTransaction(body.txSignature || `SandboxTx_Repay_${ticket.publicTicketId}`);
      if (!txCheck.verified) {
        return NextResponse.json(
          { error: txCheck.error || (isId ? "Transaksi pelunasan tidak valid." : "Invalid repayment transaction.") },
          { status: 400 }
        );
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
        return NextResponse.json(
          { error: isId ? "Tiket tidak dalam status ACTIVE." : "Ticket is not ACTIVE." },
          { status: 409 }
        );
      }
      if (actor !== ticket.lenderWallet) {
        return NextResponse.json(
          {
            error: isId
              ? "Hanya Lender tiket ini yang berhak klaim default."
              : "Only this ticket's Lender can claim default.",
          },
          { status: 403 }
        );
      }
      if (ticket.dueAt && now.getTime() <= new Date(ticket.dueAt).getTime()) {
        return NextResponse.json(
          { error: isId ? "Belum melewati tanggal jatuh tempo." : "Loan has not reached maturity yet." },
          { status: 409 }
        );
      }
      ticket.status = "DEFAULT_CLAIMED";
      ticket.updatedAt = nowIso;
      await saveTicket(ticket);
      return NextResponse.json({ ticket });
    }

    if (body.action === "cancel") {
      if (ticket.status !== "OPEN" && ticket.status !== "PENDING_VERIFICATION") {
        return NextResponse.json(
          {
            error: isId
              ? "Tiket yang sudah didanai tidak dapat dibatalkan."
              : "Funded tickets cannot be cancelled.",
          },
          { status: 409 }
        );
      }
      if (actor !== ticket.borrowerWallet) {
        return NextResponse.json(
          {
            error: isId
              ? "Hanya Borrower yang dapat membatalkan tiket."
              : "Only the Borrower can cancel this ticket.",
          },
          { status: 403 }
        );
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
