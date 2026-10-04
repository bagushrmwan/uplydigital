# Uply Digital V25 — Business Suite (Vercel)

V25 mengembangkan storefront V23 menjadi sistem operasional toko digital yang lebih lengkap tanpa reset database.

## Stack
- Vercel Static + Serverless Functions
- Node.js 20+
- PostgreSQL / Neon
- Midtrans Snap (opsional / production sesuai env)
- Transfer bank manual + QRIS manual
- Frontend vanilla HTML/CSS/JS

## Modul utama V25
1. Dashboard Admin Lengkap
2. Auto Payment via Midtrans + QRIS manual fallback
3. Instant Auto Delivery melalui Inventory
4. Balance System + ledger
5. Smart Voucher System
6. Auto Recap & Statistik 30 hari
7. Multi Payment: Midtrans / Transfer Manual / QRIS Manual / Saldo
8. Smart Stock Management + low-stock threshold
9. Dokumentasi di dalam Panel Admin
10. Role Connector Otomatis: Customer → Member → Reseller → VIP
11. Reporting System + export CSV
12. Notification Center
13. Audit Log

## Migrasi database
`ensureSchema()` membuat tabel/kolom baru menggunakan `CREATE TABLE IF NOT EXISTS` dan `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`. Tidak ada reset/drop database.

## Catatan Auto QRIS
- QRIS otomatis memerlukan payment provider/API yang memberi status transaksi/webhook. V25 mendukung Midtrans untuk otomatis jika QRIS aktif pada merchant Midtrans.
- Gambar QRIS statis yang diupload di Panel Admin adalah **manual verification**; pelanggan upload bukti, lalu admin memverifikasi.

Lihat `TUTORIAL-VERCEL-V25.md` dan `FITUR-BISNIS-V25.md`.
