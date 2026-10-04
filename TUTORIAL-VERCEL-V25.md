# Tutorial Deploy Uply Digital V25 ke Vercel

## 1. Backup
Sebelum update production, buat backup/snapshot database Neon.

## 2. Upload source
Replace isi repository lama dengan seluruh isi folder V25. Root repository harus langsung memiliki `index.html`, `app.js`, `package.json`, `vercel.json`, `api/`, `lib/`, dan `assets/`.

## 3. Environment Variables
Minimum:
- `DATABASE_URL`
- `SESSION_SECRET`
- `CREDENTIAL_ENCRYPTION_KEY`
- `ADMIN_EMAIL`
- `ADMIN_PASSWORD`
- `SITE_URL`
- `ALLOWED_ORIGIN`

Untuk Midtrans:
- `PAYMENT_MODE=hybrid`
- `MIDTRANS_SERVER_KEY=Mid-server-...`
- `MIDTRANS_IS_PRODUCTION=true`

Optional:
- `MIDTRANS_ENABLED_PAYMENTS=qris` hanya jika QRIS memang aktif di merchant.
- `RESEND_API_KEY` dan `EMAIL_FROM` untuk transactional email.

## 4. Deploy
Commit ke branch production (`main`) lalu tunggu Vercel selesai deploy.

## 5. Health check
Buka `/api/health`. Pastikan `backend=connected` dan `database=connected`.

## 6. Setup dari Panel Admin
Masuk `#admin` lalu:
1. Pembayaran & Toko → aktifkan metode yang ingin dipakai.
2. Untuk QRIS manual, upload gambar QRIS di pengaturan.
3. Produk → set low-stock threshold.
4. Inventory → isi item untuk produk auto delivery.
5. Voucher → buat voucher promo.
6. Saldo → tambah bonus/refund bila dibutuhkan.

## 7. Test sebelum live
- Buat customer test.
- Terapkan voucher.
- Checkout memakai transfer manual atau QRIS manual.
- Upload bukti.
- Admin konfirmasi di mobile.
- Test produk inventory dengan 1 kode dummy.
- Jika Midtrans aktif, lakukan transaksi nominal kecil/test merchant sesuai kebijakan merchant.
