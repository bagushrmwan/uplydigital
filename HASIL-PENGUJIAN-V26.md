# Hasil Pengujian Uply Digital V26

Pengujian lokal yang dijalankan sebelum packaging:

- `npm run check` — PASS
- `npm run test:smoke` — PASS
- Syntax check frontend — PASS
- Syntax check seluruh Vercel API — PASS
- Syntax check database/security/payment/business modules — PASS
- Marker account page / update profile / change password / logout all — PASS
- Marker Uply V26 brand CSS — PASS
- Struktur asset thumbnail produk — PASS

Yang tetap memerlukan pengujian di production milik pengguna:

- koneksi Neon menggunakan `DATABASE_URL` production;
- transaksi Midtrans production;
- upload thumbnail ke database production;
- email Resend production bila diaktifkan;
- callback/webhook production.
