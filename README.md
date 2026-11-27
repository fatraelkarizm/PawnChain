# PawnChain

**AI-Powered P2P Pawnshop & RWA Collateral Network on Solana**  
Built for **Dev3pack Global Hackathon** (27–29 November 2026)

## Overview

PawnChain connects asset owners (Borrowers) with individual liquidity providers (Lenders) on Solana Devnet. Instead of opaque manual pawnshops or complex DeFi liquidation engines, PawnChain uses:

1. **AI Appraisal + Live Market Grounding (Firecrawl):** Computes a conservative median valuation from live marketplace listings and enforces a safe Loan-to-Value (LTV <= 60%) cap.
2. **Trustless Solana Escrow (Anchor):** Locks digital collateral (NFT / RWA Receipt) in a deterministic PDA Escrow with atomic `repay_and_release`.
3. **Physical RWA Custody & Anti-Duplicate Registry:** Separates digital collateral from physical collateral; requires verified Custodian attestation and HMAC-hashed serial/IMEI duplicate checks.
4. **Voice Contract Briefing (ElevenLabs):** Reads loan principal, interest, due date, and default consequences in plain language before confirmation.
5. **Shareable 1-Click Pawn Links & Sandbox Mode:** Lets judges test the entire lifecycle in under 60 seconds.

## Architecture

```text
apps/web/           Next.js 16 App Router (UI + API Routes + Solana Wallet Adapter)
programs/pawnchain/ Solana Anchor Program (5 atomic instructions)
supabase/           PostgreSQL schema & migrations
docs/PRD.md         Full Product Requirements & Technical Specification
```

## Quick Start (Local)

```bash
cd apps/web
pnpm install
cp ../../.env.example .env.local
pnpm dev
```

Open `http://localhost:3000`. Click **Try Demo (Sandbox)** to run the full end-to-end appraisal, ticket creation, funding, duplicate-IMEI block, and atomic repayment flow immediately.

## Smart Contract (Solana Devnet)

5 core instructions in [`programs/pawnchain/src/lib.rs`](programs/pawnchain/src/lib.rs):
- `create_pawn_ticket`
- `fund_loan`
- `repay_and_release`
- `claim_default`
- `submit_custody_attestation`

## License

MIT — see [`LICENSE`](LICENSE).
