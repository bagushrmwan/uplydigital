# Hasil Pengujian Uply Digital V13

Pengecekan lokal yang dilakukan sebelum paket dibuat:

- PASS — syntax `app.js`, semua file `api/*.js`, dan `lib/*.js` dengan `node --check`.
- PASS — 7 thumbnail default produk tersedia di `assets/products/`.
- PASS — frontend membaca thumbnail dari database / path produk.
- PASS — field login Top Up muncul pada checkout produk yang membutuhkan credential.
- PASS — credential memakai AES-256-GCM dan round-trip encrypt/decrypt berhasil pada pengujian lokal.
- PASS — API publik order tidak mengembalikan plaintext credential.
- PASS — credential hanya dapat dibuka admin pada order berstatus `processing`.
- PASS — akses credential dicatat ke audit tanpa menyimpan password plaintext.
- PASS — credential otomatis dipurge saat Completed, Cancelled, expired manual order, atau pembayaran gateway gagal.
- PASS — kategori Top Up dipaksa ke fulfillment manual.
- PASS — field produk Featured, thumbnail, dan login-required masuk ke schema/migration.
- PASS — badge best seller dihitung dari completed order.
- PASS — promo banner homepage dan funnel admin tersedia.
- PASS — `.env.example` memuat `CREDENTIAL_ENCRYPTION_KEY`.
- PASS — `package.json` valid dan versi 13.0.0.

Belum dapat diuji lokal tanpa kredensial milik pengguna:

- koneksi PostgreSQL/Neon production,
- transaksi Midtrans Sandbox/Production nyata,
- email Resend nyata,
- deployment dan domain Vercel nyata.

Setelah deploy, uji alur minimal: `/api/health` → login pelanggan → checkout Top Up → pembayaran → admin tandai processing → buka login akun → complete order → pastikan credential sudah tidak dapat dibuka lagi.
