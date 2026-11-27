# Status dan Langkah Berikutnya

Diperbarui 27 November 2026. Perubahan di atas commit `381f38d`, **belum di-commit**.

## Hasil verifikasi

| Cek | Hasil |
|---|---|
| Build program (anchor-lang 1.1.2) | Lulus |
| `scripts/chain-e2e.mts` di validator lokal | 21 cek lulus |
| `scripts/devnet-flow.mts` (client browser → API → program, validator lokal) | Lulus |
| `tests/e2e-api.mjs` (sandbox) | Lulus |
| `tsc --noEmit`, `pnpm lint` | Lulus |
| **Deploy ke devnet** | **Belum.** Saldo kurang, airdrop kena rate limit |
| Transaksi dengan Phantom/Solflare asli | **Belum diuji** |
| Gadai fisik devnet lewat UI (butuh Firecrawl) | **Belum diuji** |
| Firecrawl, ElevenLabs, Supabase live | **Belum diuji** |

## Yang sudah diperbaiki

| Temuan awal | Perbaikan |
|---|---|
| Frontend tidak memanggil program | Create, attest, fund, repay, cancel, claim memanggil program |
| Verifikasi transaksi bisa dilewati | Tiket devnet hanya mengikuti akun on-chain; sandbox terpisah |
| Siapa pun bisa jadi custodian | Registry on-chain; sandbox hanya menerima wallet custodian demo |
| Duplicate check hanya di backend | PDA `CollateralLock` per fingerprint |
| Mint jaminan tidak divalidasi | Wajib supply 1, tanpa mint/freeze authority |
| Harga hardcode berlabel marketplace | Devnet menolak tanpa bukti; sandbox berlabel "Sample data" |
| Supabase menghilangkan seed, error diabaikan | Digabung, error dilaporkan, RLS lewat migrasi 002 |
| Program ID placeholder di `.env.example` | Diganti |

## Perlu dikerjakan sendiri

1. **Isi saldo devnet** untuk `ske3rsKWjmzXgL2dqhmFCM9h7Q4X6bcJQcw4P2kwRHT` (minimal 2,1 SOL, saran 3) lewat https://faucet.solana.com, lalu di WSL:
   `bash /mnt/e/hackathon/PawnChain/programs/pawnchain/deploy-devnet.sh`
2. **Cadangkan** `~/pawnchain-keys/program-keypair.json` (WSL) dan `~/.config/solana/id.json`. Jangan di-commit.
3. **Daftarkan custodian** (alamat Phantom kedua), dari `apps/web` di WSL:
   `node --experimental-strip-types scripts/custodian.mts ~/.config/solana/id.json register <PUBKEY>`
4. Siapkan 3 wallet devnet: peminjam, pendana, custodian.
5. Isi `FIRECRAWL_API_KEY`, `ELEVENLABS_API_KEY`, dan Supabase (jalankan migrasi 001 dan 002). Ganti `SERIAL_HMAC_SECRET` sebelum dipakai publik dan jangan diubah lagi sesudahnya.
6. Deploy ke Vercel, uji sekali penuh, rekam video di bawah 3 menit.
7. Di README, tulis mana yang dibuat sebelum dan saat hackathon.

## Menjalankan lokal

```powershell
cd apps/web
pnpm dev
```

Data tiket lokal ada di `.pawnchain-local-store.json`; hapus untuk reset.
