import { NextResponse } from "next/server";
import { listTickets } from "@/lib/store";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status");
    const tickets = await listTickets();
    const filtered = status ? tickets.filter((t) => t.status === status) : tickets;
    return NextResponse.json({ tickets: filtered });
  } catch {
    return NextResponse.json({ error: "Failed to load tickets" }, { status: 500 });
  }
}
