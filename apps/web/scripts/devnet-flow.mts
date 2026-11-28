// Integration test: the browser client (src/lib/devnetActions.ts) against a running
// dev server and a local validator, with a keypair standing in for the wallet.
// Start the app with NEXT_PUBLIC_SOLANA_RPC_URL=http://127.0.0.1:8899, then:
//   node --experimental-strip-types --import ./scripts/ts-resolve.mjs scripts/devnet-flow.mts <admin.json>
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  SystemProgram,
  Transaction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import type { WalletContextState } from "@solana/wallet-adapter-react";
import * as program from "../src/lib/program.ts";
import { createDevnetPledge, runDevnetAction } from "../src/lib/devnetActions.ts";

const APP = process.env.APP_URL || "http://localhost:3000";
const connection = new Connection(process.env.RPC_URL || "http://127.0.0.1:8899", "confirmed");
const admin = Keypair.fromSecretKey(
  Uint8Array.from(JSON.parse(fs.readFileSync(process.argv[2], "utf8")))
);

const realFetch = globalThis.fetch;
globalThis.fetch = (input, init) =>
  realFetch(typeof input === "string" && input.startsWith("/") ? APP + input : input, init);

const walletFor = (keypair: Keypair) =>
  ({
    publicKey: keypair.publicKey,
    sendTransaction: async (tx: Transaction, conn: Connection, opts?: { signers?: Keypair[] }) => {
      tx.sign(keypair, ...(opts?.signers ?? []));
      return conn.sendRawTransaction(tx.serialize());
    },
  }) as unknown as WalletContextState;

const [borrower, lender] = [Keypair.generate(), Keypair.generate()];
await sendAndConfirmTransaction(
  connection,
  new Transaction().add(
    ...[borrower, lender].map((k) =>
      SystemProgram.transfer({
        fromPubkey: admin.publicKey,
        toPubkey: k.publicKey,
        lamports: 5 * LAMPORTS_PER_SOL,
      })
    )
  ),
  [admin]
);

const post = async (path: string, body: object) => {
  const res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: res.status, data: await res.json() };
};

const form = {
  assetType: "DIGITAL" as const,
  brand: "Demo Collection",
  model: `Token ${Date.now()}`,
  condition: "Mint",
  description: "Integration test collateral",
  serialNumber: "",
  mintAddress: "",
  principalSol: 1,
  interestBps: 500,
  tenorDays: 7,
};

const created = await createDevnetPledge(connection, walletFor(borrower), form);
assert.equal(created.ticket.mode, "devnet");
assert.equal(created.ticket.status, "OPEN");
assert.equal(created.ticket.borrowerWallet, borrower.publicKey.toBase58());
assert.equal(created.ticket.principalLamports, LAMPORTS_PER_SOL);
assert.equal(created.ticket.chainTxSignature, created.signature);
console.log("  ok  pledge created on chain and listed");

const id = created.ticket.id;
const spoof = await post(`/api/v1/pawn-tickets/${id}`, {
  action: "fund",
  actorWallet: lender.publicKey.toBase58(),
});
assert.equal(spoof.status, 409);
const fakeSync = await post(`/api/v1/pawn-tickets/${id}`, {
  action: "sync",
  txSignature: "SandboxTx_fake",
});
assert.equal(fakeSync.data.ticket.status, "OPEN");
assert.equal(fakeSync.data.ticket.chainTxSignature, created.signature);
console.log("  ok  API claims cannot move a devnet ticket");

const forged = await post("/api/v1/pawn-requests", {
  mode: "devnet",
  appraisalToken: "forged.token",
  ticketPubkey: created.ticket.chainTicketPubkey,
});
assert.equal(forged.status, 400);
console.log("  ok  forged appraisal token rejected");

const funded = await runDevnetAction(connection, walletFor(lender), created.ticket, "fund");
assert.equal(funded.ticket.status, "ACTIVE");
assert.equal(funded.ticket.lenderWallet, lender.publicKey.toBase58());
assert.ok(funded.ticket.dueAt);
console.log("  ok  fund synced from chain");

await assert.rejects(
  () => runDevnetAction(connection, walletFor(lender), funded.ticket, "claim_default"),
  /not expired/
);
console.log("  ok  early default claim surfaces the program error");

const repaid = await runDevnetAction(connection, walletFor(borrower), funded.ticket, "repay");
assert.equal(repaid.ticket.status, "REPAID");
assert.equal(repaid.ticket.repayTxSignature, repaid.signature);
console.log("  ok  repay synced from chain");

const second = await createDevnetPledge(connection, walletFor(borrower), {
  ...form,
  mintAddress: created.ticket.asset.mintAddress!,
});
const cancelled = await runDevnetAction(connection, walletFor(borrower), second.ticket, "cancel");
assert.equal(cancelled.ticket.status, "CANCELLED");
console.log("  ok  released token pledged again, then cancelled");

assert.ok(program.PROGRAM_ID);
console.log("\ndevnet client flow passed");
