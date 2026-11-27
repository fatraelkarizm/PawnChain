// Client for programs/pawnchain. Shared by the browser, API routes and scripts/,
// so it imports nothing but @solana/web3.js.
import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  TransactionInstruction,
} from "@solana/web3.js";

export const PROGRAM_ID = new PublicKey(
  process.env.NEXT_PUBLIC_ANCHOR_PROGRAM_ID || "GbnsM4PrEhhUR462vCDiCY5wrzj4MHyTSwRFieUhYn4G"
);

export const TOKEN_PROGRAM_ID = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
export const ASSOCIATED_TOKEN_PROGRAM_ID = new PublicKey(
  "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"
);
const UPGRADEABLE_LOADER_ID = new PublicKey("BPFLoaderUpgradeab1e11111111111111111111111");
const MINT_ACCOUNT_SIZE = 82;

// First 8 bytes of sha256("global:<instruction>") and sha256("account:<Name>").
const DISCRIMINATOR = {
  registerCustodian: [182, 236, 219, 44, 221, 85, 47, 202],
  revokeCustodian: [37, 139, 60, 224, 18, 73, 28, 201],
  createPawnTicket: [237, 245, 227, 125, 166, 135, 149, 243],
  fundLoan: [50, 221, 51, 13, 3, 142, 116, 215],
  repayAndRelease: [158, 100, 174, 232, 148, 197, 245, 103],
  claimDefault: [12, 132, 209, 37, 163, 22, 128, 241],
  cancelTicket: [216, 28, 247, 206, 195, 171, 100, 143],
  submitCustodyAttestation: [81, 58, 211, 170, 143, 134, 18, 82],
  pawnTicketAccount: [63, 231, 117, 254, 132, 89, 156, 234],
};

export type ChainStatus = "OPEN" | "ACTIVE" | "REPAID" | "DEFAULT_CLAIMED" | "CANCELLED";
const CHAIN_STATUS: ChainStatus[] = ["OPEN", "ACTIVE", "REPAID", "DEFAULT_CLAIMED", "CANCELLED"];

export interface ChainTicket {
  address: string;
  borrower: string;
  lender: string | null;
  collateralMint: string;
  ticketId: number;
  loanLamports: number;
  interestBps: number;
  durationSeconds: number;
  aiValuationLamports: number;
  assetType: "DIGITAL" | "PHYSICAL";
  fingerprintHex: string;
  custodyAttested: boolean;
  custodian: string | null;
  attestationHex: string | null;
  startTime: number;
  dueTime: number;
  status: ChainStatus;
  metadataUri: string;
}

export function hexToBytes(hex: string): Uint8Array {
  if (!/^[0-9a-f]{64}$/i.test(hex)) throw new Error("Expected a 32-byte hex hash.");
  return Uint8Array.from(hex.match(/../g)!, (b) => parseInt(b, 16));
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

// DataView instead of Buffer helpers: the browser Buffer polyfill may lack BigInt methods.
function u64(value: number | bigint): Uint8Array {
  const out = new Uint8Array(8);
  new DataView(out.buffer).setBigUint64(0, BigInt(value), true);
  return out;
}

function u16(value: number): Uint8Array {
  return Uint8Array.of(value & 0xff, (value >> 8) & 0xff);
}

function u32(value: number): Uint8Array {
  const out = new Uint8Array(4);
  new DataView(out.buffer).setUint32(0, value, true);
  return out;
}

function concat(...parts: ArrayLike<number>[]): Buffer {
  return Buffer.concat(parts.map((p) => Buffer.from(Uint8Array.from(p))));
}

const meta = (pubkey: PublicKey, isWritable = false, isSigner = false) => ({
  pubkey,
  isWritable,
  isSigner,
});
const signer = (pubkey: PublicKey, isWritable = true) => meta(pubkey, isWritable, true);

function pda(seeds: Uint8Array[], programId = PROGRAM_ID): PublicKey {
  return PublicKey.findProgramAddressSync(seeds, programId)[0];
}

const seed = (text: string) => new TextEncoder().encode(text);

export const ticketPda = (borrower: PublicKey, ticketId: number) =>
  pda([seed("pawn_ticket"), borrower.toBytes(), u64(ticketId)]);
export const collateralLockPda = (fingerprintHex: string) =>
  pda([seed("collateral"), hexToBytes(fingerprintHex)]);
export const custodianPda = (custodian: PublicKey) =>
  pda([seed("custodian"), custodian.toBytes()]);
export const associatedTokenAddress = (owner: PublicKey, mint: PublicKey) =>
  pda(
    [owner.toBytes(), TOKEN_PROGRAM_ID.toBytes(), mint.toBytes()],
    ASSOCIATED_TOKEN_PROGRAM_ID
  );

/**
 * Mints the single collateral token the program accepts (supply 1, no mint or freeze
 * authority). `mint` must co-sign the transaction.
 */
export async function mintCollateralInstructions(
  connection: Connection,
  owner: PublicKey,
  mint: Keypair
): Promise<TransactionInstruction[]> {
  const ata = associatedTokenAddress(owner, mint.publicKey);
  const lamports = await connection.getMinimumBalanceForRentExemption(MINT_ACCOUNT_SIZE);
  const tokenIx = (keys: ReturnType<typeof meta>[], data: Buffer) =>
    new TransactionInstruction({ programId: TOKEN_PROGRAM_ID, keys, data });

  return [
    SystemProgram.createAccount({
      fromPubkey: owner,
      newAccountPubkey: mint.publicKey,
      lamports,
      space: MINT_ACCOUNT_SIZE,
      programId: TOKEN_PROGRAM_ID,
    }),
    // InitializeMint2: decimals 0, mint authority = owner, no freeze authority
    tokenIx([meta(mint.publicKey, true)], concat([20, 0], owner.toBytes(), [0])),
    new TransactionInstruction({
      programId: ASSOCIATED_TOKEN_PROGRAM_ID,
      keys: [
        signer(owner),
        meta(ata, true),
        meta(owner),
        meta(mint.publicKey),
        meta(SystemProgram.programId),
        meta(TOKEN_PROGRAM_ID),
      ],
      data: Buffer.alloc(0),
    }),
    // MintTo 1
    tokenIx(
      [meta(mint.publicKey, true), meta(ata, true), signer(owner, false)],
      concat([7], u64(1))
    ),
    // SetAuthority: MintTokens -> none, which fixes the supply at 1
    tokenIx([meta(mint.publicKey, true), signer(owner, false)], concat([6, 0, 0])),
  ];
}

export interface CreateTicketArgs {
  borrower: PublicKey;
  mint: PublicKey;
  ticketId: number;
  fingerprintHex: string;
  loanLamports: number;
  interestBps: number;
  durationSeconds: number;
  aiValuationLamports: number;
  assetType: "DIGITAL" | "PHYSICAL";
  metadataUri: string;
}

export function createTicketInstruction(a: CreateTicketArgs): TransactionInstruction {
  const ticket = ticketPda(a.borrower, a.ticketId);
  const uri = new TextEncoder().encode(a.metadataUri);
  return new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      signer(a.borrower),
      meta(a.mint),
      meta(associatedTokenAddress(a.borrower, a.mint), true),
      meta(ticket, true),
      meta(collateralLockPda(a.fingerprintHex), true),
      meta(associatedTokenAddress(ticket, a.mint), true),
      meta(SystemProgram.programId),
      meta(TOKEN_PROGRAM_ID),
      meta(ASSOCIATED_TOKEN_PROGRAM_ID),
    ],
    data: concat(
      DISCRIMINATOR.createPawnTicket,
      u64(a.ticketId),
      hexToBytes(a.fingerprintHex),
      u64(a.loanLamports),
      u16(a.interestBps),
      u64(a.durationSeconds),
      u64(a.aiValuationLamports),
      [a.assetType === "DIGITAL" ? 0 : 1],
      u32(uri.length),
      uri
    ),
  });
}

export function fundLoanInstruction(
  lender: PublicKey,
  ticket: ChainTicket
): TransactionInstruction {
  return new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      signer(lender),
      meta(new PublicKey(ticket.borrower), true),
      meta(new PublicKey(ticket.address), true),
      meta(SystemProgram.programId),
    ],
    data: concat(DISCRIMINATOR.fundLoan),
  });
}

/** Shared account tail of repay, cancel and claim: lock, vault, destination, mint, programs. */
function releaseKeys(ticket: ChainTicket, destinationOwner: PublicKey) {
  const address = new PublicKey(ticket.address);
  const mint = new PublicKey(ticket.collateralMint);
  return [
    meta(collateralLockPda(ticket.fingerprintHex), true),
    meta(associatedTokenAddress(address, mint), true),
    meta(associatedTokenAddress(destinationOwner, mint), true),
    meta(mint),
    meta(SystemProgram.programId),
    meta(TOKEN_PROGRAM_ID),
    meta(ASSOCIATED_TOKEN_PROGRAM_ID),
  ];
}

export function repayInstruction(ticket: ChainTicket): TransactionInstruction {
  if (!ticket.lender) throw new Error("Ticket has no lender yet.");
  const borrower = new PublicKey(ticket.borrower);
  return new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      signer(borrower),
      meta(new PublicKey(ticket.lender), true),
      meta(new PublicKey(ticket.address), true),
      ...releaseKeys(ticket, borrower),
    ],
    data: concat(DISCRIMINATOR.repayAndRelease),
  });
}

export function cancelInstruction(ticket: ChainTicket): TransactionInstruction {
  const borrower = new PublicKey(ticket.borrower);
  return new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      signer(borrower),
      meta(new PublicKey(ticket.address), true),
      ...releaseKeys(ticket, borrower),
    ],
    data: concat(DISCRIMINATOR.cancelTicket),
  });
}

export function claimDefaultInstruction(
  lender: PublicKey,
  ticket: ChainTicket
): TransactionInstruction {
  return new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      signer(lender),
      meta(new PublicKey(ticket.borrower), true),
      meta(new PublicKey(ticket.address), true),
      ...releaseKeys(ticket, lender),
    ],
    data: concat(DISCRIMINATOR.claimDefault),
  });
}

export function attestCustodyInstruction(
  custodian: PublicKey,
  ticketAddress: string,
  attestationHex: string
): TransactionInstruction {
  return new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      signer(custodian, false),
      meta(custodianPda(custodian)),
      meta(new PublicKey(ticketAddress), true),
    ],
    data: concat(DISCRIMINATOR.submitCustodyAttestation, hexToBytes(attestationHex)),
  });
}

const programDataPda = () => pda([PROGRAM_ID.toBytes()], UPGRADEABLE_LOADER_ID);

export function registerCustodianInstruction(
  admin: PublicKey,
  custodian: PublicKey
): TransactionInstruction {
  return new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      signer(admin),
      meta(custodianPda(custodian), true),
      meta(PROGRAM_ID),
      meta(programDataPda()),
      meta(SystemProgram.programId),
    ],
    data: concat(DISCRIMINATOR.registerCustodian, custodian.toBytes()),
  });
}

export function revokeCustodianInstruction(
  admin: PublicKey,
  custodian: PublicKey
): TransactionInstruction {
  return new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      signer(admin),
      meta(custodianPda(custodian), true),
      meta(PROGRAM_ID),
      meta(programDataPda()),
    ],
    data: concat(DISCRIMINATOR.revokeCustodian),
  });
}

export function decodeTicket(address: string, data: Uint8Array): ChainTicket {
  if (!DISCRIMINATOR.pawnTicketAccount.every((b, i) => data[i] === b)) {
    throw new Error("Account is not a PawnTicket.");
  }
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  let offset = 8;
  const take = (n: number) => data.subarray(offset, (offset += n));
  const key = () => new PublicKey(take(32)).toBase58();
  const num = () => {
    const v = view.getBigInt64(offset, true);
    offset += 8;
    return Number(v);
  };
  const byte = () => data[offset++];
  const optionalKey = () => {
    const k = key();
    return k === PublicKey.default.toBase58() ? null : k;
  };

  const borrower = key();
  const lender = optionalKey();
  const collateralMint = key();
  const ticketId = num();
  const loanLamports = num();
  const interestBps = view.getUint16(offset, true);
  offset += 2;
  const durationSeconds = num();
  const aiValuationLamports = num();
  const assetType = byte() === 0 ? "DIGITAL" : "PHYSICAL";
  const fingerprintHex = bytesToHex(take(32));
  const custodyAttested = byte() === 1;
  const custodian = optionalKey();
  const attestation = bytesToHex(take(32));
  const startTime = num();
  const dueTime = num();
  const status = CHAIN_STATUS[byte()];
  const uriLength = view.getUint32(offset, true);
  offset += 4;
  const metadataUri = new TextDecoder().decode(take(uriLength));

  return {
    address,
    borrower,
    lender,
    collateralMint,
    ticketId,
    loanLamports,
    interestBps,
    durationSeconds,
    aiValuationLamports,
    assetType,
    fingerprintHex,
    custodyAttested,
    custodian,
    attestationHex: /^0+$/.test(attestation) ? null : attestation,
    startTime,
    dueTime,
    status,
    metadataUri,
  };
}

/** Returns null when the account does not exist or is not owned by the program. */
export async function fetchTicket(
  connection: Connection,
  address: string
): Promise<ChainTicket | null> {
  const info = await connection.getAccountInfo(new PublicKey(address), "confirmed");
  if (!info || !info.owner.equals(PROGRAM_ID)) return null;
  return decodeTicket(address, info.data);
}
