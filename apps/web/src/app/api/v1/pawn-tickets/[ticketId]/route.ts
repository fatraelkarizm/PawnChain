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
          { error: "Devnet collateral requests can only be updated via on-chain transactions." },
          { status: 409 }
        );
      }
      return NextResponse.json({ ticket: await syncDevnetTicket(ticket, body.txSignature) });
    }

    const actor = (body.actorWallet || "").trim();
    if (!actor) {
      return NextResponse.json({ error: "Wallet address is required." }, { status: 400 });
    }

    const now = new Date();
    const nowIso = now.toISOString();

    if (body.action === "custody_attest") {
      if (ticket.asset.assetType !== "PHYSICAL") {
        return NextResponse.json({ error: "Only physical assets require custody verification." }, { status: 400 });
      }
      if (ticket.status !== "PENDING_VERIFICATION") {
        return NextResponse.json({ error: "This collateral request is not awaiting verification." }, { status: 409 });
      }
      // Separation of authority: only the custodian may attest, never the borrower.
      if (actor !== SANDBOX_WALLETS.custodian || actor === ticket.borrowerWallet) {
        return NextResponse.json(
          { error: "Custodian access is required to verify this asset." },
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
        return NextResponse.json({ error: "This request is not open for funding." }, { status: 409 });
      }
      if (actor === ticket.borrowerWallet) {
        return NextResponse.json({ error: "Borrowers cannot fund their own collateral requests." }, { status: 403 });
      }
      if (actor === ticket.custodianWallet) {
        return NextResponse.json({ error: "Custodians cannot fund collateral held in their custody." }, { status: 403 });
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
        return NextResponse.json({ error: "This loan is not currently active." }, { status: 409 });
      }
      if (actor !== ticket.borrowerWallet) {
        return NextResponse.json({ error: "Only the borrower can repay this loan." }, { status: 403 });
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
        return NextResponse.json({ error: "This loan is not currently active." }, { status: 409 });
      }
      if (actor !== ticket.lenderWallet) {
        return NextResponse.json({ error: "Only the funding lender can claim overdue collateral." }, { status: 403 });
      }
      if (ticket.dueAt && now.getTime() <= new Date(ticket.dueAt).getTime()) {
        return NextResponse.json({ error: "This loan has not reached its repayment deadline." }, { status: 409 });
      }
      ticket.status = "DEFAULT_CLAIMED";
      ticket.updatedAt = nowIso;
      await saveTicket(ticket);
      return NextResponse.json({ ticket });
    }

    if (body.action === "cancel") {
      if (ticket.status !== "OPEN" && ticket.status !== "PENDING_VERIFICATION") {
        return NextResponse.json({ error: "Funded loans cannot be cancelled." }, { status: 409 });
      }
      if (actor !== ticket.borrowerWallet) {
        return NextResponse.json({ error: "Only the borrower can cancel this request." }, { status: 403 });
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
