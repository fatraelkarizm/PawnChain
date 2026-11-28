#!/usr/bin/env bash
# Build and deploy to devnet. Run inside WSL/Linux.
# The program keypair lives outside the repo; without it the program ID cannot be redeployed.
set -euo pipefail
export PATH="$HOME/.cargo/bin:$HOME/.local/share/solana/install/active_release/bin:$PATH"

PROGRAM_KEYPAIR="${PROGRAM_KEYPAIR:-$HOME/pawnchain-keys/program-keypair.json}"
TARGET="${CARGO_TARGET_DIR:-$HOME/pawnchain-target}"
cd "$(dirname "$0")"

CARGO_TARGET_DIR="$TARGET" cargo-build-sbf
echo "Deployer $(solana address), balance $(solana balance --url devnet)"
solana program deploy "$TARGET/deploy/pawnchain.so" --program-id "$PROGRAM_KEYPAIR" --url devnet
solana program show "$(solana address -k "$PROGRAM_KEYPAIR")" --url devnet
