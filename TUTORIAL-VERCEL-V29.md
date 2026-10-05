# Tutorial Deploy Uply Digital V29 ke Vercel

1. Backup database Neon.
2. Extract ZIP V29 lalu replace seluruh file repository lama.
3. Commit ke `main`. Vercel akan deploy otomatis.
4. Pastikan Environment Variables berikut tetap tersedia: `DATABASE_URL`, `SESSION_SECRET`, `CREDENTIAL_ENCRYPTION_KEY`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `PAYMENT_MODE`, `SITE_URL`, `ALLOWED_ORIGIN`. Jika memakai Midtrans, tambahkan `MIDTRANS_SERVER_KEY` dan `MIDTRANS_IS_PRODUCTION`.
5. Buka `https://DOMAIN/api/health`. Target: `version: 29.0`, `database: connected`, `growthSuiteReady: true`.
6. Login Admin dan edit produk/varian untuk mengisi harga modal, garansi, dan jadwal flash sale.
7. Tes satu order production/test kecil, cek timeline, lalu selesaikan order. Pastikan Warranty Center membaca tanggal garansi.
8. Dari HP buka hamburger menu → Metode Pembayaran dan pastikan membuka `#pembayaran`.

Tidak perlu membuat database Neon baru. Migration V29 berjalan otomatis dan non-destruktif.
