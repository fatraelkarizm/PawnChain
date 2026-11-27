import { listTickets } from "@/lib/store";
import { PawnWorkbench } from "@/components/PawnWorkbench";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const tickets = await listTickets();
  return <PawnWorkbench initialTickets={tickets} />;
}
