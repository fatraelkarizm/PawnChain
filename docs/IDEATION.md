# Ideation PawnChain

Riset 27 November 2026, hari pertama Dev3pack.

## 1. Aturan Dev3pack

Sumber: [hack.dev3pack.xyz/faq](https://hack.dev3pack.xyz/faq)

| Hal | Isi |
|---|---|
| Jadwal | 27–29 November 2026 |
| Deadline | **Minggu, 29 November**. Jam UTC ada di dashboard |
| Tim | 1–4 orang |
| Track | Utama: Solana. Partner track diumumkan di situs |
| Wajib | Project di Solana, **open source** |
| Submit | Nama, one-liner, contract address, deskripsi, gambar, video, repo, live link, tim |
| Video | **Di bawah 3 menit** (lebih = gugur dari hadiah), demo produk asli, bukan pitch deck |
| Penilaian | Tahap 1: rubrik Product + Technical, disaring ke top 100. Tahap 2: **inspeksi kode**, founder-market fit, **verifikasi live demo** |
| Sinyal nilai | Kepatuhan aturan, kejelasan produk, dampak nyata, kualitas demo, deployment, kualitas repo, **kedalaman Solana/SDK** |
| Devnet/mainnet | Dua-duanya diterima |
| Kode lama | Boleh kalau milik sendiri; **tulis di README mana yang dibuat sebelum vs saat hackathon** |
| AI | Boleh, asal paham dan bisa menjelaskan |
| Perks | Noah AI credits, Cursor Pro (negara tertentu), v0 $30, Claude Pro untuk top 30 |

Hadiah di landing page: $10.000+ Best App on Solana, $500 track lokal, Seeker phone untuk app Solana Mobile, 1 slot accelerator. Sponsor: Firecrawl, ElevenLabs, Supabase.

Sumber ide yang disarankan panitia: ideas.sendai.fun, superteam.fun/build/ideas, superteam.fun/build/past-hackathon-winners, Colosseum Copilot.

## 2. Kompetitor langsung

Dari [Colosseum Product Directory](https://colosseum.com/arena/projects/explore) (11.259 project, pencarian **nama project saja**, jadi daftar ini tidak lengkap). Kata kunci: pawn 2 hasil, loan 5, lend 24, collectib 5, rwa 22, gadai/appraisal 0.

| Project | Event | Apa yang dibuat | Beda dengan PawnChain |
|---|---|---|---|
| NFT Pawn Shop (Turki) | Renaissance | NFT jadi jaminan untuk dana cepat | Hanya NFT, tanpa barang fisik |
| Tokenization of Collectibles / CardFi (Malaysia) | Breakout | Kartu koleksi terverifikasi jadi NFT, pinjaman P2P, default dilelang | Hanya kartu; punya lelang saat default |
| Lock n Loan (Meksiko) | Breakout | HP ditokenisasi, harga resale live, pinjam stablecoin, HP dikunci remote kalau telat | Barang tetap dipegang peminjam, tanpa custodian |
| peer.loans (Portugal) | Cypherpunk | Pinjaman P2P USDC, cicilan on-chain | Tanpa agunan barang dan appraisal |
| NuRWA (Indonesia) | Frontier | Pendanaan UMKM, escrow PDA | Bagi hasil, bukan gadai |
| GAS Grading (Kanada) | Frontier | Kartu graded + chip NFC + NFT provenance | Ide bagus untuk bukti custody |
| NanoCredit (Jerman) | Cypherpunk | Pinjaman tanpa agunan dengan verifikasi BLE | Anti-fraud kehadiran fisik |

Di luar Colosseum:

- **Collector Crypt + Jupiter Offerbook**: kartu fisik di vault berasuransi bisa jadi jaminan pinjaman P2P fixed-rate. Ini disebut di pencarian ([post Collector Crypt](https://x.com/Collector_Crypt/status/2061501489852428456)) dan [ringkasan Helius](https://www.helius.dev/blog/solana-real-world-assets); syarat pinjaman dan volumenya belum terverifikasi.
- **BAXUS**: pinjam USDC dengan jaminan botol koleksi (ringkasan Helius).
- **Collat Finance**: pawn berbasis RWA di Solana, pengumuman 2024; status sekarang tidak diketahui.

## 3. Pemenang yang relevan

| Event | Project | Hasil | Inti |
|---|---|---|---|
| Cypherpunk | Yumi Finance | DeFi #1 | BNPL on-chain |
| Cypherpunk | Autonom | RWA #1 | Oracle khusus RWA |
| Cypherpunk | Bore.fi | RWA #2 | Private equity UKM tertokenisasi |
| Cypherpunk | Legasi | RWA #3 | Kredit Lombard |
| Cypherpunk | Pencil Finance | RWA #4 | Student loan on-chain |
| Cypherpunk | Watchtower | RWA #5 | Pembiayaan beragunan aset |
| Cypherpunk | Solana ATM | Undefined #4 | Mesin fisik likuiditas P2P |
| Frontier | ODL | Top 25 | Likuidasi RWA diskon |
| Frontier | JK Index, One Arena, Traded.gg | Top 25 | Pasar dan harga kartu koleksi |
| Clock In (Mobile) | Vanna | #2 | Borrow/lend |
| Clock In (Mobile) | Polaris | #6–10 | Cicilan 4x dan skor kredit on-chain |

Sumber: [Cypherpunk](https://blog.colosseum.com/announcing-the-winners-of-the-solana-cypherpunk-hackathon/), [Frontier](https://blog.colosseum.com/announcing-the-winners-of-the-solana-frontier-hackathon/), [Clock In](https://solanacompass.com/news/solana-mobile-clock-in-hackathon-winners-sprouts-takes-30k-as-11-seeker-apps-split-135k), [Monolith](https://solanamobile.com/blog/solana-mobile-monolith-hackathon-winners-announced). Thread Radiants di X gagal diakses; dua link Solana Mobile ini penggantinya.

## 4. Data pasar

- RWA: market cap terdistribusi memuncak ~$33B di H1 2026 (+200% YoY). Private credit: suplai agunan di Solana $608,9 juta ([Colosseum Codex](https://blog.colosseum.com/rwa-report-agentic-payments-arcium/)).
- Gadai Indonesia: 229 perusahaan berizin; pembiayaan Rp156,61 triliun per Agustus 2026, +44,6% YoY ([IDXChannel](https://www.idxchannel.com/banking/ojk-terbitkan-7-izin-baru-sepanjang-2026-total-perusahaan-gadai-capai-229), dari ringkasan pencarian; cek ulang sebelum masuk video).
- Regulasi: usaha pergadaian diatur POJK 39/2024. Aturan khusus gadai P2P tidak ditemukan. Jangan klaim legal; pakai label prototipe devnet.

## 5. Ide dari SendAI

[ideas.sendai.fun](https://ideas.sendai.fun) berfokus pada AI agent.

**Bisa dipakai PawnChain**

| Ide | Pemakaian |
|---|---|
| AI-Powered Onchain Identity | Skor reputasi borrower dari riwayat tebus/default |
| Marketplace of Trust | Skor kepercayaan custodian atau appraiser |
| Real-World Commerce with AI x Crypto | Pencairan ke rupiah (fase lanjut) |
| Decentralized Negotiation Agent | Agent menawar bunga/tenor |
| Voice-Integrated AI Agent | Briefing kontrak yang bisa ditanya balik |
| Autonomous Task Executor with Crypto Payments | Appraisal API berbayar via x402 |

**Lainnya:** Shopify for Agents, Twitch for AI Agents, Screener supercharged with Agents, Autonomous Trading Agent, Telegram prediction markets, Perplexity for Solana Actions, AI Health & Fitness Advisor, Multi-Agent Collaboration, LLMHive, On-chain inference, Shared Graph, AI GitHub Contributions via Discord, Agent Deployment Hub, AI Market Makers, Smart Contract Wallet Agent, zkML DeFi Agent, Fractionalized Agent Earnings, Social Trading Agent, Collaborative AI Art Game, Crypto Investment Coach, Yield Optimization Bot, DAO Participation Agent, Crypto Mentor Agent, Agent using DePIN, Multi-Modal Personality Bots, AI Rewards Game, LinkedIn for AI Agents, Agent with a Browser, AI Shopping Companion.

## 6. Rekomendasi arah (opini, bukan fakta)

**Posisi:** "Gadai barang fisik sehari-hari (HP, laptop, kamera) dengan custodian lokal, bukti harga yang bisa diklik, dan escrow Solana."

"NFT jadi jaminan" dan "kartu koleksi jadi jaminan" sudah ada yang membuat. Yang bisa ditonjolkan:

1. Anti gadai ganda lewat fingerprint serial/IMEI, idealnya dicatat on-chain sebagai PDA `CollateralRecord`.
2. Custodian yang terdaftar on-chain.
3. Appraisal dengan link listing nyata, dan menolak menaksir kalau bukti tidak cukup.
4. Voice briefing bahasa Indonesia untuk inklusi.

**Ditunda:** x402, agent negosiasi, skor reputasi, mobile app. Selesaikan dulu alur inti on-chain (lihat [STATUS_AUDIT.md](STATUS_AUDIT.md)).

**Belum dicek:** superteam.fun/build/ideas (redirect loop; ada entri "RWA Collateral Lending" di build.superteam.fun/ideas/rwa-collateral-lending), Colosseum Copilot (perlu login; jalankan untuk pencarian isi project).
