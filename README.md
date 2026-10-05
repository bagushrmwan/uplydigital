# Uply Digital V29 — Growth & Trust Suite

Production-ready untuk **Vercel + Neon PostgreSQL**. V29 melanjutkan V28 dan menambah fitur yang paling berguna untuk pertumbuhan dan operasional toko digital.

## Highlight V29
- Metode Pembayaran punya halaman sendiri `#pembayaran` (bug redirect ke Bantuan sudah diperbaiki).
- Warranty / Claim Center customer + admin.
- Garansi per produk dan per varian.
- Timeline status pesanan.
- Harga modal, estimasi laba, dan margin.
- Flash Sale Scheduler per produk/varian.
- Customer Notification Center.
- Payment Monitor Midtrans + sinkronisasi status.
- Seluruh fitur V28 tetap ada: varian, gallery multi-image, safe delete/restore produk, voucher, saldo, inventory, upload thumbnail, account/logout, mobile admin, Midtrans/manual payment.

## Deploy
1. Backup Neon.
2. Replace repository lama dengan isi folder ini.
3. Push ke `main` dan tunggu Vercel Production selesai.
4. Environment Variables lama tetap digunakan.
5. Buka `/api/health` dan pastikan `version` = `29.0` serta `growthSuiteReady` = `true`.

Lihat `TUTORIAL-VERCEL-V29.md`, `FITUR-V29.md`, dan `CHANGELOG-V29.md`.
