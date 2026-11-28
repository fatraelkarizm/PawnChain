# Skill, Tools, dan Resource Solana

Diambil 27 November 2026. Belum ada skill yang di-install; ini daftar untuk dipilih.

Status: ✅ terbaca · 🟡 sebagian / dari hasil pencarian · ❌ gagal diakses

## 1. Rekomendasi untuk PawnChain

| Prioritas | Skill | Kenapa | Install |
|---|---|---|---|
| 1 | `solana-dev` (Solana Foundation) | Anchor, testing, security, wallet, Token-2022 | `npx skills add solana-foundation/solana-dev-skill` |
| 2 | `vulnhunter`, `code-recon` (SendAI) | Review keamanan program escrow | `npx skills add sendaifun/skills` |
| 3 | `surfpool` (SendAI) | Test integrasi lokal | sama dengan no. 2 |
| 4 | `metaplex` | Mint RWA Receipt NFT | sama dengan no. 2, atau https://github.com/metaplex-foundation/skill |
| 5 | Colosseum Copilot | Cek apakah ide sudah pernah dibuat | `npx skills add ColosseumOrg/colosseum-copilot -g` (perlu login) |
| Opsional | Solana MCP | Dokumentasi Solana di dalam agent | `claude mcp add --transport http solana-mcp-server https://mcp.solana.com/mcp` |

Skill pihak ketiga belum diaudit. Baca isinya sebelum di-install.

## 2. Katalog skill

| Sumber | Status | Isi |
|---|---|---|
| [solana-dev-skill](https://github.com/solana-foundation/solana-dev-skill) | ✅ | 1 skill (v2.8.0) dengan banyak referensi |
| [sendaifun/skills](https://github.com/sendaifun/skills) | ✅ | 36 skill |
| [awesome-solana-ai](https://github.com/solana-foundation/awesome-solana-ai) | ✅ | Daftar kurasi, tidak di-endorse Foundation |
| [awesome-solana-oss](https://github.com/StockpileLabs/awesome-solana-oss) | ✅ | Daftar repo open source, bukan skill |
| [solanaskills.com](https://solanaskills.com) | 🟡 | Landing page solana.new, "100+ skills" tanpa daftar nama |
| [solana.com/skills](https://solana.com/skills) | 🟡 | Rate limit (429). Dari pencarian: ada Official dan Community Skills |
| [solana.new](https://solana.new) | ❌ | DNS gagal. Installer di solanaskills.com: `curl -fsSL https://www.solana.new/setup.sh \| bash` (script belum dibaca, jangan langsung dijalankan) |

### 2.1 solana-dev (referensi di dalamnya)

`kit/`, `frontend.md`, `kit-web3-interop.md`, `testing.md` (Surfpool, LiteSVM, Mollusk), `idl-codegen.md` (Codama), `tokens.md` (SPL, Token-2022), `payments.md`, `kora.md` (gasless), `keychain.md`, `mosaic.md`, `security.md`, `concepts.md`, `programs/anchor.md`, `programs/pinocchio.md`, `programs/design-patterns.md` (PDA seeds, vault), `anchor/migrating-v0.32-to-v1.md`, `surfpool/`, `confidential-transfers.md`, `transactions-v1.md`, `rpc-quick-lookups.md`, `resources.md`, `compatibility-matrix.md`, `common-errors.md`.

Cara lain install: clone repo lalu `./install.sh` (user) atau `./install.sh --project`.

### 2.2 sendaifun/skills

| Kategori | Skill |
|---|---|
| DeFi | jupiter, glam, kamino, lulo, manifest, marginfi, meteora, orca, pumpfun, raydium, sanctum |
| Infra | arcium, helius, quicknode, light-protocol, magicblock, sol-incinerator, squads |
| Trading | dflow, ranger-finance |
| Oracle | pyth, switchboard |
| Data | birdeye, coingecko, metengine, wallet-analysis |
| Cross-chain | debridge, lifi |
| NFT | metaplex |
| Client | solana-kit, solana-kit-migration |
| Program | pinocchio-development |
| AI agent | solana-agent-kit |
| Security | vulnhunter, code-recon |
| DevOps | surfpool |

Claude Code: `/plugin marketplace add sendaifun/skills`, lalu `/plugin install <nama>`.

### 2.3 awesome-solana-ai (yang relevan)

| Topik | Entri |
|---|---|
| Anchor / test | [solana-anchor-claude-skill](https://github.com/quiknode-labs/solana-anchor-claude-skill), [solana-skills-plugin](https://github.com/tenequm/claude-plugins/tree/main/solana), [orquestra](https://github.com/berkayoztunc/orquestra) (IDL ke REST/MCP) |
| Security | [Sealevel Guard](https://github.com/NewmanXBT/sealevel-guard), [Trident Arena](https://tridentarena.xyz), [Sentinel Code](https://github.com/oraclesentinel/sentinel-code) |
| NFT / wallet | [metaplex skill](https://github.com/metaplex-foundation/skill), [helius-phantom](https://github.com/helius-labs/core-ai/tree/main/helius-skills/helius-phantom), [phantom-connect](https://github.com/phantom/phantom-connect-cursor-plugin), [squads](https://github.com/sendaifun/skills/tree/main/skills/squads) |
| Lending (referensi) | [kamino](https://github.com/sendaifun/skills/tree/main/skills/kamino), [lulo](https://github.com/sendaifun/skills/tree/main/skills/lulo), [jupiter](https://github.com/jup-ag/agent-skills/tree/main/skills/integrating-jupiter), [sodax](https://sodax.com/skill.md) |
| Oracle / harga | [switchboard](https://github.com/sendaifun/skills/tree/main/skills/switchboard), [pyth](https://github.com/pyth-network/pyth-crosschain/tree/main/apps/mcp/skills), [coingecko](https://github.com/sendaifun/skills/tree/main/skills/coingecko) |

### 2.4 awesome-solana-oss (yang relevan)

[Anchor](https://github.com/coral-xyz/anchor), [LiteSVM](https://github.com/LiteSVM/litesvm), [Mollusk](https://github.com/buffalojoec/mollusk), [Trident](https://github.com/Ackee-Blockchain/trident) (fuzzing), [Kamino Lend](https://github.com/Kamino-Finance/klend), [Wallet Adapter](https://github.com/anza-xyz/wallet-adapter), [Kit](https://github.com/anza-xyz/kit), [Lighthouse](https://github.com/Jac0xb/lighthouse), [solana-verifiable-build](https://github.com/solana-foundation/solana-verifiable-build).

## 3. Developer resources

| Resource | Status | Catatan |
|---|---|---|
| [Anchor installation](https://anchor-lang.com/docs/installation) | ✅ | Lihat bagian 4 |
| [create-solana-dapp](https://github.com/solana-foundation/create-solana-dapp) | ✅ | `pnpm create solana-dapp@latest`. Tidak dibutuhkan, project sudah ada |
| [solana-web3.js](https://github.com/solana-foundation/solana-web3.js) | ✅ | v1.x (dipakai project ini) hanya dapat critical fix; pengembangan baru di v3+. Tidak perlu migrasi saat hackathon |
| [Phantom Connect](https://docs.phantom.com/phantom-connect) | ✅ | Pendaftaran app baru di Phantom Portal sedang ditutup. Mode `injected` tidak butuh Portal |
| [Swig](https://build.onswig.com) | ✅ | Smart wallet, butuh API key. `bun add @swig-wallet/developer-sdk` |
| [Privy](https://docs.privy.io/welcome) | ✅ | Embedded wallet, butuh appId/appSecret |
| [pay.sh](https://pay.sh) | ✅ | CLI pembayaran x402 untuk API. `npm install -g @solana/pay` |
| x402 on Solana | 🟡 | Pembayaran per request via HTTP 402 untuk API dan agent. Halaman solana.com kena 429 |
| [Solana Playground](https://beta.solpg.io) | 🟡 | Hanya judul yang terbaca (butuh JS) |
| [Bootcamp 2026](https://youtube.com/watch?v=2pcm7ICRJKU) | 🟡 | Hanya judul, isi video belum dipelajari |
| Quick Start, Installation, Templates (solana.com) | ❌ | 429 |
| [Superteam developer tools](https://superteam.fun/build/developer-tools) | ❌ | Redirect loop |
| [NoahAI](https://trynoah.ai) | ❌ | 403. FAQ Dev3pack menyarankannya sebagai generator app; ada Noah AI credits di perks |

## 4. Setup toolchain smart contract (belum dijalankan)

Di Windows, pengembangan program Solana lewat WSL:

```bash
curl --proto '=https' --tlsv1.2 -sSfL https://solana-install.solana.workers.dev | bash
```

Manual:

```bash
sh -c "$(curl -sSfL https://release.anza.xyz/stable/install)"
cargo install --git https://github.com/otter-sec/anchor avm --force
avm install 0.30.1 && avm use 0.30.1   # project ini pakai anchor-lang 0.30.1
solana config set -ud
solana airdrop 2
```

Kondisi mesin saat dicek: WSL Ubuntu sudah punya AVM, tetapi Solana CLI belum aktif (auto-setup 3.1.10 gagal).
