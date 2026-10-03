# Uply Digital V14 — Vercel Native

V14 adalah perbaikan reliability untuk pembayaran otomatis Midtrans dan stok produk.

## Environment Variables
Wajib:
- `DATABASE_URL`
- `SESSION_SECRET`
- `ADMIN_EMAIL`
- `ADMIN_PASSWORD`
- `SITE_URL`

Top Up via login:
- `CREDENTIAL_ENCRYPTION_KEY` minimal 32 karakter (Secret)

Midtrans:
- `PAYMENT_MODE=midtrans`
- `MIDTRANS_SERVER_KEY=<Server Key>`
- `MIDTRANS_IS_PRODUCTION=false` untuk Sandbox
- `MIDTRANS_NOTIFICATION_URL` opsional; jika kosong, sistem memakai `${SITE_URL}/api/payment-webhook`

## Midtrans V14
Backend membuat Snap transaction menggunakan Server Key. V14 juga mengirim notification override per transaksi ke webhook website, menyediakan sinkronisasi Get Status API, dan memakai gateway order ID per attempt supaya retry lebih aman.

Gunakan `/api/health` untuk memastikan konfigurasi payment siap sebelum test checkout.

## Stok V14
Ada dua model stok:

### Manual stock
Cocok untuk produk yang diproses admin, termasuk Top Up.
Panel Admin → Produk → **Tambah stok / Atur stok**.

### Inventory Otomatis
Cocok untuk kode/link/lisensi yang dapat diberikan otomatis.
Panel Admin → Inventory → **Tambah 1 Item**.
Jumlah inventory berstatus `available` menjadi stok produk.

Top Up tetap dipaksa ke mode manual sesuai desain V13.

## Database migration
Migration bersifat non-destruktif (`ADD COLUMN IF NOT EXISTS`). V14 menambahkan field retry/payment event tanpa reset data lama.
