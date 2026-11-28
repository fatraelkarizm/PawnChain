// End-to-end test of the on-chain program against a local validator.
// Usage: node --experimental-strip-types scripts/chain-e2e.mts <admin-keypair.json>
// The admin keypair must be the program upgrade authority and hold SOL.
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import {
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  SystemProgram,
  Transaction,
  TransactionInstruction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import * as chain from "../src/lib/program.ts";

const RPC = process.env.RPC_URL || "http://127.0.0.1:8899";
const connection = new Connection(RPC, "confirmed");
const admin = Keypair.fromSecretKey(
  Uint8Array.from(JSON.parse(fs.readFileSync(process.argv[2], "utf8")))
);

const send = (ixs: TransactionInstruction[], signers: Keypair[]) =>
  sendAndConfirmTransaction(connection, new Transaction().add(...ixs), signers, {
    commitment: "confirmed",
  });

let passed = 0;
async function ok(name: string, fn: () => Promise<unknown>) {
  await fn();
  passed++;
  console.log(`  ok  ${name}`);
}
async function rejects(name: string, expected: RegExp, fn: () => Promise<unknown>) {
  await ok(`rejects: ${name}`, async () => {
    try {
      await fn();
    } catch (err) {
      const e = err as { message: string; logs?: string[]; transactionLogs?: string[] };
      const text = [e.message, ...(e.logs ?? []), ...(e.transactionLogs ?? [])].join("\n");
      assert.match(text, expected);
      return;
    }
    assert.fail("transaction should have failed");
  });
}

const [borrower, lender, custodian, stranger] = [0, 1, 2, 3].map(() => Keypair.generate());
const run = Date.now();
const hash = (s: string) => crypto.createHash("sha256").update(`${run}:${s}`).digest("hex");
let nextId = run;

async function createTicket(
  fingerprint: string,
  opts: { assetType?: "DIGITAL" | "PHYSICAL"; duration?: number; skipFixSupply?: boolean } = {}
) {
  const mint = Keypair.generate();
  const ticketId = ++nextId;
  const mintIxs = await chain.mintCollateralInstructions(connection, borrower.publicKey, mint);
  const create = chain.createTicketInstruction({
    borrower: borrower.publicKey,
    mint: mint.publicKey,
    ticketId,
    fingerprintHex: fingerprint,
    loanLamports: LAMPORTS_PER_SOL,
    interestBps: 500,
    durationSeconds: opts.duration ?? 3600,
    aiValuationLamports: 2 * LAMPORTS_PER_SOL,
    assetType: opts.assetType ?? "PHYSICAL",
    metadataUri: "pawnchain:sha256:test",
  });
  await send(
    [...(opts.skipFixSupply ? mintIxs.slice(0, -1) : mintIxs), create],
    [borrower, mint]
  );
  const address = chain.ticketPda(borrower.publicKey, ticketId).toBase58();
  return { address, mint: mint.publicKey };
}

const read = async (address: string) => {
  const t = await chain.fetchTicket(connection, address);
  assert.ok(t, "ticket account should exist");
  return t;
};
const tokenBalance = async (owner: Keypair, mint: chain.ChainTicket["collateralMint"] | Keypair["publicKey"]) => {
  const { PublicKey } = await import("@solana/web3.js");
  const ata = chain.associatedTokenAddress(owner.publicKey, new PublicKey(mint));
  return (await connection.getTokenAccountBalance(ata)).value.amount;
};

console.log(`program ${chain.PROGRAM_ID.toBase58()} on ${RPC}`);

await send(
  [borrower, lender, custodian, stranger].map((k) =>
    SystemProgram.transfer({
      fromPubkey: admin.publicKey,
      toPubkey: k.publicKey,
      lamports: 5 * LAMPORTS_PER_SOL,
    })
  ),
  [admin]
);

await rejects("non-admin registering a custodian", /NotAdmin/, () =>
  send([chain.registerCustodianInstruction(stranger.publicKey, stranger.publicKey)], [stranger])
);
await ok("admin registers custodians", () =>
  send(
    [
      chain.registerCustodianInstruction(admin.publicKey, custodian.publicKey),
      chain.registerCustodianInstruction(admin.publicKey, borrower.publicKey),
    ],
    [admin]
  )
);

await rejects("collateral whose supply can still change", /InvalidCollateralMint/, () =>
  createTicket(hash("inflatable"), { skipFixSupply: true })
);

const imei = hash("imei-1");
let main!: Awaited<ReturnType<typeof createTicket>>;
await ok("create physical ticket locks the token in escrow", async () => {
  main = await createTicket(imei);
  const t = await read(main.address);
  assert.equal(t.status, "OPEN");
  assert.equal(t.custodyAttested, false);
  assert.equal(t.fingerprintHex, imei);
  assert.equal(t.loanLamports, LAMPORTS_PER_SOL);
  assert.equal(t.metadataUri, "pawnchain:sha256:test");
  assert.equal(await tokenBalance(borrower, main.mint), "0");
});

await rejects("same fingerprint pledged twice", /already in use/, () => createTicket(imei));

await rejects("funding before custody attestation", /CustodyNotAttested/, async () =>
  send([chain.fundLoanInstruction(lender.publicKey, await read(main.address))], [lender])
);
await rejects("attestation by an unregistered wallet", /AccountNotInitialized/, () =>
  send(
    [chain.attestCustodyInstruction(stranger.publicKey, main.address, hash("a"))],
    [stranger]
  )
);
await rejects("borrower attesting their own item", /CustodianConflict/, () =>
  send(
    [chain.attestCustodyInstruction(borrower.publicKey, main.address, hash("a"))],
    [borrower]
  )
);
await ok("registered custodian attests", async () => {
  await send(
    [chain.attestCustodyInstruction(custodian.publicKey, main.address, hash("a"))],
    [custodian]
  );
  const t = await read(main.address);
  assert.equal(t.custodyAttested, true);
  assert.equal(t.custodian, custodian.publicKey.toBase58());
});

await rejects("custodian funding the item they hold", /CustodianConflict/, async () =>
  send([chain.fundLoanInstruction(custodian.publicKey, await read(main.address))], [custodian])
);
await rejects("borrower funding their own loan", /CannotFundOwnLoan/, async () =>
  send([chain.fundLoanInstruction(borrower.publicKey, await read(main.address))], [borrower])
);
await ok("lender funds and the borrower receives the principal", async () => {
  const before = await connection.getBalance(borrower.publicKey);
  await send([chain.fundLoanInstruction(lender.publicKey, await read(main.address))], [lender]);
  assert.equal((await connection.getBalance(borrower.publicKey)) - before, LAMPORTS_PER_SOL);
  const t = await read(main.address);
  assert.equal(t.status, "ACTIVE");
  assert.equal(t.lender, lender.publicKey.toBase58());
  assert.equal(t.dueTime - t.startTime, 3600);
});
await rejects("funding twice", /TicketNotOpen/, async () =>
  send([chain.fundLoanInstruction(stranger.publicKey, await read(main.address))], [stranger])
);
await rejects("cancel after funding", /TicketNotOpen/, async () =>
  send([chain.cancelInstruction(await read(main.address))], [borrower])
);
await rejects("default claim before the due time", /LoanNotExpired/, async () =>
  send([chain.claimDefaultInstruction(lender.publicKey, await read(main.address))], [lender])
);
await ok("repay pays principal plus interest and returns the token", async () => {
  const before = await connection.getBalance(lender.publicKey);
  await send([chain.repayInstruction(await read(main.address))], [borrower]);
  assert.equal(
    (await connection.getBalance(lender.publicKey)) - before,
    LAMPORTS_PER_SOL * 1.05
  );
  assert.equal((await read(main.address)).status, "REPAID");
  assert.equal(await tokenBalance(borrower, main.mint), "1");
});
await rejects("repaying twice", /TicketNotActive|AccountNotInitialized/, async () => {
  const t = await read(main.address);
  await send([chain.repayInstruction(t)], [borrower]);
});

let again!: Awaited<ReturnType<typeof createTicket>>;
await ok("a released fingerprint can be pledged again", async () => {
  again = await createTicket(imei);
});
await ok("borrower cancels an open ticket and gets the token back", async () => {
  await send([chain.cancelInstruction(await read(again.address))], [borrower]);
  assert.equal((await read(again.address)).status, "CANCELLED");
  assert.equal(await tokenBalance(borrower, again.mint), "1");
});

await ok("lender claims collateral after the due time", async () => {
  const t = await createTicket(hash("nft"), { assetType: "DIGITAL", duration: 2 });
  await send([chain.fundLoanInstruction(lender.publicKey, await read(t.address))], [lender]);
  await new Promise((r) => setTimeout(r, 5000));
  await send([chain.claimDefaultInstruction(lender.publicKey, await read(t.address))], [lender]);
  assert.equal((await read(t.address)).status, "DEFAULT_CLAIMED");
  assert.equal(await tokenBalance(lender, t.mint), "1");
});

await ok("revoked custodian can no longer attest", async () => {
  const t = await createTicket(hash("imei-2"));
  await send([chain.revokeCustodianInstruction(admin.publicKey, custodian.publicKey)], [admin]);
  await assert.rejects(() =>
    send([chain.attestCustodyInstruction(custodian.publicKey, t.address, hash("b"))], [custodian])
  );
});

console.log(`\n${passed} on-chain checks passed`);
