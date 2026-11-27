// Register or revoke a custodian. The keypair must be the program upgrade authority.
//   node --experimental-strip-types scripts/custodian.mts <admin.json> register|revoke <pubkey>
import fs from "node:fs";
import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import * as program from "../src/lib/program.ts";

const [keyPath, action, target] = process.argv.slice(2);
if (!keyPath || !target || (action !== "register" && action !== "revoke")) {
  console.error("Usage: custodian.mts <admin.json> register|revoke <pubkey>");
  process.exit(1);
}

const admin = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(keyPath, "utf8"))));
const connection = new Connection(
  process.env.RPC_URL || "https://api.devnet.solana.com",
  "confirmed"
);
const build =
  action === "register"
    ? program.registerCustodianInstruction
    : program.revokeCustodianInstruction;

const signature = await sendAndConfirmTransaction(
  connection,
  new Transaction().add(build(admin.publicKey, new PublicKey(target))),
  [admin]
);
console.log(`${action} ${target}: ${signature}`);
